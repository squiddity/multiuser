import { randomUUID } from 'node:crypto';
import type { Logger } from 'pino';
import { Narrator, type NarratorOutput } from '../../agents/narrator.js';
import type { EventBus } from '../../core/events.js';
import { appendIndexAndEmit } from '../../store/emit.js';
import { getActiveGrantsForUserRoom } from '../../store/rooms.js';
import { db } from '../../store/client.js';
import { roleGrants } from '../../store/schema.js';
import { getStatement } from '../../store/statements.js';

export const DISCORD_DEMO_PARTY_ROOM_ID = '11111111-1111-1111-1111-111111111111';
export const DISCORD_DEMO_ADMIN_ROOM_ID = '22222222-2222-2222-2222-222222222222';
const DISCORD_DEMO_PLAYER_ROLE_ID = '33333333-3333-3333-3333-333333333333';

export interface PartyTurnNarrator {
  compose(roomId: string, userId: string, recentContent?: string): Promise<NarratorOutput>;
  emit(roomId: string, output: NarratorOutput, sources?: string[]): Promise<string[]>;
}

export interface SubmitDiscordPartyTurnInput {
  userId: string;
  text: string;
  modelSpec: string;
  events: EventBus;
  logger: Logger;
  narrator?: PartyTurnNarrator;
  partyRoomId?: string;
  adminRoomId?: string;
  fields?: Record<string, unknown>;
}

export interface SubmitDiscordPartyTurnResult {
  playerStatementId: string;
  narratorStatementIds: string[];
  output: NarratorOutput;
}

export async function ensureDiscordDemoPlayerGrant(
  userId: string,
  partyRoomId = DISCORD_DEMO_PARTY_ROOM_ID,
): Promise<void> {
  const grants = await getActiveGrantsForUserRoom(userId, partyRoomId);
  const alreadyGranted = grants.some((grant) => grant.roleId === DISCORD_DEMO_PLAYER_ROLE_ID);
  if (alreadyGranted) return;

  await db.insert(roleGrants).values({
    id: randomUUID(),
    userId,
    roomId: partyRoomId,
    roleId: DISCORD_DEMO_PLAYER_ROLE_ID,
    grantedBy: 'discord-demo-bot',
    precedence: 0,
  });
}

export async function emitStatementCreatedById(id: string, events: EventBus): Promise<void> {
  const row = await getStatement(id);
  if (!row) return;

  events.emit('statement:created', {
    id: row.id,
    kind: row.kind,
    scopeType: row.scopeType,
    scopeKey: row.scopeKey,
  });
}

export async function submitDiscordPartyTurn({
  userId,
  text,
  modelSpec,
  events,
  logger,
  narrator,
  partyRoomId = DISCORD_DEMO_PARTY_ROOM_ID,
  adminRoomId = DISCORD_DEMO_ADMIN_ROOM_ID,
  fields = {},
}: SubmitDiscordPartyTurnInput): Promise<SubmitDiscordPartyTurnResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('party turn text must not be empty');
  }

  await ensureDiscordDemoPlayerGrant(userId, partyRoomId);

  const playerStatementId = await appendIndexAndEmit(
    {
      scope: { type: 'party', partyId: partyRoomId },
      kind: 'dialogue',
      authorType: 'user',
      authorId: userId,
      content: trimmed,
      icOoc: 'ic',
      fields,
    },
    events,
  );

  const turnNarrator =
    narrator ??
    new Narrator({
      modelSpec,
      adminRoomId,
    });

  const output = await turnNarrator.compose(partyRoomId, userId, trimmed);
  const narratorStatementIds = await turnNarrator.emit(partyRoomId, output, [playerStatementId]);

  for (const id of narratorStatementIds) {
    await emitStatementCreatedById(id, events);
  }

  logger.info(
    { userId, partyRoomId, playerStatementId, narratorStatementIds, kind: output.kind },
    'discord party turn submitted',
  );

  return {
    playerStatementId,
    narratorStatementIds,
    output,
  };
}
