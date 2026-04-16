import { appendStatement, type AppendStatementInput, scopeParts } from './statements.js';
import { appendAndIndex } from './vectors.js';
import type { EventBus, StatementEvent } from '../core/events.js';

export async function appendAndEmit(
  input: Omit<AppendStatementInput, 'embedding'>,
  events: EventBus,
): Promise<string> {
  const id = await appendStatement({
    ...input,
    embedding: null,
  });

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
  input: Omit<AppendStatementInput, 'embedding'>,
  events: EventBus,
): Promise<string> {
  const id = await appendAndIndex(input);

  const { scopeType, scopeKey } = scopeParts(input.scope);
  events.emit<StatementEvent>('statement:created', {
    id,
    kind: input.kind,
    scopeType,
    scopeKey,
  });

  return id;
}
