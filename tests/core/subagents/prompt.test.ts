import { describe, expect, it } from 'vitest';
import { formatSubagentRoster, SUBAGENT_USAGE_GUIDANCE } from '../../../src/core/subagents/prompt.js';
import type { SubagentConfig } from '../../../src/core/subagents/loader.js';

function agent(overrides: Partial<SubagentConfig>): SubagentConfig {
    return {
        name: 'reviewer',
        model: 'default',
        allowedTools: ['readFile', 'grepSearch'],
        description: 'Find correctness and security issues',
        systemPrompt: 'Review code.',
        filePath: '/agents/reviewer.md',
        triggerKeywords: [],
        maxContextMessages: 6,
        reportFormat: 'json',
        emoji: '',
        contextInject: [],
        isPreset: true,
        ...overrides,
    };
}

describe('subagent prompt helpers', () => {
    it('renders a compact roster with usage guidance for the manager prompt', () => {
        const roster = formatSubagentRoster([
            agent({ name: 'reviewer' }),
            agent({ name: 'coder', allowedTools: [], reportFormat: 'text', description: 'Implement bounded patches' }),
        ]);

        expect(roster).toContain('<subagents>');
        expect(roster).toContain('- reviewer: Find correctness and security issues');
        expect(roster).toContain('declared tools: readFile, grepSearch');
        expect(roster).toContain('delegate execution: read-only');
        expect(roster).toContain('- coder: Implement bounded patches');
        expect(roster).toContain('declared tools: all read-only inspection tools');
        expect(roster).toContain('</subagents>');
        expect(SUBAGENT_USAGE_GUIDANCE).toContain('Keep critical-path blocking work local');
        expect(SUBAGENT_USAGE_GUIDANCE).toContain('one synchronous call');
        expect(SUBAGENT_USAGE_GUIDANCE).toContain('only granted read-only inspection tools');
        expect(SUBAGENT_USAGE_GUIDANCE).not.toContain('while a delegate runs');
    });
});
