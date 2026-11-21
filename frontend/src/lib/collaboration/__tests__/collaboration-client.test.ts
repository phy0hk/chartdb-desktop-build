import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    CollaborationClient,
    reconnectDelay,
    type CollaborationClientEvent,
} from '../collaboration-client';
import type {
    CollaborationHello,
    CollaborationWelcome,
} from '../collaboration-protocol';

class FakeWebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    static instances: FakeWebSocket[] = [];

    readonly url: string;
    readyState = FakeWebSocket.CONNECTING;
    sent: string[] = [];
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;

    constructor(url: string) {
        this.url = url;
        FakeWebSocket.instances.push(this);
    }

    open(): void {
        this.readyState = FakeWebSocket.OPEN;
        this.onopen?.();
    }

    receive(message: unknown): void {
        this.onmessage?.({ data: JSON.stringify(message) });
    }

    fail(): void {
        this.onerror?.();
    }

    /** Simulate the server closing an established socket unexpectedly. */
    drop(): void {
        this.readyState = FakeWebSocket.CLOSED;
        this.onclose?.();
    }

    send(data: string): void {
        this.sent.push(data);
    }

    close(): void {
        if (
            this.readyState === FakeWebSocket.OPEN ||
            this.readyState === FakeWebSocket.CONNECTING
        ) {
            this.readyState = FakeWebSocket.CLOSED;
            this.onclose?.();
        }
    }
}

const hello: CollaborationHello = {
    protocolVersion: 1,
    type: 'hello',
    clientId: 'peer-1',
    role: 'participant',
};

const welcome: CollaborationWelcome = {
    protocolVersion: 1,
    type: 'welcome',
    documentId: 'diagram-1',
    revision: 0,
    targetRevision: 1,
    payload: { tables: [] },
};

function collect(client: CollaborationClient): CollaborationClientEvent[] {
    const events: CollaborationClientEvent[] = [];
    client.subscribe((event) => events.push(event));
    return events;
}

function statusEvents(events: CollaborationClientEvent[], status: string) {
    return events.filter(
        (event) => event.type === 'status' && event.status === status
    );
}

async function establish(
    client: CollaborationClient,
    url = 'ws://lan/session'
): Promise<FakeWebSocket> {
    const connected = client.connect(url, hello);
    const socket = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
    socket.open();
    socket.receive(welcome);
    await connected;
    return socket;
}

describe('reconnectDelay', () => {
    it('doubles from 500ms and caps at 8s', () => {
        expect([1, 2, 3, 4, 5, 6].map((n) => reconnectDelay(n))).toEqual([
            500, 1000, 2000, 4000, 8000, 8000,
        ]);
    });
});

describe('CollaborationClient reconnect', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        FakeWebSocket.instances = [];
        vi.stubGlobal('WebSocket', FakeWebSocket);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('reconnects after a drop with the same hello: reconnecting then connected', async () => {
        const client = new CollaborationClient();
        const events = collect(client);
        const first = await establish(client);

        events.length = 0;
        first.drop();

        const reconnecting = statusEvents(events, 'reconnecting');
        expect(reconnecting).toHaveLength(1);
        expect(reconnecting[0]).toMatchObject({
            attempt: 1,
            url: 'ws://lan/session',
        });

        await vi.advanceTimersByTimeAsync(499);
        expect(FakeWebSocket.instances).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(FakeWebSocket.instances).toHaveLength(2);

        const second = FakeWebSocket.instances[1];
        second.open();
        expect(JSON.parse(second.sent[0])).toMatchObject({
            type: 'hello',
            clientId: 'peer-1',
        });
        second.receive(welcome);

        expect(statusEvents(events, 'connected')).toHaveLength(1);
        client.close();
    });

    it('does not reconnect after explicit close()', async () => {
        const client = new CollaborationClient();
        const events = collect(client);
        const first = await establish(client);

        events.length = 0;
        client.close();
        first.drop();

        await vi.advanceTimersByTimeAsync(10_000);
        expect(statusEvents(events, 'reconnecting')).toHaveLength(0);
        expect(FakeWebSocket.instances).toHaveLength(1);
    });

    it('emits session_ended as a message, disconnects, and stops reconnecting', async () => {
        const client = new CollaborationClient();
        const events = collect(client);
        const first = await establish(client);

        events.length = 0;
        first.receive({
            protocolVersion: 1,
            type: 'session_ended',
            message: 'The host ended the collaboration session',
        });

        expect(events).toContainEqual({
            type: 'message',
            message: expect.objectContaining({ type: 'session_ended' }),
        });
        expect(events).toContainEqual({
            type: 'status',
            status: 'disconnected',
            error: 'The host ended the collaboration session',
        });
        expect(statusEvents(events, 'reconnecting')).toHaveLength(0);

        first.drop();
        await vi.advanceTimersByTimeAsync(10_000);
        expect(FakeWebSocket.instances).toHaveLength(1);
    });

    it('uses a clear default error when session_ended has no message', async () => {
        const client = new CollaborationClient();
        const events = collect(client);
        const first = await establish(client);

        first.receive({ protocolVersion: 1, type: 'session_ended' });
        expect(events).toContainEqual({
            type: 'status',
            status: 'disconnected',
            error: 'Session ended by host',
        });
    });

    it('rejects a handshake error without reconnecting', async () => {
        const client = new CollaborationClient();
        const events = collect(client);
        const connected = client.connect('ws://lan/session', hello);
        const first = FakeWebSocket.instances[0];
        first.open();
        first.receive({
            protocolVersion: 1,
            type: 'error',
            code: 'protocol_version_required',
            message: 'protocolVersion is required',
        });

        await expect(connected).rejects.toThrow('protocolVersion is required');
        await vi.advanceTimersByTimeAsync(10_000);
        expect(statusEvents(events, 'reconnecting')).toHaveLength(0);
        expect(FakeWebSocket.instances).toHaveLength(1);
    });

    it('keeps retrying with backoff when a reconnect attempt is rejected', async () => {
        const client = new CollaborationClient();
        const events = collect(client);
        await establish(client);

        FakeWebSocket.instances[0].drop();
        await vi.advanceTimersByTimeAsync(500);
        const retry = FakeWebSocket.instances[1];
        retry.open();
        retry.receive({
            protocolVersion: 1,
            type: 'error',
            code: 'session_unavailable',
            message: 'Session unavailable',
        });

        expect(
            statusEvents(events, 'reconnecting').map(
                (event) => event.type === 'status' && event.attempt
            )
        ).toEqual([1, 2]);

        await vi.advanceTimersByTimeAsync(1_000);
        const nextRetry = FakeWebSocket.instances[2];
        expect(nextRetry).toBeDefined();
        nextRetry.open();
        nextRetry.receive(welcome);
        expect(statusEvents(events, 'connected')).toHaveLength(2);
        client.close();
    });

    it('keeps retrying after a dial error on a reconnect attempt', async () => {
        const client = new CollaborationClient();
        const events = collect(client);
        await establish(client);

        FakeWebSocket.instances[0].drop();
        await vi.advanceTimersByTimeAsync(500);
        FakeWebSocket.instances[1].fail();

        expect(statusEvents(events, 'reconnecting')).toHaveLength(2);
        await vi.advanceTimersByTimeAsync(1_000);
        expect(FakeWebSocket.instances).toHaveLength(3);
        client.close();
    });

    it('cancels a pending reconnect when connect() is called again', async () => {
        const client = new CollaborationClient();
        const events = collect(client);
        await establish(client);

        FakeWebSocket.instances[0].drop();
        expect(statusEvents(events, 'reconnecting')).toHaveLength(1);

        const secondConnect = client.connect('ws://lan/new-session', hello);
        const replacement = FakeWebSocket.instances[1];
        expect(replacement.url).toBe('ws://lan/new-session');

        await vi.advanceTimersByTimeAsync(10_000);
        expect(FakeWebSocket.instances).toHaveLength(2);

        replacement.open();
        replacement.receive(welcome);
        await expect(secondConnect).resolves.toMatchObject({ type: 'welcome' });
        client.close();
    });

    it('honors reconnect disabled', async () => {
        const client = new CollaborationClient();
        const events = collect(client);
        client.connect('ws://lan/session', hello, { reconnect: false });
        const first = FakeWebSocket.instances[0];
        first.open();
        first.receive(welcome);
        await vi.advanceTimersByTimeAsync(0);

        first.drop();
        await vi.advanceTimersByTimeAsync(10_000);
        expect(statusEvents(events, 'reconnecting')).toHaveLength(0);
        expect(FakeWebSocket.instances).toHaveLength(1);
    });
});
