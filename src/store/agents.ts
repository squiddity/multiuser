import { appendStatement } from './statements.js';
import type { Scope } from '../core/statement.js';

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

export async function emitAgentStatement(input: EmitAgentStatementInput): Promise<string> {
  const id = await appendStatement({
    scope: input.scope,
    kind: input.kind,
    authorType: 'agent',
    authorId: input.authorId ?? 'narrator',
    content: input.content,
    icOoc: input.icOoc ?? null,
    supersedes: input.supersedes ?? null,
    sources: input.sources ?? [],
    fields: input.fields ?? {},
    embedding: null,
  });
  return id;
}

export interface CreateOpenQuestionInput {
  subject: string;
  candidate: string;
  routedTo: string;
  blocks?: string[];
  sources?: string[];
}

export async function createOpenQuestion(
  scope: Scope,
  input: CreateOpenQuestionInput,
): Promise<string> {
  const id = await appendStatement({
    scope,
    kind: 'open-question',
    authorType: 'agent',
    authorId: 'narrator',
    content: `Subject: ${input.subject}\n\nCandidate: ${input.candidate}`,
    icOoc: null,
    supersedes: null,
    sources: input.sources ?? [],
    fields: {
      subject: input.subject,
      candidate: input.candidate,
      routedTo: input.routedTo,
      blocks: input.blocks ?? [],
      stage: 'deferred',
    },
    embedding: null,
  });
  return id;
}
