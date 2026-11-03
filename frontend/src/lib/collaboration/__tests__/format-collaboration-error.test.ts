import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { formatCollaborationError } from '../format-collaboration-error';

describe('formatCollaborationError', () => {
    it('renders validation paths and messages on separate readable lines', () => {
        const error = new z.ZodError([
            {
                code: 'custom',
                message: 'Invalid input',
                path: ['entityVersions', 'table-1'],
            },
        ]);

        expect(formatCollaborationError(error)).toBe(
            'entityVersions.table-1: Invalid input'
        );
    });

    it('preserves ordinary error messages', () => {
        expect(formatCollaborationError(new Error('Connection failed'))).toBe(
            'Connection failed'
        );
    });

    it('handles non-error values', () => {
        expect(formatCollaborationError('unknown failure')).toBe(
            'unknown failure'
        );
    });
});
