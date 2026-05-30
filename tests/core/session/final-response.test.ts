import { describe, expect, it } from 'vitest';
import { extractMessageText, getLastAssistantFinalContent } from '../../../src/core/session/final-response.js';
import { Session } from '../../../src/core/session/state.js';

describe('final response helpers', () => {
    it('extracts string and multipart text content', () => {
        expect(extractMessageText({ content: 'plain text' })).toBe('plain text');
        expect(extractMessageText({
            content: [
                { type: 'text', text: 'first' },
                { type: 'image', mimeType: 'image/png', data: 'base64' },
                { type: 'text', text: 'second' },
            ],
        })).toBe('first\nsecond');
    });

    it('returns the latest non-empty assistant text', () => {
        const session = new Session('session-final');
        session.addMessage({ role: 'assistant', content: '' });
        session.addMessage({ role: 'user', content: 'question' });
        session.addMessage({ role: 'assistant', content: 'answer' });

        expect(getLastAssistantFinalContent(session)).toBe('answer');
    });
});
