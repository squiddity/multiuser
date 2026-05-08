import type { AppendStatementInput } from './statements.js';
import { appendStatement } from './statements.js';

// Vector embedding is handled by memsearch (Phase 2+). This shim keeps call
// sites unchanged during the transition.
export async function appendAndIndex(input: AppendStatementInput): Promise<string> {
  return appendStatement(input);
}
