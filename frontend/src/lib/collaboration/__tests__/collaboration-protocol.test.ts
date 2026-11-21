import { describe, expect, it } from 'vitest';
import {
    decodeCollaborationMessage,
    parseCollaborationOutgoingMessage,
} from '../collaboration-protocol';

describe('collaboration protocol', () => {
    it('decodes a valid sequenced operation', () => {
        const operation = decodeCollaborationMessage({
            protocolVersion: 1,
            type: 'operation',
            id: 'op-1',
            clientId: 'peer-1',
            documentId: 'diagram-1',
            revision: 3,
            entityVersions: { 'table-1': 2 },
            payload: { action: 'rename', value: 'users' },
        });

        expect(operation.type).toBe('operation');
        if (operation.type === 'operation') {
            expect(operation.revision).toBe(3);
            expect(operation.entityVersions['table-1']).toBe(2);
        }
    });

    it('rejects unsupported versions, unknown fields, and oversized data', () => {
        expect(() =>
            decodeCollaborationMessage({ protocolVersion: 2, type: 'ping' })
        ).toThrow();
        expect(() =>
            decodeCollaborationMessage({
                protocolVersion: 1,
                type: 'ping',
                unexpected: true,
            })
        ).toThrow();
        expect(() =>
            decodeCollaborationMessage('x'.repeat(8 * 1024 * 1024 + 1))
        ).toThrow();
    });

    it('requires a host hello to include its document snapshot', () => {
        expect(() =>
            parseCollaborationOutgoingMessage({
                protocolVersion: 1,
                type: 'hello',
                clientId: 'host-1',
                documentId: 'diagram-1',
                role: 'host',
            })
        ).toThrow(/snapshot/);
    });

    it('allows a participant hello without knowing the host document ID', () => {
        expect(
            parseCollaborationOutgoingMessage({
                protocolVersion: 1,
                type: 'hello',
                clientId: 'peer-1',
                role: 'participant',
            })
        ).toMatchObject({ type: 'hello', role: 'participant' });
    });

    it('decodes a welcome with base and target revisions', () => {
        const welcome = decodeCollaborationMessage({
            protocolVersion: 1,
            type: 'welcome',
            documentId: 'diagram-1',
            revision: 0,
            targetRevision: 7,
            payload: { tables: [] },
        });

        expect(welcome.type).toBe('welcome');
        if (welcome.type === 'welcome') {
            expect(welcome.revision).toBe(0);
            expect(welcome.targetRevision).toBe(7);
        }
    });

    it('decodes a reject with last-writer attribution', () => {
        const reject = decodeCollaborationMessage({
            protocolVersion: 1,
            type: 'reject',
            id: 'op-1',
            code: 'stale_version',
            message: 'conflict',
            lastWriter: 'peer-2',
        });

        expect(reject.type).toBe('reject');
        if (reject.type === 'reject') {
            expect(reject.lastWriter).toBe('peer-2');
        }
    });

    it('decodes session_ended with optional fields and keeps strict validation', () => {
        expect(
            decodeCollaborationMessage({
                protocolVersion: 1,
                type: 'session_ended',
                documentId: 'diagram-1',
                message: 'The host ended the collaboration session',
            })
        ).toMatchObject({
            type: 'session_ended',
            documentId: 'diagram-1',
            message: 'The host ended the collaboration session',
        });
        expect(
            decodeCollaborationMessage({
                protocolVersion: 1,
                type: 'session_ended',
            })
        ).toMatchObject({ type: 'session_ended' });
        expect(() =>
            decodeCollaborationMessage({
                protocolVersion: 1,
                type: 'session_ended',
                message: 'x'.repeat(513),
            })
        ).toThrow();
    });

    it('allows 1024 entity versions but rejects 1025', () => {
        const versions = (count: number) =>
            Object.fromEntries(
                Array.from({ length: count }, (_, index) => [
                    `table-${index}`,
                    1,
                ])
            );
        const operation = {
            protocolVersion: 1 as const,
            type: 'operation' as const,
            id: 'op-1',
            clientId: 'peer-1',
            documentId: 'diagram-1',
            payload: { action: 'noop' },
        };

        expect(
            decodeCollaborationMessage({
                ...operation,
                entityVersions: versions(1024),
            }).type
        ).toBe('operation');
        expect(() =>
            decodeCollaborationMessage({
                ...operation,
                entityVersions: versions(1025),
            })
        ).toThrow();
    });

    it('accepts operation payloads above the old 256 KiB limit', () => {
        expect(
            parseCollaborationOutgoingMessage({
                protocolVersion: 1,
                type: 'operation',
                id: 'op-1',
                clientId: 'peer-1',
                documentId: 'diagram-1',
                entityVersions: { 'table-1': 2 },
                payload: { blob: 'x'.repeat(300 * 1024) },
            }).type
        ).toBe('operation');
    });
});
