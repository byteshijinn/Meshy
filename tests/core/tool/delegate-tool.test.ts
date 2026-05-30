import { describe, expect, it } from 'vitest';
import { executeDelegate, normalizeDelegateTaskName } from '../../../src/core/tool/delegate-tool.js';
import { Session } from '../../../src/core/session/state.js';
import type { SubagentConfig } from '../../../src/core/subagents/loader.js';
import type { StandardPrompt } from '../../../src/core/llm/provider.js';

const baseAgent: SubagentConfig = {
    name: 'reviewer',
    model: 'default',
    allowedTools: ['readFile'],
    description: 'Review risky changes',
    systemPrompt: 'You are a focused reviewer.',
    filePath: '/agents/reviewer.md',
    triggerKeywords: [],
    maxContextMessages: 1,
    reportFormat: 'json',
    emoji: '',
    contextInject: [],
    isPreset: true,
};

describe('executeDelegate', () => {
    it('normalizes optional delegate task names for traceability', () => {
        expect(normalizeDelegateTaskName('Review Engine Slice')).toBe('review_engine_slice');
        expect(normalizeDelegateTaskName('  !!!!  ')).toBeUndefined();
        expect(normalizeDelegateTaskName(undefined)).toBeUndefined();
    });

    it('frames delegated tasks with expected output and pruned parent context', async () => {
        let capturedPrompt: StandardPrompt | null = null;
        const parentSession = new Session('parent');
        parentSession.addMessage({ role: 'user', content: 'old context' });
        parentSession.addMessage({ role: 'assistant', content: 'recent context' });

        const result = await executeDelegate(
            {
                agentName: 'reviewer',
                taskName: 'Review Engine Slice',
                taskDescription: 'Review src/core/engine/index.ts for regressions.',
                expectedOutput: 'Return findings with file and line references.',
            },
            {
                subagentRegistry: {
                    getAgent: () => baseAgent,
                    listAgents: () => [baseAgent],
                } as any,
                providerResolver: {
                    getProvider: () => ({
                        generateResponseStream: async (prompt: StandardPrompt, onEvent: (event: any) => void) => {
                            capturedPrompt = prompt;
                            onEvent({ type: 'text', data: '{"findings":[]}' });
                        },
                    }),
                } as any,
                toolRegistry: {
                    toStandardTools: () => [
                        { name: 'readFile', description: 'Read file', inputSchema: {} },
                        { name: 'write', description: 'Write file', inputSchema: {} },
                    ],
                } as any,
                parentSession,
            },
        );

        expect(result.success).toBe(true);
        expect(result.taskName).toBe('review_engine_slice');
        expect(result.sessionId).toContain('delegate-reviewer-review_engine_slice-');
        expect(result.toolsGranted).toEqual(['readFile']);
        expect(capturedPrompt?.messages.map((m) => m.content)).toEqual([
            'recent context',
            'Review src/core/engine/index.ts for regressions.',
        ]);
        expect(capturedPrompt?.systemPrompt).toContain('<delegated_task>');
        expect(capturedPrompt?.systemPrompt).toContain('<task_name>');
        expect(capturedPrompt?.systemPrompt).toContain('review_engine_slice');
        expect(capturedPrompt?.systemPrompt).toContain('Return findings with file and line references.');
        expect(capturedPrompt?.systemPrompt).toContain('Return a valid JSON object');
        expect(capturedPrompt?.tools.map((t) => t.name)).toEqual(['readFile']);
    });

    it('fails closed when a delegated model requests unsupported tool calls', async () => {
        const result = await executeDelegate(
            {
                agentName: 'reviewer',
                taskDescription: 'Read src/index.ts and summarize risks.',
            },
            {
                subagentRegistry: {
                    getAgent: () => baseAgent,
                    listAgents: () => [baseAgent],
                } as any,
                providerResolver: {
                    getProvider: () => ({
                        generateResponseStream: async (_prompt: StandardPrompt, onEvent: (event: any) => void) => {
                            onEvent({ type: 'tool_call_start', data: { id: 'call-1', name: 'readFile' } });
                            onEvent({ type: 'tool_call_chunk', data: '{"filePath":"src/index.ts"}' });
                            onEvent({ type: 'tool_call_end' });
                        },
                    }),
                } as any,
                toolRegistry: {
                    toStandardTools: () => [
                        { name: 'readFile', description: 'Read file', inputSchema: {} },
                    ],
                } as any,
                parentSession: new Session('parent'),
            },
        );

        expect(result.success).toBe(false);
        expect(result.error?.kind).toBe('unsupported_tool_call');
        expect(result.error?.toolCalls).toEqual([
            { id: 'call-1', name: 'readFile', argumentsText: '{"filePath":"src/index.ts"}' },
        ]);
        expect(result.response).toContain('single-turn text reports only');
    });

    it('classifies empty delegated model responses as failures', async () => {
        const result = await executeDelegate(
            {
                agentName: 'reviewer',
                taskDescription: 'Return a report.',
            },
            {
                subagentRegistry: {
                    getAgent: () => baseAgent,
                    listAgents: () => [baseAgent],
                } as any,
                providerResolver: {
                    getProvider: () => ({
                        generateResponseStream: async () => undefined,
                    }),
                } as any,
                toolRegistry: {
                    toStandardTools: () => [],
                } as any,
                parentSession: new Session('parent'),
            },
        );

        expect(result.success).toBe(false);
        expect(result.error?.kind).toBe('empty_response');
        expect(result.response).toBe('Delegate completed without returning text.');
    });
});
