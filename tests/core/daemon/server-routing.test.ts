import { describe, expect, it, vi } from 'vitest';
import { DaemonServer } from '../../../src/core/daemon/server.js';

describe('DaemonServer RPC routing', () => {
    it('routes harness and plugin RPC methods to dedicated events', () => {
        const daemon = new DaemonServer(0) as any;
        const ws = { readyState: 1, send: vi.fn() } as any;
        const emitted: Array<{ event: string; args: unknown[] }> = [];
        const originalEmit = daemon.emit.bind(daemon);
        daemon.emit = ((event: string, ...args: unknown[]) => {
            emitted.push({ event, args });
            return originalEmit(event, ...args);
        }) as typeof daemon.emit;

        daemon.handleClientMessage(ws, {
            id: '1',
            type: 'request',
            method: 'harness:fixture:create',
            params: { replayPath: '/tmp/replay.json' },
        });
        daemon.handleClientMessage(ws, {
            id: '2',
            type: 'request',
            method: 'plugin:list',
            params: {},
        });

        expect(emitted.some(entry => entry.event === 'harness:fixture:create')).toBe(true);
        expect(emitted.some(entry => entry.event === 'plugin:list')).toBe(true);
    });

    it('preserves task submit params for mode and attachments', () => {
        const daemon = new DaemonServer(0) as any;
        const ws = { readyState: 1, send: vi.fn() } as any;
        const emitted: Array<{ event: string; args: unknown[] }> = [];
        const originalEmit = daemon.emit.bind(daemon);
        daemon.emit = ((event: string, ...args: unknown[]) => {
            emitted.push({ event, args });
            return originalEmit(event, ...args);
        }) as typeof daemon.emit;

        daemon.handleClientMessage(ws, {
            id: 'task-1',
            type: 'request',
            method: 'task:submit',
            params: { prompt: 'hello', mode: 'plan', attachments: [{ name: 'a.txt' }] },
        });

        const routed = emitted.find(entry => entry.event === 'task:submit');
        expect(routed?.args[0]).toEqual({ prompt: 'hello', mode: 'plan', attachments: [{ name: 'a.txt' }] });
        expect(routed?.args[1]).toBe('task-1');
    });

    it('rejects invalid params before emitting a handler event', () => {
        const daemon = new DaemonServer(0) as any;
        const ws = { readyState: 1, send: vi.fn() } as any;
        const emitted: Array<{ event: string; args: unknown[] }> = [];
        const originalEmit = daemon.emit.bind(daemon);
        daemon.emit = ((event: string, ...args: unknown[]) => {
            emitted.push({ event, args });
            return originalEmit(event, ...args);
        }) as typeof daemon.emit;

        daemon.handleClientMessage(ws, {
            id: 'bad-delete',
            type: 'request',
            method: 'skill:delete',
            params: { filePath: '.agent/skills/demo/SKILL.md' },
        });

        expect(emitted.some(entry => entry.event === 'skill:delete')).toBe(false);
        expect(ws.send).toHaveBeenCalledTimes(1);
        const response = JSON.parse(ws.send.mock.calls[0][0]);
        expect(response.error).toContain('Invalid params for skill:delete');
        expect(response.error).toContain('expectedHash');
    });

    it('returns an RPC error for malformed approval responses', () => {
        const daemon = new DaemonServer(0) as any;
        const ws = { readyState: 1, send: vi.fn() } as any;

        daemon.handleClientMessage(ws, {
            id: 'bad-approval',
            type: 'request',
            method: 'approval:response',
            params: { id: 'approval-1', approved: 'yes' },
        });

        expect(ws.send).toHaveBeenCalledTimes(1);
        const response = JSON.parse(ws.send.mock.calls[0][0]);
        expect(response.error).toContain('Invalid params for approval:response');
        expect(response.error).toContain('approved');
    });
});
