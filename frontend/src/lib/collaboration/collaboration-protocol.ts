import { z } from 'zod';

export const collaborationProtocolVersion = 1 as const;

const identifierSchema = z.string().min(1).max(128);
const payloadSchema = z
    .unknown()
    .refine((value) => value !== undefined && value !== null);

const baseMessageSchema = z
    .object({
        protocolVersion: z.literal(collaborationProtocolVersion),
    })
    .strict();

export const collaborationMessageSchema = z.discriminatedUnion('type', [
    baseMessageSchema.extend({
        type: z.literal('hello'),
        clientId: identifierSchema,
        documentId: identifierSchema.optional(),
        role: z.enum(['host', 'participant']),
        name: z.string().max(64).optional(),
        payload: payloadSchema.optional(),
    }),
    baseMessageSchema.extend({
        type: z.literal('welcome'),
        documentId: identifierSchema,
        revision: z.number().int().nonnegative().optional(),
        payload: payloadSchema,
    }),
    baseMessageSchema.extend({
        type: z.literal('operation'),
        id: identifierSchema,
        clientId: identifierSchema,
        documentId: identifierSchema,
        revision: z.number().int().positive().optional(),
        entityVersions: z
            .record(identifierSchema, z.number().int().nonnegative())
            .refine(
                (versions) =>
                    Object.keys(versions).length > 0 &&
                    Object.keys(versions).length <= 64
            ),
        payload: payloadSchema,
    }),
    baseMessageSchema.extend({
        type: z.literal('ack'),
        id: identifierSchema,
        clientId: identifierSchema.optional(),
        documentId: identifierSchema.optional(),
        revision: z.number().int().positive(),
    }),
    baseMessageSchema.extend({
        type: z.literal('reject'),
        id: identifierSchema,
        clientId: identifierSchema.optional(),
        documentId: identifierSchema.optional(),
        code: identifierSchema,
        message: z.string().max(512),
        revision: z.number().int().nonnegative().optional(),
    }),
    baseMessageSchema.extend({
        type: z.literal('resync'),
        clientId: identifierSchema,
        documentId: identifierSchema,
        revision: z.number().int().nonnegative(),
    }),
    baseMessageSchema.extend({
        type: z.literal('cursor'),
        clientId: identifierSchema,
        position: z
            .object({
                x: z.number().finite().min(-1e7).max(1e7),
                y: z.number().finite().min(-1e7).max(1e7),
            })
            .strict(),
    }),
    baseMessageSchema.extend({
        type: z.literal('name'),
        clientId: identifierSchema,
        name: z.string().min(1).max(64),
    }),
    baseMessageSchema.extend({
        type: z.literal('selection'),
        clientId: identifierSchema,
        selection: z.array(identifierSchema).max(256),
    }),
    baseMessageSchema.extend({
        type: z.literal('editing'),
        clientId: identifierSchema,
        targetId: identifierSchema,
    }),
    baseMessageSchema.extend({
        type: z.literal('preview'),
        clientId: identifierSchema,
        targetId: identifierSchema,
        payload: payloadSchema,
    }),
    baseMessageSchema.extend({
        type: z.literal('leave'),
        clientId: identifierSchema,
    }),
    baseMessageSchema.extend({
        type: z.literal('ping'),
        clientId: identifierSchema.optional(),
    }),
    baseMessageSchema.extend({
        type: z.literal('pong'),
        clientId: identifierSchema.optional(),
    }),
    baseMessageSchema.extend({
        type: z.literal('error'),
        code: identifierSchema,
        message: z.string().max(512),
    }),
]);

export type CollaborationMessage = z.infer<typeof collaborationMessageSchema>;
export type CollaborationHello = Extract<
    CollaborationMessage,
    { type: 'hello' }
>;
export type CollaborationWelcome = Extract<
    CollaborationMessage,
    { type: 'welcome' }
>;
export type CollaborationOperation = Extract<
    CollaborationMessage,
    { type: 'operation' }
>;

export type CollaborationOutgoingMessage = Extract<
    CollaborationMessage,
    {
        type:
            | 'hello'
            | 'operation'
            | 'cursor'
            | 'name'
            | 'selection'
            | 'editing'
            | 'preview'
            | 'leave'
            | 'ping'
            | 'resync';
    }
>;

const outgoingTypes = new Set([
    'hello',
    'operation',
    'cursor',
    'name',
    'selection',
    'editing',
    'preview',
    'leave',
    'ping',
    'resync',
]);

export function parseCollaborationOutgoingMessage(
    message: CollaborationOutgoingMessage
): CollaborationOutgoingMessage {
    const parsed = collaborationMessageSchema.parse(message);
    if (!outgoingTypes.has(parsed.type)) {
        throw new Error(
            `Message type ${parsed.type} cannot be sent by a client`
        );
    }
    validateHello(parsed);
    const serialized = JSON.stringify(parsed);
    const maxSize = parsed.type === 'operation' ? 256 * 1024 : 8 * 1024 * 1024;
    if (new TextEncoder().encode(serialized).byteLength > maxSize) {
        throw new Error('Collaboration message exceeds the size limit');
    }
    return parsed as CollaborationOutgoingMessage;
}

export function decodeCollaborationMessage(
    data: unknown
): CollaborationMessage {
    if (
        typeof data === 'string' &&
        new TextEncoder().encode(data).byteLength > 8 * 1024 * 1024
    ) {
        throw new Error('Collaboration message exceeds the size limit');
    }
    const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
    const message = collaborationMessageSchema.parse(parsedData);
    validateHello(message);
    return message;
}

function validateHello(message: CollaborationMessage): void {
    if (message.type !== 'hello') return;
    if (
        message.role === 'host' &&
        (!message.documentId || message.payload === undefined)
    ) {
        throw new Error(
            'Host hello requires a document ID and initial snapshot'
        );
    }
    if (message.role === 'participant' && message.payload !== undefined) {
        throw new Error('Participant hello must not include a snapshot');
    }
}
