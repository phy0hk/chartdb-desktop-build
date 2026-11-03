import { describe, expect, it } from 'vitest';
import { DatabaseType } from '@/lib/domain/database-type';
import type { Diagram } from '@/lib/domain/diagram';
import {
    applyDiagramOperation,
    buildDiagramOperation,
    parseDiagramOperationPayload,
    seedEntityVersions,
} from '../diagram-operations';

const createDiagram = (overrides: Record<string, unknown> = {}): Diagram =>
    ({
        id: 'diagram-1',
        name: 'Schema',
        databaseType: DatabaseType.POSTGRESQL,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        tables: [
            {
                id: 'table-1',
                name: 'users',
                fields: [{ id: 'field-1', name: 'id' }],
            },
        ],
        relationships: [{ id: 'relationship-1', name: 'user-role' }],
        dependencies: [],
        areas: [
            { id: 'area-1', name: 'Core', x: 0, y: 0, width: 100, height: 100 },
        ],
        customTypes: [],
        notes: [],
        ...overrides,
    }) as unknown as Diagram;

describe('diagram collaboration operations', () => {
    it('groups entity changes and uses each entity current version', () => {
        const previous = createDiagram();
        const current = createDiagram({
            tables: [
                {
                    id: 'table-1',
                    name: 'people',
                    fields: [{ id: 'field-1', name: 'id' }],
                },
            ],
            areas: [
                {
                    id: 'area-1',
                    name: 'Core',
                    x: 10,
                    y: 20,
                    width: 100,
                    height: 100,
                },
            ],
            notes: [{ id: 'note-1', content: 'Review' }],
        });
        const operation = buildDiagramOperation(
            previous,
            current,
            new Map([
                ['table-1', 2],
                ['area-1', 4],
                ['note-1', 0],
            ])
        );

        expect(operation?.entityVersions).toEqual({
            'table-1': 2,
            'area-1': 4,
            'note-1': 0,
        });
        expect(operation?.payload.changes).toHaveLength(3);
        expect(
            operation?.payload.changes.some(
                (change) =>
                    change.kind === 'upsert' &&
                    change.collection === 'tables' &&
                    change.id === 'table-1'
            )
        ).toBe(true);
    });

    it('seeds entity versions and validates remote payload entity versions', () => {
        const diagram = createDiagram();
        const versions = seedEntityVersions(diagram);
        expect(versions.get('diagram-1')).toBe(0);
        expect(versions.get('field-1')).toBe(0);
        const operation = buildDiagramOperation(
            diagram,
            createDiagram({ name: 'Updated' }),
            versions
        );
        expect(operation).not.toBeNull();
        expect(
            parseDiagramOperationPayload(
                operation?.payload,
                operation?.entityVersions ?? {}
            ).changes
        ).toHaveLength(1);
        expect(() =>
            parseDiagramOperationPayload(operation?.payload, { wrong: 0 })
        ).toThrow(/versions/);
    });

    it('accepts null database editions in metadata operations', () => {
        const diagram = createDiagram({ databaseEdition: null });
        const operation = buildDiagramOperation(
            createDiagram(),
            diagram,
            seedEntityVersions(diagram)
        );

        expect(operation?.payload.changes).toContainEqual({
            kind: 'metadata',
            id: 'diagram-1',
            value: {
                name: 'Schema',
                databaseType: DatabaseType.POSTGRESQL,
                databaseEdition: null,
            },
        });
        expect(
            parseDiagramOperationPayload(
                operation?.payload,
                operation?.entityVersions ?? {}
            )
        ).toEqual(operation?.payload);
    });

    it('returns no operation for timestamps or unchanged diagram state', () => {
        const previous = createDiagram();
        const current = createDiagram({
            updatedAt: new Date('2025-01-01T00:00:00.000Z'),
        });
        expect(buildDiagramOperation(previous, current, new Map())).toBeNull();
    });

    it('applies entity deletes, upserts, and metadata changes', () => {
        const initial = createDiagram();
        const payload = {
            changes: [
                {
                    kind: 'delete' as const,
                    collection: 'relationships' as const,
                    id: 'relationship-1',
                },
                {
                    kind: 'upsert' as const,
                    collection: 'notes' as const,
                    id: 'note-1',
                    value: { id: 'note-1', content: 'Added remotely' },
                },
                {
                    kind: 'metadata' as const,
                    id: 'diagram-1',
                    value: {
                        name: 'Shared schema',
                        databaseType: DatabaseType.POSTGRESQL,
                    },
                },
            ],
        };

        const result = applyDiagramOperation(initial, payload);
        expect(result.relationships).toEqual([]);
        expect(result.notes).toEqual([
            { id: 'note-1', content: 'Added remotely' },
        ]);
        expect(result.name).toBe('Shared schema');
        expect(initial.relationships).toHaveLength(1);
    });

    it('rejects changes that target another diagram or mismatch an entity ID', () => {
        expect(() =>
            applyDiagramOperation(createDiagram(), {
                changes: [
                    {
                        kind: 'metadata',
                        id: 'different-diagram',
                        value: {
                            name: 'Wrong',
                            databaseType: DatabaseType.POSTGRESQL,
                        },
                    },
                ],
            })
        ).toThrow(/another diagram/);
        expect(() =>
            applyDiagramOperation(createDiagram(), {
                changes: [
                    {
                        kind: 'upsert',
                        collection: 'tables',
                        id: 'table-1',
                        value: { id: 'different-table' },
                    },
                ],
            })
        ).toThrow(/does not match/);
    });
});
