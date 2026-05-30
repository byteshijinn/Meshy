import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { TaskEngine } from '../../../src/core/engine/index.js';
import { Session } from '../../../src/core/session/state.js';
import type { ILLMProvider } from '../../../src/core/llm/provider.js';

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
});
