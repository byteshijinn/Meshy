import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.hoisted(() => vi.fn());
const proxyAgentMock = vi.hoisted(() => vi.fn());

vi.mock('undici', () => ({
    fetch: fetchMock,
    ProxyAgent: proxyAgentMock,
}));

import { WebFetchTool } from '../../../src/core/tool/webfetch.js';

const originalProxyEnv = {
    HTTPS_PROXY: process.env.HTTPS_PROXY,
    https_proxy: process.env.https_proxy,
    HTTP_PROXY: process.env.HTTP_PROXY,
    http_proxy: process.env.http_proxy,
};

let tempRoot: string;

function mockResponse(body: string, contentType = 'text/plain') {
    const bytes = new TextEncoder().encode(body);
    return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {
            get(name: string) {
                if (name.toLowerCase() === 'content-type') return contentType;
                return null;
            },
        },
        arrayBuffer: async () => bytes.buffer,
    };
}

beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meshy-webfetch-'));
    fetchMock.mockReset();
    proxyAgentMock.mockReset();
    delete process.env.HTTPS_PROXY;
    delete process.env.https_proxy;
    delete process.env.HTTP_PROXY;
    delete process.env.http_proxy;
});

afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    for (const [key, value] of Object.entries(originalProxyEnv)) {
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }
});

describe('webfetch tool', () => {
    it('returns small responses inline without creating temp files', async () => {
        fetchMock.mockResolvedValueOnce(mockResponse('short response'));

        const result = await WebFetchTool.execute(
            { url: 'https://example.test/small', format: 'text' },
            { sessionId: 's1', workspaceRoot: tempRoot },
        );

        expect(result.output).toBe('short response');
        expect(result.metadata).toMatchObject({ truncated: false, length: 14 });
        expect(fs.existsSync(path.join(tempRoot, '.meshy', 'tmp'))).toBe(false);
    });

    it('offloads large converted content to a workspace-local temp file', async () => {
        const largeBody = 'a'.repeat(121_000);
        fetchMock.mockResolvedValueOnce(mockResponse(largeBody));

        const result = await WebFetchTool.execute(
            { url: 'https://example.test/large', format: 'text' },
            { sessionId: 's1', workspaceRoot: tempRoot },
        );

        const savedToRelative = result.metadata?.savedToRelative as string;
        const savedTo = result.metadata?.savedTo as string;

        expect(result.metadata).toMatchObject({
            truncated: true,
            length: largeBody.length,
        });
        expect(savedToRelative).toContain(path.join('.meshy', 'tmp', 'webfetch-'));
        expect(savedTo).toBe(path.join(tempRoot, savedToRelative));
        expect(fs.readFileSync(savedTo, 'utf8')).toBe(largeBody);
        expect(result.output).toContain('...[CONTENT TRUNCATED]...');
        expect(result.output).toContain(`filePath="${savedToRelative}"`);
    });
});
