import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LazyInjector } from '../src/core/injector/lazy.js';
import { Session } from '../src/core/session/state.js';
import { RoutingDecision } from '../src/core/router/intent.js';
import fs from 'fs';

const mockSkillRegistry = {
    searchByKeywords: vi.fn().mockReturnValue([]),
    getSkill: vi.fn(),
    getSkillBody: vi.fn(),
    listSkills: vi.fn().mockReturnValue([]),
};

const mockSubagentRegistry = {
    getAgent: vi.fn(),
    listAgents: vi.fn().mockReturnValue([]),
};

const mockToolRegistry = {
    getCatalog: vi.fn().mockReturnValue({
        getAllEntries: vi.fn().mockReturnValue([{ id: 'tool_a' }, { id: 'tool_b' }]),
        getRagIndex: vi.fn().mockReturnValue({ search: vi.fn().mockReturnValue([]) })
    }),
};

const mockToolPackRegistry = {
    match: vi.fn().mockReturnValue([]),
    collectToolIds: vi.fn().mockReturnValue([]),
};

const mockProviderResolver = {
    getProvider: vi.fn(),
};

vi.mock('fs', () => ({
    default: {
        existsSync: vi.fn(),
        readFileSync: vi.fn(),
    }
}));

describe('LazyInjector (TP-01)', () => {
    let injector: LazyInjector;
    let session: Session;

    beforeEach(() => {
        vi.clearAllMocks();
        injector = new LazyInjector(
            mockSkillRegistry as any,
            mockSubagentRegistry as any,
            mockToolRegistry as any,
            mockToolPackRegistry as any
        );
        session = new Session('test-session');
    });

    it('should inject workspace context if agent requests it and file exists', async () => {
        const parsedInput = { mentions: [], skills: [], cleanText: 'hello' } as any;
        const decision: RoutingDecision = {
            intent: 'code_generate',
            confidence: 0.9,
            modelTier: 'default',
            suggestedSkills: [],
            suggestedToolPacks: [],
            systemPromptHint: ''
        } as any;

        mockSubagentRegistry.getAgent.mockReturnValue({
            name: 'coder',
            systemPrompt: 'Coder System Prompt',
            contextInject: ['tech-stack'],
            allowedTools: []
        });

        session.activeAgentId = 'coder';

        (fs.existsSync as any).mockReturnValue(true);
        (fs.readFileSync as any).mockReturnValue('We use React and Node.js');

        const result = await injector.resolve(
            parsedInput,
            decision,
            'Base Prompt',
            session,
            mockProviderResolver as any,
            '/fake/workspace'
        );

        expect(result.systemPrompt).toContain('Base Prompt');
        expect(result.systemPrompt).toContain('Coder System Prompt');
        expect(result.systemPrompt).toContain('--- Workspace Context: tech-stack ---');
        expect(result.systemPrompt).toContain('We use React and Node.js');

        expect(session.activatedTools.size).toBeGreaterThanOrEqual(0);
    });

    it('should inject skill body if skill is requested', async () => {
        const parsedInput = { mentions: [], skills: [{ value: 'my-skill' }], cleanText: 'hello' } as any;
        const decision: RoutingDecision = {
            intent: 'code_generate',
            confidence: 0.9,
            modelTier: 'default',
            suggestedSkills: [],
            suggestedToolPacks: [],
            systemPromptHint: ''
        } as any;

        mockSkillRegistry.getSkill.mockReturnValue({
            name: 'my-skill',
            tools: [{ name: 'my_tool', description: '', inputSchema: {} }]
        });
        mockSkillRegistry.getSkillBody.mockReturnValue('Skill instructions goes here.');
        mockSubagentRegistry.getAgent.mockReturnValue(null);

        const result = await injector.resolve(
            parsedInput,
            decision,
            'Base Prompt',
            session,
            mockProviderResolver as any,
            '/cwd'
        );

        expect(result.systemPrompt).toContain('--- Skill: my-skill ---');
        expect(result.systemPrompt).toContain('Skill instructions goes here.');
        expect(result.tools.length).toBe(1);
        expect(result.tools[0].name).toBe('my_tool');
    });
});
