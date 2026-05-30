import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    deleteSkillFile,
    readSkillFile,
    resolveSkillMarkdownPath,
    writeSkillFile,
} from '../../../src/core/skills/file-ops.js';

const cleanupPaths: string[] = [];

afterEach(() => {
    for (const dir of cleanupPaths.splice(0)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

function tempWorkspace(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meshy-skill-file-'));
    cleanupPaths.push(root);
    return root;
}

function writeSkill(root: string, name: string, content = '# Skill\n'): string {
    const skillPath = path.join(root, '.agent', 'skills', name, 'SKILL.md');
    fs.mkdirSync(path.dirname(skillPath), { recursive: true });
    fs.writeFileSync(skillPath, content, 'utf8');
    return skillPath;
}

describe('skill file operations', () => {
    it('allows only SKILL.md files under .agent/skills', async () => {
        const root = tempWorkspace();
        const skillPath = writeSkill(root, 'demo');

        expect(resolveSkillMarkdownPath(root, '.agent/skills/demo/SKILL.md')).toBe(skillPath);
        expect(() => resolveSkillMarkdownPath(root, path.join(root, 'package.json'))).toThrow(/outside/);
        expect(() => resolveSkillMarkdownPath(root, '.agent/skills/demo/notes.md')).toThrow(/SKILL\.md/);
    });

    it('returns a hash on read and requires it for existing writes', async () => {
        const root = tempWorkspace();
        const skillPath = writeSkill(root, 'demo', 'old');

        const read = await readSkillFile(root, skillPath);
        expect(read.content).toBe('old');
        expect(read.hash).toMatch(/^[a-f0-9]{64}$/);

        await expect(writeSkillFile(root, skillPath, 'new')).rejects.toThrow(/expectedHash/);
        await expect(writeSkillFile(root, skillPath, 'new', 'bad')).rejects.toThrow(/modified/);

        const written = await writeSkillFile(root, skillPath, 'new', read.hash);
        expect(written.hash).not.toBe(read.hash);
        expect(fs.readFileSync(skillPath, 'utf8')).toBe('new');
    });

    it('creates new skill files but hash-guards deletes', async () => {
        const root = tempWorkspace();
        const skillPath = path.join(root, '.agent', 'skills', 'new-skill', 'SKILL.md');

        const created = await writeSkillFile(root, skillPath, '# New Skill\n');
        expect(created.created).toBe(true);

        await expect(deleteSkillFile(root, skillPath)).rejects.toThrow(/expectedHash/);
        await expect(deleteSkillFile(root, skillPath, 'bad')).rejects.toThrow(/modified/);

        await deleteSkillFile(root, skillPath, created.hash);
        expect(fs.existsSync(path.dirname(skillPath))).toBe(false);
    });
});
