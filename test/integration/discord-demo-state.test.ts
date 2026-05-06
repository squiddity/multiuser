import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray, like } from 'drizzle-orm';
import type { Guild } from 'discord.js';
import { db, close } from '../../src/store/client.js';
import { migrate } from '../../src/store/migrate.js';
import { seed } from '../../src/store/seed.js';
import { mappings, roleGrants, statements } from '../../src/store/schema.js';
import {
  completeDiscordDemoOnboarding,
  ensureDiscordUserLink,
  resolveDiscordDemoPlayerDefinition,
} from '../../src/adapters/discord/demo-state.js';
import { DISCORD_DEMO_PARTY_ROOM_ID } from '../../src/adapters/discord/party-turns.js';

const touchedStatementIds: string[] = [];
const touchedMappingIds: string[] = [];
const touchedUserIds = new Set<string>();

function createMockGuild(id = 'guild-test-1'): Guild {
  const channels = new Map<string, any>();
  let nextChannelId = 1;

  const makeChannel = (name: string) => {
    const channel = {
      id: `channel-${nextChannelId++}`,
      name,
      type: 0,
      sentMessages: [] as string[],
      permissionOverwrites: {
        edit: async () => undefined,
      },
      send: async (content: string) => {
        channel.sentMessages.push(content);
        return undefined;
      },
    };
    channels.set(channel.id, channel);
    return channel;
  };

  return {
    id,
    roles: { everyone: { id: `${id}-everyone` } },
    channels: {
      cache: {
        find: (predicate: (channel: any) => boolean) => {
          for (const channel of channels.values()) {
            if (predicate(channel)) return channel;
          }
          return undefined;
        },
      },
      fetch: async (channelId?: string) => {
        if (channelId) {
          return channels.get(channelId) ?? null;
        }
        return {
          find: (predicate: (channel: any) => boolean) => {
            for (const channel of channels.values()) {
              if (predicate(channel)) return channel;
            }
            return undefined;
          },
        };
      },
      create: async ({ name }: { name: string }) => makeChannel(name),
    },
  } as unknown as Guild;
}

describe('integration: Discord demo onboarding state', () => {
  beforeAll(async () => {
    await migrate();
    await seed();
  });

  afterEach(async () => {
    if (touchedStatementIds.length > 0) {
      await db.delete(statements).where(inArray(statements.id, touchedStatementIds));
      touchedStatementIds.length = 0;
    }

    if (touchedMappingIds.length > 0) {
      await db.delete(mappings).where(inArray(mappings.id, touchedMappingIds));
      touchedMappingIds.length = 0;
    }

    for (const userId of touchedUserIds) {
      await db.delete(roleGrants).where(eq(roleGrants.userId, userId));
    }
    touchedUserIds.clear();
  });

  afterAll(async () => {
    await close();
  });

  it('creates a linked player definition, room grant, and routing records on onboarding completion', async () => {
    const guild = createMockGuild();
    const discordUserId = 'discord-onboard-user-1';
    const sessionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const linked = await ensureDiscordUserLink({
      discordUserId,
      discordDisplayName: 'Traveler One',
      guildId: guild.id,
    });
    touchedUserIds.add(linked.userId);

    const player = await completeDiscordDemoOnboarding({
      guild,
      discordUserId,
      discordDisplayName: 'Traveler One',
      sessionId,
      draft: {
        name: 'Kaelen',
        profile: {
          archetype: 'scout',
          pronouns: 'he/him',
          hook: 'Sworn to find the thief who stole his family blade.',
        },
      },
    });
    touchedUserIds.add(player.userId);

    const playerDefinition = await resolveDiscordDemoPlayerDefinition({ discordUserId });
    expect(playerDefinition).not.toBeNull();
    expect(playerDefinition?.characterName).toBe('Kaelen');
    expect(playerDefinition?.userId).toBe(linked.userId);
    expect(playerDefinition?.roomId).toBe(DISCORD_DEMO_PARTY_ROOM_ID);

    const grantRows = await db
      .select()
      .from(roleGrants)
      .where(
        and(
          eq(roleGrants.userId, player.userId),
          eq(roleGrants.roomId, DISCORD_DEMO_PARTY_ROOM_ID),
        ),
      );
    expect(grantRows).toHaveLength(1);

    const mappingRows = await db
      .select()
      .from(mappings)
      .where(like(mappings.sourceId, `%${player.userId}%`));
    touchedMappingIds.push(...mappingRows.map((row) => row.id));
    expect(mappingRows.some((row) => row.kind === 'user-discord-user')).toBe(true);
    expect(mappingRows.some((row) => row.kind === 'room-user-character')).toBe(true);

    const roomChannelMappings = await db
      .select()
      .from(mappings)
      .where(eq(mappings.kind, 'room-channel'));
    touchedMappingIds.push(...roomChannelMappings.map((row) => row.id));
    expect(roomChannelMappings.some((row) => row.sourceId === DISCORD_DEMO_PARTY_ROOM_ID)).toBe(
      true,
    );

    const sessionStatementRows = await db
      .select()
      .from(statements)
      .where(and(eq(statements.scopeType, 'session'), eq(statements.scopeKey, sessionId)));
    const characterStatementRows = await db
      .select()
      .from(statements)
      .where(
        and(
          eq(statements.scopeType, 'character'),
          like(statements.content, 'Character Kaelen created%'),
        ),
      );
    touchedStatementIds.push(
      ...sessionStatementRows.map((row) => row.id),
      ...characterStatementRows.map((row) => row.id),
    );
    expect(sessionStatementRows.some((row) => row.kind === 'governance')).toBe(true);
    expect(characterStatementRows.some((row) => row.kind === 'governance')).toBe(true);
  });
});
