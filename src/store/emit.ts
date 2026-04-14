import { appendStatement, type AppendStatementInput } from './statements.js';
import { scopeParts } from './statements.js';
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
