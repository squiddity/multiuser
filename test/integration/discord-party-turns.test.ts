import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import type { Logger } from 'pino';
import { appendStatement } from '../../src/store/statements.js';
import { db, close } from '../../src/store/client.js';
import { migrate } from '../../src/store/migrate.js';
import { seed } from '../../src/store/seed.js';
import { roleGrants, statements } from '../../src/store/schema.js';
import { EventBus, type StatementEvent } from '../../src/core/events.js';
import {
  DISCORD_DEMO_PARTY_ROOM_ID,
  submitDiscordPartyTurn,
} from '../../src/adapters/discord/party-turns.js';

const touchedUserIds = new Set<string>();
const touchedStatementIds: string[] = [];

const noopLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
  trace: () => undefined,
  fatal: () => undefined,
  child: () => noopLogger,
} as unknown as Logger;

async function cleanupUser(userId: string): Promise<void> {
  await db.delete(roleGrants).where(eq(roleGrants.userId, userId));
}

describe('integration: Discord party turns', () => {
  beforeAll(async () => {
    await migrate();
    await seed();
  });

  afterEach(async () => {
    for (const userId of touchedUserIds) {
      await cleanupUser(userId);
    }
    touchedUserIds.clear();

    if (touchedStatementIds.length > 0) {
      await db.delete(statements).where(inArray(statements.id, touchedStatementIds));
      touchedStatementIds.length = 0;
    }
  });

  afterAll(async () => {
    await close();
  });

  it('records a party turn, emits events, and ensures the Discord user can read the room', async () => {
    const userId = 'discord-party-user-1';
    touchedUserIds.add(userId);

    const events = new EventBus();
    const seenEvents: StatementEvent[] = [];
    events.on<StatementEvent>('statement:created', (event) => {
      seenEvents.push(event);
    });

    const result = await submitDiscordPartyTurn({
      userId,
      text: 'I ask the innkeeper about the red tower.',
      modelSpec: 'test-model',
      events,
      logger: noopLogger,
      narrator: {
        compose: async () => ({
          kind: 'narration',
          content: 'The innkeeper lowers her voice and points east toward the red tower.',
        }),
        emit: async (roomId, output, sources) => {
          const id = await appendStatement({
            scope: { type: 'party', partyId: roomId },
            kind: output.kind,
            authorType: 'agent',
            authorId: 'narrator',
            content: output.content,
            sources: sources ?? [],
            embedding: null,
          });
          touchedStatementIds.push(id);
          return [id];
        },
      },
      fields: {
        discordChannelId: 'channel-1',
      },
    });

    touchedStatementIds.push(result.playerStatementId, ...result.narratorStatementIds);

    expect(result.output.kind).toBe('narration');
    expect(result.narratorStatementIds).toHaveLength(1);
    expect(seenEvents.map((event) => event.kind)).toEqual(['dialogue', 'narration']);
    expect(seenEvents.every((event) => event.scopeType === 'party')).toBe(true);

    const playerRow = await db
      .select()
      .from(statements)
      .where(eq(statements.id, result.playerStatementId))
      .limit(1);
    expect(playerRow[0]?.authorId).toBe(userId);
    expect(playerRow[0]?.scopeKey).toBe(DISCORD_DEMO_PARTY_ROOM_ID);

    const narratorRow = await db
      .select()
      .from(statements)
      .where(eq(statements.id, result.narratorStatementIds[0]!))
      .limit(1);
    expect(narratorRow[0]?.sources).toContain(result.playerStatementId);

    const grantRows = await db
      .select()
      .from(roleGrants)
      .where(and(eq(roleGrants.userId, userId), eq(roleGrants.roomId, DISCORD_DEMO_PARTY_ROOM_ID)));
    expect(grantRows).toHaveLength(1);
    expect(grantRows[0]?.roleId).toBe('33333333-3333-3333-3333-333333333333');
  });
});
