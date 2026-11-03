import { z } from 'zod';
import { DatabaseEdition } from '@/lib/domain/database-edition';
import { DatabaseType } from '@/lib/domain/database-type';
import type { Diagram } from '@/lib/domain/diagram';

export type DiagramCollection =
    | 'tables'
    | 'relationships'
    | 'dependencies'
    | 'areas'
    | 'customTypes'
    | 'notes';

export type DiagramEntityChange =
    | {
          kind: 'upsert';
          collection: DiagramCollection;
          id: string;
          value: unknown;
      }
    | { kind: 'delete'; collection: DiagramCollection; id: string }
    | {
          kind: 'metadata';
          id: string;
          value: Pick<Diagram, 'name' | 'databaseType' | 'databaseEdition'>;
      };

export interface DiagramOperationPayload {
    changes: DiagramEntityChange[];
}

const collectionSchema = z.enum([
    'tables',
    'relationships',
    'dependencies',
    'areas',
    'customTypes',
    'notes',
]);
const identifierSchema = z.string().min(1).max(128);
const operationChangeSchema = z.discriminatedUnion('kind', [
    z
        .object({
            kind: z.literal('delete'),
            collection: collectionSchema,
            id: identifierSchema,
        })
        .strict(),
    z
        .object({
            kind: z.literal('upsert'),
            collection: collectionSchema,
            id: identifierSchema,
            value: z.record(z.unknown()),
        })
        .strict(),
    z
        .object({
            kind: z.literal('metadata'),
            id: identifierSchema,
            value: z
                .object({
                    name: z.string(),
                    databaseType: z.nativeEnum(DatabaseType),
                    databaseEdition: z
                        .nativeEnum(DatabaseEdition)
                        .nullable()
                        .optional(),
                })
                .strict(),
        })
        .strict(),
]);
const operationPayloadSchema = z
    .object({ changes: z.array(operationChangeSchema).min(1).max(64) })
    .strict();

const collections: DiagramCollection[] = [
    'tables',
    'relationships',
    'dependencies',
    'areas',
    'customTypes',
    'notes',
];

export function buildDiagramOperation(
    previous: Diagram,
    current: Diagram,
    versions: ReadonlyMap<string, number>
): {
    payload: DiagramOperationPayload;
    entityVersions: Record<string, number>;
} | null {
    if (previous.id !== current.id) {
        throw new Error(
            'A collaboration session cannot change diagram identity'
        );
    }

    const changes: DiagramEntityChange[] = [];
    const entityVersions: Record<string, number> = {};

    for (const collection of collections) {
        const before = new Map(
            (previous[collection] ?? []).map((entity) => [entity.id, entity])
        );
        const after = new Map(
            (current[collection] ?? []).map((entity) => [entity.id, entity])
        );
        const ids = new Set([...before.keys(), ...after.keys()]);
        for (const id of ids) {
            const oldValue = before.get(id);
            const newValue = after.get(id);
            if (oldValue && !newValue) {
                changes.push({ kind: 'delete', collection, id });
                entityVersions[id] = versions.get(id) ?? 0;
            } else if (
                newValue &&
                (!oldValue || !sameValue(oldValue, newValue))
            ) {
                changes.push({
                    kind: 'upsert',
                    collection,
                    id,
                    value: newValue,
                });
                entityVersions[id] = versions.get(id) ?? 0;
            }
        }
    }

    if (
        previous.name !== current.name ||
        previous.databaseType !== current.databaseType ||
        previous.databaseEdition !== current.databaseEdition
    ) {
        changes.push({
            kind: 'metadata',
            id: current.id,
            value: {
                name: current.name,
                databaseType: current.databaseType,
                databaseEdition: current.databaseEdition,
            },
        });
        entityVersions[current.id] = versions.get(current.id) ?? 0;
    }

    if (changes.length === 0) return null;
    return { payload: { changes }, entityVersions };
}

export function parseDiagramOperationPayload(
    value: unknown,
    entityVersions: Record<string, number>
): DiagramOperationPayload {
    const payload = operationPayloadSchema.parse(value);
    const ids = payload.changes.map((change) => change.id);
    if (new Set(ids).size !== ids.length) {
        throw new Error('Diagram operation contains duplicate entities');
    }
    const versionIds = Object.keys(entityVersions);
    if (
        ids.length !== versionIds.length ||
        ids.some((id) => !entityVersions[id] && entityVersions[id] !== 0)
    ) {
        throw new Error(
            'Diagram operation entity versions do not match its changes'
        );
    }
    if (
        ids.some(
            (id) => !Object.prototype.hasOwnProperty.call(entityVersions, id)
        )
    ) {
        throw new Error(
            'Diagram operation entity versions do not match its changes'
        );
    }
    for (const change of payload.changes) {
        if (change.kind === 'upsert' && change.value.id !== change.id) {
            throw new Error(
                'Diagram operation entity ID does not match its value'
            );
        }
    }
    return payload as DiagramOperationPayload;
}

export function seedEntityVersions(diagram: Diagram): Map<string, number> {
    const versions = new Map<string, number>();
    const visit = (value: unknown): void => {
        if (Array.isArray(value)) {
            value.forEach(visit);
            return;
        }
        if (typeof value !== 'object' || value === null) return;
        if ('id' in value && typeof value.id === 'string')
            versions.set(value.id, 0);
        Object.values(value).forEach(visit);
    };
    visit(diagram);
    return versions;
}

export function applyDiagramOperation(
    diagram: Diagram,
    payload: DiagramOperationPayload
): Diagram {
    const result: Diagram = {
        ...diagram,
        tables: [...(diagram.tables ?? [])],
        relationships: [...(diagram.relationships ?? [])],
        dependencies: [...(diagram.dependencies ?? [])],
        areas: [...(diagram.areas ?? [])],
        customTypes: [...(diagram.customTypes ?? [])],
        notes: [...(diagram.notes ?? [])],
    };

    for (const change of payload.changes) {
        if (change.kind === 'metadata') {
            if (change.id !== diagram.id) {
                throw new Error(
                    'Diagram metadata operation targets another diagram'
                );
            }
            result.name = change.value.name;
            result.databaseType = change.value.databaseType;
            result.databaseEdition = change.value.databaseEdition;
            continue;
        }

        const entities = result[change.collection] as Array<{ id: string }>;
        const existingIndex = entities.findIndex(
            (entity) => entity.id === change.id
        );
        if (change.kind === 'delete') {
            if (existingIndex >= 0) entities.splice(existingIndex, 1);
            continue;
        }
        if (!isEntity(change.value) || change.value.id !== change.id) {
            throw new Error(
                'Diagram operation entity ID does not match its value'
            );
        }
        const value = change.value as { id: string };
        if (existingIndex >= 0) entities[existingIndex] = value;
        else entities.push(value);
    }

    return result;
}

function sameValue(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

function isEntity(value: unknown): value is { id: string } {
    return (
        typeof value === 'object' &&
        value !== null &&
        'id' in value &&
        typeof value.id === 'string'
    );
}
