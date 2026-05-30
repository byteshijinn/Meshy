import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface SkillFileReadResult {
    filePath: string;
    content: string;
    hash: string;
}

export interface SkillFileWriteResult {
    filePath: string;
    hash: string;
    created: boolean;
}

function sha256(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
}

function ensureCurrentHash(filePath: string, expectedHash?: string): string {
    if (!expectedHash) {
        throw new Error('expectedHash is required for existing skill file changes. Read the skill first and retry with the returned hash.');
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const currentHash = sha256(content);
    if (currentHash !== expectedHash) {
        throw new Error('Skill file has been modified since it was read. Read the skill again and retry with the current hash.');
    }
    return currentHash;
}

export function resolveSkillMarkdownPath(workspaceRoot: string, filePath: string): string {
    if (!filePath || typeof filePath !== 'string') {
        throw new Error('filePath is required');
    }

    const skillsRoot = path.resolve(workspaceRoot, '.agent', 'skills');
    const resolvedPath = path.isAbsolute(filePath)
        ? path.resolve(filePath)
        : path.resolve(workspaceRoot, filePath);
    const relativePath = path.relative(skillsRoot, resolvedPath);

    if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        throw new Error('Skill file path is outside .agent/skills');
    }

    if (path.basename(resolvedPath) !== 'SKILL.md') {
        throw new Error('Skill file path must target a SKILL.md file');
    }

    return resolvedPath;
}

export async function readSkillFile(workspaceRoot: string, filePath: string): Promise<SkillFileReadResult> {
    const resolvedPath = resolveSkillMarkdownPath(workspaceRoot, filePath);
    const content = await fs.promises.readFile(resolvedPath, 'utf8');
    return {
        filePath: resolvedPath,
        content,
        hash: sha256(content),
    };
}

export async function writeSkillFile(
    workspaceRoot: string,
    filePath: string,
    content: string,
    expectedHash?: string,
): Promise<SkillFileWriteResult> {
    if (typeof content !== 'string') {
        throw new Error('content must be a string');
    }

    const resolvedPath = resolveSkillMarkdownPath(workspaceRoot, filePath);
    const created = !fs.existsSync(resolvedPath);
    if (!created) {
        ensureCurrentHash(resolvedPath, expectedHash);
    }

    await fs.promises.mkdir(path.dirname(resolvedPath), { recursive: true });
    await fs.promises.writeFile(resolvedPath, content, 'utf8');

    return {
        filePath: resolvedPath,
        hash: sha256(content),
        created,
    };
}

export async function deleteSkillFile(
    workspaceRoot: string,
    filePath: string,
    expectedHash?: string,
): Promise<{ filePath: string; deletedDir: string }> {
    const resolvedPath = resolveSkillMarkdownPath(workspaceRoot, filePath);
    ensureCurrentHash(resolvedPath, expectedHash);

    const skillDir = path.dirname(resolvedPath);
    await fs.promises.rm(skillDir, { recursive: true, force: true });
    return { filePath: resolvedPath, deletedDir: skillDir };
}
