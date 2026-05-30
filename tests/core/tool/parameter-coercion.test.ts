import { describe, expect, it } from 'vitest';
import { BashTool } from '../../../src/core/tool/bash.js';
import { WebSearchTool } from '../../../src/core/tool/websearch.js';
import { CommandStatusTool } from '../../../src/core/tool/terminal/command_status.js';

describe('tool numeric parameter coercion', () => {
    it('accepts string numbers for common LLM-emitted numeric fields', () => {
        const bash = BashTool.parameters.safeParse({
            command: 'echo ok',
            timeout: '1000',
            description: 'Prints ok',
        });
        const websearch = WebSearchTool.parameters.safeParse({
            query: 'Meshy project',
            maxResults: '3',
        });
        const commandStatus = CommandStatusTool.parameters.safeParse({
            CommandId: 'cmd-1',
            OutputCharacterCount: '2000',
        });

        expect(bash.success && bash.data.timeout).toBe(1000);
        expect(websearch.success && websearch.data.maxResults).toBe(3);
        expect(commandStatus.success && commandStatus.data.OutputCharacterCount).toBe(2000);
    });
});
