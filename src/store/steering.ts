import { appendAndEmit } from './emit.js';
import { listByScope } from './statements.js';
import { userHasCapability } from './rooms.js';
import {
  selectActiveSteering,
  SteeringRequestContract,
  type SteeringCandidate,
  type SteeringFields,
  type SteeringIntent,
} from '../core/briefing-steering.js';
import type { EventBus } from '../core/events.js';

export type { SteeringCandidate } from '../core/briefing-steering.js';

export class SteeringError extends Error {
  constructor(
    message: string,
    public readonly code: 'forbidden' | 'bad_request',
  ) {
    super(message);
    this.name = 'SteeringError';
  }
}

export interface EmitSteeringRequestInput {
  userId: string;
  adminRoomId: string;
  partyRoomId: string;
  intent: SteeringIntent;
  direction: string;
  tone?: string;
  constraints?: string[];
  content?: string;
}

export async function emitSteeringRequest(
  input: EmitSteeringRequestInput,
  events: EventBus,
): Promise<string> {
  const hasCapability = await userHasCapability(input.userId, input.adminRoomId, 'canonize');
  if (!hasCapability) {
    throw new SteeringError(
      `user ${input.userId} lacks authoring capability in room ${input.adminRoomId}`,
      'forbidden',
    );
  }

  const fields: Record<string, unknown> = {
    appliesToPartyRoomId: input.partyRoomId,
    issuedByUserId: input.userId,
    intent: input.intent,
    direction: input.direction,
  };
  if (input.tone !== undefined) fields.tone = input.tone;
  if (input.constraints !== undefined) fields.constraints = input.constraints;

  const content = input.content ?? `[/steer ${input.intent}] ${input.direction}`;

  const requestInput = {
    kind: 'steering-request' as const,
    scope: { type: 'governance' as const, roomId: input.adminRoomId },
    content,
    fields,
  };

  const parsed = SteeringRequestContract.safeParse(requestInput);
  if (!parsed.success) {
    throw new SteeringError(`invalid steering request: ${parsed.error.message}`, 'bad_request');
  }

  return appendAndEmit(
    {
      scope: requestInput.scope,
      kind: 'steering-request',
      authorType: 'user',
      authorId: input.userId,
      content,
      fields,
    },
    events,
  );
}

export async function listActiveSteeringFor(
  partyRoomId: string,
  adminRoomId: string,
  limit = 20,
): Promise<SteeringCandidate[]> {
  const rows = await listByScope(
    { type: 'governance', roomId: adminRoomId },
    { kind: 'steering', limit },
  );

  const candidates: SteeringCandidate[] = rows
    .filter((r) => {
      const f = r.fields as Record<string, unknown>;
      return f && f.appliesToPartyRoomId === partyRoomId;
    })
    .map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      fields: r.fields as unknown as SteeringFields,
    }));

  return selectActiveSteering(candidates);
}
