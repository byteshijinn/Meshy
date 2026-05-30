import { describe, expect, it } from 'vitest';
import {
    createRuntimeTaskId,
    isTerminalRuntimeTaskStatus,
    RUNTIME_TASK_STATUSES,
    type RuntimeApprovalRequestEvent,
    type RuntimeBackgroundCompletionEvent,
    type RuntimeTaskStatus,
    type RuntimeToolCallEvent,
    type RuntimeToolResultEvent,
} from '../../../src/core/runtime/protocol.js';

describe('runtime protocol', () => {
    it('creates task ids with the task prefix', () => {
        expect(createRuntimeTaskId()).toMatch(/^task-/);
    });

    it('recognizes terminal runtime task statuses', () => {
        expect(isTerminalRuntimeTaskStatus('completed')).toBe(true);
        expect(isTerminalRuntimeTaskStatus('failed')).toBe(true);
        expect(isTerminalRuntimeTaskStatus('cancelled')).toBe(true);
        expect(isTerminalRuntimeTaskStatus('running')).toBe(false);
    });

    it('exposes the extended runtime task status set', () => {
        const statuses = new Set<RuntimeTaskStatus>(RUNTIME_TASK_STATUSES);
        expect(statuses.has('waiting_approval')).toBe(true);
        expect(statuses.has('blocked')).toBe(true);
        expect(statuses.has('cancelled')).toBe(true);
    });

    it('supports shared runtime event shapes', () => {
        const toolCallEvent: RuntimeToolCallEvent = {
            type: 'tool_call',
            sessionId: 'session-1',
            taskId: 'task-1',
            toolCallId: 'tool-1',
            toolName: 'readFile',
            argumentsText: '{"path":"src/index.ts"}',
            createdAt: '2026-04-04T00:00:00.000Z',
        };
        const toolResultEvent: RuntimeToolResultEvent = {
            type: 'tool_result',
            sessionId: 'session-1',
            taskId: 'task-1',
            toolCallId: 'tool-1',
            toolName: 'readFile',
            content: 'file contents',
            isError: false,
            createdAt: '2026-04-04T00:00:01.000Z',
        };
        const approvalEvent: RuntimeApprovalRequestEvent = {
            type: 'approval_request',
            sessionId: 'session-1',
            taskId: 'task-1',
            approvalId: 'approval-1',
            action: 'write-file',
            reason: 'Needs permission',
            createdAt: '2026-04-04T00:00:02.000Z',
        };
        const completionEvent: RuntimeBackgroundCompletionEvent = {
            type: 'background_completion',
            sessionId: 'session-1',
            taskId: 'task-1',
            status: 'completed',
            summary: 'done',
            createdAt: '2026-04-04T00:00:03.000Z',
        };

        expect(toolCallEvent.type).toBe('tool_call');
        expect(toolResultEvent.type).toBe('tool_result');
        expect(approvalEvent.type).toBe('approval_request');
        expect(completionEvent.status).toBe('completed');
    });
});
