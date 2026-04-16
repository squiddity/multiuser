import { describe, expect, it } from 'vitest';
import { describeDnd5eActions } from '../../src/resolvers/dnd5e/actions.js';

describe('describeDnd5eActions', () => {
  it('returns 18 skills', () => {
    const actions = describeDnd5eActions('any-actor');
    expect(actions).toHaveLength(18);
  });

  it('all actions are skill-checks', () => {
    const actions = describeDnd5eActions('any-actor');
    for (const action of actions) {
      expect(action.kind).toBe('skill-check');
      expect(action.valid).toBe(true);
    }
  });

  it('includes core skills', () => {
    const names = describeDnd5eActions('any-actor').map((a) => a.name);
    expect(names).toContain('Athletics');
    expect(names).toContain('Stealth');
    expect(names).toContain('Perception');
    expect(names).toContain('Arcana');
    expect(names).toContain('Persuasion');
  });

  it('labels include ability score', () => {
    const actions = describeDnd5eActions('any-actor');
    const athletics = actions.find((a) => a.name === 'Athletics');
    expect(athletics!.label).toContain('STR');

    const stealth = actions.find((a) => a.name === 'Stealth');
    expect(stealth!.label).toContain('DEX');
  });

  it('each action has required fields', () => {
    const actions = describeDnd5eActions('any-actor');
    for (const action of actions) {
      expect(action).toHaveProperty('name');
      expect(action).toHaveProperty('label');
      expect(action).toHaveProperty('kind');
      expect(action).toHaveProperty('valid');
      expect(action).toHaveProperty('paramsSchema');
    }
  });
});
