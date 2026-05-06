import { describe, expect, it } from 'vitest';
import {
  validateCharacterDraft,
  formatValidationErrors,
} from '../../src/resolvers/tools/validate.js';

describe('validateCharacterDraft', () => {
  it('accepts a complete valid draft with name and profile', () => {
    const result = validateCharacterDraft({
      name: 'Kaelen',
      profile: { archetype: 'scout', pronouns: 'he/him', hook: 'Sworn to find the thief.' },
    });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.draft.name).toBe('Kaelen');
    }
  });

  it('accepts a draft with profile-only fields and no pronouns', () => {
    const result = validateCharacterDraft({
      name: 'Kaelen',
      profile: { archetype: 'frontline' },
    });

    expect(result.valid).toBe(true);
  });

  it('rejects a missing name', () => {
    const result = validateCharacterDraft({
      profile: { archetype: 'scout' },
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.field === 'name')).toBe(true);
    }
  });

  it('rejects a name that is too short', () => {
    const result = validateCharacterDraft({
      name: 'A',
      profile: { archetype: 'scout' },
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      const nameError = result.errors.find((e) => e.field === 'name');
      expect(nameError).toBeDefined();
    }
  });

  it('rejects an empty profile record', () => {
    const result = validateCharacterDraft({
      name: 'Valid Name',
      profile: {},
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      const profileError = result.errors.find((e) => e.field === 'profile');
      expect(profileError).toBeDefined();
    }
  });

  it('rejects non-object input', () => {
    const result = validateCharacterDraft(null);
    expect(result.valid).toBe(false);

    const result2 = validateCharacterDraft('string');
    expect(result2.valid).toBe(false);
  });

  it('accepts a draft where hook and pronouns are in profile (agent-defined)', () => {
    const result = validateCharacterDraft({
      name: 'Valid',
      profile: { archetype: 'scout', pronouns: 'they/them', hook: 'A sufficiently long goal.' },
    });
    expect(result.valid).toBe(true);
  });

  it('returns all errors at once for multiple failures', () => {
    const result = validateCharacterDraft({
      name: 'X',
      profile: {},
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      const fields = result.errors.map((e) => e.field);
      expect(fields).toContain('name');
      expect(fields).toContain('profile');
    }
  });
});

describe('formatValidationErrors', () => {
  it('formats errors as readable text', () => {
    const result = validateCharacterDraft({
      name: 'X',
      profile: { archetype: 'frontline' },
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      const formatted = formatValidationErrors(result);
      expect(formatted).toContain('name');
      expect(typeof formatted).toBe('string');
    }
  });

  it('joins multiple errors with newlines', () => {
    const result = validateCharacterDraft({
      name: 'X',
      profile: {},
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      const formatted = formatValidationErrors(result);
      const lines = formatted.split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(2);
    }
  });
});
