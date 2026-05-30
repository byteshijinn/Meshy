import { SubagentRegistry } from '../subagents/loader.js';
import { ProviderResolver } from '../llm/resolver.js';
import { Session } from '../session/state.js';
import { SystemPromptBuilder } from '../router/prompt-builder.js';
import { ToolRegistry } from '../tool/registry.js';
import { AgentMessageEvent, ILLMProvider, StandardPrompt, StandardTool } from '../llm/provider.js';
import { formatDelegateTaskBlock } from '../subagents/prompt.js';
import type { ToolResult } from './define.js';
import type { ToolPermissionClass } from './manifest.js';
import { createDelegateTracePayload, type DelegateTracePayload } from '../../shared/delegate-trace.js';

const BASE_SUBAGENT_PROMPT = [
    'You are a specialized sub-agent running with pruned context.',
    'Focus only on the delegated task. Return a concise report that the manager can act on directly.',
    'State uncertainty explicitly and avoid redoing unrelated work.',
    'Tool access is bounded to non-mutating workspace inspection only. Do not request edits, shell commands, or nested delegation.',
].join('\n');

const MAX_DELEGATE_TOOL_ITERATIONS = 6;

const DELEGATE_TOOL_ALIASES: Record<string, string> = {
    read_file: 'readFile',
    readfile: 'readFile',
    list_dir: 'ls',
    listdir: 'ls',
    grep_search: 'grep',
    grepsearch: 'grep',
    find_file: 'glob',
    findfile: 'glob',
    web_search: 'websearch',
    websearch: 'websearch',
    web_fetch: 'webfetch',
    webfetch: 'webfetch',
    edit_file: 'editFile',
    editfile: 'editFile',
    write_file: 'write',
    writefile: 'write',
    run_command: 'runCommand',
    runcommand: 'runCommand',
};

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
    | 'empty_response'
    | 'tool_loop_exhausted';

export interface DelegateToolCallRequest {
    id?: string;
    name?: string;
    argumentsText: string;
}

export interface DelegateDeniedTool {
    name: string;
    resolvedName?: string;
    permissionClass?: ToolPermissionClass;
    reason: string;
}

export interface DelegateResult {
    agentName: string;
    taskName?: string;
    sessionId?: string;
    toolExecution?: 'read_only';
    toolCallLimit?: number;
    toolsGranted?: string[];
    toolsDenied?: DelegateDeniedTool[];
    toolCallsExecuted?: DelegateToolCallRequest[];
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

export function createDelegateTrace(result: DelegateResult): DelegateTracePayload {
    return createDelegateTracePayload({
        agentName: result.agentName,
        taskName: result.taskName,
        sessionId: result.sessionId,
        success: result.success,
        toolExecution: result.toolExecution,
        toolCallLimit: result.toolCallLimit,
        toolsGranted: result.toolsGranted,
        toolsDenied: result.toolsDenied,
        toolCallsExecuted: result.toolCallsExecuted,
        errorKind: result.error?.kind,
        errorMessage: result.error?.message,
        responsePreview: result.response.slice(0, 1000),
    });
}

export async function executeDelegate(
    args: DelegateArgs,
    context: {
        subagentRegistry: SubagentRegistry;
        providerResolver: ProviderResolver;
        toolRegistry: ToolRegistry;
        parentSession: Session;
        workspaceRoot?: string;
        abortSignal?: AbortSignal;
    },
): Promise<DelegateResult> {
    const { subagentRegistry, providerResolver, toolRegistry, parentSession } = context;
    const taskName = normalizeDelegateTaskName(args.taskName);

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

    const sessionId = `delegate-${agent.name}${taskName ? `-${taskName}` : ''}-${Date.now()}`;
    const tempSession = new Session(sessionId);

    const recentHistory = parentSession.history.slice(-agent.maxContextMessages);
    for (const msg of recentHistory) {
        tempSession.addMessage(msg);
    }
    tempSession.addMessage({ role: 'user', content: args.taskDescription });

    const delegatedTaskBlock = formatDelegateTaskBlock(args.taskDescription, args.expectedOutput, taskName);
    const builder = new SystemPromptBuilder(BASE_SUBAGENT_PROMPT)
        .withPersona(agent.systemPrompt)
        .withConstraint(`Complete this delegated task:\n${delegatedTaskBlock}`);

    if (agent.reportFormat === 'json') {
        builder.withConstraint('Return a valid JSON object.');
    }

    const toolAccess = buildDelegateToolAccess(agent.allowedTools, toolRegistry);
    const toolsGranted = toolAccess.tools.map(t => t.name);
    const llm: ILLMProvider = providerResolver.getProvider(agent.model);
    const executedToolCalls: DelegateToolCallRequest[] = [];

    for (let turn = 0; turn <= MAX_DELEGATE_TOOL_ITERATIONS; turn++) {
        const prompt: StandardPrompt = {
            systemPrompt: builder.build(),
            messages: tempSession.history,
            tools: toolAccess.tools,
        };

        const turnResult = await collectDelegateTurn(llm, prompt, context.abortSignal);
        if (turnResult.error) {
            return buildDelegateFailure(agent.name, taskName, sessionId, {
                kind: 'model_error',
                message: turnResult.error,
            }, {
                toolsGranted,
                toolsDenied: toolAccess.denied,
                toolCallsExecuted: executedToolCalls,
            });
        }

        if (turnResult.toolCalls.length === 0) {
            const responseText = turnResult.responseText.trim();
            if (!responseText) {
                const message = 'Delegate completed without returning text.';
                return buildDelegateFailure(agent.name, taskName, sessionId, {
                    kind: 'empty_response',
                    message,
                }, {
                    response: message,
                    toolsGranted,
                    toolsDenied: toolAccess.denied,
                    toolCallsExecuted: executedToolCalls,
                });
            }

            return {
                agentName: agent.name,
                taskName,
                sessionId,
                toolExecution: 'read_only',
                toolCallLimit: MAX_DELEGATE_TOOL_ITERATIONS,
                toolsGranted,
                toolsDenied: toolAccess.denied,
                toolCallsExecuted: executedToolCalls,
                response: responseText,
                success: true,
            };
        }

        if (turnResult.responseText.trim()) {
            tempSession.addMessage({ role: 'assistant', content: turnResult.responseText });
        }

        if (executedToolCalls.length + turnResult.toolCalls.length > MAX_DELEGATE_TOOL_ITERATIONS) {
            const message = `Delegate reached the read-only tool call limit (${MAX_DELEGATE_TOOL_ITERATIONS}) without returning a final report.`;
            return buildDelegateFailure(agent.name, taskName, sessionId, {
                kind: 'tool_loop_exhausted',
                message,
                toolCalls: [...executedToolCalls, ...turnResult.toolCalls],
            }, {
                response: message,
                toolsGranted,
                toolsDenied: toolAccess.denied,
                toolCallsExecuted: executedToolCalls,
            });
        }

        for (const toolCall of turnResult.toolCalls) {
            const toolName = toolCall.name;
            if (!toolName || !toolAccess.names.has(toolName)) {
                const names = turnResult.toolCalls.map(call => call.name).filter(Boolean).join(', ') || 'unknown tool';
                const message = `Delegate requested unavailable or unsafe tool calls (${names}). Delegated agents may only use granted read-only tools: ${toolsGranted.join(', ') || 'none'}.`;
                return buildDelegateFailure(agent.name, taskName, sessionId, {
                    kind: 'unsupported_tool_call',
                    message,
                    toolCalls: turnResult.toolCalls,
                }, {
                    response: message,
                    toolsGranted,
                    toolsDenied: toolAccess.denied,
                    toolCallsExecuted: executedToolCalls,
                });
            }

            const normalizedCall = {
                ...toolCall,
                id: toolCall.id || `delegate-tool-${executedToolCalls.length + 1}`,
                name: toolName,
            };
            executedToolCalls.push(normalizedCall);

            const parsedArgs = parseToolArguments(normalizedCall.argumentsText);
            tempSession.addMessage({
                role: 'assistant',
                content: {
                    type: 'tool_call',
                    id: normalizedCall.id,
                    name: normalizedCall.name,
                    arguments: parsedArgs.ok ? parsedArgs.value : { raw: normalizedCall.argumentsText },
                },
            });

            const toolResult = parsedArgs.ok
                ? await toolRegistry.execute(normalizedCall.name, parsedArgs.value, {
                    sessionId,
                    workspaceRoot: context.workspaceRoot ?? process.cwd(),
                    session: tempSession,
                    abort: context.abortSignal,
                })
                : {
                    output: `Invalid JSON arguments for "${normalizedCall.name}": ${parsedArgs.error}`,
                    isError: true,
                } satisfies ToolResult;

            tempSession.addMessage({
                role: 'tool',
                content: {
                    type: 'tool_result',
                    id: normalizedCall.id,
                    content: toolResult.output,
                    isError: toolResult.isError,
                    metadata: toolResult.metadata,
                },
            });
        }
    }

    const message = `Delegate reached the read-only tool call limit (${MAX_DELEGATE_TOOL_ITERATIONS}) without returning a final report.`;
    return buildDelegateFailure(agent.name, taskName, sessionId, {
        kind: 'tool_loop_exhausted',
        message,
        toolCalls: executedToolCalls,
    }, {
        response: message,
        toolsGranted,
        toolsDenied: toolAccess.denied,
        toolCallsExecuted: executedToolCalls,
    });
}

function buildDelegateToolAccess(
    allowedTools: string[],
    toolRegistry: ToolRegistry,
): {
    tools: StandardTool[];
    names: Set<string>;
    denied: DelegateDeniedTool[];
} {
    const allTools = toolRegistry.toStandardTools();
    const toolByName = new Map(allTools.map(tool => [tool.name, tool]));
    const hasWhitelist = allowedTools.length > 0;
    const requestedNames = hasWhitelist ? allowedTools : allTools.map(tool => tool.name);
    const tools: StandardTool[] = [];
    const names = new Set<string>();
    const denied: DelegateDeniedTool[] = [];

    for (const requestedName of requestedNames) {
        const resolvedName = resolveDelegateToolName(requestedName, toolByName);
        if (!resolvedName) {
            if (hasWhitelist) {
                denied.push({
                    name: requestedName,
                    reason: 'tool is not registered',
                });
            }
            continue;
        }

        if (names.has(resolvedName)) continue;

        const manifest = toolRegistry.getManifest(resolvedName);
        if (!manifest) {
            denied.push({
                name: requestedName,
                resolvedName,
                reason: 'tool has no manifest',
            });
            continue;
        }

        if (resolvedName === 'delegateToAgent') {
            denied.push({
                name: requestedName,
                resolvedName,
                permissionClass: manifest.permissionClass,
                reason: 'nested delegation is disabled for delegated agents',
            });
            continue;
        }

        if (manifest.permissionClass !== 'read') {
            denied.push({
                name: requestedName,
                resolvedName,
                permissionClass: manifest.permissionClass,
                reason: `permissionClass ${manifest.permissionClass} is not allowed for delegated read-only execution`,
            });
            continue;
        }

        const tool = toolByName.get(resolvedName);
        if (!tool) continue;

        names.add(resolvedName);
        tools.push(tool);
    }

    return { tools, names, denied };
}

function resolveDelegateToolName(
    name: string,
    toolByName: Map<string, StandardTool>,
): string | null {
    if (toolByName.has(name)) return name;

    const normalized = name.replace(/[-\s]+/g, '_');
    const alias = DELEGATE_TOOL_ALIASES[normalized] ?? DELEGATE_TOOL_ALIASES[normalized.toLowerCase()];
    if (alias && toolByName.has(alias)) return alias;

    return null;
}

async function collectDelegateTurn(
    llm: ILLMProvider,
    prompt: StandardPrompt,
    abortSignal?: AbortSignal,
): Promise<{
    responseText: string;
    toolCalls: DelegateToolCallRequest[];
    error: string | null;
}> {
    let responseText = '';
    let currentToolCall: DelegateToolCallRequest | null = null;
    const toolCalls: DelegateToolCallRequest[] = [];
    let providerError: string | null = null;

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
        }, abortSignal);
    } catch (err: unknown) {
        return {
            responseText,
            toolCalls,
            error: err instanceof Error ? err.message : String(err),
        };
    }

    return {
        responseText,
        toolCalls,
        error: providerError,
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

function parseToolArguments(argumentsText: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
    if (!argumentsText.trim()) return { ok: true, value: {} };

    try {
        const parsed = JSON.parse(argumentsText);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return { ok: false, error: 'arguments must be a JSON object' };
        }
        return { ok: true, value: parsed as Record<string, unknown> };
    } catch (err: unknown) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}

function buildDelegateFailure(
    agentName: string,
    taskName: string | undefined,
    sessionId: string | undefined,
    error: {
        kind: DelegateFailureKind;
        message: string;
        toolCalls?: DelegateToolCallRequest[];
    },
    options: {
        response?: string;
        toolsGranted?: string[];
        toolsDenied?: DelegateDeniedTool[];
        toolCallsExecuted?: DelegateToolCallRequest[];
    } = {},
): DelegateResult {
    return {
        agentName,
        taskName,
        sessionId,
        toolExecution: 'read_only',
        toolCallLimit: MAX_DELEGATE_TOOL_ITERATIONS,
        toolsGranted: options.toolsGranted,
        toolsDenied: options.toolsDenied,
        toolCallsExecuted: options.toolCallsExecuted,
        response: options.response ?? `Delegate failed: ${error.message}`,
        success: false,
        error,
    };
}
