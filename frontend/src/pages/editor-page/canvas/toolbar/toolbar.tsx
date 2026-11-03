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

const convertToPercentage = (value: number) => `${Math.round(value * 100)}%`;

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
    const { currentDiagram, loadDiagramFromData } = useChartDB();
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
    const socketRef = useRef<WebSocket | null>(null);
    const lastRemoteRef = useRef('');
    const lastSentRef = useRef('');
    const hostRef = useRef(false);

    useEffect(() => {
        const socket = socketRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) return;
        const snapshot = JSON.stringify(currentDiagram);
        if (
            snapshot !== lastRemoteRef.current &&
            snapshot !== lastSentRef.current
        ) {
            lastSentRef.current = snapshot;
            socket.send(snapshot);
        }
    }, [currentDiagram]);

    const startCollaboration = async () => {
        if (!window.go?.main?.App) {
            setCollaborationStatus(
                'Collaboration requires the Wails desktop app.'
            );
            return;
        }
        try {
            const session = await window.go.main.App.StartCollaboration();
            hostRef.current = true;
            setCollaborationUrl(session.url);
            setCollaborationUrls(session.urls ?? [session.url]);
            connectCollaboration(session.url);
        } catch (error) {
            setCollaborationStatus(String(error));
        }
    };

    const connectCollaboration = (url: string) => {
        socketRef.current?.close();
        const socket = new WebSocket(url);
        socketRef.current = socket;
        socket.onopen = () => {
            setCollaborationStatus('Connected');
            socket.send(
                JSON.stringify({
                    type: 'name',
                    id: participantIdRef.current,
                    name: participantName,
                })
            );
            if (hostRef.current) {
                const snapshot = JSON.stringify(currentDiagramRef.current);
                lastRemoteRef.current = snapshot;
                lastSentRef.current = snapshot;
                socket.send(snapshot);
            }
        };
        socket.onclose = () => setCollaborationStatus('Disconnected');
        socket.onerror = () => setCollaborationStatus('Connection failed');
        socket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message?.type === 'cursor' || message?.type === 'name') {
                    window.dispatchEvent(
                        new CustomEvent('collaboration:peer', {
                            detail: message,
                        })
                    );
                    return;
                }
                const snapshot = JSON.stringify(message);
                lastRemoteRef.current = snapshot;
                lastSentRef.current = snapshot;
                loadDiagramFromData(message);
            } catch {
                setCollaborationStatus(
                    'Received an invalid collaboration message'
                );
            }
        };
        const sendCursor = (event: Event) => {
            const socket = socketRef.current;
            if (!socket || socket.readyState !== WebSocket.OPEN) return;
            const position = (event as CustomEvent<{ x: number; y: number }>)
                .detail;
            socket.send(
                JSON.stringify({
                    type: 'cursor',
                    id: participantIdRef.current,
                    name: participantNameRef.current,
                    position,
                })
            );
        };
        window.addEventListener('collaboration:cursor', sendCursor);
        socket.addEventListener('close', () =>
            window.removeEventListener('collaboration:cursor', sendCursor)
        );
    };

    const joinCollaboration = () => {
        const url = window.prompt('Enter the collaboration WebSocket URL');
        if (url) {
            hostRef.current = false;
            setCollaborationUrl(url);
            connectCollaboration(url);
        }
    };

    const stopCollaboration = async () => {
        socketRef.current?.close();
        socketRef.current = null;
        hostRef.current = false;
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
                                const socket = socketRef.current;
                                if (socket?.readyState === WebSocket.OPEN) {
                                    socket.send(
                                        JSON.stringify({
                                            type: 'name',
                                            id: participantIdRef.current,
                                            name: name.trim(),
                                        })
                                    );
                                }
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
