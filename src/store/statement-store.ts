import type {
  CreateOpenQuestionInput,
  EmitAgentStatementInput,
  StatementStore,
  StatementStoreReadOptions,
  StatementStoreRow,
} from '../core/statement-store.js';
import type { Scope } from '../core/statement.js';
import { getStatement as dbGetStatement } from './statements.js';
import {
  retrieveByScopes as dbRetrieveByScopes,
  retrieveForUserRoom as dbRetrieveForUserRoom,
} from './retrieval.js';
import {
  createOpenQuestion as dbCreateOpenQuestion,
  emitAgentStatement as dbEmitAgentStatement,
} from './agents.js';

export class PostgresStatementStore implements StatementStore {
  async getStatement(id: string): Promise<unknown | null> {
    return dbGetStatement(id);
  }

  async retrieveForUserRoom(
    userId: string,
    roomId: string,
    opts: StatementStoreReadOptions = {},
  ): Promise<StatementStoreRow[]> {
    return dbRetrieveForUserRoom(userId, roomId, opts);
  }

  async retrieveByScopes(
    scopes: Scope[],
    opts: StatementStoreReadOptions = {},
  ): Promise<StatementStoreRow[]> {
    return dbRetrieveByScopes(scopes, opts);
  }

  async emitAgentStatement(input: EmitAgentStatementInput): Promise<string> {
    return dbEmitAgentStatement(input);
  }

  async createOpenQuestion(scope: Scope, input: CreateOpenQuestionInput): Promise<string> {
    return dbCreateOpenQuestion(scope, input);
  }
}

export function createStatementStore(): StatementStore {
  return new PostgresStatementStore();
}
