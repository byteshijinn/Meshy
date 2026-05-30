import { afterEach, describe, expect, it } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { WriteTool } from '../../../src/core/tool/write.js';

const cleanupPaths: string[] = [];

afterEach(() => {
    for (const dir of cleanupPaths.splice(0)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

function tempWorkspace(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meshy-write-tool-'));
    cleanupPaths.push(root);
    return root;
}

function sha256(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
}

describe('WriteTool', () => {
    it('creates new files without overwrite flags', async () => {
        const root = tempWorkspace();
        const result = await WriteTool.execute(
            { filePath: 'notes/new.md', content: 'hello' },
            { workspaceRoot: root } as any,
        );

        expect(result.output).toContain('Created file');
        expect(fs.readFileSync(path.join(root, 'notes', 'new.md'), 'utf8')).toBe('hello');
    });

    it('rejects existing file writes unless overwrite is hash-guarded', async () => {
        const root = tempWorkspace();
        const filePath = path.join(root, 'existing.md');
        fs.writeFileSync(filePath, 'old', 'utf8');

        await expect(WriteTool.execute(
            { filePath, content: 'new' },
            { workspaceRoot: root } as any,
        )).rejects.toThrow(/already exists/);
        await expect(WriteTool.execute(
            { filePath, content: 'new', overwrite: true, expectedHash: 'bad' },
            { workspaceRoot: root } as any,
        )).rejects.toThrow(/modified/);

        const result = await WriteTool.execute(
            { filePath, content: 'new', overwrite: true, expectedHash: sha256('old') },
            { workspaceRoot: root } as any,
        );

        expect(result.output).toContain('Updated file');
        expect(fs.readFileSync(filePath, 'utf8')).toBe('new');
    });
});
