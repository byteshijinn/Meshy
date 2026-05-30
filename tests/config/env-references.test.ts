import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { getEnvReferenceName, loadConfig, resolveEnvReference } from '../../src/config/index.js';

const originalCwd = process.cwd();
const originalKimiKey = process.env.KIMI_API_KEY;
const originalKimiBaseUrl = process.env.KIMI_BASE_URL;
let tempRoot: string | null = null;

afterEach(() => {
    process.chdir(originalCwd);
    if (originalKimiKey === undefined) {
        delete process.env.KIMI_API_KEY;
    } else {
        process.env.KIMI_API_KEY = originalKimiKey;
    }
    if (originalKimiBaseUrl === undefined) {
        delete process.env.KIMI_BASE_URL;
    } else {
        process.env.KIMI_BASE_URL = originalKimiBaseUrl;
    }
    if (tempRoot) {
        fs.rmSync(tempRoot, { recursive: true, force: true });
        tempRoot = null;
    }
});

describe('config environment references', () => {
    it('expands provider apiKey and baseUrl environment references', () => {
        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meshy-config-'));
        fs.mkdirSync(path.join(tempRoot, '.agent'), { recursive: true });
        fs.writeFileSync(path.join(tempRoot, '.agent', 'config.json'), JSON.stringify({
            providers: {
                'kimi-code-cn': {
                    protocol: 'openai',
                    baseUrl: '$KIMI_BASE_URL',
                    apiKey: '$KIMI_API_KEY',
                    models: {
                        'kimi-for-coding': { name: 'Kimi Code' },
                    },
                },
            },
            models: {
                default: 'kimi-code-cn/kimi-for-coding',
                fallback: 'kimi-code-cn/kimi-for-coding',
                small: 'kimi-code-cn/kimi-for-coding',
            },
        }), 'utf8');

        process.env.KIMI_API_KEY = 'test-kimi-token';
        process.env.KIMI_BASE_URL = 'https://api.kimi.com/coding/v1';
        process.chdir(tempRoot);

        const config = loadConfig();

        expect(config.providers['kimi-code-cn'].apiKey).toBe('test-kimi-token');
        expect(config.providers['kimi-code-cn'].baseUrl).toBe('https://api.kimi.com/coding/v1');
        expect(config.models.default).toBe('kimi-code-cn/kimi-for-coding');
    });

    it('recognizes exact shell-style environment placeholders', () => {
        process.env.KIMI_API_KEY = 'test-kimi-token';

        expect(resolveEnvReference('$KIMI_API_KEY')).toBe('test-kimi-token');
        expect(resolveEnvReference('${KIMI_API_KEY}')).toBe('test-kimi-token');
        expect(getEnvReferenceName('$KIMI_API_KEY')).toBe('KIMI_API_KEY');
        expect(getEnvReferenceName('prefix-$KIMI_API_KEY')).toBeNull();
    });

    it('loads UTF-8 BOM project config files written by Windows tooling', () => {
        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meshy-config-bom-'));
        fs.mkdirSync(path.join(tempRoot, '.agent'), { recursive: true });
        const json = JSON.stringify({
            providers: {
                local: {
                    protocol: 'openai',
                    apiKey: 'test-token',
                },
            },
            models: {
                default: 'local/test-model',
                fallback: 'local/test-model',
                small: 'local/test-model',
            },
        });
        fs.writeFileSync(path.join(tempRoot, '.agent', 'config.json'), `\uFEFF${json}`, 'utf8');
        process.chdir(tempRoot);

        expect(loadConfig().models.default).toBe('local/test-model');
    });
});
