import { describe, expect, it } from 'vitest';
import { resolveProviderCapabilities } from '../../../src/core/llm/capabilities.js';

describe('provider capability registry', () => {
    it('uses declared SDK aliases for bundled providers', () => {
        expect(resolveProviderCapabilities({ sdkIdentifier: '@ai-sdk/openai' })).toMatchObject({
            sdkKey: 'openai',
            providerKey: 'openai',
            supportsEmbeddings: true,
        });
        expect(resolveProviderCapabilities({ sdkIdentifier: '@ai-sdk/anthropic' })).toMatchObject({
            sdkKey: 'anthropic',
            providerKey: 'anthropic',
            supportsEmbeddings: false,
            stripV1BaseURL: true,
        });
    });

    it('lets declared provider identity override openai-compatible protocol capabilities', () => {
        expect(resolveProviderCapabilities({
            sdkIdentifier: 'openai',
            providerName: 'deepseek',
        })).toMatchObject({
            sdkKey: 'openai',
            providerKey: 'deepseek',
            supportsEmbeddings: false,
        });
    });

    it('treats Kimi/Moonshot coding endpoints as OpenAI-compatible without OpenAI embeddings or sampling overrides', () => {
        expect(resolveProviderCapabilities({
            sdkIdentifier: 'openai',
            providerName: 'kimi-for-coding',
        })).toMatchObject({
            sdkKey: 'openai',
            providerKey: 'kimi',
            supportsEmbeddings: false,
            supportsModelListing: true,
            omitSamplingParameters: true,
        });
    });

    it('defaults unknown OpenAI-compatible providers to no remote embeddings', () => {
        expect(resolveProviderCapabilities({
            sdkIdentifier: 'some-openai-compatible-sdk',
            providerName: 'custom-relay',
        })).toMatchObject({
            sdkKey: 'openai-compatible',
            providerKey: 'custom-relay',
            supportsEmbeddings: false,
        });
    });
});
