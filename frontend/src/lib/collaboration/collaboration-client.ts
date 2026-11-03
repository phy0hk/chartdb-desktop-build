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
          status: 'connecting' | 'connected' | 'disconnected' | 'error';
          error?: string;
      };

export class CollaborationClient {
    private socket: WebSocket | null = null;
    private readonly listeners = new Set<
        (event: CollaborationClientEvent) => void
    >();
    private clientId = '';

    subscribe(listener: (event: CollaborationClientEvent) => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    async connect(
        url: string,
        hello: CollaborationHello
    ): Promise<CollaborationWelcome> {
        this.close();
        this.clientId = hello.clientId;
        const socket = new WebSocket(url);
        this.socket = socket;
        this.emit({ type: 'status', status: 'connecting' });

        return new Promise<CollaborationWelcome>((resolve, reject) => {
            let settled = false;
            socket.onopen = () => {
                this.emit({ type: 'status', status: 'connected' });
                socket.send(JSON.stringify(hello));
            };
            socket.onmessage = (event) => {
                try {
                    const message = collaborationMessageSchema.parse(
                        JSON.parse(String(event.data))
                    );
                    this.emit({ type: 'message', message });
                    if (message.type === 'welcome' && !settled) {
                        settled = true;
                        resolve(message);
                    } else if (message.type === 'error' && !settled) {
                        settled = true;
                        reject(new Error(message.message || message.code));
                        socket.close();
                    }
                } catch (error) {
                    this.emit({
                        type: 'status',
                        status: 'error',
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    });
                    if (!settled) {
                        settled = true;
                        reject(error);
                    }
                    socket.close();
                }
            };
            socket.onerror = () => {
                this.emit({
                    type: 'status',
                    status: 'error',
                    error: 'Connection failed',
                });
                if (!settled) {
                    settled = true;
                    reject(new Error('Connection failed'));
                }
            };
            socket.onclose = () => {
                this.emit({ type: 'status', status: 'disconnected' });
                if (!settled) {
                    settled = true;
                    reject(
                        new Error('Connection closed before session welcome')
                    );
                }
                if (this.socket === socket) this.socket = null;
            };
        });
    }

    send(message: CollaborationOutgoingMessage): boolean {
        const parsed = parseCollaborationOutgoingMessage(message);
        const socket = this.socket;
        if (!socket || socket.readyState !== WebSocket.OPEN) return false;
        socket.send(JSON.stringify(parsed));
        return true;
    }

    close(): void {
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
