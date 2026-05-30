/**
 * Full-file write tool.
 *
 * Creates new files by default. Existing files require an explicit overwrite
 * request plus the SHA-256 hash that was observed before the write.
 */

import { z } from 'zod';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { defineTool } from './define.js';

function sha256(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
}

export const WriteTool = defineTool('write', {
    description: [
        'Write content to a file. Creates the file (and parent directories) if it does not exist.',
        'If the file already exists, overwrite=true and expectedHash are required.',
        'For partial edits to existing files, use the editFile tool instead.',
        'Always provide the COMPLETE file content; do not use placeholders or omit sections.',
    ].join('\n'),
    parameters: z.object({
        filePath: z.string().describe('The absolute path to the file to write (must be absolute, not relative)'),
        content: z.string().describe('The complete content to write to the file'),
        overwrite: z.boolean().optional().describe('Set true only when intentionally replacing an existing file'),
        expectedHash: z.string().optional().describe('Required SHA-256 hash of the existing file when overwrite is true'),
    }),
    manifest: {
        permissionClass: 'write',
    },
    async execute(params, ctx) {
        let filePath = params.filePath;
        if (!path.isAbsolute(filePath)) {
            filePath = path.resolve(ctx.workspaceRoot, filePath);
        }

        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const existed = fs.existsSync(filePath);
        if (existed) {
            if (!params.overwrite) {
                throw new Error(`File already exists: ${relativePathForOutput(ctx.workspaceRoot, filePath)}. Use editFile for partial edits, or set overwrite=true with expectedHash to replace the full file.`);
            }

            if (!params.expectedHash) {
                throw new Error(`expectedHash is required to overwrite existing file: ${relativePathForOutput(ctx.workspaceRoot, filePath)}`);
            }

            const currentContent = fs.readFileSync(filePath, 'utf8');
            if (sha256(currentContent) !== params.expectedHash) {
                throw new Error(`File ${relativePathForOutput(ctx.workspaceRoot, filePath)} has been modified since it was read. Read it again and retry with the current hash.`);
            }
        }

        fs.writeFileSync(filePath, params.content, 'utf8');

        const relativePath = relativePathForOutput(ctx.workspaceRoot, filePath);
        const action = existed ? 'Updated' : 'Created';

        return {
            output: `${action} file: ${relativePath}`,
            metadata: { filePath, existed },
        };
    },
});

function relativePathForOutput(workspaceRoot: string, filePath: string): string {
    return path.relative(workspaceRoot, filePath) || filePath;
}
