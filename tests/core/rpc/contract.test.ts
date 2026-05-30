import { describe, expect, it } from 'vitest';
import {
    RPC_EVENT_TYPES,
    RPC_METHODS,
    type RpcMessage,
    type RpcParams,
    type RpcResult,
} from '../../../src/core/rpc/contract.js';

describe('RPC contract', () => {
    it('lists skill file operations as typed RPC methods', () => {
        expect(RPC_METHODS).toContain('skill:read');
        expect(RPC_METHODS).toContain('skill:write');
        expect(RPC_METHODS).toContain('skill:delete');
    });

    it('lists daemon events shared by server and web client', () => {
        expect(RPC_EVENT_TYPES).toContain('agent:policy_decision');
        expect(RPC_EVENT_TYPES).toContain('workspace:list');
        expect(RPC_EVENT_TYPES).toContain('server.connected');
    });

    it('exposes method-specific params and result types', () => {
        const params: RpcParams<'skill:write'> = {
            filePath: '.agent/skills/demo/SKILL.md',
            content: '# Demo\n',
            expectedHash: 'a'.repeat(64),
        };
        const result: RpcResult<'skill:write'> = {
            success: true,
            filePath: 'C:/repo/.agent/skills/demo/SKILL.md',
            hash: 'b'.repeat(64),
            created: false,
        };
        const message: RpcMessage = {
            type: 'request',
            id: '1',
            method: 'skill:write',
            params,
        };

        expect(message.method).toBe('skill:write');
        expect(result.hash).toHaveLength(64);
    });
});
