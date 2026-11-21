import {
    collaborationMessageSchema,
    parseCollaborationOutgoingMessage,
    type CollaborationHello,
    type CollaborationMessage,
    type CollaborationOutgoingMessage,
    type CollaborationWelcome,
} from './collaboration-protocol';

export type CollaborationClientEvent =
    | { type: 'message'; message: CollaborationMessage }
    | {
          type: 'status';
          status:
              | 'connecting'
              | 'connected'
              | 'disconnected'
              | 'error'
              | 'reconnecting';
          error?: string;
          url?: string;
          attempt?: number;
      };

export interface CollaborationConnectOptions {
    reconnect?: boolean;
}

export const RECONNECT_BASE_DELAY_MS = 500;
export const RECONNECT_MAX_DELAY_MS = 8_000;

/** Attempt numbers are 1-based. Jitter defaults to 0 so retries are deterministic. */
export function reconnectDelay(attempt: number, jitter = 0): number {
    const bounded = Math.max(1, Math.floor(attempt));
    const delay = Math.min(
        RECONNECT_BASE_DELAY_MS * 2 ** (bounded - 1),
        RECONNECT_MAX_DELAY_MS
    );
    if (jitter <= 0) return delay;
    const spread = delay * Math.min(1, jitter);
    return delay - spread / 2 + Math.random() * spread;
}

type Handshake = {
    resolve: (welcome: CollaborationWelcome) => void;
    reject: (error: unknown) => void;
};

export class CollaborationClient {
    private socket: WebSocket | null = null;
    private readonly listeners = new Set<
        (event: CollaborationClientEvent) => void
    >();
    private clientId = '';
    private url = '';
    private hello: CollaborationHello | null = null;
    private reconnectEnabled = true;
    private reconnectAttempt = 0;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    subscribe(listener: (event: CollaborationClientEvent) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    async connect(
        url: string,
        hello: CollaborationHello,
        options: CollaborationConnectOptions = {}
    ): Promise<CollaborationWelcome> {
        // Cancels any pending reconnect and invalidates the previous socket's
        // handlers, so calling connect() again cannot start a second loop.
        this.close();
        this.url = url;
        this.hello = hello;
        this.reconnectEnabled = options.reconnect !== false;
        this.clientId = hello.clientId;

        return new Promise<CollaborationWelcome>((resolve, reject) => {
            this.openSocket(url, hello, { resolve, reject });
        });
    }

    private openSocket(
        url: string,
        hello: CollaborationHello,
        handshake?: Handshake
    ): void {
        let socket: WebSocket;
        try {
            socket = new WebSocket(url);
        } catch (error) {
            const detail =
                error instanceof Error ? error.message : String(error);
            if (handshake) {
                this.emit({ type: 'status', status: 'error', error: detail });
                handshake.reject(error);
            } else {
                this.scheduleReconnect(detail);
            }
            return;
        }
        this.socket = socket;
        if (handshake) this.emit({ type: 'status', status: 'connecting' });

        let settled = false;
        const settleReject = (error: unknown) => {
            if (settled || !handshake) return;
            settled = true;
            handshake.reject(error);
        };

        socket.onopen = () => {
            if (this.socket !== socket) return;
            socket.send(JSON.stringify(hello));
        };

        socket.onmessage = (event) => {
            if (this.socket !== socket) return;
            let message: CollaborationMessage;
            try {
                message = collaborationMessageSchema.parse(
                    JSON.parse(String(event.data))
                );
            } catch (error) {
                const detail =
                    error instanceof Error ? error.message : String(error);
                if (handshake && !settled) {
                    this.emit({
                        type: 'status',
                        status: 'error',
                        error: detail,
                    });
                }
                settleReject(error);
                this.socket = null;
                socket.close();
                if (!handshake) this.scheduleReconnect(detail);
                return;
            }

            // Deliver every typed message first, including session_ended, so
            // subscribers can show the host's reason before teardown.
            this.emit({ type: 'message', message });

            if (message.type === 'error' && !settled) {
                // Keep the machine-readable code: callers need it to tell a
                // retryable join failure from a permanent handshake rejection.
                const detail = message.message
                    ? `${message.code}: ${message.message}`
                    : message.code;
                settleReject(new Error(detail));
                this.socket = null;
                socket.close();
                if (!handshake) this.scheduleReconnect(detail);
                return;
            }

            if (message.type === 'session_ended') {
                this.stopReconnecting();
                this.socket = null;
                socket.close();
                this.emit({
                    type: 'status',
                    status: 'disconnected',
                    error: message.message || 'Session ended by host',
                });
                return;
            }

            if (message.type === 'welcome') {
                if (!settled && handshake) {
                    settled = true;
                    handshake.resolve(message);
                }
                this.emit({ type: 'status', status: 'connected' });
            }
        };

        socket.onerror = () => {
            if (this.socket !== socket) return;
            if (handshake && !settled) {
                this.emit({
                    type: 'status',
                    status: 'error',
                    error: 'Connection failed',
                });
                settleReject(new Error('Connection failed'));
                this.socket = null;
                socket.close();
                return;
            }
            // Already established (or a retry attempt): keep retrying instead
            // of rejecting the original, already-resolved connect() promise.
            this.socket = null;
            socket.close();
            this.scheduleReconnect('Connection failed');
        };

        socket.onclose = () => {
            const wasCurrent = this.socket === socket;
            settleReject(new Error('Connection closed before session welcome'));
            if (!wasCurrent) return;
            this.socket = null;
            this.scheduleReconnect();
        };
    }

    private scheduleReconnect(reason?: string): void {
        if (!this.reconnectEnabled || !this.url || !this.hello) return;
        if (this.reconnectTimer !== null) return;
        this.reconnectAttempt += 1;
        const attempt = this.reconnectAttempt;
        this.emit({
            type: 'status',
            status: 'reconnecting',
            attempt,
            url: this.url,
            ...(reason ? { error: reason } : {}),
        });
        const { url, hello } = this;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (!this.reconnectEnabled) return;
            this.openSocket(url, hello);
        }, reconnectDelay(attempt));
    }

    private stopReconnecting(): void {
        if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.reconnectAttempt = 0;
    }

    send(message: CollaborationOutgoingMessage): boolean {
        const parsed = parseCollaborationOutgoingMessage(message);
        const socket = this.socket;
        if (!socket || socket.readyState !== WebSocket.OPEN) return false;
        socket.send(JSON.stringify(parsed));
        return true;
    }

    close(): void {
        if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.reconnectAttempt = 0;
        const socket = this.socket;
        this.socket = null;
        if (!socket) return;
        if (socket.readyState === WebSocket.OPEN && this.clientId) {
            socket.send(
                JSON.stringify({
                    protocolVersion: 1,
                    type: 'leave',
                    clientId: this.clientId,
                })
            );
        }
        socket.close();
    }

    private emit(event: CollaborationClientEvent): void {
        for (const listener of this.listeners) listener(event);
    }
}
