import type { StandardContentPart, StandardMessage } from '../llm/provider.js';
import type { Session } from './state.js';

function isTextPart(part: StandardContentPart): boolean {
    return part.type === 'text' && typeof part.text === 'string' && part.text.length > 0;
}

export function extractMessageText(message: Pick<StandardMessage, 'content'>): string {
    const { content } = message;
    if (typeof content === 'string') return content;

    if (Array.isArray(content)) {
        return content
            .filter(isTextPart)
            .map(part => part.text)
            .join('\n')
            .trim();
    }

    return '';
}

export function getLastAssistantFinalContent(session: Pick<Session, 'history'>): string {
    for (let index = session.history.length - 1; index >= 0; index -= 1) {
        const message = session.history[index];
        if (!message || message.role !== 'assistant') continue;

        const text = extractMessageText(message);
        if (text) return text;
    }

    return '';
}
