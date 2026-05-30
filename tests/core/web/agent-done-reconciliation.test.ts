import { describe, expect, it } from 'vitest';
import { reconcileAgentDoneMessages } from '../../../web/src/store/agent-done-reconciliation.js';
import type { ChatMessage } from '../../../web/src/store/ws.js';

describe('agent done reconciliation', () => {
  it('fills a missing agent message from final content', () => {
    const messages: ChatMessage[] = [{ id: 'user-1', role: 'user', content: 'hello', timestamp: 1 }];

    expect(reconcileAgentDoneMessages(messages, { id: 'task-1', finalContent: 'final answer' }, 10)).toEqual([
      { id: 'user-1', role: 'user', content: 'hello', timestamp: 1 },
      { id: 'task-1', role: 'agent', content: 'final answer', timestamp: 10 },
    ]);
  });

  it('repairs truncated or reasoning-only agent content without shortening existing text', () => {
    const truncated: ChatMessage[] = [{ id: 'agent-1', role: 'agent', content: 'short', timestamp: 1 }];
    expect(reconcileAgentDoneMessages(truncated, { finalContent: 'short but complete' })).toEqual([
      { id: 'agent-1', role: 'agent', content: 'short but complete', timestamp: 1 },
    ]);

    const complete: ChatMessage[] = [{ id: 'agent-1', role: 'agent', content: 'already complete', timestamp: 1 }];
    expect(reconcileAgentDoneMessages(complete, { finalContent: 'short' })).toBe(complete);

    const reasoningOnly: ChatMessage[] = [{
      id: 'agent-2',
      role: 'agent',
      content: '',
      reasoningContent: 'reasoning fallback',
      timestamp: 2,
    }];
    expect(reconcileAgentDoneMessages(reasoningOnly, {})).toEqual([{
      id: 'agent-2',
      role: 'agent',
      content: 'reasoning fallback',
      reasoningContent: 'reasoning fallback',
      timestamp: 2,
    }]);
  });
});
