import { createHash } from 'node:crypto';
import type { Scope } from '../core/statement.js';
import { appendStatement, listByScope } from './statements.js';

const DEFAULT_WORKFLOW_SESSION_KIND = 'governance';
const DEFAULT_WORKFLOW_SESSION_AUTHOR_ID = 'workflow-session-store';
const DEFAULT_WORKFLOW_SESSION_LIMIT = 1000;

export interface WorkflowSessionSnapshot<TState> {
  sessionId: string;
  workflowType: string;
  ownerId: string;
  state: TState;
  updatedAt: Date;
}

export interface WorkflowSessionUpdateInput<TState> {
  eventType: string;
  content: string;
  metadata?: Record<string, unknown>;
  mutate: (state: TState) => void;
}

export interface WorkflowSessionStoreConfig<TState> {
  workflowType: string;
  createInitialState: (input: { ownerId: string; sessionId: string; now: Date }) => TState;
  serializeState?: (state: TState) => unknown;
  deserializeState?: (value: unknown) => TState | undefined;
  kind?: string;
  authorId?: string;
  limit?: number;
}

export interface WorkflowSessionStore<TState> {
  getOrCreate(ownerId: string): Promise<WorkflowSessionSnapshot<TState>>;
  get(ownerId: string): Promise<WorkflowSessionSnapshot<TState> | undefined>;
  getBySessionId(sessionId: string): Promise<WorkflowSessionSnapshot<TState> | undefined>;
  update(
    ownerId: string,
    input: WorkflowSessionUpdateInput<TState>,
  ): Promise<WorkflowSessionSnapshot<TState>>;
  reset(
    ownerId: string,
    input?: { content?: string; metadata?: Record<string, unknown> },
  ): Promise<void>;
}

function now(): Date {
  return new Date();
}

function buildSessionScope(sessionId: string): Scope {
  return { type: 'session', sessionId };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneSnapshot<TState>(
  snapshot: WorkflowSessionSnapshot<TState>,
): WorkflowSessionSnapshot<TState> {
  return {
    sessionId: snapshot.sessionId,
    workflowType: snapshot.workflowType,
    ownerId: snapshot.ownerId,
    state: structuredClone(snapshot.state),
    updatedAt: new Date(snapshot.updatedAt),
  };
}

function defaultDeserializeState<TState>(value: unknown): TState | undefined {
  return value as TState;
}

function defaultSerializeState<TState>(state: TState): unknown {
  return state;
}

export function deriveWorkflowSessionId(workflowType: string, ownerId: string): string {
  const hash = createHash('sha1')
    .update(`workflow-session:${workflowType}:${ownerId}`)
    .digest('hex')
    .slice(0, 32);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export class InMemoryWorkflowSessionStore<TState> implements WorkflowSessionStore<TState> {
  private readonly sessions = new Map<string, WorkflowSessionSnapshot<TState>>();

  constructor(private readonly config: WorkflowSessionStoreConfig<TState>) {}

  async getOrCreate(ownerId: string): Promise<WorkflowSessionSnapshot<TState>> {
    const existing = await this.get(ownerId);
    if (existing) return existing;

    const created = this.createSnapshot(ownerId, now());
    this.sessions.set(created.sessionId, cloneSnapshot(created));
    return created;
  }

  async get(ownerId: string): Promise<WorkflowSessionSnapshot<TState> | undefined> {
    const sessionId = deriveWorkflowSessionId(this.config.workflowType, ownerId);
    return this.getBySessionId(sessionId);
  }

  async getBySessionId(sessionId: string): Promise<WorkflowSessionSnapshot<TState> | undefined> {
    const snapshot = this.sessions.get(sessionId);
    return snapshot ? cloneSnapshot(snapshot) : undefined;
  }

  async update(
    ownerId: string,
    input: WorkflowSessionUpdateInput<TState>,
  ): Promise<WorkflowSessionSnapshot<TState>> {
    const base = (await this.get(ownerId)) ?? this.createSnapshot(ownerId, now());
    const next = cloneSnapshot(base);
    input.mutate(next.state);
    next.updatedAt = now();
    this.sessions.set(next.sessionId, cloneSnapshot(next));
    return next;
  }

  async reset(ownerId: string): Promise<void> {
    const sessionId = deriveWorkflowSessionId(this.config.workflowType, ownerId);
    this.sessions.delete(sessionId);
  }

  private createSnapshot(ownerId: string, createdAt: Date): WorkflowSessionSnapshot<TState> {
    const sessionId = deriveWorkflowSessionId(this.config.workflowType, ownerId);
    return {
      sessionId,
      workflowType: this.config.workflowType,
      ownerId,
      state: this.config.createInitialState({ ownerId, sessionId, now: createdAt }),
      updatedAt: createdAt,
    };
  }
}

export class StatementBackedWorkflowSessionStore<TState> implements WorkflowSessionStore<TState> {
  private readonly kind: string;
  private readonly authorId: string;
  private readonly limit: number;
  private readonly serializeState: (state: TState) => unknown;
  private readonly deserializeState: (value: unknown) => TState | undefined;

  constructor(private readonly config: WorkflowSessionStoreConfig<TState>) {
    this.kind = config.kind ?? DEFAULT_WORKFLOW_SESSION_KIND;
    this.authorId = config.authorId ?? DEFAULT_WORKFLOW_SESSION_AUTHOR_ID;
    this.limit = config.limit ?? DEFAULT_WORKFLOW_SESSION_LIMIT;
    this.serializeState = config.serializeState ?? defaultSerializeState;
    this.deserializeState = config.deserializeState ?? defaultDeserializeState;
  }

  async getOrCreate(ownerId: string): Promise<WorkflowSessionSnapshot<TState>> {
    const existing = await this.get(ownerId);
    if (existing) return existing;

    const created = this.createSnapshot(ownerId, now());
    await this.appendSnapshot(created, {
      eventType: 'session-created',
      content: `Workflow session created for ${this.config.workflowType}.`,
    });
    return created;
  }

  async get(ownerId: string): Promise<WorkflowSessionSnapshot<TState> | undefined> {
    const sessionId = deriveWorkflowSessionId(this.config.workflowType, ownerId);
    return this.getBySessionId(sessionId);
  }

  async getBySessionId(sessionId: string): Promise<WorkflowSessionSnapshot<TState> | undefined> {
    const rows = await listByScope(buildSessionScope(sessionId), {
      kind: this.kind,
      limit: this.limit,
    });
    return this.snapshotFromRows(sessionId, rows);
  }

  async update(
    ownerId: string,
    input: WorkflowSessionUpdateInput<TState>,
  ): Promise<WorkflowSessionSnapshot<TState>> {
    const base = (await this.get(ownerId)) ?? this.createSnapshot(ownerId, now());
    const next = cloneSnapshot(base);
    input.mutate(next.state);
    next.updatedAt = now();
    await this.appendSnapshot(next, input);
    return next;
  }

  async reset(
    ownerId: string,
    input: { content?: string; metadata?: Record<string, unknown> } = {},
  ): Promise<void> {
    const existing = await this.get(ownerId);
    if (!existing) return;

    await appendStatement({
      scope: buildSessionScope(existing.sessionId),
      kind: this.kind,
      authorType: 'system',
      authorId: this.authorId,
      content: input.content ?? `Workflow session reset for ${this.config.workflowType}.`,
      fields: {
        workflowType: this.config.workflowType,
        workflowOwnerId: existing.ownerId,
        workflowEventType: 'session-reset',
        workflowMetadata: input.metadata ?? {},
      },
      embedding: null,
    });
  }

  private createSnapshot(ownerId: string, createdAt: Date): WorkflowSessionSnapshot<TState> {
    const sessionId = deriveWorkflowSessionId(this.config.workflowType, ownerId);
    return {
      sessionId,
      workflowType: this.config.workflowType,
      ownerId,
      state: this.config.createInitialState({ ownerId, sessionId, now: createdAt }),
      updatedAt: createdAt,
    };
  }

  private async appendSnapshot(
    snapshot: WorkflowSessionSnapshot<TState>,
    input: Omit<WorkflowSessionUpdateInput<TState>, 'mutate'>,
  ): Promise<void> {
    await appendStatement({
      scope: buildSessionScope(snapshot.sessionId),
      kind: this.kind,
      authorType: 'system',
      authorId: this.authorId,
      content: input.content,
      fields: {
        workflowType: snapshot.workflowType,
        workflowOwnerId: snapshot.ownerId,
        workflowEventType: input.eventType,
        state: this.serializeState(snapshot.state),
        workflowMetadata: input.metadata ?? {},
      },
      embedding: null,
    });
  }

  private snapshotFromRows(
    sessionId: string,
    rows: Awaited<ReturnType<typeof listByScope>>,
  ): WorkflowSessionSnapshot<TState> | undefined {
    let current: WorkflowSessionSnapshot<TState> | undefined;

    for (const row of [...rows].reverse()) {
      const fields = isRecord(row.fields) ? row.fields : {};
      if (fields.workflowType !== this.config.workflowType) continue;

      if (fields.workflowEventType === 'session-reset') {
        current = undefined;
        continue;
      }

      const state = this.deserializeState(fields.state);
      const ownerId = typeof fields.workflowOwnerId === 'string' ? fields.workflowOwnerId : null;
      if (!state || !ownerId) continue;

      current = {
        sessionId,
        workflowType: this.config.workflowType,
        ownerId,
        state,
        updatedAt: row.createdAt,
      };
    }

    return current ? cloneSnapshot(current) : undefined;
  }
}
