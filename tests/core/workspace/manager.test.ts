import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { WorkspaceManager } from '../../../src/core/workspace/manager.js';

const tempRoots: string[] = [];

function createTempRoot(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meshy-workspace-manager-'));
    tempRoots.push(root);
    return root;
}

function createManager(registryPath: string): WorkspaceManager {
    return new WorkspaceManager({} as any, registryPath);
}

afterEach(() => {
    for (const root of tempRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

describe('WorkspaceManager', () => {
    it('persists a valid project root in the configured registry', () => {
        const root = createTempRoot();
        const projectRoot = path.join(root, 'project');
        const registryPath = path.join(root, 'registry', 'workspaces.json');
        fs.mkdirSync(projectRoot);

        const manager = createManager(registryPath);
        manager.addWorkspace(projectRoot);

        const resolvedPath = path.resolve(projectRoot);
        expect(manager.listWorkspaces()).toEqual([resolvedPath]);
        expect(JSON.parse(fs.readFileSync(registryPath, 'utf-8'))).toEqual([resolvedPath]);
    });

    it.each(['.git', 'node_modules', 'dist', 'tmp'])('rejects %s as a workspace root', (blockedDir) => {
        const root = createTempRoot();
        const blockedRoot = path.join(root, blockedDir);
        fs.mkdirSync(blockedRoot);

        const manager = createManager(path.join(root, 'workspaces.json'));

        expect(() => manager.addWorkspace(blockedRoot)).toThrow(`Cannot add system directory "${blockedDir}"`);
        expect(manager.listWorkspaces()).toEqual([]);
    });

    it('rejects missing directories', () => {
        const root = createTempRoot();
        const manager = createManager(path.join(root, 'workspaces.json'));

        expect(() => manager.addWorkspace(path.join(root, 'missing'))).toThrow('Workspace directory does not exist');
    });

    it('rejects file paths', () => {
        const root = createTempRoot();
        const filePath = path.join(root, 'README.md');
        fs.writeFileSync(filePath, '# test\n');
        const manager = createManager(path.join(root, 'workspaces.json'));

        expect(() => manager.addWorkspace(filePath)).toThrow('Workspace path is not a directory');
    });
});
