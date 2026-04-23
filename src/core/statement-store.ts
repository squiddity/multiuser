import type { Scope } from './statement.js';

export interface StatementStoreReadOptions {
  limit?: number;
  kind?: string;
  query?: string;
}

export interface StatementStoreRow {
  id: string;
  scopeType: string;
  scopeKey: string | null;
  kind: string;
  authorType: string;
  authorId: string;
  icOoc: string | null;
  createdAt: Date;
  supersedes: string | null;
  sources: string[];
  content: string;
  fields: Record<string, unknown>;
  score?: number;
}

export interface EmitAgentStatementInput {
  scope: Scope;
  kind: string;
  content: string;
  authorId?: string;
  icOoc?: 'ic' | 'ooc' | null;
  supersedes?: string | null;
  sources?: string[];
  fields?: Record<string, unknown>;
}

export interface CreateOpenQuestionInput {
  subject: string;
  candidate: string;
  routedTo: string;
  blocks?: string[];
  sources?: string[];
}

/**
 * Canonical statement-store interface.
 *
 * Postgres is the default backing implementation, but this contract allows
 * future adapters (e.g. alternate SQL/graph stores) without changing workers.
 */
export interface StatementStore {
  getStatement(id: string): Promise<unknown | null>;
  retrieveForUserRoom(
    userId: string,
    roomId: string,
    opts?: StatementStoreReadOptions,
  ): Promise<StatementStoreRow[]>;
  retrieveByScopes(scopes: Scope[], opts?: StatementStoreReadOptions): Promise<StatementStoreRow[]>;
  emitAgentStatement(input: EmitAgentStatementInput): Promise<string>;
  createOpenQuestion(scope: Scope, input: CreateOpenQuestionInput): Promise<string>;
}
