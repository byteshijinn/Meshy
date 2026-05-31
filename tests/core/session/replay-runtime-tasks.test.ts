import { describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Session } from '../../../src/core/session/state.js';
import { exportReplay, loadReplay } from '../../../src/core/session/replay.js';

describe('replay runtime tasks', () => {
    it('exports runtime task records', () => {
        const session = new Session('session-runtime-tasks');
        session.upsertRuntimeTask({
            id: 'task-delegate-reviewer',
            kind: 'delegate',
            description: '@agent:reviewer inspect trace',
            status: 'completed',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:01.000Z',
            metadata: {
                agentName: 'reviewer',
            },
        });

        const replay = exportReplay(session);

        expect(replay.runtimeTasks).toEqual([
            {
                id: 'task-delegate-reviewer',
                kind: 'delegate',
                description: '@agent:reviewer inspect trace',
                status: 'completed',
                createdAt: '2026-01-01T00:00:00.000Z',
                updatedAt: '2026-01-01T00:00:01.000Z',
                metadata: {
                    agentName: 'reviewer',
                },
            },
        ]);
    });

    it('normalizes legacy replay files without runtime task records', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meshy-legacy-runtime-tasks-'));
        const filePath = path.join(dir, 'legacy.replay.json');
        fs.writeFileSync(filePath, JSON.stringify({
            sessionId: 'legacy',
            exportedAt: '2026-03-29T00:00:00.000Z',
            totalSteps: 0,
            steps: [],
            blackboard: { currentGoal: '', tasks: [] },
        }), 'utf8');

        const loaded = loadReplay(filePath);

        expect(loaded?.runtimeTasks).toEqual([]);
        fs.rmSync(dir, { recursive: true, force: true });
    });
});
