import { describe, it, expect } from 'vitest';
import { LocalEmbeddingAdapter } from '../src/core/llm/local-embedding.js';

describe('LocalEmbeddingAdapter (TP-02)', () => {
    it('should generate embeddings with exactly 768 dimensions', async () => {
        const adapter = new LocalEmbeddingAdapter();

        const embedding = await adapter.generateEmbedding('Meshy Agent Sandbox Test');

        expect(Array.isArray(embedding)).toBe(true);
        expect(embedding.length).toBe(768);

        const allZeros = embedding.every((val: number) => val === 0);
        const hasNaN = embedding.some((val: number) => isNaN(val));

        expect(allZeros).toBe(false);
        expect(hasNaN).toBe(false);
    }, 60000);
});
