/**
 * DelegateToAgent Tool — Manager → Subagent 委派工具
 *
 * 允许 Manager Agent 将子任务委派给特定的 Subagent：
 * 1. 从 SubagentRegistry 获取配置
 * 2. 创建隔离的临时 Session（仅含任务描述 + 最近 N 条历史）
 * 3. 用 SystemPromptBuilder 组装 Subagent 专用 Prompt
 * 4. 执行单轮推理，捕获最终文本回复
 * 5. 将结果作为 Tool Result 返回给 Manager
 * 6. 销毁临时 Session
 *
 * 参考 OpenCode 的 task.ts 工具设计。
 */

import { SubagentRegistry } from '../subagents/loader.js';
import { ProviderResolver } from '../llm/resolver.js';
import { Session } from '../session/state.js';
import { SystemPromptBuilder } from '../router/prompt-builder.js';
import { ToolRegistry } from '../tool/registry.js';
import { AgentMessageEvent, ILLMProvider, StandardPrompt } from '../llm/provider.js';
import { formatDelegateTaskBlock } from '../subagents/prompt.js';

const BASE_SUBAGENT_PROMPT = [
    'You are a specialized sub-agent running with pruned context.',
    'Focus only on the delegated task. Return a concise report that the manager can act on directly.',
    'State uncertainty explicitly and avoid redoing unrelated work.',
].join('\n');

export interface DelegateArgs {
    agentName: string;
    taskName?: string;
    taskDescription: string;
    expectedOutput?: string;
}

export type DelegateFailureKind =
    | 'agent_not_found'
    | 'model_error'
    | 'unsupported_tool_call'
    | 'empty_response';

export interface DelegateToolCallRequest {
    id?: string;
    name?: string;
    argumentsText: string;
}

export interface DelegateResult {
    agentName: string;
    taskName?: string;
    sessionId?: string;
    toolsGranted?: string[];
    response: string;
    success: boolean;
    error?: {
        kind: DelegateFailureKind;
        message: string;
        toolCalls?: DelegateToolCallRequest[];
    };
}

export function normalizeDelegateTaskName(taskName: string | undefined): string | undefined {
    const trimmed = taskName?.trim();
    if (!trimmed) return undefined;

    const normalized = trimmed
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 64)
        .replace(/_+$/g, '');

    return normalized || undefined;
}

/**
 * 执行委派逻辑（不依赖 defineTool，由 TaskEngine 自行封装注册）。
 */
export async function executeDelegate(
    args: DelegateArgs,
    context: {
        subagentRegistry: SubagentRegistry;
        providerResolver: ProviderResolver;
        toolRegistry: ToolRegistry;
        parentSession: Session;
    },
): Promise<DelegateResult> {
    const { subagentRegistry, providerResolver, toolRegistry, parentSession } = context;
    const taskName = normalizeDelegateTaskName(args.taskName);

    // 1. 查找 Subagent
    const agent = subagentRegistry.getAgent(args.agentName);
    if (!agent) {
        return {
            agentName: args.agentName,
            taskName,
            response: `Agent "${args.agentName}" not found. Available: ${subagentRegistry.listAgents().map(a => a.name).join(', ')}`,
            success: false,
            error: {
                kind: 'agent_not_found',
                message: `Agent "${args.agentName}" not found.`,
            },
        };
    }

    // 2. 创建隔离 Session（裁剪上下文）
    const sessionId = `delegate-${agent.name}${taskName ? `-${taskName}` : ''}-${Date.now()}`;
    const tempSession = new Session(sessionId);

    // 仅注入最近 N 条消息作为背景
    const recentHistory = parentSession.history.slice(-agent.maxContextMessages);
    for (const msg of recentHistory) {
        tempSession.addMessage(msg);
    }
    tempSession.addMessage({ role: 'user', content: args.taskDescription });

    // 3. 组装 Prompt
    const delegatedTaskBlock = formatDelegateTaskBlock(args.taskDescription, args.expectedOutput, taskName);
    const builder = new SystemPromptBuilder(BASE_SUBAGENT_PROMPT)
        .withPersona(agent.systemPrompt)
        .withConstraint(`Complete this delegated task:\n${delegatedTaskBlock}`);

    if (agent.reportFormat === 'json') {
        builder.withConstraint('Return a valid JSON object.');
    }

    // 4. 准备工具列表（按白名单裁剪）
    const allTools = toolRegistry.toStandardTools();
    const hasWhitelist = agent.allowedTools.length > 0;
    const whitelistSet = new Set(agent.allowedTools);
    const filteredTools = hasWhitelist
        ? allTools.filter(t => whitelistSet.has(t.name))
        : allTools;
    const toolsGranted = filteredTools.map(t => t.name);

    // 5. 获取模型并执行推理
    const llm: ILLMProvider = providerResolver.getProvider(agent.model);
    const prompt: StandardPrompt = {
        systemPrompt: builder.build(),
        messages: tempSession.history,
        tools: filteredTools,
    };

    let responseText = '';
    let providerError: string | null = null;
    let currentToolCall: DelegateToolCallRequest | null = null;
    const toolCalls: DelegateToolCallRequest[] = [];

    try {
        await llm.generateResponseStream(prompt, (event) => {
            if (event.type === 'text') {
                responseText += String(event.data ?? '');
            } else if (event.type === 'tool_call_start') {
                currentToolCall = normalizeDelegateToolCallStart(event);
                toolCalls.push(currentToolCall);
            } else if (event.type === 'tool_call_chunk') {
                const chunk = typeof event.data === 'string' ? event.data : JSON.stringify(event.data ?? '');
                if (!currentToolCall) {
                    currentToolCall = { argumentsText: '' };
                    toolCalls.push(currentToolCall);
                }
                currentToolCall.argumentsText += chunk;
            } else if (event.type === 'tool_call_end') {
                currentToolCall = null;
            } else if (event.type === 'error') {
                providerError = String(event.data || 'Provider emitted an error event.');
            }
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            agentName: agent.name,
            taskName,
            sessionId,
            toolsGranted,
            response: `Delegate failed: ${message}`,
            success: false,
            error: {
                kind: 'model_error',
                message,
            },
        };
    }

    if (providerError) {
        return {
            agentName: agent.name,
            taskName,
            sessionId,
            toolsGranted,
            response: `Delegate failed: ${providerError}`,
            success: false,
            error: {
                kind: 'model_error',
                message: providerError,
            },
        };
    }

    if (toolCalls.length > 0) {
        const names = toolCalls.map(call => call.name).filter(Boolean).join(', ') || 'unknown tool';
        const message = `Delegate requested tool calls (${names}), but delegateToAgent currently supports single-turn text reports only.`;
        return {
            agentName: agent.name,
            taskName,
            sessionId,
            toolsGranted,
            response: message,
            success: false,
            error: {
                kind: 'unsupported_tool_call',
                message,
                toolCalls,
            },
        };
    }

    if (!responseText) {
        const message = 'Delegate completed without returning text.';
        return {
            agentName: agent.name,
            taskName,
            sessionId,
            toolsGranted,
            response: message,
            success: false,
            error: {
                kind: 'empty_response',
                message,
            },
        };
    }

    // 6. 返回结果（临时 Session 自动被 GC 回收）
    return {
        agentName: agent.name,
        taskName,
        sessionId,
        toolsGranted,
        response: responseText,
        success: true,
    };
}

function normalizeDelegateToolCallStart(event: AgentMessageEvent): DelegateToolCallRequest {
    const data = event.data as Record<string, unknown> | undefined;
    return {
        id: typeof data?.id === 'string' ? data.id : undefined,
        name: typeof data?.name === 'string' ? data.name : undefined,
        argumentsText: '',
    };
}
