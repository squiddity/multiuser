import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  GatewayIntentBits,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
  type ButtonInteraction,
  type Interaction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type { Logger } from 'pino';
import {
  normalizeOnboardingInput,
  type Archetype,
  type CharacterDraft,
} from '../../core/onboarding.js';
import { InMemoryOnboardingService, type OnboardingSession } from './onboarding-service.js';

const ARCHETYPE_OPTIONS: Array<{ value: Archetype; label: string; description: string }> = [
  { value: 'frontline', label: 'Frontline', description: 'Direct, bold approach' },
  { value: 'scout', label: 'Scout', description: 'Stealth and mobility' },
  { value: 'scholar', label: 'Scholar', description: 'Knowledge and analysis' },
  { value: 'face', label: 'Face', description: 'Social influence and diplomacy' },
  { value: 'wildcard', label: 'Wildcard', description: 'Unpredictable style' },
];

export interface DiscordDemoBotController {
  client: Client;
  stop(): Promise<void>;
}

function progressText(session: OnboardingSession): string {
  let complete = 0;
  if (session.draft.name) complete += 1;
  if (typeof session.draft.pronouns !== 'undefined') complete += 1;
  if (session.draft.archetype) complete += 1;
  if (session.draft.hook) complete += 1;
  return `Progress: ${complete}/4`;
}

function renderSummary(session: OnboardingSession): string {
  return [
    '**Character Summary**',
    `- Name: ${session.draft.name ?? '_not set_'}`,
    `- Pronouns/display: ${session.draft.pronouns ?? 'not specified'}`,
    `- Archetype: ${session.draft.archetype ?? '_not set_'}`,
    `- Hook: ${session.draft.hook ?? '_not set_'}`,
    progressText(session),
  ].join('\n');
}

function welcomeComponents() {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('onboard.continue')
        .setLabel('Continue')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('onboard.cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

function namePromptComponents() {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('onboard.name.open')
        .setLabel('Set name')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('onboard.cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger),
    ),
  ];
}

function pronounsPromptComponents() {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('onboard.pronouns.open')
        .setLabel('Set preference')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('onboard.continue')
        .setLabel('Skip')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function archetypePromptComponents() {
  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('onboard.archetype.select')
        .setPlaceholder('Pick an archetype')
        .addOptions(
          ARCHETYPE_OPTIONS.map((option) => ({
            label: option.label,
            value: option.value,
            description: option.description,
          })),
        ),
    ),
  ];
}

function hookPromptComponents() {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('onboard.hook.open')
        .setLabel('Add hook')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('onboard.private-thread.open')
        .setLabel('Open private thread')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function reviewComponents() {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('onboard.confirm')
        .setLabel('Confirm character')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('onboard.edit.name')
        .setLabel('Edit name')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('onboard.edit.hook')
        .setLabel('Edit hook')
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

async function showNameModal(interaction: ButtonInteraction): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId('onboard.name.submit')
    .setTitle('Set character name');
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('name')
        .setLabel('Character name')
        .setStyle(TextInputStyle.Short)
        .setMinLength(2)
        .setMaxLength(40)
        .setRequired(true),
    ),
  );
  await interaction.showModal(modal);
}

async function showPronounsModal(interaction: ButtonInteraction): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId('onboard.pronouns.submit')
    .setTitle('Pronouns / display preference');
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('pronouns')
        .setLabel('Pronouns / display preference')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(60)
        .setRequired(false),
    ),
  );
  await interaction.showModal(modal);
}

async function showHookModal(interaction: ButtonInteraction): Promise<void> {
  const modal = new ModalBuilder().setCustomId('onboard.hook.submit').setTitle('Backstory hook');
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('hook')
        .setLabel('Goal, debt, promise, or mystery')
        .setStyle(TextInputStyle.Paragraph)
        .setMinLength(10)
        .setMaxLength(280)
        .setRequired(true),
    ),
  );
  await interaction.showModal(modal);
}

async function continueFlow({
  interaction,
  session,
}: {
  interaction: ButtonInteraction;
  session: OnboardingSession;
}): Promise<void> {
  if (!session.draft.name) {
    await interaction.update({
      content: `Choose your character name.\n${progressText(session)}`,
      components: namePromptComponents(),
    });
    return;
  }

  if (!session.draft.archetype) {
    if (typeof session.draft.pronouns === 'undefined') {
      await interaction.update({
        content: `Optional: share pronouns or display preference.\n${progressText(session)}`,
        components: pronounsPromptComponents(),
      });
      return;
    }

    await interaction.update({
      content: `Pick your starting archetype/playstyle.\n${progressText(session)}`,
      components: archetypePromptComponents(),
    });
    return;
  }

  if (!session.draft.hook) {
    await interaction.update({
      content: `Give one short hook: a goal, debt, promise, or mystery.\n${progressText(session)}`,
      components: hookPromptComponents(),
    });
    return;
  }

  await interaction.update({ content: renderSummary(session), components: reviewComponents() });
}

function ensureDraftComplete(
  session: OnboardingSession,
): session is OnboardingSession & { draft: CharacterDraft } {
  return Boolean(session.draft.name && session.draft.archetype && session.draft.hook);
}

async function handleButton({
  interaction,
  service,
  logger,
}: {
  interaction: ButtonInteraction;
  service: InMemoryOnboardingService;
  logger: Logger;
}): Promise<void> {
  const session = service.getOrCreateSession(interaction.user.id);

  switch (interaction.customId) {
    case 'onboard.continue': {
      await continueFlow({ interaction, session });
      return;
    }
    case 'onboard.cancel': {
      service.reset(interaction.user.id);
      await interaction.update({
        content: 'Onboarding canceled. Run /start-onboarding to begin again.',
        components: [],
      });
      return;
    }
    case 'onboard.name.open': {
      await showNameModal(interaction);
      return;
    }
    case 'onboard.pronouns.open': {
      await showPronounsModal(interaction);
      return;
    }
    case 'onboard.hook.open': {
      await showHookModal(interaction);
      return;
    }
    case 'onboard.private-thread.open': {
      const channel = interaction.channel;
      if (!channel || channel.type !== ChannelType.GuildText || !('threads' in channel)) {
        await interaction.update({
          content: 'Could not open a private thread in this channel. Continue in ephemeral flow.',
          components: hookPromptComponents(),
        });
        return;
      }

      const thread = await channel.threads.create({
        name: `onboarding-${interaction.user.username}`.slice(0, 50),
        autoArchiveDuration: 60,
        type: ChannelType.PrivateThread,
        invitable: false,
        reason: 'Onboarding private drafting session',
      });
      await thread.members.add(interaction.user.id);
      await thread.send(
        'Private onboarding started. Continue by pressing **Add hook** in your ephemeral flow.',
      );
      await interaction.update({
        content: `Opened private thread: <#${thread.id}>\nContinue in this ephemeral flow when ready.`,
        components: hookPromptComponents(),
      });
      return;
    }
    case 'onboard.edit.name': {
      await showNameModal(interaction);
      return;
    }
    case 'onboard.edit.hook': {
      await showHookModal(interaction);
      return;
    }
    case 'onboard.confirm': {
      if (!ensureDraftComplete(session)) {
        await interaction.update({
          content: 'Character is incomplete. Please finish all required fields first.',
          components: reviewComponents(),
        });
        return;
      }

      service.confirm(interaction.user.id);
      await interaction.update({
        content: `${renderSummary(session)}\n\n✅ Onboarding complete (demo).`,
        components: [],
      });
      logger.info(
        { userId: interaction.user.id, draft: session.draft },
        'demo onboarding completed',
      );
      return;
    }
    default: {
      await interaction.reply({ content: 'Unknown action.', flags: MessageFlags.Ephemeral });
    }
  }
}

async function handleSelect({
  interaction,
  service,
}: {
  interaction: StringSelectMenuInteraction;
  service: InMemoryOnboardingService;
}): Promise<void> {
  if (interaction.customId !== 'onboard.archetype.select') {
    return;
  }

  const selected = interaction.values[0];
  const archetype = ARCHETYPE_OPTIONS.find((opt) => opt.value === selected)?.value;
  if (!archetype) {
    await interaction.update({
      content: 'Invalid archetype.',
      components: archetypePromptComponents(),
    });
    return;
  }

  const session = service.setArchetype(interaction.user.id, archetype);
  await interaction.update({
    content: `Archetype saved: **${archetype}**\n${progressText(session)}`,
    components: hookPromptComponents(),
  });
}

async function handleModal({
  interaction,
  service,
}: {
  interaction: ModalSubmitInteraction;
  service: InMemoryOnboardingService;
}): Promise<void> {
  if (interaction.customId === 'onboard.name.submit') {
    const name = normalizeOnboardingInput(interaction.fields.getTextInputValue('name'));
    const session = service.setName(interaction.user.id, name);
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: `Name saved: **${name}**\n${progressText(session)}`,
      components: pronounsPromptComponents(),
    });
    return;
  }

  if (interaction.customId === 'onboard.pronouns.submit') {
    const raw = interaction.fields.getTextInputValue('pronouns');
    const normalized = normalizeOnboardingInput(raw);
    const pronouns = normalized.length > 0 ? normalized : undefined;
    const session = service.setPronouns(interaction.user.id, pronouns);
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: `Saved.\n${progressText(session)}`,
      components: archetypePromptComponents(),
    });
    return;
  }

  if (interaction.customId === 'onboard.hook.submit') {
    const hook = normalizeOnboardingInput(interaction.fields.getTextInputValue('hook'));
    const session = service.setHook(interaction.user.id, hook);
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: `Hook saved.\n${progressText(session)}`,
      components: reviewComponents(),
    });
    return;
  }
}

async function registerCommands(
  client: Client,
  guildId: string | undefined,
  logger: Logger,
): Promise<void> {
  if (!client.application) {
    return;
  }

  const commands = [
    { name: 'start-onboarding', description: 'Start the demo onboarding flow' },
    { name: 'ping', description: 'Check bot liveness' },
  ];

  if (guildId) {
    await client.application.commands.set(commands, guildId);
    logger.info({ guildId }, 'registered guild onboarding commands');
    return;
  }

  await client.application.commands.set(commands);
  logger.info('registered global onboarding commands');
}

export async function startDiscordDemoBot({
  token,
  guildId,
  logger,
}: {
  token: string;
  guildId?: string;
  logger: Logger;
}): Promise<DiscordDemoBotController> {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  });

  const onboarding = new InMemoryOnboardingService();

  client.on('clientReady', async () => {
    logger.info({ bot: client.user?.tag }, 'discord demo bot ready');
    await registerCommands(client, guildId, logger);
  });

  client.on('interactionCreate', async (interaction: Interaction) => {
    try {
      if (interaction.isChatInputCommand() && interaction.commandName === 'ping') {
        await interaction.reply({ flags: MessageFlags.Ephemeral, content: 'pong' });
        return;
      }

      if (interaction.isChatInputCommand() && interaction.commandName === 'start-onboarding') {
        onboarding.getOrCreateSession(interaction.user.id);
        await interaction.reply({
          flags: MessageFlags.Ephemeral,
          content:
            'I’ll guide you through a short setup. First, confirming your account link...\nLinked. Let’s build your character.',
          components: welcomeComponents(),
        });
        return;
      }

      if (interaction.isButton()) {
        await handleButton({ interaction, service: onboarding, logger });
        return;
      }

      if (interaction.isStringSelectMenu()) {
        await handleSelect({ interaction, service: onboarding });
        return;
      }

      if (interaction.isModalSubmit()) {
        await handleModal({ interaction, service: onboarding });
      }
    } catch (error) {
      logger.error(
        { err: error, customId: 'customId' in interaction ? interaction.customId : undefined },
        'discord interaction failed',
      );
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({
          flags: MessageFlags.Ephemeral,
          content: 'Something went wrong while handling onboarding.',
        });
      }
    }
  });

  await client.login(token);

  return {
    client,
    stop: async () => {
      client.destroy();
    },
  };
}
