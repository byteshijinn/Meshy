import type { ChatMessage } from './ws';

export interface AgentDonePayload {
  id?: string;
  finalContent?: string;
}

export function reconcileAgentDoneMessages(
  messages: ChatMessage[],
  payload?: AgentDonePayload,
  now = Date.now(),
): ChatMessage[] {
  const finalContent = payload?.finalContent || '';
  const last = messages[messages.length - 1];

  if (last?.role === 'agent') {
    if (finalContent && (!last.content || finalContent.length > last.content.length)) {
      return [...messages.slice(0, -1), { ...last, content: finalContent }];
    }

    if (!last.content && last.reasoningContent) {
      return [...messages.slice(0, -1), { ...last, content: last.reasoningContent }];
    }

    return messages;
  }

  if (!finalContent) return messages;

  return [
    ...messages,
    {
      id: payload?.id || `agent-${now}`,
      role: 'agent',
      content: finalContent,
      timestamp: now,
    },
  ];
}
