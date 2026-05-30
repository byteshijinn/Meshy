import { describe, expect, it, vi } from 'vitest';
import { executeDelegate, normalizeDelegateTaskName } from '../../../src/core/tool/delegate-tool.js';
import { Session } from '../../../src/core/session/state.js';
import type { SubagentConfig } from '../../../src/core/subagents/loader.js';
import type { StandardMessage, StandardPrompt, StandardTool } from '../../../src/core/llm/provider.js';

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

const standardTools: StandardTool[] = [
    { name: 'readFile', description: 'Read file', inputSchema: {} },
    { name: 'grep', description: 'Search files', inputSchema: {} },
    { name: 'websearch', description: 'Search web', inputSchema: {} },
    { name: 'write', description: 'Write file', inputSchema: {} },
    { name: 'delegateToAgent', description: 'Delegate task', inputSchema: {} },
];

function manifest(permissionClass: string) {
    return {
        permissionClass,
        concurrencySafe: true,
        timeoutMs: null,
        retryable: false,
        outputPersistence: 'inline',
    };
}

function createContext(options: {
    agent?: SubagentConfig;
    provider: {
        generateResponseStream: (prompt: StandardPrompt, onEvent: (event: any) => void) => Promise<void>;
    };
    tools?: StandardTool[];
    execute?: (name: string, args: Record<string, unknown>, ctx: Record<string, unknown>) => Promise<{ output: string; isError?: boolean }>;
}) {
    const tools = options.tools ?? standardTools;
    const manifests: Record<string, ReturnType<typeof manifest>> = {
        readFile: manifest('read'),
        grep: manifest('read'),
        websearch: manifest('network'),
        write: manifest('write'),
        delegateToAgent: manifest('read'),
    };

    return {
        subagentRegistry: {
            getAgent: () => options.agent ?? baseAgent,
            listAgents: () => [options.agent ?? baseAgent],
        } as any,
        providerResolver: {
            getProvider: () => ({
                generateResponseStream: options.provider.generateResponseStream,
            }),
        } as any,
        toolRegistry: {
            toStandardTools: () => tools,
            getManifest: (name: string) => manifests[name] ?? null,
            execute: options.execute ?? vi.fn(async () => ({ output: 'tool output' })),
        } as any,
        parentSession: new Session('parent'),
        workspaceRoot: 'C:/workspace/project',
    };
}

function hasToolResult(messages: StandardMessage[], content: string): boolean {
    return messages.some((message) => (
        !Array.isArray(message.content)
        && typeof message.content === 'object'
        && message.content?.type === 'tool_result'
        && message.content.content === content
    ));
}

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
        const context = createContext({
            provider: {
                generateResponseStream: async (prompt: StandardPrompt, onEvent: (event: any) => void) => {
                    capturedPrompt = prompt;
                    onEvent({ type: 'text', data: '{"findings":[]}' });
                },
            },
        });
        context.parentSession = parentSession;

        const result = await executeDelegate(
            {
                agentName: 'reviewer',
                taskName: 'Review Engine Slice',
                taskDescription: 'Review src/core/engine/index.ts for regressions.',
                expectedOutput: 'Return findings with file and line references.',
            },
            context,
        );

        expect(result.success).toBe(true);
        expect(result.taskName).toBe('review_engine_slice');
        expect(result.sessionId).toContain('delegate-reviewer-review_engine_slice-');
        expect(result.toolExecution).toBe('read_only');
        expect(result.toolsGranted).toEqual(['readFile']);
        expect(result.toolCallsExecuted).toEqual([]);
        expect(capturedPrompt?.messages.map((m) => m.content)).toEqual([
            'recent context',
            'Review src/core/engine/index.ts for regressions.',
        ]);
        expect(capturedPrompt?.systemPrompt).toContain('<delegated_task>');
        expect(capturedPrompt?.systemPrompt).toContain('<task_name>');
        expect(capturedPrompt?.systemPrompt).toContain('review_engine_slice');
        expect(capturedPrompt?.systemPrompt).toContain('Return findings with file and line references.');
        expect(capturedPrompt?.systemPrompt).toContain('Return a valid JSON object');
        expect(capturedPrompt?.tools?.map((t) => t.name)).toEqual(['readFile']);
    });

    it('resolves preset tool aliases while denying non-read tools', async () => {
        let capturedPrompt: StandardPrompt | null = null;
        const agent: SubagentConfig = {
            ...baseAgent,
            allowedTools: ['read_file', 'grep_search', 'web_search', 'write'],
        };

        const result = await executeDelegate(
            {
                agentName: 'reviewer',
                taskDescription: 'Inspect changed files.',
            },
            createContext({
                agent,
                provider: {
                    generateResponseStream: async (prompt: StandardPrompt, onEvent: (event: any) => void) => {
                        capturedPrompt = prompt;
                        onEvent({ type: 'text', data: 'done' });
                    },
                },
            }),
        );

        expect(result.success).toBe(true);
        expect(result.toolsGranted).toEqual(['readFile', 'grep']);
        expect(capturedPrompt?.tools?.map((tool) => tool.name)).toEqual(['readFile', 'grep']);
        expect(result.toolsDenied).toEqual([
            expect.objectContaining({
                name: 'web_search',
                resolvedName: 'websearch',
                permissionClass: 'network',
            }),
            expect.objectContaining({
                name: 'write',
                resolvedName: 'write',
                permissionClass: 'write',
            }),
        ]);
    });

    it('executes granted read-only tool calls before returning the final report', async () => {
        const prompts: StandardPrompt[] = [];
        const execute = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({
            output: 'file text',
        }));

        const result = await executeDelegate(
            {
                agentName: 'reviewer',
                taskDescription: 'Read src/index.ts and summarize risks.',
            },
            createContext({
                provider: {
                    generateResponseStream: async (prompt: StandardPrompt, onEvent: (event: any) => void) => {
                        prompts.push(prompt);
                        if (prompts.length === 1) {
                            onEvent({ type: 'tool_call_start', data: { id: 'call-1', name: 'readFile' } });
                            onEvent({ type: 'tool_call_chunk', data: '{"filePath":"src/index.ts"}' });
                            onEvent({ type: 'tool_call_end' });
                            return;
                        }
                        onEvent({ type: 'text', data: '{"summary":"reviewed"}' });
                    },
                },
                execute,
            }),
        );

        expect(result.success).toBe(true);
        expect(result.response).toBe('{"summary":"reviewed"}');
        expect(result.toolCallsExecuted).toEqual([
            { id: 'call-1', name: 'readFile', argumentsText: '{"filePath":"src/index.ts"}' },
        ]);
        expect(execute).toHaveBeenCalledWith(
            'readFile',
            { filePath: 'src/index.ts' },
            expect.objectContaining({
                workspaceRoot: 'C:/workspace/project',
            }),
        );
        expect(prompts).toHaveLength(2);
        expect(hasToolResult(prompts[1].messages, 'file text')).toBe(true);
    });

    it('removes nested delegation from all-tools subagents', async () => {
        const agent: SubagentConfig = {
            ...baseAgent,
            allowedTools: [],
        };

        const result = await executeDelegate(
            {
                agentName: 'reviewer',
                taskDescription: 'Inspect context and report.',
            },
            createContext({
                agent,
                provider: {
                    generateResponseStream: async (_prompt: StandardPrompt, onEvent: (event: any) => void) => {
                        onEvent({ type: 'text', data: 'done' });
                    },
                },
            }),
        );

        expect(result.success).toBe(true);
        expect(result.toolsGranted).toEqual(['readFile', 'grep']);
        expect(result.toolsDenied).toEqual(expect.arrayContaining([
            expect.objectContaining({
                name: 'delegateToAgent',
                resolvedName: 'delegateToAgent',
                reason: 'nested delegation is disabled for delegated agents',
            }),
        ]));
    });

    it('fails closed when a delegated model requests unavailable or unsafe tool calls', async () => {
        const result = await executeDelegate(
            {
                agentName: 'reviewer',
                taskDescription: 'Write a patch.',
            },
            createContext({
                provider: {
                    generateResponseStream: async (_prompt: StandardPrompt, onEvent: (event: any) => void) => {
                        onEvent({ type: 'tool_call_start', data: { id: 'call-1', name: 'write' } });
                        onEvent({ type: 'tool_call_chunk', data: '{"filePath":"src/index.ts","content":"x"}' });
                        onEvent({ type: 'tool_call_end' });
                    },
                },
            }),
        );

        expect(result.success).toBe(false);
        expect(result.error?.kind).toBe('unsupported_tool_call');
        expect(result.error?.toolCalls).toEqual([
            { id: 'call-1', name: 'write', argumentsText: '{"filePath":"src/index.ts","content":"x"}' },
        ]);
        expect(result.response).toContain('unavailable or unsafe tool calls');
    });

    it('classifies empty delegated model responses as failures', async () => {
        const result = await executeDelegate(
            {
                agentName: 'reviewer',
                taskDescription: 'Return a report.',
            },
            createContext({
                provider: {
                    generateResponseStream: async () => undefined,
                },
                tools: [],
            }),
        );

        expect(result.success).toBe(false);
        expect(result.error?.kind).toBe('empty_response');
        expect(result.response).toBe('Delegate completed without returning text.');
    });
});
