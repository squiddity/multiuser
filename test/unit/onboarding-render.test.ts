import { describe, expect, it } from 'vitest';
import {
  renderComponentSpec,
  renderComponentSpecs,
  extractModalSpecs,
  findModalByOpenButton,
  findModalBySubmitId,
  type ComponentSpec,
} from '../../src/resolvers/tools/render.js';

describe('renderComponentSpec', () => {
  it('renders a button spec into an ActionRowBuilder', () => {
    const rows = renderComponentSpec({
      type: 'button',
      customId: 'onboard.continue',
      label: 'Continue',
      style: 'primary',
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.components).toHaveLength(1);
    const data = rows[0]!.components[0]!.data;
    expect(data.custom_id).toBe('onboard.continue');
    expect(data.label).toBe('Continue');
    expect(data.style).toBe(1); // Primary
  });

  it('renders a danger button with correct style', () => {
    const rows = renderComponentSpec({
      type: 'button',
      customId: 'onboard.cancel',
      label: 'Cancel',
      style: 'danger',
    });

    const data = rows[0]!.components[0]!.data;
    expect(data.style).toBe(4); // Danger
  });

  it('renders a select menu spec', () => {
    const rows = renderComponentSpec({
      type: 'select',
      customId: 'onboard.profile.select',
      placeholder: 'Pick archetype',
      options: [
        { value: 'scout', label: 'Scout', description: 'Stealth and mobility' },
        { value: 'face', label: 'Face', description: 'Social influence' },
      ],
    });

    expect(rows).toHaveLength(1);
    const component = rows[0]!.components[0]!;
    expect(component.data.custom_id).toBe('onboard.profile.select');
  });

  it('renders a modal spec as its opener button', () => {
    const rows = renderComponentSpec({
      type: 'modal',
      customId: 'onboard.name.submit',
      openButtonId: 'onboard.name.open',
      openButtonLabel: 'Set name',
      openButtonStyle: 'primary',
      title: 'Set character name',
      fields: [
        {
          customId: 'name',
          label: 'Character name',
          style: 'short',
          required: true,
          minLength: 2,
          maxLength: 40,
        },
      ],
    });

    expect(rows).toHaveLength(1);
    const data = rows[0]!.components[0]!.data;
    expect(data.custom_id).toBe('onboard.name.open');
    expect(data.label).toBe('Set name');
  });

  it('renders a private thread spec', () => {
    const rows = renderComponentSpec({
      type: 'private-thread',
      customId: 'onboard.private-thread.open',
      label: 'Open private thread',
      style: 'secondary',
    });

    expect(rows).toHaveLength(1);
    const data = rows[0]!.components[0]!.data;
    expect(data.custom_id).toBe('onboard.private-thread.open');
  });
});

describe('extractModalSpecs', () => {
  it('extracts only modal specs from mixed components', () => {
    const specs: ComponentSpec[] = [
      { type: 'button', customId: 'onboard.continue', label: 'Next', style: 'primary' },
      {
        type: 'modal',
        customId: 'onboard.name.submit',
        openButtonId: 'onboard.name.open',
        openButtonLabel: 'Set name',
        title: 'Name',
        fields: [{ customId: 'name', label: 'Name', style: 'short', required: true }],
      },
      { type: 'button', customId: 'onboard.cancel', label: 'Cancel', style: 'danger' },
    ];

    const modals = extractModalSpecs(specs);
    expect(modals).toHaveLength(1);
    expect(modals[0]!.customId).toBe('onboard.name.submit');
  });

  it('returns empty array when no modals present', () => {
    const specs: ComponentSpec[] = [
      { type: 'button', customId: 'onboard.continue', label: 'Next', style: 'primary' },
    ];

    expect(extractModalSpecs(specs)).toHaveLength(0);
  });
});

describe('findModalByOpenButton', () => {
  it('finds a modal by its open button id', () => {
    const specs: ComponentSpec[] = [
      {
        type: 'modal',
        customId: 'onboard.hook.submit',
        openButtonId: 'onboard.hook.open',
        openButtonLabel: 'Add hook',
        title: 'Hook',
        fields: [],
      },
    ];

    const found = findModalByOpenButton(specs, 'onboard.hook.open');
    expect(found).toBeDefined();
    expect(found!.customId).toBe('onboard.hook.submit');
  });

  it('returns undefined when not found', () => {
    const specs: ComponentSpec[] = [];
    expect(findModalByOpenButton(specs, 'nonexistent')).toBeUndefined();
  });
});

describe('findModalBySubmitId', () => {
  it('finds a modal by its submit id', () => {
    const specs: ComponentSpec[] = [
      {
        type: 'modal',
        customId: 'onboard.name.submit',
        openButtonId: 'onboard.name.open',
        openButtonLabel: 'Set name',
        title: 'Name',
        fields: [],
      },
    ];

    const found = findModalBySubmitId(specs, 'onboard.name.submit');
    expect(found).toBeDefined();
  });

  it('returns undefined when submit id not found', () => {
    const specs: ComponentSpec[] = [];
    expect(findModalBySubmitId(specs, 'onboard.wrong.submit')).toBeUndefined();
  });
});

describe('renderComponentSpecs', () => {
  it('renders multiple specs into multiple action rows', () => {
    const specs: ComponentSpec[] = [
      { type: 'button', customId: 'onboard.continue', label: 'Next', style: 'primary' },
      { type: 'button', customId: 'onboard.cancel', label: 'Cancel', style: 'danger' },
    ];

    const rows = renderComponentSpecs(specs);
    expect(rows).toHaveLength(2);
  });

  it('includes modal opener buttons in rendered rows', () => {
    const specs: ComponentSpec[] = [
      {
        type: 'modal',
        customId: 'onboard.name.submit',
        openButtonId: 'onboard.name.open',
        openButtonLabel: 'Set name',
        title: 'Name',
        fields: [],
      },
    ];

    const rows = renderComponentSpecs(specs);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.components[0]!.data.custom_id).toBe('onboard.name.open');
  });
});
