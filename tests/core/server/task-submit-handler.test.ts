import { describe, expect, it, vi } from 'vitest';
import { handleTaskSubmitFromDaemon, normalizeSubmittedTaskPayload } from '../../../src/index.js';
import { Session } from '../../../src/core/session/state.js';

describe('task submit daemon handler', () => {
    it('normalizes task payload generation options', () => {
        expect(normalizeSubmittedTaskPayload({
            prompt: 'hello',
            mode: 'smart',
            attachments: [{ name: 'a.txt' }],
            temperature: 0.2,
            maxTokens: 1024,
            topP: 0.9,
        })).toEqual({
            submittedPrompt: 'hello',
            contextOpts: {
                mode: 'smart',
                attachments: [{ name: 'a.txt' }],
                generationOptions: {
                    temperature: 0.2,
                    maxTokens: 1024,
                    topP: 0.9,
                },
            },
        });
    });

    it('broadcasts done and session list after successful task runs', async () => {
        const session = new Session('session-1');
        const engine = {
            runTask: vi.fn().mockResolvedValue(undefined),
        };
        const daemon = {
            broadcast: vi.fn(),
        };
        const sessionManager = {
            listSessions: vi.fn().mockReturnValue([{ id: 'session-1' }]),
        };

        await handleTaskSubmitFromDaemon(
            { prompt: 'Generate tests', mode: 'smart' },
            'task-1',
            { getSession: () => session, engine, daemon, sessionManager },
        );

        expect(session.title).toBe('Generate tests');
        expect(engine.runTask).toHaveBeenCalledWith('Generate tests', {
            mode: 'smart',
            attachments: undefined,
            generationOptions: {
                temperature: undefined,
                maxTokens: undefined,
                topP: undefined,
            },
        });
        expect(daemon.broadcast).toHaveBeenCalledWith('session:list', { sessions: [{ id: 'session-1' }] });
        expect(daemon.broadcast).toHaveBeenCalledWith('agent:done', { id: 'task-1' });
    });

    it('broadcasts an error message and done when task execution fails', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const session = new Session('session-1');
        const engine = {
            runTask: vi.fn().mockRejectedValue(new Error('provider unavailable')),
        };
        const daemon = {
            broadcast: vi.fn(),
        };
        const sessionManager = {
            listSessions: vi.fn().mockReturnValue([{ id: 'session-1' }]),
        };

        try {
            await handleTaskSubmitFromDaemon(
                { prompt: 'Run failed task' },
                'task-2',
                {
                    getSession: () => session,
                    engine,
                    daemon,
                    sessionManager,
                    createErrorEventId: () => 'error-test',
                },
            );
        } finally {
            errorSpy.mockRestore();
        }

        expect(daemon.broadcast).toHaveBeenCalledWith('agent:text', {
            text: '\n[Error] Task failed: provider unavailable\n',
            id: 'error-test',
        });
        expect(daemon.broadcast).toHaveBeenCalledWith('session:list', { sessions: [{ id: 'session-1' }] });
        expect(daemon.broadcast).toHaveBeenCalledWith('agent:done', { id: 'task-2' });
    });
});
