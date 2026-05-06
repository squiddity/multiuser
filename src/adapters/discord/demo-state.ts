import { randomUUID } from 'node:crypto';
import {
  ChannelType,
  PermissionFlagsBits,
  type Guild,
  type GuildBasedChannel,
  type TextChannel,
} from 'discord.js';
import type { CharacterDraft } from '../../core/onboarding.js';
import { logger } from '../../config/logger.js';
import { appendStatement } from '../../store/statements.js';
import {
  getLatestMappingByPlatform,
  getLatestMappingBySource,
  recordMapping,
} from '../../store/mappings.js';
import {
  DISCORD_DEMO_ADMIN_ROOM_ID,
  DISCORD_DEMO_PARTY_ROOM_ID,
  ensureDiscordDemoPlayerGrant,
} from './party-turns.js';

const DISCORD_PLATFORM = 'discord';
const ONBOARDING_ROOM_SOURCE_ID = 'discord-demo:onboarding-intake';
const ONBOARDING_CHANNEL_NAME = 'onboarding-intake';
const PARTY_CHANNEL_NAME = 'party-1';
const ADMIN_CHANNEL_NAME = 'gm-briefings';

export interface DiscordLinkedUser {
  userId: string;
  discordUserId: string;
  discordDisplayName?: string;
  guildId?: string | null;
}

export interface DiscordDemoPlayerDefinition {
  userId: string;
  discordUserId: string;
  characterId: string;
  characterName: string;
  pronouns?: string;
  archetype: string;
  hook: string;
  roomId: string;
  channelId: string;
}

export interface DiscordDemoGuildProjection {
  onboardingChannelId: string;
  partyChannelId: string;
  adminChannelId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deriveDemoUserId(discordUserId: string): string {
  return `discord-user:${discordUserId}`;
}

function roomUserCharacterSourceId(roomId: string, userId: string): string {
  return `${roomId}:${userId}`;
}

function asTextChannel(channel: GuildBasedChannel | null): TextChannel | null {
  if (!channel) return null;
  return channel.type === ChannelType.GuildText ? (channel as TextChannel) : null;
}

async function resolveMappedChannel(guild: Guild, sourceId: string): Promise<TextChannel | null> {
  const mapping = await getLatestMappingBySource('room-channel', sourceId);
  if (!mapping) return null;
  const channel = await guild.channels.fetch(mapping.platformId).catch(() => null);
  return asTextChannel(channel);
}

async function findTextChannelByName(guild: Guild, name: string): Promise<TextChannel | null> {
  const existing = guild.channels.cache.find(
    (channel) => channel.type === ChannelType.GuildText && channel.name === name,
  );
  if (existing) return existing as TextChannel;

  const fetched = await guild.channels.fetch();
  const match = fetched.find(
    (channel) => channel?.type === ChannelType.GuildText && channel.name === name,
  );
  return match ? (match as TextChannel) : null;
}

async function ensureMappedTextChannel(input: {
  guild: Guild;
  sourceId: string;
  name: string;
  content: string;
  privateToAssignedUsers?: boolean;
}): Promise<TextChannel> {
  const botMemberId = input.guild.members?.me?.id;
  const privateOverwrites = input.privateToAssignedUsers
    ? [
        {
          id: input.guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
        },
        ...(botMemberId
          ? [
              {
                id: botMemberId,
                allow: [
                  PermissionFlagsBits.ViewChannel,
                  PermissionFlagsBits.SendMessages,
                  PermissionFlagsBits.ReadMessageHistory,
                  PermissionFlagsBits.ManageChannels,
                ],
              },
            ]
          : []),
      ]
    : undefined;
  const mapped = await resolveMappedChannel(input.guild, input.sourceId);
  if (mapped) return mapped;

  const existingByName = await findTextChannelByName(input.guild, input.name);
  const channel =
    existingByName ??
    ((await input.guild.channels.create({
      name: input.name,
      type: ChannelType.GuildText,
      permissionOverwrites: privateOverwrites,
    })) as TextChannel);

  await recordMapping({
    kind: 'room-channel',
    sourceId: input.sourceId,
    platform: DISCORD_PLATFORM,
    platformId: channel.id,
    authorId: 'discord-demo-bot',
    content: input.content,
    fields: {
      guildId: input.guild.id,
      channelId: channel.id,
      channelName: channel.name,
      channelType: channel.type,
      privateToAssignedUsers: input.privateToAssignedUsers ?? false,
    },
  });

  return channel;
}

export async function ensureDiscordDemoGuildProjection(
  guild: Guild,
): Promise<DiscordDemoGuildProjection> {
  const onboardingChannel = await ensureMappedTextChannel({
    guild,
    sourceId: ONBOARDING_ROOM_SOURCE_ID,
    name: ONBOARDING_CHANNEL_NAME,
    content: 'Projected onboarding intake channel for the Discord demo bot.',
  });
  const partyChannel = await ensureMappedTextChannel({
    guild,
    sourceId: DISCORD_DEMO_PARTY_ROOM_ID,
    name: PARTY_CHANNEL_NAME,
    content: 'Projected party room channel for the Discord demo bot.',
    privateToAssignedUsers: false,
  });
  const adminChannel = await ensureMappedTextChannel({
    guild,
    sourceId: DISCORD_DEMO_ADMIN_ROOM_ID,
    name: ADMIN_CHANNEL_NAME,
    content: 'Projected governance room channel for the Discord demo bot.',
    privateToAssignedUsers: true,
  });

  return {
    onboardingChannelId: onboardingChannel.id,
    partyChannelId: partyChannel.id,
    adminChannelId: adminChannel.id,
  };
}

export async function ensureDiscordUserLink(input: {
  discordUserId: string;
  discordDisplayName?: string;
  guildId?: string | null;
}): Promise<DiscordLinkedUser> {
  const userId = deriveDemoUserId(input.discordUserId);
  await recordMapping({
    kind: 'user-discord-user',
    sourceId: userId,
    platform: DISCORD_PLATFORM,
    platformId: input.discordUserId,
    authorId: 'discord-demo-bot',
    content: `Linked Discord account ${input.discordUserId} to ${userId}.`,
    fields: {
      userId,
      userAccountType: DISCORD_PLATFORM,
      userAccountId: input.discordUserId,
      discordDisplayName: input.discordDisplayName ?? null,
      guildId: input.guildId ?? null,
    },
  });

  return {
    userId,
    discordUserId: input.discordUserId,
    discordDisplayName: input.discordDisplayName,
    guildId: input.guildId,
  };
}

export async function resolveDiscordDemoPlayerDefinition(input: {
  discordUserId: string;
  roomId?: string;
}): Promise<DiscordDemoPlayerDefinition | null> {
  const roomId = input.roomId ?? DISCORD_DEMO_PARTY_ROOM_ID;
  const userMapping = await getLatestMappingByPlatform(
    'user-discord-user',
    DISCORD_PLATFORM,
    input.discordUserId,
  );
  if (!userMapping) return null;

  const userId = userMapping.sourceId;
  const playerMapping = await getLatestMappingBySource(
    'room-user-character',
    roomUserCharacterSourceId(roomId, userId),
  );
  if (!playerMapping) return null;

  const fields = isRecord(playerMapping.fields) ? playerMapping.fields : {};
  if (
    typeof fields.characterId !== 'string' ||
    typeof fields.characterName !== 'string' ||
    typeof fields.hook !== 'string' ||
    typeof fields.archetype !== 'string' ||
    typeof fields.channelId !== 'string'
  ) {
    return null;
  }

  return {
    userId,
    discordUserId: input.discordUserId,
    characterId: fields.characterId,
    characterName: fields.characterName,
    pronouns: typeof fields.pronouns === 'string' ? fields.pronouns : undefined,
    archetype: fields.archetype,
    hook: typeof fields.hook === 'string' ? fields.hook : '',
    roomId,
    channelId: fields.channelId,
  };
}

export async function completeDiscordDemoOnboarding(input: {
  guild: Guild;
  discordUserId: string;
  discordDisplayName?: string;
  sessionId: string;
  draft: CharacterDraft;
}): Promise<DiscordDemoPlayerDefinition> {
  const linkedUser = await ensureDiscordUserLink({
    discordUserId: input.discordUserId,
    discordDisplayName: input.discordDisplayName,
    guildId: input.guild.id,
  });
  const projection = await ensureDiscordDemoGuildProjection(input.guild);
  const existing = await resolveDiscordDemoPlayerDefinition({
    discordUserId: input.discordUserId,
    roomId: DISCORD_DEMO_PARTY_ROOM_ID,
  });
  if (existing) {
    return existing;
  }

  const characterId = randomUUID();
  const profile = input.draft.profile ?? {};
  const archetype = profile.archetype ?? 'wildcard';
  const pronouns = profile.pronouns ?? null;
  const hook = profile.hook ?? '';

  await appendStatement({
    scope: { type: 'character', characterId },
    kind: 'governance',
    authorType: 'system',
    authorId: 'discord-demo-bot',
    content: `Character ${input.draft.name} created during onboarding.`,
    fields: {
      recordType: 'character-definition',
      userId: linkedUser.userId,
      userAccountType: DISCORD_PLATFORM,
      userAccountId: input.discordUserId,
      roomId: DISCORD_DEMO_PARTY_ROOM_ID,
      sessionId: input.sessionId,
      draft: input.draft,
    },
    embedding: null,
  });

  await recordMapping({
    kind: 'room-user-character',
    sourceId: roomUserCharacterSourceId(DISCORD_DEMO_PARTY_ROOM_ID, linkedUser.userId),
    platform: DISCORD_PLATFORM,
    platformId: input.discordUserId,
    authorId: 'discord-demo-bot',
    content: `Defined ${input.draft.name} for ${linkedUser.userId} in the demo party room.`,
    fields: {
      userId: linkedUser.userId,
      userAccountType: DISCORD_PLATFORM,
      userAccountId: input.discordUserId,
      roomId: DISCORD_DEMO_PARTY_ROOM_ID,
      channelId: projection.partyChannelId,
      characterId,
      characterName: input.draft.name,
      pronouns,
      archetype,
      hook,
      sessionId: input.sessionId,
    },
  });

  await ensureDiscordDemoPlayerGrant(linkedUser.userId, DISCORD_DEMO_PARTY_ROOM_ID);

  const handoffContent = hook
    ? `The door opens. **${input.draft.name}** steps in, driven by: ${hook}. When you're ready, use /say for your first action.`
    : `The door opens. **${input.draft.name}** steps in. When you're ready, use /say for your first action.`;

  const partyChannel = asTextChannel(await input.guild.channels.fetch(projection.partyChannelId));
  if (partyChannel) {
    try {
      await partyChannel.permissionOverwrites.edit(input.discordUserId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });
    } catch (permErr) {
      logger.warn(
        { err: permErr, discordUserId: input.discordUserId, channelId: partyChannel.id },
        'failed to grant channel access — bot may lack Manage Permissions',
      );
    }
    await partyChannel.send(handoffContent);
  }

  await appendStatement({
    scope: { type: 'session', sessionId: input.sessionId },
    kind: 'governance',
    authorType: 'system',
    authorId: 'discord-demo-bot',
    content: `Onboarding completed and routed ${input.draft.name} to the demo party room.`,
    fields: {
      workflowType: 'onboarding',
      workflowEventType: 'room-assigned',
      userId: linkedUser.userId,
      userAccountType: DISCORD_PLATFORM,
      userAccountId: input.discordUserId,
      destinationRoomId: DISCORD_DEMO_PARTY_ROOM_ID,
      destinationChannelId: projection.partyChannelId,
      decisionSource: 'rule',
      characterId,
      characterName: input.draft.name,
    },
    embedding: null,
  });

  return {
    userId: linkedUser.userId,
    discordUserId: input.discordUserId,
    characterId,
    characterName: input.draft.name,
    pronouns: pronouns ?? undefined,
    archetype,
    hook,
    roomId: DISCORD_DEMO_PARTY_ROOM_ID,
    channelId: projection.partyChannelId,
  };
}
