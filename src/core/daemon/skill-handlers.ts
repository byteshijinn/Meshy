import type { WebSocket } from 'ws';
import type { DaemonServer } from './server.js';
import type { TaskEngine } from '../engine/index.js';
import type { Workspace } from '../workspace/workspace.js';
import type { RpcSkillDeleteParams, RpcSkillReadParams, RpcSkillWriteParams } from '../rpc/contract.js';
import { deleteSkillFile, readSkillFile, writeSkillFile } from '../skills/file-ops.js';

interface SkillHandlerDeps {
    daemon: DaemonServer;
    engine: TaskEngine;
    getWorkspace: () => Workspace;
}

async function refreshSkillIndex(engine: TaskEngine, workspace: Workspace): Promise<void> {
    const scanned = engine.getSkillRegistry().refreshAll(workspace.rootPath);
    await workspace.memoryStore.syncSkills(scanned);
}

export function registerSkillHandlers({ daemon, engine, getWorkspace }: SkillHandlerDeps): void {
    daemon.on('skill:read', async (params: RpcSkillReadParams, ws: WebSocket, msgId?: string) => {
        try {
            if (!params?.filePath) {
                return daemon.sendResponse(ws, msgId, { success: false, error: 'filePath is required' });
            }

            const workspace = getWorkspace();
            const result = await readSkillFile(workspace.rootPath, params.filePath);
            daemon.sendResponse(ws, msgId, {
                success: true,
                content: result.content,
                filePath: result.filePath,
                hash: result.hash,
            });
        } catch (err: any) {
            daemon.sendResponse(ws, msgId, { success: false, error: err.message });
        }
    });

    daemon.on('skill:write', async (params: RpcSkillWriteParams, ws: WebSocket, msgId?: string) => {
        try {
            if (!params?.filePath || typeof params.content !== 'string') {
                return daemon.sendResponse(ws, msgId, { success: false, error: 'filePath and content are required' });
            }

            const workspace = getWorkspace();
            const result = await writeSkillFile(
                workspace.rootPath,
                params.filePath,
                params.content,
                typeof params.expectedHash === 'string' ? params.expectedHash : undefined,
            );

            await refreshSkillIndex(engine, workspace);

            daemon.sendResponse(ws, msgId, {
                success: true,
                filePath: result.filePath,
                hash: result.hash,
                created: result.created,
            });
        } catch (err: any) {
            daemon.sendResponse(ws, msgId, { success: false, error: err.message });
        }
    });

    daemon.on('skill:delete', async (params: RpcSkillDeleteParams, ws: WebSocket, msgId?: string) => {
        try {
            if (!params?.filePath) {
                return daemon.sendResponse(ws, msgId, { success: false, error: 'filePath is required' });
            }

            const workspace = getWorkspace();
            await deleteSkillFile(
                workspace.rootPath,
                params.filePath,
                typeof params.expectedHash === 'string' ? params.expectedHash : undefined,
            );

            await refreshSkillIndex(engine, workspace);

            daemon.sendResponse(ws, msgId, { success: true });
        } catch (err: any) {
            daemon.sendResponse(ws, msgId, { success: false, error: err.message });
        }
    });
}
