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
});
