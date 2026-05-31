import {
    createRuntimeTaskId,
    isTerminalRuntimeTaskStatus,
    type RuntimeTaskStatus,
} from '../protocol.js';

export interface RuntimeTaskRecord {
    id: string;
    description: string;
    status: RuntimeTaskStatus;
    createdAt: string;
    updatedAt: string;
    kind?: 'generic' | 'delegate';
    parentTaskId?: string;
    errorMessage?: string;
    metadata?: Record<string, unknown>;
}

export interface CreateRuntimeTaskInput {
    id?: string;
    description: string;
    status?: RuntimeTaskStatus;
    kind?: RuntimeTaskRecord['kind'];
    parentTaskId?: string;
    metadata?: Record<string, unknown>;
}

const ALLOWED_TRANSITIONS: Record<RuntimeTaskStatus, RuntimeTaskStatus[]> = {
    pending: ['running', 'waiting_approval', 'blocked', 'completed', 'failed', 'cancelled'],
    running: ['waiting_approval', 'blocked', 'completed', 'failed', 'cancelled'],
    in_progress: ['waiting_approval', 'blocked', 'completed', 'failed', 'cancelled'],
    waiting_approval: ['running', 'in_progress', 'blocked', 'failed', 'cancelled'],
    blocked: ['running', 'in_progress', 'failed', 'cancelled'],
    completed: [],
    failed: [],
    cancelled: [],
};

export class RuntimeTaskManager {
    private readonly tasks = new Map<string, RuntimeTaskRecord>();

    public clear(): void {
        this.tasks.clear();
    }

    public createTask(input: CreateRuntimeTaskInput): RuntimeTaskRecord {
        const now = new Date().toISOString();
        const record: RuntimeTaskRecord = {
            id: input.id ?? createRuntimeTaskId(),
            description: input.description,
            status: input.status ?? 'pending',
            createdAt: now,
            updatedAt: now,
            kind: input.kind,
            parentTaskId: input.parentTaskId,
            metadata: cloneMetadata(input.metadata),
        };

        this.tasks.set(record.id, record);
        return cloneRuntimeTaskRecord(record);
    }

    public getTask(taskId: string): RuntimeTaskRecord | null {
        const record = this.tasks.get(taskId);
        return record ? cloneRuntimeTaskRecord(record) : null;
    }

    public listTasks(): RuntimeTaskRecord[] {
        return Array.from(this.tasks.values()).map(cloneRuntimeTaskRecord);
    }

    public transitionTask(taskId: string, nextStatus: RuntimeTaskStatus, errorMessage?: string): RuntimeTaskRecord {
        const task = this.tasks.get(taskId);
        if (!task) {
            throw new Error(`Task not found: ${taskId}`);
        }

        if (!this.canTransition(task.status, nextStatus)) {
            throw new Error(`Invalid transition: ${task.status} -> ${nextStatus}`);
        }

        const previousUpdatedAtMs = Date.parse(task.updatedAt);
        const nowMs = Date.now();
        const nextUpdatedAt = Number.isNaN(previousUpdatedAtMs)
            ? new Date(nowMs).toISOString()
            : new Date(Math.max(nowMs, previousUpdatedAtMs + 1)).toISOString();

        const updated: RuntimeTaskRecord = {
            ...task,
            status: nextStatus,
            updatedAt: nextUpdatedAt,
            errorMessage: nextStatus === 'failed' ? errorMessage : task.errorMessage,
        };

        this.tasks.set(taskId, updated);
        return cloneRuntimeTaskRecord(updated);
    }

    public canTransition(from: RuntimeTaskStatus, to: RuntimeTaskStatus): boolean {
        if (from === to) return true;
        if (isTerminalRuntimeTaskStatus(from)) return false;
        return ALLOWED_TRANSITIONS[from].includes(to);
    }
}

function cloneMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
    return metadata ? { ...metadata } : undefined;
}

function cloneRuntimeTaskRecord(record: RuntimeTaskRecord): RuntimeTaskRecord {
    return {
        ...record,
        metadata: cloneMetadata(record.metadata),
    };
}
