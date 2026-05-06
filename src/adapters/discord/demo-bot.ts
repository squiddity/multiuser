import {
  ActionRowBuilder,
  ButtonBuilder,
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
import { normalizeOnboardingInput, type CharacterDraft } from '../../core/onboarding.js';
import { StatementBackedOnboardingStore, type OnboardingStore } from './onboarding-store.js';
import { createOnboardingAgent, type OnboardingAgent } from '../../agents/onboarding-agent.js';
import {
  renderComponentSpecs,
  findModalByOpenButton,
  findModalBySubmitId,
  type ComponentSpec,
  type ModalSpec,
} from '../../resolvers/tools/render.js';
import { validateCharacterDraft, formatValidationErrors } from '../../resolvers/tools/validate.js';
import { env } from '../../config/env.js';

const DEFAULT_MODEL = 'openrouter:deepseek/deepseek-v4-flash';

// --- Modal rendering (Discord.js specific) ---

function buildDiscordModal(spec: ModalSpec): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(spec.customId).setTitle(spec.title);

  const rows = spec.fields.map((field) => {
    const textInput = new TextInputBuilder()
      .setCustomId(field.customId)
      .setLabel(field.label)
      .setStyle(field.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(field.required);

    if (field.minLength !== undefined) textInput.setMinLength(field.minLength);
    if (field.maxLength !== undefined) textInput.setMaxLength(field.maxLength);
    if (field.placeholder) textInput.setPlaceholder(field.placeholder);

    return new ActionRowBuilder<TextInputBuilder>().addComponents(textInput);
  });

  modal.addComponents(rows);
  return modal;
}

// --- Component rendering from agent spec ---

function renderAgentComponents(specs: ComponentSpec[]): ActionRowBuilder<any>[] {
  return renderComponentSpecs(specs);
}

// --- Interaction serialization ---

function describeButtonClick(customId: string): string {
  const labels: Record<string, string> = {
    'onboard.continue': 'User clicked Continue.',
    'onboard.cancel': 'User cancelled onboarding.',
    'onboard.name.open': 'User wants to set their character name.',
    'onboard.pronouns.open': 'User wants to set pronouns.',
    'onboard.hook.open': 'User wants to set their backstory hook.',
    'onboard.private-thread.open': 'User requested a private thread.',
    'onboard.edit.name': 'User wants to edit their character name.',
    'onboard.edit.pronouns': 'User wants to edit their pronouns.',
    'onboard.edit.profile': 'User wants to edit their archetype.',
    'onboard.edit.hook': 'User wants to edit their backstory hook.',
    'onboard.confirm': 'User confirmed the final character.',
  };
  return labels[customId] ?? `User clicked button: ${customId}.`;
}

function getDraftForAgent(draft: {
  name?: string;
  pronouns?: string;
  profile: Record<string, string>;
  hook?: string;
}): Record<string, unknown> {
  return {
    name: draft.name,
    pronouns: draft.pronouns,
    profile: draft.profile ?? {},
    hook: draft.hook,
  };
}

// --- Main demo bot ---

export interface DiscordDemoBotController {
  client: Client;
  stop(): Promise<void>;
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

  const store: OnboardingStore = new StatementBackedOnboardingStore();
  const agent: OnboardingAgent = createOnboardingAgent({
    modelSpec: env.DEFAULT_MODEL_SPEC || DEFAULT_MODEL,
  });

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
        await store.getOrCreate(interaction.user.id);

        const output = await agent.start(interaction.user.id);
        await store.addHistory(interaction.user.id, `Agent: ${output.message}`);
        await store.setLastComponents(interaction.user.id, output.components);

        await interaction.reply({
          flags: MessageFlags.Ephemeral,
          content: `${output.message}\n${output.progress}`,
          components: renderAgentComponents(output.components),
        });
        return;
      }

      if (interaction.isButton()) {
        await handleAgenticButton({ interaction, store, agent, logger });
        return;
      }

      if (interaction.isStringSelectMenu()) {
        await handleAgenticSelect({ interaction, store, agent, logger });
        return;
      }

      if (interaction.isModalSubmit()) {
        await handleAgenticModal({ interaction, store, agent, logger });
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

// --- Agentic interaction handlers ---

async function handleAgenticButton({
  interaction,
  store,
  agent,
  logger,
}: {
  interaction: ButtonInteraction;
  store: OnboardingStore;
  agent: OnboardingAgent;
  logger: Logger;
}): Promise<void> {
  const session = await store.getOrCreate(interaction.user.id);

  // If the button opens a modal, show it
  const modalSpec = findModalByOpenButton(session.lastComponents, interaction.customId);
  if (modalSpec) {
    const modal = buildDiscordModal(modalSpec);
    await interaction.showModal(modal);
    return;
  }

  // Handle cancel directly (no agent needed)
  if (interaction.customId === 'onboard.cancel') {
    await store.reset(interaction.user.id);
    await interaction.update({
      content: 'Onboarding canceled. Run /start-onboarding to begin again.',
      components: [],
    });
    return;
  }

  // Handle confirm: validate draft before finalizing
  if (interaction.customId === 'onboard.confirm') {
    const validation = validateCharacterDraft(getDraftForAgent(session.draft));
    if (validation.valid) {
      await store.mergeDraft(
        interaction.user.id,
        validation.draft as unknown as Record<string, unknown>,
      );
      await store.confirm(interaction.user.id);

      await interaction.update({
        content: [
          `✅ **Onboarding complete!**`,
          '',
          `Welcome, **${validation.draft.name}**. You are ready to begin your adventure.`,
        ].join('\n'),
        components: [],
      });

      logger.info(
        { userId: interaction.user.id, draft: validation.draft },
        'agentic onboarding completed',
      );
      return;
    }

    // Validation failed — feed errors back to agent
    const errors = formatValidationErrors(validation);
    await store.addHistory(interaction.user.id, `(Validation failed: ${errors})`);

    const output = await agent.turn({
      draft: getDraftForAgent(session.draft),
      actionDescription: describeButtonClick(interaction.customId),
      conversationHistory: await store.getHistory(interaction.user.id),
      validationErrors: errors,
    });

    await store.addHistory(interaction.user.id, `Agent: ${output.message}`);
    await store.setLastComponents(interaction.user.id, output.components);

    await interaction.update({
      content: `${output.message}\n${output.progress}`,
      components: renderAgentComponents(output.components),
    });
    return;
  }

  // Handle private thread
  if (interaction.customId === 'onboard.private-thread.open') {
    const channel = interaction.channel;
    if (channel && channel.type === ChannelType.GuildText && 'threads' in channel) {
      const thread = await (channel as any).threads.create({
        name: `onboarding-${interaction.user.username}`.slice(0, 50),
        autoArchiveDuration: 60,
        type: ChannelType.PrivateThread,
        invitable: false,
        reason: 'Onboarding private drafting session',
      });
      await thread.members.add(interaction.user.id);
      await thread.send(
        'Private onboarding started. Your details here are visible only to you and moderators.',
      );
      await interaction.update({
        content: `Opened private thread: <#${thread.id}>\nContinue in this ephemeral flow when ready.`,
        components: renderAgentComponents(session.lastComponents),
      });
      return;
    }

    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: 'Could not open a private thread in this channel.',
    });
    return;
  }

  // General button: serialize, send to agent
  const actionDesc = describeButtonClick(interaction.customId);
  await store.addHistory(interaction.user.id, `User: ${actionDesc}`);

  const output = await agent.turn({
    draft: getDraftForAgent(session.draft),
    actionDescription: actionDesc,
    conversationHistory: await store.getHistory(interaction.user.id),
  });

  await store.addHistory(interaction.user.id, `Agent: ${output.message}`);
  await store.setLastComponents(interaction.user.id, output.components);

  await interaction.update({
    content: `${output.message}\n${output.progress}`,
    components: renderAgentComponents(output.components),
  });
}

async function handleAgenticSelect({
  interaction,
  store,
  agent,
  logger,
}: {
  interaction: StringSelectMenuInteraction;
  store: OnboardingStore;
  agent: OnboardingAgent;
  logger: Logger;
}): Promise<void> {
  let session = await store.getOrCreate(interaction.user.id);
  const selected = interaction.values[0];

  if (!selected) {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: 'No option selected.',
    });
    return;
  }

  session = await store.setField(interaction.user.id, 'archetype', selected);

  const actionDesc = `User selected archetype "${selected}".`;
  await store.addHistory(interaction.user.id, `User: ${actionDesc}`);

  const output = await agent.turn({
    draft: getDraftForAgent(session.draft),
    actionDescription: actionDesc,
    conversationHistory: await store.getHistory(interaction.user.id),
  });

  await store.addHistory(interaction.user.id, `Agent: ${output.message}`);
  await store.setLastComponents(interaction.user.id, output.components);

  await interaction.update({
    content: `${output.message}\n${output.progress}`,
    components: renderAgentComponents(output.components),
  });
}

async function handleAgenticModal({
  interaction,
  store,
  agent,
  logger,
}: {
  interaction: ModalSubmitInteraction;
  store: OnboardingStore;
  agent: OnboardingAgent;
  logger: Logger;
}): Promise<void> {
  let session = await store.getOrCreate(interaction.user.id);
  const modalSpec = findModalBySubmitId(session.lastComponents, interaction.customId);

  if (!modalSpec) {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: 'Unknown modal submission.',
    });
    return;
  }

  // Collect field values
  const fieldValues: Record<string, string> = {};
  for (const field of modalSpec.fields) {
    const value = normalizeOnboardingInput(interaction.fields.getTextInputValue(field.customId));
    fieldValues[field.customId] = value;
  }

  // Apply to session based on the fields present
  let actionDesc = '';
  if (fieldValues.name !== undefined) {
    session = await store.setField(interaction.user.id, 'name', fieldValues.name);
    actionDesc = `User set character name to "${fieldValues.name}".`;
  } else if (fieldValues.pronouns !== undefined) {
    const pronouns = fieldValues.pronouns.length > 0 ? fieldValues.pronouns : undefined;
    session = await store.setField(interaction.user.id, 'pronouns', pronouns ?? '');
    actionDesc = pronouns ? `User set pronouns to "${pronouns}".` : 'User skipped pronouns.';
  } else if (fieldValues.hook !== undefined) {
    session = await store.setField(interaction.user.id, 'hook', fieldValues.hook);
    actionDesc = `User set backstory hook to "${fieldValues.hook}".`;
  } else {
    actionDesc = 'User submitted a modal.';
  }

  await store.addHistory(interaction.user.id, `User: ${actionDesc}`);

  const output = await agent.turn({
    draft: getDraftForAgent(session.draft),
    actionDescription: actionDesc,
    conversationHistory: await store.getHistory(interaction.user.id),
  });

  await store.addHistory(interaction.user.id, `Agent: ${output.message}`);
  await store.setLastComponents(interaction.user.id, output.components);

  await interaction.reply({
    flags: MessageFlags.Ephemeral,
    content: `${output.message}\n${output.progress}`,
    components: renderAgentComponents(output.components),
  });
}

// --- Command registration ---

async function registerCommands(
  client: Client,
  guildId: string | undefined,
  logger: Logger,
): Promise<void> {
  if (!client.application) return;

  const commands = [
    { name: 'start-onboarding', description: 'Start the onboarding flow' },
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
