import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/card/card';
import {
    ZoomIn,
    ZoomOut,
    Search,
    Redo,
    Undo,
    Scan,
    LayoutGrid,
    Users,
} from 'lucide-react';
import { Separator } from '@/components/separator/separator';
import { ToolbarButton } from './toolbar-button';
import { useHistory } from '@/hooks/use-history';
import { useOnViewportChange, useReactFlow } from '@xyflow/react';
import {
    Tooltip,
    TooltipTrigger,
    TooltipContent,
} from '@/components/tooltip/tooltip';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/button/button';
import { keyboardShortcutsForOS } from '@/context/keyboard-shortcuts-context/keyboard-shortcuts';
import { KeyboardShortcutAction } from '@/context/keyboard-shortcuts-context/keyboard-shortcuts';
import { useCanvas } from '@/hooks/use-canvas';
import { cn } from '@/lib/utils';
import { useDiagramFilter } from '@/context/diagram-filter-context/use-diagram-filter';
import { useAlert } from '@/context/alert-context/alert-context';
import { useChartDB } from '@/hooks/use-chartdb';
import { useToast } from '@/components/toast/use-toast';
import { CollaborationClient } from '@/lib/collaboration/collaboration-client';
import {
    collaborationProtocolVersion,
    type CollaborationMessage,
    type CollaborationOperation,
} from '@/lib/collaboration/collaboration-protocol';
import {
    applyDiagramOperation,
    buildDiagramOperation,
    parseDiagramOperationPayload,
    seedEntityVersions,
    type DiagramOperationPayload,
} from '@/lib/collaboration/diagram-operations';
import { diagramSchema, type Diagram } from '@/lib/domain/diagram';
import { formatCollaborationError } from '@/lib/collaboration/format-collaboration-error';

const convertToPercentage = (value: number) => `${Math.round(value * 100)}%`;

function reviveCollaborationDates(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(reviveCollaborationDates);
    if (typeof value !== 'object' || value === null) return value;
    return Object.fromEntries(
        Object.entries(value).map(([key, nested]) => {
            if (
                (key === 'createdAt' || key === 'updatedAt') &&
                typeof nested === 'string'
            ) {
                return [key, new Date(nested)];
            }
            return [key, reviveCollaborationDates(nested)];
        })
    );
}

export interface ToolbarProps {
    readonly?: boolean;
}

export const Toolbar: React.FC<ToolbarProps> = ({ readonly }) => {
    const { t } = useTranslation();
    const { redo, undo, hasRedo, hasUndo } = useHistory();
    const { getZoom, zoomIn, zoomOut, fitView } = useReactFlow();
    const [zoom, setZoom] = useState<string>(convertToPercentage(getZoom()));
    const { setShowFilter, reorderTables } = useCanvas();
    const { hasActiveFilter } = useDiagramFilter();
    const { showAlert } = useAlert();
    const { toast } = useToast();
    const { currentDiagram, updateDiagramData, setCollaborationSynchronized } =
        useChartDB();
    const currentDiagramRef = useRef(currentDiagram);
    currentDiagramRef.current = currentDiagram;
    const [collaborationUrl, setCollaborationUrl] = useState('');
    const [collaborationUrls, setCollaborationUrls] = useState<string[]>([]);
    const [collaborationStatus, setCollaborationStatus] = useState('');
    const [participantName, setParticipantName] = useState(
        () => `Guest-${Math.random().toString(36).slice(2, 7)}`
    );
    const participantIdRef = useRef(crypto.randomUUID());
    const participantNameRef = useRef(participantName);
    participantNameRef.current = participantName;
    const clientRef = useRef<CollaborationClient | null>(null);
    const unsubscribeRef = useRef<(() => void) | null>(null);
    const hostRef = useRef(false);
    const sessionReadyRef = useRef(false);
    const documentIdRef = useRef('');
    const baselineDiagramRef = useRef<Diagram>(currentDiagram);
    const entityVersionsRef = useRef(new Map<string, number>());
    const revisionRef = useRef(0);
    const targetRevisionRef = useRef(0);
    const pendingOperationRef = useRef<{
        id: string;
        payload: DiagramOperationPayload;
        entityVersions: Record<string, number>;
        timeout: number;
    } | null>(null);
    const operationsByRevisionRef = useRef(
        new Map<
            number,
            {
                payload: DiagramOperationPayload;
                entityVersions: Record<string, number>;
            }
        >()
    );
    const applyingRemoteRef = useRef(false);
    const resyncRequestedRef = useRef(false);
    const welcomeTaskRef = useRef(Promise.resolve());
    const skipDiagramRef = useRef('');
    const flushLocalRef = useRef<() => void>(() => undefined);

    const requestResync = () => {
        const client = clientRef.current;
        if (!client || !documentIdRef.current || resyncRequestedRef.current)
            return;
        resyncRequestedRef.current = true;
        sessionReadyRef.current = false;
        setCollaborationSynchronized(false);
        setCollaborationStatus('Conflict detected; resynchronizing');
        client.send({
            protocolVersion: collaborationProtocolVersion,
            type: 'resync',
            clientId: participantIdRef.current,
            documentId: documentIdRef.current,
            revision: revisionRef.current,
        });
    };

    const drainOperations = async () => {
        if (applyingRemoteRef.current) return;
        applyingRemoteRef.current = true;
        try {
            while (
                operationsByRevisionRef.current.has(revisionRef.current + 1)
            ) {
                const nextRevision = revisionRef.current + 1;
                const item = operationsByRevisionRef.current.get(nextRevision);
                if (!item) break;
                for (const [entityId, expectedVersion] of Object.entries(
                    item.entityVersions
                )) {
                    if (
                        (entityVersionsRef.current.get(entityId) ?? 0) !==
                        expectedVersion
                    ) {
                        requestResync();
                        return;
                    }
                }
                const canonical = applyDiagramOperation(
                    baselineDiagramRef.current,
                    item.payload
                );
                const visible = applyDiagramOperation(
                    currentDiagramRef.current,
                    item.payload
                );
                baselineDiagramRef.current = canonical;
                for (const [entityId, expectedVersion] of Object.entries(
                    item.entityVersions
                )) {
                    entityVersionsRef.current.set(
                        entityId,
                        expectedVersion + 1
                    );
                }
                revisionRef.current = nextRevision;
                operationsByRevisionRef.current.delete(nextRevision);
                currentDiagramRef.current = visible;
                skipDiagramRef.current = JSON.stringify(visible);
                await updateDiagramData(visible);
            }
            sessionReadyRef.current =
                !resyncRequestedRef.current &&
                revisionRef.current >= targetRevisionRef.current;
            setCollaborationSynchronized(sessionReadyRef.current);
            flushLocalRef.current();
        } catch (error) {
            setCollaborationStatus(
                `Could not apply collaborator change: ${String(error)}`
            );
            requestResync();
        } finally {
            applyingRemoteRef.current = false;
        }
    };

    const initializeWelcome = async (
        message: Extract<CollaborationMessage, { type: 'welcome' }>
    ) => {
        setCollaborationSynchronized(false);
        const snapshot = diagramSchema.parse(
            reviveCollaborationDates(message.payload)
        );
        documentIdRef.current = message.documentId;
        revisionRef.current = 0;
        targetRevisionRef.current = message.revision ?? 0;
        operationsByRevisionRef.current.clear();
        entityVersionsRef.current = seedEntityVersions(snapshot);
        pendingOperationRef.current = null;
        baselineDiagramRef.current = snapshot;
        const shouldReplace = !hostRef.current || resyncRequestedRef.current;
        resyncRequestedRef.current = false;
        sessionReadyRef.current = !shouldReplace;
        if (shouldReplace) {
            currentDiagramRef.current = snapshot;
            skipDiagramRef.current = JSON.stringify(snapshot);
            await updateDiagramData(snapshot);
        }
        sessionReadyRef.current =
            revisionRef.current >= targetRevisionRef.current;
        setCollaborationSynchronized(sessionReadyRef.current);
        setCollaborationStatus(
            sessionReadyRef.current ? 'Connected' : 'Synchronizing'
        );
        clientRef.current?.send({
            protocolVersion: collaborationProtocolVersion,
            type: 'name',
            clientId: participantIdRef.current,
            name: participantNameRef.current,
        });
        flushLocalRef.current();
    };

    const handleOperation = async (message: CollaborationOperation) => {
        try {
            await welcomeTaskRef.current;
            if (
                message.documentId !== documentIdRef.current ||
                message.revision === undefined
            ) {
                requestResync();
                return;
            }
            const payload = parseDiagramOperationPayload(
                message.payload,
                message.entityVersions
            );
            if (message.revision <= revisionRef.current) return;
            operationsByRevisionRef.current.set(message.revision, {
                payload,
                entityVersions: message.entityVersions,
            });
            await drainOperations();
        } catch (error) {
            setCollaborationStatus(
                `Invalid collaborator operation: ${String(error)}`
            );
            requestResync();
        }
    };

    const handleMessage = (message: CollaborationMessage) => {
        if (message.type === 'welcome') {
            welcomeTaskRef.current = initializeWelcome(message).catch(
                (error: unknown) => {
                    sessionReadyRef.current = false;
                    setCollaborationSynchronized(false);
                    setCollaborationStatus(
                        `Invalid session snapshot: ${String(error)}`
                    );
                    clientRef.current?.close();
                }
            );
            return;
        }
        if (
            message.type === 'cursor' ||
            message.type === 'name' ||
            message.type === 'selection' ||
            message.type === 'editing' ||
            message.type === 'preview' ||
            message.type === 'leave'
        ) {
            window.dispatchEvent(
                new CustomEvent('collaboration:peer', { detail: message })
            );
            return;
        }
        if (message.type === 'operation') {
            void handleOperation(message);
            return;
        }
        if (message.type === 'ack') {
            const pending = pendingOperationRef.current;
            if (!pending || pending.id !== message.id) return;
            window.clearTimeout(pending.timeout);
            pendingOperationRef.current = null;
            if (operationsByRevisionRef.current.has(message.revision)) {
                requestResync();
                return;
            }
            operationsByRevisionRef.current.set(message.revision, {
                payload: pending.payload,
                entityVersions: pending.entityVersions,
            });
            void drainOperations();
            return;
        }
        if (message.type === 'reject') {
            const pending = pendingOperationRef.current;
            if (pending && pending.id === message.id) {
                window.clearTimeout(pending.timeout);
                pendingOperationRef.current = null;
                requestResync();
            }
            return;
        }
        if (message.type === 'error') {
            setCollaborationStatus(`Collaboration error: ${message.code}`);
        }
    };

    const connectCollaboration = async (
        url: string,
        role: 'host' | 'participant'
    ) => {
        unsubscribeRef.current?.();
        clientRef.current?.close();
        sessionReadyRef.current = false;
        setCollaborationSynchronized(false);
        const client = new CollaborationClient();
        clientRef.current = client;
        const sendCursor = (event: Event) => {
            const position = (event as CustomEvent<{ x: number; y: number }>)
                .detail;
            client.send({
                protocolVersion: collaborationProtocolVersion,
                type: 'cursor',
                clientId: participantIdRef.current,
                position,
            });
        };
        const sendSelection = (event: Event) => {
            const selection = (event as CustomEvent<string[]>).detail;
            client.send({
                protocolVersion: collaborationProtocolVersion,
                type: 'selection',
                clientId: participantIdRef.current,
                selection,
            });
        };
        const sendPreview = (event: Event) => {
            const preview = (
                event as CustomEvent<{ targetId: string; payload: unknown }>
            ).detail;
            client.send({
                protocolVersion: collaborationProtocolVersion,
                type: 'preview',
                clientId: participantIdRef.current,
                targetId: preview.targetId,
                payload: preview.payload as {
                    active?: boolean;
                    position?: { x: number; y: number };
                    dimensions?: { width: number; height: number };
                },
            });
        };
        window.addEventListener('collaboration:cursor', sendCursor);
        window.addEventListener('collaboration:selection', sendSelection);
        window.addEventListener('collaboration:preview', sendPreview);
        const unsubscribe = client.subscribe((event) => {
            if (event.type === 'status') {
                setCollaborationStatus(
                    event.status === 'error'
                        ? (event.error ?? 'Connection failed')
                        : event.status
                );
                if (
                    event.status === 'disconnected' ||
                    event.status === 'error'
                ) {
                    sessionReadyRef.current = false;
                    setCollaborationSynchronized(false);
                    window.dispatchEvent(
                        new CustomEvent('collaboration:peer', {
                            detail: { type: 'reset' },
                        })
                    );
                }
            } else {
                handleMessage(event.message);
            }
        });
        unsubscribeRef.current = () => {
            unsubscribe();
            window.removeEventListener('collaboration:cursor', sendCursor);
            window.removeEventListener(
                'collaboration:selection',
                sendSelection
            );
            window.removeEventListener('collaboration:preview', sendPreview);
        };
        const hello =
            role === 'host'
                ? {
                      protocolVersion: collaborationProtocolVersion,
                      type: 'hello' as const,
                      clientId: participantIdRef.current,
                      documentId: currentDiagramRef.current.id,
                      role,
                      name: participantNameRef.current,
                      payload: currentDiagramRef.current,
                  }
                : {
                      protocolVersion: collaborationProtocolVersion,
                      type: 'hello' as const,
                      clientId: participantIdRef.current,
                      role,
                      name: participantNameRef.current,
                  };
        try {
            await client.connect(url, hello);
        } catch (error) {
            setCollaborationStatus(String(error));
            throw error;
        }
    };

    const flushLocalChanges = () => {
        const client = clientRef.current;
        if (!client || !sessionReadyRef.current || pendingOperationRef.current)
            return;
        const current = currentDiagramRef.current;
        const serialized = JSON.stringify(current);
        if (serialized === skipDiagramRef.current) {
            skipDiagramRef.current = '';
            return;
        }
        try {
            const change = buildDiagramOperation(
                baselineDiagramRef.current,
                current,
                entityVersionsRef.current
            );
            if (!change) return;
            const id = crypto.randomUUID();
            const sent = client.send({
                protocolVersion: collaborationProtocolVersion,
                type: 'operation',
                id,
                clientId: participantIdRef.current,
                documentId: documentIdRef.current,
                entityVersions: change.entityVersions,
                payload: change.payload,
            });
            if (!sent) return;
            const timeout = window.setTimeout(() => {
                if (pendingOperationRef.current?.id === id) requestResync();
            }, 10000);
            pendingOperationRef.current = {
                id,
                payload: change.payload,
                entityVersions: change.entityVersions,
                timeout,
            };
        } catch (error) {
            const message = formatCollaborationError(error);
            setCollaborationStatus(`Could not send diagram change: ${message}`);
            toast({
                title: 'Could not send diagram change',
                description: (
                    <span className="whitespace-pre-wrap break-words">
                        {message}
                    </span>
                ),
                variant: 'destructive',
            });
        }
    };
    flushLocalRef.current = flushLocalChanges;

    useEffect(() => {
        flushLocalRef.current();
    }, [currentDiagram, collaborationStatus]);

    useEffect(
        () => () => {
            const pending = pendingOperationRef.current;
            if (pending) window.clearTimeout(pending.timeout);
            unsubscribeRef.current?.();
            clientRef.current?.close();
            if (hostRef.current && window.go?.main?.App) {
                void window.go.main.App.StopCollaboration();
            }
        },
        []
    );

    const startCollaboration = async () => {
        if (readonly) {
            setCollaborationStatus(
                'Collaboration is unavailable in read-only mode.'
            );
            return;
        }
        if (!window.go?.main?.App) {
            setCollaborationStatus(
                'Collaboration requires the Wails desktop app.'
            );
            return;
        }
        try {
            const session = await window.go.main.App.StartCollaboration();
            hostRef.current = true;
            const urls = session.urls?.length ? session.urls : [session.url];
            setCollaborationUrls(urls);
            let lastError: unknown;
            for (const url of urls) {
                try {
                    await connectCollaboration(url, 'host');
                    setCollaborationUrl(url);
                    return;
                } catch (error) {
                    lastError = error;
                }
            }
            await window.go.main.App.StopCollaboration();
            hostRef.current = false;
            throw (
                lastError ?? new Error('Could not connect to any host address')
            );
        } catch (error) {
            setCollaborationStatus(String(error));
        }
    };

    const joinCollaboration = () => {
        if (readonly) return;
        const url = window.prompt('Enter the collaboration WebSocket URL');
        if (url) {
            hostRef.current = false;
            setCollaborationUrl(url);
            void connectCollaboration(url, 'participant').catch(
                () => undefined
            );
        }
    };

    const stopCollaboration = async () => {
        const pending = pendingOperationRef.current;
        if (pending) window.clearTimeout(pending.timeout);
        pendingOperationRef.current = null;
        unsubscribeRef.current?.();
        unsubscribeRef.current = null;
        clientRef.current?.close();
        clientRef.current = null;
        hostRef.current = false;
        sessionReadyRef.current = false;
        setCollaborationSynchronized(true);
        if (window.go?.main?.App) await window.go.main.App.StopCollaboration();
        setCollaborationUrl('');
        setCollaborationUrls([]);
        setCollaborationStatus('');
    };

    const toggleFilter = useCallback(() => {
        setShowFilter((prev) => !prev);
    }, [setShowFilter]);

    useOnViewportChange({
        onChange: ({ zoom }) => {
            setZoom(convertToPercentage(zoom));
        },
    });

    const zoomDuration = 200;
    const zoomInHandler = () => {
        zoomIn({ duration: zoomDuration });
    };

    const zoomOutHandler = () => {
        zoomOut({ duration: zoomDuration });
    };

    const resetZoom = () => {
        fitView({
            minZoom: 1,
            maxZoom: 1,
            duration: zoomDuration,
        });
    };

    const showAll = useCallback(() => {
        fitView({
            duration: 500,
            padding: 0.1,
            maxZoom: 0.8,
        });
    }, [fitView]);

    const showReorderConfirmation = useCallback(() => {
        showAlert({
            title: t('reorder_diagram_alert.title'),
            description: t('reorder_diagram_alert.description'),
            actionLabel: t('reorder_diagram_alert.reorder'),
            closeLabel: t('reorder_diagram_alert.cancel'),
            onAction: reorderTables,
        });
    }, [t, showAlert, reorderTables]);

    return (
        <div className="px-1">
            <Card className="h-[44px] bg-secondary p-0 shadow-none">
                <CardContent className="flex h-full flex-row items-center p-1">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span>
                                <ToolbarButton
                                    onClick={toggleFilter}
                                    className={cn(
                                        'transition-all duration-200',
                                        {
                                            'bg-pink-500 text-white hover:bg-pink-600 hover:text-white':
                                                hasActiveFilter,
                                        }
                                    )}
                                >
                                    <Search />
                                </ToolbarButton>
                            </span>
                        </TooltipTrigger>
                        <TooltipContent>
                            {t('toolbar.filter')}
                            <span className="ml-2 text-muted-foreground">
                                {
                                    keyboardShortcutsForOS[
                                        KeyboardShortcutAction.TOGGLE_FILTER
                                    ].keyCombinationLabel
                                }
                            </span>
                        </TooltipContent>
                    </Tooltip>
                    <Separator orientation="vertical" />
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span>
                                <ToolbarButton onClick={showAll}>
                                    <Scan />
                                </ToolbarButton>
                            </span>
                        </TooltipTrigger>
                        <TooltipContent>
                            {t('toolbar.show_all')}
                            <span className="ml-2 text-muted-foreground">
                                {
                                    keyboardShortcutsForOS[
                                        KeyboardShortcutAction.SHOW_ALL
                                    ].keyCombinationLabel
                                }
                            </span>
                        </TooltipContent>
                    </Tooltip>
                    <Separator orientation="vertical" />
                    <ToolbarButton
                        onClick={
                            collaborationUrl
                                ? stopCollaboration
                                : startCollaboration
                        }
                    >
                        <Users />
                    </ToolbarButton>
                    <ToolbarButton onClick={joinCollaboration}>
                        Join
                    </ToolbarButton>
                    {collaborationUrl ? (
                        <Button
                            variant="ghost"
                            onClick={() => {
                                const name = window.prompt(
                                    'Your name for this session',
                                    participantNameRef.current
                                );
                                if (!name?.trim()) return;
                                setParticipantName(name.trim());
                                clientRef.current?.send({
                                    protocolVersion:
                                        collaborationProtocolVersion,
                                    type: 'name',
                                    clientId: participantIdRef.current,
                                    name: name.trim(),
                                });
                            }}
                        >
                            {participantName}
                        </Button>
                    ) : null}
                    {collaborationUrl ? (
                        <Button
                            variant="ghost"
                            onClick={() =>
                                navigator.clipboard?.writeText(
                                    collaborationUrls.join('\n') ||
                                        collaborationUrl
                                )
                            }
                        >
                            Copy invite
                        </Button>
                    ) : null}
                    {collaborationStatus ? (
                        <span className="px-2 text-xs">
                            {collaborationStatus}
                        </span>
                    ) : null}
                    <Separator orientation="vertical" />
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span>
                                <ToolbarButton onClick={zoomOutHandler}>
                                    <ZoomOut />
                                </ToolbarButton>
                            </span>
                        </TooltipTrigger>
                        <TooltipContent>{t('toolbar.zoom_out')}</TooltipContent>
                    </Tooltip>
                    <Button
                        variant="ghost"
                        onClick={resetZoom}
                        className="w-[60px] p-2 hover:bg-primary-foreground"
                    >
                        {zoom}
                    </Button>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span>
                                <ToolbarButton onClick={zoomInHandler}>
                                    <ZoomIn />
                                </ToolbarButton>
                            </span>
                        </TooltipTrigger>
                        <TooltipContent>{t('toolbar.zoom_in')}</TooltipContent>
                    </Tooltip>
                    <Separator orientation="vertical" />
                    {!readonly ? (
                        <>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <span>
                                        <ToolbarButton
                                            onClick={showReorderConfirmation}
                                        >
                                            <LayoutGrid />
                                        </ToolbarButton>
                                    </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                    {t('toolbar.reorder_diagram')}
                                </TooltipContent>
                            </Tooltip>
                            <Separator orientation="vertical" />
                        </>
                    ) : null}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span>
                                <ToolbarButton
                                    onClick={undo}
                                    disabled={!hasUndo}
                                >
                                    <Undo />
                                </ToolbarButton>
                            </span>
                        </TooltipTrigger>
                        <TooltipContent>
                            {t('toolbar.undo')}
                            <span className="ml-2 text-muted-foreground">
                                {
                                    keyboardShortcutsForOS[
                                        KeyboardShortcutAction.UNDO
                                    ].keyCombinationLabel
                                }
                            </span>
                        </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <span>
                                <ToolbarButton
                                    onClick={redo}
                                    disabled={!hasRedo}
                                >
                                    <Redo />
                                </ToolbarButton>
                            </span>
                        </TooltipTrigger>
                        <TooltipContent>
                            {t('toolbar.redo')}
                            <span className="ml-2 text-muted-foreground">
                                {
                                    keyboardShortcutsForOS[
                                        KeyboardShortcutAction.REDO
                                    ].keyCombinationLabel
                                }
                            </span>
                        </TooltipContent>
                    </Tooltip>
                </CardContent>
            </Card>
        </div>
    );
};
