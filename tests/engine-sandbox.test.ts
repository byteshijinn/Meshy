import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskEngine } from '../src/core/engine/index.js';
import { Session } from '../src/core/session/state.js';
import { ExecutionMode } from '../src/core/sandbox/execution.js';

const mockProviderResolver = {
    getProvider: vi.fn().mockReturnValue({
        generateResponseStream: vi.fn(async (prompt, callback) => {
            callback({ type: 'tool_call_start', data: { id: 'test_id', name: 'runCommand' } });
            callback({ type: 'tool_call_chunk', data: '{"command": "rm -rf /"}' });
            callback({ type: 'done' });
        })
    })
};

const mockAci = {
    terminalManager: {
        executeCommand: vi.fn()
    }
};

const mockWorkspace = {
    rootPath: '/fake/root',
    getRepoMap: vi.fn().mockReturnValue(''),
    mcpHost: {
        getServerSummaries: vi.fn().mockReturnValue([]),
        getAllTools: vi.fn().mockReturnValue([]),
        ensureAutoStartServers: vi.fn().mockResolvedValue(true)
    },
    snapshotManager: {
        appendMessage: vi.fn(),
        appendStateUpdate: vi.fn()
    },
    reflectionEngine: {
        recallRelevantCapsules: vi.fn().mockResolvedValue(''),
        onSessionComplete: vi.fn().mockResolvedValue(true)
    },
    memoryStore: {
        initialize: vi.fn().mockResolvedValue(true),
        getUserProfile: vi.fn().mockResolvedValue(null)
    }
};

describe('TaskEngine Sandbox Defense (TP-03)', () => {
    let engine: TaskEngine;
    let session: Session;
    let mockAskUser: any;

    beforeEach(() => {
        vi.clearAllMocks();
        session = new Session('test-session');

        mockAskUser = vi.fn().mockResolvedValue('REJECT');

        engine = new TaskEngine(
            mockProviderResolver as any,
            mockWorkspace as any,
            session,
            { askUser: mockAskUser, executionMode: 'smart' as ExecutionMode }
        );

        engine.logger = {
            engine: vi.fn(),
            tool: vi.fn(),
            error: vi.fn()
        } as any;
    });

    it('should abort LLM loop immediately when sandbox rejects a tool call', async () => {
        const interruptSpy = vi.spyOn(engine, 'interrupt');

        await engine.runTask('Delete my root directory');

        expect(mockAskUser).toHaveBeenCalled();
        expect(interruptSpy).toHaveBeenCalledTimes(1);

        const rejectionMessage = session.history.find((m: any) =>
            m.role === 'user' && typeof m.content === 'string' && m.content.includes('Execution aborted')
        );
        expect(rejectionMessage).toBeDefined();

        expect(mockProviderResolver.getProvider().generateResponseStream).toHaveBeenCalled();
    });
});
