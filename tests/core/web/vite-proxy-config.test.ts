import { describe, expect, it } from 'vitest';
import config from '../../../web/vite.config.ts';

function getProxyConfig() {
    const resolvedConfig = typeof config === 'function' ? config({ command: 'serve', mode: 'test' }) : config;
    if (resolvedConfig instanceof Promise) {
        throw new Error('Async Vite config is not supported in this test.');
    }
    return resolvedConfig.server?.proxy as Record<string, any>;
}

describe('web Vite proxy config', () => {
    it('keeps daemon routes available in development', () => {
        const proxy = getProxyConfig();

        expect(proxy).toHaveProperty('/events');
        expect(proxy).toHaveProperty('/rpc');
        expect(proxy).toHaveProperty('/ws');
        expect(proxy['/rpc'].target).toBe('http://localhost:9120');
        expect(proxy['/ws'].ws).toBe(true);
    });

    it('marks SSE responses as unbuffered', () => {
        const proxy = getProxyConfig();
        const headers: Record<string, string> = {};
        const httpProxy = {
            on(eventName: string, handler: (proxyRes: { headers: Record<string, string> }) => void) {
                if (eventName === 'proxyRes') handler({ headers });
            },
        };

        proxy['/events'].configure(httpProxy);

        expect(headers['cache-control']).toBe('no-cache');
        expect(headers['x-accel-buffering']).toBe('no');
    });
});
