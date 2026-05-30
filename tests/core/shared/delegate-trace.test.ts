import { describe, expect, it } from 'vitest';
import { createDelegateTracePayload, normalizeDelegateTracePayload } from '../../../src/shared/delegate-trace.js';

describe('delegate trace payloads', () => {
    it('normalizes delegate tool execution traces for UI and replay consumers', () => {
        const trace = createDelegateTracePayload({
            agentName: 'reviewer',
            taskName: 'review_patch',
            sessionId: 'delegate-reviewer-review_patch-1',
            success: false,
            toolExecution: 'read_only',
            toolCallLimit: 6,
            toolsGranted: ['readFile', 'grep'],
            toolsDenied: [
                { name: 'write', resolvedName: 'write', permissionClass: 'write', reason: 'blocked' },
            ],
            toolCallsExecuted: [
                { id: 'call-1', name: 'readFile', argumentsText: '{"filePath":"src/index.ts"}' },
            ],
            errorKind: 'model_error',
            errorMessage: 'provider failed',
            responsePreview: 'partial report',
        });

        expect(normalizeDelegateTracePayload(trace)).toEqual(trace);
        expect(normalizeDelegateTracePayload({ agentName: 'reviewer' })).toBeUndefined();
    });
});
