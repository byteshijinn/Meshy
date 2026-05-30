import type { SubagentConfig } from './loader.js';

export const SUBAGENT_USAGE_GUIDANCE = [
    '<subagent_usage>',
    'Use delegateToAgent for concrete, bounded sidecar tasks that materially advance the current task.',
    'Keep critical-path blocking work local when your next step depends on the result.',
    'Do not duplicate delegated work. Continue with non-overlapping local work while a delegate runs.',
    'When delegating, pass the exact agentName from the roster and a self-contained taskDescription with the expected output.',
    'Prefer agents whose tool whitelist and persona match the delegated task.',
    '</subagent_usage>',
].join('\n');

export function formatSubagentRoster(agents: SubagentConfig[]): string {
    if (agents.length === 0) return '';

    const lines = agents
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((agent) => {
            const description = agent.description || 'No description provided';
            const tools = agent.allowedTools.length > 0
                ? agent.allowedTools.join(', ')
                : 'all available tools';
            return `- ${agent.name}: ${description} (model: ${agent.model}; tools: ${tools}; report: ${agent.reportFormat})`;
        });

    return [
        '<subagents>',
        ...lines,
        '</subagents>',
    ].join('\n');
}

export function formatSubagentManagerPrompt(agents: SubagentConfig[]): string {
    const roster = formatSubagentRoster(agents);
    if (!roster) return '';
    return `${roster}\n\n${SUBAGENT_USAGE_GUIDANCE}`;
}

export function formatDelegateTaskBlock(taskDescription: string, expectedOutput?: string): string {
    const parts = [
        '<delegated_task>',
        taskDescription.trim(),
    ];

    const trimmedExpectedOutput = expectedOutput?.trim();
    if (trimmedExpectedOutput) {
        parts.push('', '<expected_output>', trimmedExpectedOutput, '</expected_output>');
    }

    parts.push('</delegated_task>');
    return parts.join('\n');
}
