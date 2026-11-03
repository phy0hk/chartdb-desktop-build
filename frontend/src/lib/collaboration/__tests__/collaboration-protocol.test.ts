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
});
