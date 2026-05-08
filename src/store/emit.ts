import { appendStatement, type AppendStatementInput, scopeParts } from './statements.js';
import type { EventBus, StatementEvent } from '../core/events.js';

export async function appendAndEmit(
  input: AppendStatementInput,
  events: EventBus,
): Promise<string> {
  const id = await appendStatement(input);

  const { scopeType, scopeKey } = scopeParts(input.scope);
  events.emit<StatementEvent>('statement:created', {
    id,
    kind: input.kind,
    scopeType,
    scopeKey,
  });

  return id;
}

export async function appendIndexAndEmit(
  input: AppendStatementInput,
  events: EventBus,
): Promise<string> {
  const id = await appendStatement(input);

  const { scopeType, scopeKey } = scopeParts(input.scope);
  events.emit<StatementEvent>('statement:created', {
    id,
    kind: input.kind,
    scopeType,
    scopeKey,
  });

  return id;
}
