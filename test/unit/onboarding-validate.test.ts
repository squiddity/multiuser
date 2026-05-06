import { describe, expect, it } from 'vitest';
import {
  validateCharacterDraft,
  formatValidationErrors,
} from '../../src/resolvers/tools/validate.js';

describe('validateCharacterDraft', () => {
  it('accepts a complete valid draft', () => {
    const result = validateCharacterDraft({
      name: 'Kaelen',
      pronouns: 'he/him',
      profile: { archetype: 'scout' },
      hook: 'Sworn to find the thief who stole his heirloom blade.',
    });

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.draft.name).toBe('Kaelen');
    }
  });

  it('accepts a draft with omitted pronouns', () => {
    const result = validateCharacterDraft({
      name: 'Kaelen',
      profile: { archetype: 'frontline' },
      hook: 'A backstory hook with enough length for the test.',
    });

    expect(result.valid).toBe(true);
  });

  it('rejects a missing name', () => {
    const result = validateCharacterDraft({
      profile: { archetype: 'scout' },
      hook: 'A hook of sufficient length for testing validation.',
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
      hook: 'A hook of sufficient length for testing.',
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      const nameError = result.errors.find((e) => e.field === 'name');
      expect(nameError).toBeDefined();
    }
  });

  it('rejects a missing archetype (empty profile)', () => {
    const result = validateCharacterDraft({
      name: 'Valid Name',
      profile: {},
      hook: 'A hook of sufficient length for testing.',
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      const profileError = result.errors.find((e) => e.field === 'profile');
      expect(profileError).toBeDefined();
    }
  });

  it('rejects a missing hook', () => {
    const result = validateCharacterDraft({
      name: 'Valid Name',
      profile: { archetype: 'scout' },
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      const hookError = result.errors.find((e) => e.field === 'hook');
      expect(hookError).toBeDefined();
    }
  });

  it('rejects a hook that is too short', () => {
    const result = validateCharacterDraft({
      name: 'Valid Name',
      profile: { archetype: 'scout' },
      hook: 'short',
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      const hookError = result.errors.find((e) => e.field === 'hook');
      expect(hookError).toBeDefined();
      expect(hookError!.message).toContain('10');
    }
  });

  it('rejects non-object input', () => {
    const result = validateCharacterDraft(null);
    expect(result.valid).toBe(false);

    const result2 = validateCharacterDraft('string');
    expect(result2.valid).toBe(false);
  });

  it('rejects pronouns that are too long', () => {
    const result = validateCharacterDraft({
      name: 'Valid',
      pronouns: 'a'.repeat(61),
      profile: { archetype: 'scout' },
      hook: 'A hook of sufficient length for the test.',
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      const pronounsError = result.errors.find((e) => e.field === 'pronouns');
      expect(pronounsError).toBeDefined();
    }
  });

  it('accepts pronouns that are exactly within limit', () => {
    const result = validateCharacterDraft({
      name: 'Valid',
      pronouns: 'a'.repeat(60),
      profile: { archetype: 'scout' },
      hook: 'A hook of sufficient length for the test.',
    });
    expect(result.valid).toBe(true);
  });

  it('returns all errors at once for multiple failures', () => {
    const result = validateCharacterDraft({
      name: 'X',
      profile: {},
      hook: 's',
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      const fields = result.errors.map((e) => e.field);
      expect(fields).toContain('name');
      expect(fields).toContain('profile');
      expect(fields).toContain('hook');
    }
  });
});

describe('formatValidationErrors', () => {
  it('formats errors as readable text', () => {
    const result = validateCharacterDraft({
      name: 'X',
      profile: { archetype: 'frontline' },
      hook: 'A valid hook that is long enough for the test.',
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
      hook: 's',
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      const formatted = formatValidationErrors(result);
      const lines = formatted.split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(2);
    }
  });
});
