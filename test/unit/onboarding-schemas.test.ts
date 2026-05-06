import { describe, expect, it } from 'vitest';
import {
  CharacterDraft,
  normalizeOnboardingInput,
  isValidOnboardingTransition,
  ONBOARDING_VALIDATION_RETRY_LIMIT,
} from '../../src/core/onboarding.js';

describe('core onboarding schemas', () => {
  describe('CharacterDraft', () => {
    it('parses a valid complete draft with name and profile', () => {
      const result = CharacterDraft.parse({
        name: 'Kaelen',
        profile: { archetype: 'scout', pronouns: 'he/him', hook: 'Sworn to find the thief.' },
      });

      expect(result.name).toBe('Kaelen');
      expect(result.profile.archetype).toBe('scout');
      expect(result.profile.pronouns).toBe('he/him');
      expect(result.profile.hook).toBe('Sworn to find the thief.');
    });

    it('rejects a draft missing required name', () => {
      const result = CharacterDraft.safeParse({
        profile: { archetype: 'scout' },
      });
      expect(result.success).toBe(false);
    });

    it('rejects a name that is too short', () => {
      const result = CharacterDraft.safeParse({
        name: 'A',
        profile: { archetype: 'frontline' },
      });
      expect(result.success).toBe(false);
    });

    it('stores hook and pronouns in the flexible profile record', () => {
      const result = CharacterDraft.safeParse({
        name: 'Valid Name',
        profile: {
          archetype: 'face',
          hook: 'A sufficiently long hook detail.',
          pronouns: 'they/them',
        },
      });
      expect(result.success).toBe(true);
      expect(result.data!.profile.hook).toBe('A sufficiently long hook detail.');
      expect(result.data!.profile.pronouns).toBe('they/them');
    });

    it('allows omitted pronouns', () => {
      const result = CharacterDraft.safeParse({
        name: 'Valid Name',
        profile: { archetype: 'scout' },
      });
      expect(result.success).toBe(true);
    });

    it('rejects an empty profile record', () => {
      const result = CharacterDraft.safeParse({
        name: 'Valid Name',
        profile: {},
      });
      expect(result.success).toBe(false);
    });

    it('allows multiple profile keys', () => {
      const result = CharacterDraft.safeParse({
        name: 'Valid Name',
        profile: { archetype: 'scout', subclass: 'shadow' },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.profile.subclass).toBe('shadow');
      }
    });
  });

  describe('normalizeOnboardingInput', () => {
    it('trims leading and trailing whitespace', () => {
      expect(normalizeOnboardingInput('  hello  ')).toBe('hello');
    });

    it('collapses repeated internal whitespace', () => {
      expect(normalizeOnboardingInput('hello   world')).toBe('hello world');
    });

    it('returns empty string for whitespace-only input', () => {
      expect(normalizeOnboardingInput('   ')).toBe('');
    });
  });

  describe('isValidOnboardingTransition', () => {
    it('allows advancing one step', () => {
      expect(isValidOnboardingTransition({ from: 'invited', to: 'joined' })).toBe(true);
      expect(isValidOnboardingTransition({ from: 'joined', to: 'linked' })).toBe(true);
      expect(isValidOnboardingTransition({ from: 'linked', to: 'character-drafting' })).toBe(true);
      expect(
        isValidOnboardingTransition({ from: 'character-drafting', to: 'character-confirmed' }),
      ).toBe(true);
      expect(
        isValidOnboardingTransition({ from: 'character-confirmed', to: 'room-assigned' }),
      ).toBe(true);
      expect(isValidOnboardingTransition({ from: 'room-assigned', to: 'completed' })).toBe(true);
    });

    it('allows staying on the same step', () => {
      expect(isValidOnboardingTransition({ from: 'linked', to: 'linked' })).toBe(true);
      expect(
        isValidOnboardingTransition({ from: 'character-drafting', to: 'character-drafting' }),
      ).toBe(true);
    });

    it('allows transition to failed from any step', () => {
      expect(isValidOnboardingTransition({ from: 'invited', to: 'failed' })).toBe(true);
      expect(isValidOnboardingTransition({ from: 'completed', to: 'failed' })).toBe(true);
    });

    it('allows recovery from failed', () => {
      expect(isValidOnboardingTransition({ from: 'failed', to: 'joined' })).toBe(true);
      expect(isValidOnboardingTransition({ from: 'failed', to: 'linked' })).toBe(true);
      expect(isValidOnboardingTransition({ from: 'failed', to: 'character-drafting' })).toBe(true);
    });

    it('rejects skipping steps forward', () => {
      expect(isValidOnboardingTransition({ from: 'invited', to: 'linked' })).toBe(false);
      expect(isValidOnboardingTransition({ from: 'joined', to: 'completed' })).toBe(false);
    });

    it('rejects moving backwards (except from failed)', () => {
      expect(isValidOnboardingTransition({ from: 'completed', to: 'invited' })).toBe(false);
    });
  });

  describe('ONBOARDING_VALIDATION_RETRY_LIMIT', () => {
    it('is 2', () => {
      expect(ONBOARDING_VALIDATION_RETRY_LIMIT).toBe(2);
    });
  });
});
