import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  type AnyComponentBuilder,
} from 'discord.js';

// --- Component spec types (JSON format from agent output) ---

export interface ButtonSpec {
  type: 'button';
  customId: string;
  label: string;
  style: 'primary' | 'secondary' | 'success' | 'danger';
}

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

export interface SelectSpec {
  type: 'select';
  customId: string;
  placeholder: string;
  options: SelectOption[];
}

export interface ModalFieldSpec {
  customId: string;
  label: string;
  style: 'short' | 'paragraph';
  required: boolean;
  minLength?: number;
  maxLength?: number;
  placeholder?: string;
}

export interface ModalSpec {
  type: 'modal';
  customId: string;
  openButtonId: string;
  openButtonLabel: string;
  openButtonStyle?: 'primary' | 'secondary' | 'success' | 'danger';
  title: string;
  fields: ModalFieldSpec[];
}

export interface PrivateThreadSpec {
  type: 'private-thread';
  customId: string;
  label: string;
  style: 'primary' | 'secondary' | 'success' | 'danger';
}

export type ComponentSpec = ButtonSpec | SelectSpec | ModalSpec | PrivateThreadSpec;

// --- Style mapping ---

const STYLE_MAP: Record<string, ButtonStyle> = {
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
};

function toButtonStyle(style: string): ButtonStyle {
  return STYLE_MAP[style] ?? ButtonStyle.Secondary;
}

// --- Render functions ---

/**
 * Render a single component spec into Discord.js builders.
 * Returns an array of ActionRowBuilder — typically one row per component,
 * but modals with their opener buttons are split across interactions.
 */
export function renderComponentSpec(spec: ComponentSpec): ActionRowBuilder<AnyComponentBuilder>[] {
  switch (spec.type) {
    case 'button': {
      const button = new ButtonBuilder()
        .setCustomId(spec.customId)
        .setLabel(spec.label)
        .setStyle(toButtonStyle(spec.style));
      return [new ActionRowBuilder<ButtonBuilder>().addComponents(button)];
    }

    case 'private-thread': {
      const button = new ButtonBuilder()
        .setCustomId(spec.customId)
        .setLabel(spec.label)
        .setStyle(toButtonStyle(spec.style));
      return [new ActionRowBuilder<ButtonBuilder>().addComponents(button)];
    }

    case 'select': {
      const select = new StringSelectMenuBuilder()
        .setCustomId(spec.customId)
        .setPlaceholder(spec.placeholder)
        .addOptions(
          spec.options.map((opt) => ({
            label: opt.label,
            value: opt.value,
            description: opt.description,
          })),
        );
      return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)];
    }

    case 'modal': {
      // Modals are not rendered as action rows — they're opened separately.
      // The opener button is rendered here; the modal itself is built via buildModalSpec.
      const button = new ButtonBuilder()
        .setCustomId(spec.openButtonId)
        .setLabel(spec.openButtonLabel)
        .setStyle(toButtonStyle(spec.openButtonStyle ?? 'primary'));
      return [new ActionRowBuilder<ButtonBuilder>().addComponents(button)];
    }

    default:
      return [];
  }
}

/**
 * Render an array of component specs. Filters out modal specs (those are handled
 * separately via buildModalSpec) and returns action rows for all others.
 */
export function renderComponentSpecs(
  specs: ComponentSpec[],
): ActionRowBuilder<AnyComponentBuilder>[] {
  const rows: ActionRowBuilder<AnyComponentBuilder>[] = [];
  for (const spec of specs) {
    if (spec.type === 'modal') {
      // Still render the opener button
      rows.push(...renderComponentSpec(spec));
    } else {
      rows.push(...renderComponentSpec(spec));
    }
  }
  return rows;
}

/**
 * Extract modal specs from a component array. Used to look up which modal
 * to show when a button with matching openButtonId is clicked.
 */
export function extractModalSpecs(specs: ComponentSpec[]): ModalSpec[] {
  return specs.filter((s): s is ModalSpec => s.type === 'modal');
}

/**
 * Find a modal spec by its open button customId.
 */
export function findModalByOpenButton(
  specs: ComponentSpec[],
  openButtonId: string,
): ModalSpec | undefined {
  return extractModalSpecs(specs).find((m) => m.openButtonId === openButtonId);
}

/**
 * Find a modal spec by its submit customId.
 */
export function findModalBySubmitId(
  specs: ComponentSpec[],
  submitId: string,
): ModalSpec | undefined {
  return extractModalSpecs(specs).find((m) => m.customId === submitId);
}
