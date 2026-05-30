import type { WebSocket } from 'ws';
import { z, type ZodTypeAny } from 'zod';
import {
    isRpcMethod,
    type RpcJsonObject,
    type RpcMessage,
    type RpcMethod,
    type RpcParams,
    type RpcRequestMessage,
} from '../rpc/contract.js';

interface RpcEmitter {
    emit(eventName: string | symbol, ...args: any[]): boolean;
}

export interface ApprovalResponsePayload {
    approvalId: string;
    answer: string;
}

export interface RpcRouteResult {
    ok: boolean;
    error?: string;
}

type RpcForwarder = (daemon: RpcEmitter, ws: WebSocket, msg: RpcRequestMessage<RpcMethod>, params: RpcJsonObject) => void;

const emptyParamsSchema = z.object({}).passthrough();
const nonEmptyString = z.string().min(1);

const PARAM_SCHEMAS: Partial<Record<RpcMethod, ZodTypeAny>> = {
    'task:submit': z.object({
        prompt: z.string().optional(),
        mode: z.string().optional(),
        attachments: z.array(z.unknown()).optional(),
    }).passthrough(),
    'approval:response': z.object({
        id: z.string().optional(),
        approvalId: z.string().optional(),
        answer: z.string().optional(),
        approved: z.boolean().optional(),
    }).passthrough(),
    'approval:respond': z.object({
        id: z.string().optional(),
        approvalId: z.string().optional(),
        answer: z.string().optional(),
        approved: z.boolean().optional(),
    }).passthrough(),
    'model:switch': z.object({ model: nonEmptyString }).passthrough(),
    'session:delete': z.object({ id: nonEmptyString }).passthrough(),
    'session:rename': z.object({ id: nonEmptyString, title: z.string() }).passthrough(),
    'session:compact': z.object({ id: nonEmptyString }).passthrough(),
    'skill:search': z.object({ query: z.string() }).passthrough(),
    'skill:read': z.object({ filePath: nonEmptyString }).passthrough(),
    'skill:write': z.object({
        filePath: nonEmptyString,
        content: z.string(),
        expectedHash: z.string().optional(),
    }).passthrough(),
    'skill:delete': z.object({
        filePath: nonEmptyString,
        expectedHash: nonEmptyString,
    }).passthrough(),
    'mcp:delete': z.object({ name: nonEmptyString }).passthrough(),
    'mcp:toggle': z.object({ name: nonEmptyString, enabled: z.boolean() }).passthrough(),
    'session:switch': z.object({ sessionId: nonEmptyString }).passthrough(),
    'session:replay': z.object({ sessionId: nonEmptyString }).passthrough(),
};

const noParamMethods = [
    'model:list',
    'agent:list',
    'session:interrupt',
    'skill:list',
    'skill:refresh',
    'mcp:list',
    'ritual:status',
    'session:get',
    'workspace:list',
    'session:list',
    'session:create',
    'capsules:list',
    'blackboard:get',
    'plugin:list',
    'plugin:preset:list',
    'plugin:capabilities:get',
] as const satisfies readonly RpcMethod[];

const paramsFirstMethods = [
    'agent:switch',
    'command:list',
    'mention:list',
    'session:delete',
    'session:rename',
    'session:compact',
    'skill:search',
    'skill:read',
    'skill:write',
    'skill:delete',
    'mcp:create',
    'mcp:update',
    'mcp:delete',
    'mcp:toggle',
    'harness:fixture:create',
    'harness:fixture:run',
    'harness:run:get',
    'harness:report:get',
    'plugin:preset:enable',
    'plugin:preset:disable',
    'plugin:mcp:save',
] as const satisfies readonly RpcMethod[];

const RPC_FORWARDERS: Partial<Record<RpcMethod, RpcForwarder>> = Object.fromEntries([
    ...noParamMethods.map((method) => [
        method,
        (daemon: RpcEmitter, ws: WebSocket, msg: RpcRequestMessage<RpcMethod>) => {
            daemon.emit(method, ws, msg.id);
        },
    ]),
    ...paramsFirstMethods.map((method) => [
        method,
        (daemon: RpcEmitter, ws: WebSocket, msg: RpcRequestMessage<RpcMethod>, params: RpcJsonObject) => {
            daemon.emit(method, params, ws, msg.id);
        },
    ]),
]) as Partial<Record<RpcMethod, RpcForwarder>>;

RPC_FORWARDERS['task:submit'] = (daemon, _ws, msg, params) => {
    daemon.emit('task:submit', params, msg.id);
};

RPC_FORWARDERS['model:switch'] = (daemon, ws, msg, params) => {
    daemon.emit('model:switch', params.model, ws, msg.id);
};

RPC_FORWARDERS['session:switch'] = (daemon, ws, msg, params) => {
    daemon.emit('session:switch', params.sessionId, ws, msg.id);
};

RPC_FORWARDERS['session:replay'] = (daemon, ws, msg, params) => {
    daemon.emit('session:replay', params.sessionId, ws, msg.id);
};

export function parseApprovalResponse(msg: RpcMessage): ApprovalResponsePayload | null {
    if (msg.type !== 'request') return null;
    if (msg.method !== 'approval:response' && msg.method !== 'approval:respond') return null;

    const params = validateRpcParams(msg.method, msg.params);
    const approvalId = String(params.id || params.approvalId || '');
    if (!approvalId) return null;

    let answer = typeof params.answer === 'string' ? params.answer : '';
    if (params.approved !== undefined) {
        answer = params.approved ? 'y' : 'n';
    }

    return { approvalId, answer };
}

export function routeRpcRequest(daemon: RpcEmitter, ws: WebSocket, msg: RpcMessage): RpcRouteResult {
    if (msg.type !== 'request') {
        return { ok: false, error: 'Only request messages can be routed' };
    }

    if (!isRpcMethod(msg.method)) {
        return { ok: false, error: `Unknown method: ${msg.method}` };
    }

    const forwarder = RPC_FORWARDERS[msg.method];
    if (!forwarder) {
        return { ok: false, error: `No route registered for method: ${msg.method}` };
    }

    try {
        const params = validateRpcParams(msg.method, msg.params) as unknown as RpcJsonObject;
        forwarder(daemon, ws, msg as RpcRequestMessage<RpcMethod>, params);
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}

export function validateRpcParams<M extends RpcMethod>(
    method: M,
    params: RpcRequestMessage<M>['params'],
): RpcParams<M> {
    const schema = PARAM_SCHEMAS[method] ?? emptyParamsSchema;
    const parsed = schema.safeParse(params ?? {});
    if (!parsed.success) {
        throw new Error(`Invalid params for ${method}: ${formatZodIssues(parsed.error.issues)}`);
    }
    return parsed.data as RpcParams<M>;
}

function formatZodIssues(issues: z.core.$ZodIssue[]): string {
    return issues
        .map((issue) => {
            const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
            return `${path}: ${issue.message}`;
        })
        .join('; ');
}
