export interface DelegateTraceToolCall {
    id?: string;
    name?: string;
    argumentsText: string;
}

export interface DelegateTraceDeniedTool {
    name: string;
    resolvedName?: string;
    permissionClass?: string;
    reason: string;
}

export interface DelegateTracePayload {
    agentName: string;
    taskName?: string;
    sessionId?: string;
    success: boolean;
    toolExecution?: 'read_only';
    toolCallLimit?: number;
    toolsGranted: string[];
    toolsDenied: DelegateTraceDeniedTool[];
    toolCallsExecuted: DelegateTraceToolCall[];
    errorKind?: string;
    errorMessage?: string;
    responsePreview?: string;
}

export interface DelegateTraceInput {
    agentName: string;
    taskName?: string;
    sessionId?: string;
    success: boolean;
    toolExecution?: 'read_only';
    toolCallLimit?: number;
    toolsGranted?: unknown[];
    toolsDenied?: unknown[];
    toolCallsExecuted?: unknown[];
    errorKind?: string;
    errorMessage?: string;
    responsePreview?: string;
}

const asRecord = (value: unknown): Record<string, unknown> | null => (
    value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null
);

const optionalString = (value: unknown): string | undefined => (
    typeof value === 'string' && value.length > 0 ? value : undefined
);

const normalizeStringArray = (value: unknown): string[] => (
    Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
        : []
);

const normalizeToolCall = (value: unknown): DelegateTraceToolCall | null => {
    const record = asRecord(value);
    if (!record) return null;

    return {
        id: optionalString(record.id),
        name: optionalString(record.name),
        argumentsText: typeof record.argumentsText === 'string' ? record.argumentsText : '',
    };
};

const normalizeDeniedTool = (value: unknown): DelegateTraceDeniedTool | null => {
    const record = asRecord(value);
    const name = optionalString(record?.name);
    const reason = optionalString(record?.reason);
    if (!name || !reason) return null;

    return {
        name,
        resolvedName: optionalString(record?.resolvedName),
        permissionClass: optionalString(record?.permissionClass),
        reason,
    };
};

export function createDelegateTracePayload(input: DelegateTraceInput): DelegateTracePayload {
    return {
        agentName: input.agentName,
        taskName: optionalString(input.taskName),
        sessionId: optionalString(input.sessionId),
        success: Boolean(input.success),
        toolExecution: input.toolExecution === 'read_only' ? 'read_only' : undefined,
        toolCallLimit: typeof input.toolCallLimit === 'number' ? input.toolCallLimit : undefined,
        toolsGranted: normalizeStringArray(input.toolsGranted),
        toolsDenied: (input.toolsDenied ?? [])
            .map(normalizeDeniedTool)
            .filter((item): item is DelegateTraceDeniedTool => Boolean(item)),
        toolCallsExecuted: (input.toolCallsExecuted ?? [])
            .map(normalizeToolCall)
            .filter((item): item is DelegateTraceToolCall => Boolean(item)),
        errorKind: optionalString(input.errorKind),
        errorMessage: optionalString(input.errorMessage),
        responsePreview: optionalString(input.responsePreview),
    };
}

export function normalizeDelegateTracePayload(value: unknown): DelegateTracePayload | undefined {
    const record = asRecord(value);
    const agentName = optionalString(record?.agentName);
    if (!record || !agentName || typeof record.success !== 'boolean') {
        return undefined;
    }

    return createDelegateTracePayload({
        agentName,
        taskName: optionalString(record.taskName),
        sessionId: optionalString(record.sessionId),
        success: record.success,
        toolExecution: record.toolExecution === 'read_only' ? 'read_only' : undefined,
        toolCallLimit: typeof record.toolCallLimit === 'number' ? record.toolCallLimit : undefined,
        toolsGranted: Array.isArray(record.toolsGranted) ? record.toolsGranted : [],
        toolsDenied: Array.isArray(record.toolsDenied) ? record.toolsDenied : [],
        toolCallsExecuted: Array.isArray(record.toolCallsExecuted) ? record.toolCallsExecuted : [],
        errorKind: optionalString(record.errorKind),
        errorMessage: optionalString(record.errorMessage),
        responsePreview: optionalString(record.responsePreview),
    });
}
