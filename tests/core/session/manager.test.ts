import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SessionManager } from '../../../src/core/session/manager.js';

const tempRoots: string[] = [];

function tempWorkspace(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meshy-session-manager-'));
    tempRoots.push(root);
    return root;
}

afterEach(() => {
    for (const root of tempRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('SessionManager', () => {
    it('creates saved sessions that are immediately visible to listSessions', () => {
        const root = tempWorkspace();
        const manager = new SessionManager(root);

        const session = manager.createSavedSession();

        expect(fs.existsSync(path.join(root, '.meshy', 'sessions', `${session.id}.jsonl`))).toBe(true);
        expect(manager.listSessions().map(summary => summary.id)).toContain(session.id);
        expect(manager.loadSession(session.id)?.id).toBe(session.id);
    });
});
