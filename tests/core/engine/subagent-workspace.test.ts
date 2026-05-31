import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { TaskEngine } from '../../../src/core/engine/index.js';
import { exportReplay } from '../../../src/core/session/replay.js';
import { Session } from '../../../src/core/session/state.js';
import type { ILLMProvider, StandardPrompt } from '../../../src/core/llm/provider.js';

const cleanupPaths: string[] = [];

afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    for (const dir of cleanupPaths.splice(0)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

describe('TaskEngine subagent registry', () => {
    it('loads workspace-local .meshy/agents definitions', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meshy-agents-'));
        cleanupPaths.push(root);
        const agentsDir = path.join(root, '.meshy', 'agents');
        fs.mkdirSync(agentsDir, { recursive: true });
        fs.writeFileSync(
            path.join(agentsDir, 'workspace-reviewer.md'),
            [
                '---',
                'name: workspace-reviewer',
                'description: Workspace reviewer',
                'model: default',
                'allowed-tools: ["readFile"]',
                '---',
                'Review only this workspace.',
            ].join('\n'),
            'utf8',
        );

        const provider: ILLMProvider = {
            generateResponseStream: async () => undefined,
            supportsEmbedding: () => false,
            generateEmbedding: async () => [],
        };
        const resolver = {
            getProvider: () => provider,
            getEmbeddingProvider: () => null,
        };
        const workspace = {
            rootPath: root,
            snapshotManager: {},
            reflectionEngine: {},
            memoryStore: {},
            mcpHost: {
                getAllTools: () => [],
                getServerSummaries: () => [],
            },
            lspManager: {
                startServer: async () => undefined,
                getDiagnostics: () => [],
            },
        };
        const engine = new TaskEngine(resolver as any, workspace as any, new Session('test'), { maxRetries: 1 });

        expect(engine.getSubagentRegistry().getAgent('workspace-reviewer')?.systemPrompt).toContain('Review only this workspace');
    });

    it('delegates with the currently active session after session swaps', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meshy-delegate-session-'));
        cleanupPaths.push(root);
        let capturedPrompt: StandardPrompt | null = null;

        const provider: ILLMProvider = {
            generateResponseStream: async (prompt, onEvent) => {
                capturedPrompt = prompt;
                onEvent({ type: 'text', data: 'done' });
            },
            supportsEmbedding: () => false,
            generateEmbedding: async () => [],
        };
        const resolver = {
            getProvider: () => provider,
            getEmbeddingProvider: () => null,
        };
        const workspace = {
            rootPath: root,
            snapshotManager: {},
            reflectionEngine: {},
            memoryStore: {},
            mcpHost: {
                getAllTools: () => [],
                getServerSummaries: () => [],
            },
            lspManager: {
                startServer: async () => undefined,
                getDiagnostics: () => [],
            },
        };

        const oldSession = new Session('old-session');
        oldSession.addMessage({ role: 'user', content: 'old context' });
        const engine = new TaskEngine(resolver as any, workspace as any, oldSession, { maxRetries: 1 });

        const activeSession = new Session('active-session');
        activeSession.addMessage({ role: 'user', content: 'fresh context' });
        engine.setSession(activeSession);

        const result = await engine.getToolRegistry().execute('delegateToAgent', {
            agentName: 'reviewer',
            taskDescription: 'Review current context.',
        }, {
            sessionId: activeSession.id,
            workspaceRoot: root,
            session: activeSession,
        });

        expect(capturedPrompt?.messages.map((message) => message.content)).toContain('fresh context');
        expect(capturedPrompt?.messages.map((message) => message.content)).not.toContain('old context');
        expect(result.metadata?.delegateTrace).toMatchObject({
            agentName: 'reviewer',
            success: true,
            toolExecution: 'read_only',
            responsePreview: 'done',
        });
        expect(result.metadata?.runtimeTaskId).toEqual(expect.stringMatching(/^task-/));
        expect(activeSession.runtimeTasks).toHaveLength(1);
        expect(activeSession.runtimeTasks[0]).toMatchObject({
            id: result.metadata?.runtimeTaskId,
            kind: 'delegate',
            description: '@agent:reviewer',
            status: 'completed',
            metadata: {
                agentName: 'reviewer',
                delegateTrace: {
                    agentName: 'reviewer',
                    success: true,
                    responsePreview: 'done',
                },
            },
        });

        const replay = exportReplay(activeSession);
        expect(replay.runtimeTasks?.[0]).toMatchObject({
            id: result.metadata?.runtimeTaskId,
            kind: 'delegate',
            status: 'completed',
        });
    });
});
