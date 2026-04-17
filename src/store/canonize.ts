import { appendStatement } from './statements.js';
import { appendAndEmit } from './emit.js';
import { userHasCapability } from './rooms.js';
import type { EventBus } from '../core/events.js';

export class CanonizeError extends Error {
  constructor(
    message: string,
    public readonly code: 'forbidden' | 'bad_request',
  ) {
    super(message);
    this.name = 'CanonizeError';
  }
}

export interface CanonizeInput {
  userId: string;
  roomId: string;
  openQuestionId: string;
  decision: 'promote' | 'reject' | 'supersede';
  rationale?: string;
  revisedCandidate?: string;
}

export async function canonizeOpenQuestion(
  input: CanonizeInput,
  events?: EventBus,
): Promise<string> {
  const { userId, roomId, openQuestionId, decision, revisedCandidate } = input;
  const rationale = input.rationale ?? `Direct canonization decision: ${decision}`;

  const hasCapability = await userHasCapability(userId, roomId, 'canonize');
  if (!hasCapability) {
    throw new CanonizeError(
      `user ${userId} lacks canonize capability in room ${roomId}`,
      'forbidden',
    );
  }

  if (decision === 'supersede' && !revisedCandidate) {
    throw new CanonizeError('supersede decision requires revisedCandidate', 'bad_request');
  }

  const fields: Record<string, unknown> = { openQuestionId, decision, rationale };
  if (revisedCandidate !== undefined) {
    fields.revisedCandidate = revisedCandidate;
  }

  const stmtInput = {
    scope: { type: 'governance' as const, roomId },
    kind: 'authoring-decision',
    authorType: 'user',
    authorId: userId,
    content: `[/canonize] Decision: ${decision}. ${rationale}`,
    icOoc: null as null,
    supersedes: null as null,
    sources: [openQuestionId],
    fields,
  };

  if (events) {
    return appendAndEmit(stmtInput, events);
  }

  return appendStatement({ ...stmtInput, embedding: null });
}
