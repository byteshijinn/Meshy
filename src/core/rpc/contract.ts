export type RpcJsonObject = Record<string, unknown>;

export interface RpcSkillItem {
    name: string;
    description: string;
    keywords: string[];
    source: 'global' | 'project';
    filePath: string;
}

export interface RpcSuccessResponse {
    success: boolean;
    error?: string;
}

export interface RpcSkillListResponse {
    skills: RpcSkillItem[];
    refreshed?: boolean;
    error?: string;
}

export interface RpcSkillReadParams {
    filePath: string;
}

export interface RpcSkillReadResponse extends RpcSuccessResponse {
    content?: string;
    filePath?: string;
    hash?: string;
}

export interface RpcSkillWriteParams {
    filePath: string;
    content: string;
    expectedHash?: string;
}

export interface RpcSkillWriteResponse extends RpcSuccessResponse {
    filePath?: string;
    hash?: string;
    created?: boolean;
}

export interface RpcSkillDeleteParams {
    filePath: string;
    expectedHash: string;
}

export type RpcRequestContract = {
    'task:submit': {
        params: {
            prompt: string;
            mode?: string;
            attachments?: unknown[];
            temperature?: number;
            maxTokens?: number;
            topP?: number;
        };
        result: RpcSuccessResponse;
    };
    'approval:response': { params: { id?: string; approvalId?: string; answer?: string; approved?: boolean }; result: RpcSuccessResponse };
    'approval:respond': { params: { id?: string; approvalId?: string; answer?: string; approved?: boolean }; result: RpcSuccessResponse };
    'model:list': { params: RpcJsonObject; result: unknown };
    'model:switch': { params: { model: string }; result: RpcSuccessResponse };
    'agent:list': { params: RpcJsonObject; result: unknown };
    'agent:switch': { params: RpcJsonObject; result: RpcSuccessResponse };
    'command:list': { params: RpcJsonObject; result: unknown };
    'mention:list': { params: RpcJsonObject; result: unknown };
    'session:interrupt': { params: RpcJsonObject; result: RpcSuccessResponse };
    'session:delete': { params: { id: string }; result: RpcSuccessResponse };
    'session:rename': { params: { id: string; title: string }; result: RpcSuccessResponse };
    'session:compact': { params: { id: string }; result: RpcSuccessResponse };
    'skill:list': { params: RpcJsonObject; result: RpcSkillListResponse };
    'skill:search': { params: { query: string }; result: RpcSkillListResponse };
    'skill:refresh': { params: RpcJsonObject; result: RpcSkillListResponse };
    'skill:read': { params: RpcSkillReadParams; result: RpcSkillReadResponse };
    'skill:write': { params: RpcSkillWriteParams; result: RpcSkillWriteResponse };
    'skill:delete': { params: RpcSkillDeleteParams; result: RpcSuccessResponse };
    'mcp:list': { params: RpcJsonObject; result: unknown };
    'mcp:create': { params: RpcJsonObject; result: RpcSuccessResponse };
    'mcp:update': { params: RpcJsonObject; result: RpcSuccessResponse };
    'mcp:delete': { params: { name: string }; result: RpcSuccessResponse };
    'mcp:toggle': { params: { name: string; enabled: boolean }; result: RpcSuccessResponse };
    'ritual:status': { params: RpcJsonObject; result: unknown };
    'session:get': { params: RpcJsonObject; result: unknown };
    'workspace:list': { params: RpcJsonObject; result: unknown };
    'session:list': { params: RpcJsonObject; result: unknown };
    'session:create': { params: RpcJsonObject; result: { sessionId: string; sessions?: unknown[] } };
    'session:switch': { params: { sessionId: string }; result: RpcSuccessResponse };
    'capsules:list': { params: RpcJsonObject; result: unknown };
    'blackboard:get': { params: RpcJsonObject; result: unknown };
    'session:replay': { params: { sessionId: string }; result: unknown };
    'harness:fixture:create': { params: RpcJsonObject; result: RpcSuccessResponse };
    'harness:fixture:run': { params: RpcJsonObject; result: RpcSuccessResponse };
    'harness:run:get': { params: RpcJsonObject; result: unknown };
    'harness:report:get': { params: RpcJsonObject; result: unknown };
    'plugin:list': { params: RpcJsonObject; result: unknown };
    'plugin:preset:list': { params: RpcJsonObject; result: unknown };
    'plugin:preset:enable': { params: RpcJsonObject; result: RpcSuccessResponse };
    'plugin:preset:disable': { params: RpcJsonObject; result: RpcSuccessResponse };
    'plugin:capabilities:get': { params: RpcJsonObject; result: unknown };
    'plugin:mcp:save': { params: RpcJsonObject; result: RpcSuccessResponse };
};

export const RPC_METHODS = [
    'task:submit',
    'approval:response',
    'approval:respond',
    'model:list',
    'model:switch',
    'agent:list',
    'agent:switch',
    'command:list',
    'mention:list',
    'session:interrupt',
    'session:delete',
    'session:rename',
    'session:compact',
    'skill:list',
    'skill:search',
    'skill:refresh',
    'skill:read',
    'skill:write',
    'skill:delete',
    'mcp:list',
    'mcp:create',
    'mcp:update',
    'mcp:delete',
    'mcp:toggle',
    'ritual:status',
    'session:get',
    'workspace:list',
    'session:list',
    'session:create',
    'session:switch',
    'capsules:list',
    'blackboard:get',
    'session:replay',
    'harness:fixture:create',
    'harness:fixture:run',
    'harness:run:get',
    'harness:report:get',
    'plugin:list',
    'plugin:preset:list',
    'plugin:preset:enable',
    'plugin:preset:disable',
    'plugin:capabilities:get',
    'plugin:mcp:save',
] as const satisfies readonly (keyof RpcRequestContract)[];

export type RpcMethod = typeof RPC_METHODS[number];
const RPC_METHOD_SET = new Set<string>(RPC_METHODS);

export function isRpcMethod(method: string | undefined): method is RpcMethod {
    return typeof method === 'string' && RPC_METHOD_SET.has(method);
}

export type RpcParams<M extends RpcMethod> = RpcRequestContract[M]['params'];
export type RpcResult<M extends RpcMethod> = RpcRequestContract[M]['result'];

export type RpcEventContract = {
    'agent:text': RpcJsonObject | string;
    'agent:reasoning': RpcJsonObject;
    'agent:tool_call': RpcJsonObject;
    'agent:tool_result': RpcJsonObject;
    'agent:policy_decision': RpcJsonObject & {
        id?: string;
        tool?: string;
        decision?: 'allow' | 'deny';
        mode?: string;
        permissionClass?: string;
        reason?: string;
        timestamp?: string;
    };
    'agent:done': RpcJsonObject;
    'agent:error': RpcJsonObject;
    'agent:approve': RpcJsonObject;
    'agent:session_changed': { sessionId: string };
    'approval:request': { id: string; question: string; context?: string };
    'session:update': RpcJsonObject;
    'workspace:list': RpcJsonObject;
    'session:list': RpcJsonObject;
    'router:decision': RpcJsonObject;
    'server.connected': RpcJsonObject;
};

export const RPC_EVENT_TYPES = [
    'agent:text',
    'agent:reasoning',
    'agent:tool_call',
    'agent:tool_result',
    'agent:policy_decision',
    'agent:done',
    'agent:error',
    'agent:approve',
    'agent:session_changed',
    'approval:request',
    'session:update',
    'workspace:list',
    'session:list',
    'router:decision',
    'server.connected',
] as const satisfies readonly (keyof RpcEventContract)[];

export type DaemonEventType = Exclude<typeof RPC_EVENT_TYPES[number], 'server.connected'>;
export type RpcEventName = typeof RPC_EVENT_TYPES[number];
export type RpcEventData<E extends RpcEventName> = RpcEventContract[E];

export interface RpcRequestMessage<M extends string = string> {
    id?: string;
    type: 'request';
    method: M;
    params?: M extends RpcMethod ? RpcParams<M> : RpcJsonObject;
    result?: undefined;
    error?: undefined;
    name?: undefined;
    data?: undefined;
}

export interface RpcResponseMessage {
    id?: string;
    type: 'response';
    method?: string;
    params?: undefined;
    result?: unknown;
    error?: string;
    name?: undefined;
    data?: undefined;
}

export interface RpcEventMessage<E extends RpcEventName = RpcEventName> {
    id?: string;
    type: 'event';
    method?: undefined;
    params?: undefined;
    result?: undefined;
    error?: undefined;
    name: E;
    data?: RpcEventData<E>;
}

export type RpcMessage = RpcRequestMessage | RpcResponseMessage | RpcEventMessage;
