import { ZodError } from 'zod';

export function formatCollaborationError(error: unknown): string {
    if (error instanceof ZodError) {
        return error.issues
            .map(
                ({ path, message }) =>
                    `${path.join('.') || 'Input'}: ${message}`
            )
            .join('\n');
    }

    return error instanceof Error ? error.message : String(error);
}
