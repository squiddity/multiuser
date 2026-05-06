import { beforeEach, describe, expect, it } from 'vitest';
import {
  deriveOnboardingSessionId,
  InMemoryOnboardingStore,
} from '../../src/adapters/discord/onboarding-store.js';

describe('InMemoryOnboardingStore', () => {
  let store: InMemoryOnboardingStore;

  beforeEach(() => {
    store = new InMemoryOnboardingStore();
  });

  describe('getOrCreate', () => {
    it('creates a new session with initial state', async () => {
      const session = await store.getOrCreate('user-1');

      expect(session.userId).toBe('user-1');
      expect(session.sessionId).toBe(deriveOnboardingSessionId('user-1'));
      expect(session.step).toBe('linked');
      expect(session.draft.profile).toEqual({});
      expect(session.draft.name).toBeUndefined();
      expect(session.conversationHistory).toEqual([]);
      expect(session.lastComponents).toEqual([]);
      expect(session.retryCounts.name).toBe(0);
      expect(session.retryCounts.profile).toBe(0);
    });

    it('returns stored state for the same user', async () => {
      await store.setField('user-1', 'name', 'Modified');

      const second = await store.getOrCreate('user-1');
      expect(second.draft.name).toBe('Modified');
    });

    it('returns defensive copies so caller mutation does not leak back into storage', async () => {
      const first = await store.getOrCreate('user-1');
      first.draft.name = 'Leaked';
      first.conversationHistory.push('User: hacked');

      const second = await store.getOrCreate('user-1');
      expect(second.draft.name).toBeUndefined();
      expect(second.conversationHistory).toEqual([]);
    });

    it('creates separate sessions for different users', async () => {
      await store.setField('user-1', 'name', 'Alice');
      await store.setField('user-2', 'name', 'Bob');

      expect((await store.getOrCreate('user-1')).draft.name).toBe('Alice');
      expect((await store.getOrCreate('user-2')).draft.name).toBe('Bob');
    });
  });

  describe('get', () => {
    it('returns undefined for unknown user', async () => {
      await expect(store.get('nonexistent')).resolves.toBeUndefined();
    });

    it('returns session for known user', async () => {
      await store.getOrCreate('user-1');
      await expect(store.get('user-1')).resolves.toBeDefined();
    });
  });

  describe('addHistory / getHistory', () => {
    it('appends entries to conversation history', async () => {
      await store.getOrCreate('user-1');
      await store.addHistory('user-1', 'Agent: Hello.');
      await store.addHistory('user-1', 'User: Hi!');

      const history = await store.getHistory('user-1');
      expect(history).toContain('Agent: Hello.');
      expect(history).toContain('User: Hi!');
    });

    it('returns default message for no conversation', async () => {
      await expect(store.getHistory('nonexistent')).resolves.toBe('(no conversation yet)');
    });

    it('returns default message for empty history', async () => {
      await store.getOrCreate('user-1');
      await expect(store.getHistory('user-1')).resolves.toBe('(no conversation yet)');
    });
  });

  describe('setField', () => {
    it('sets name field', async () => {
      const session = await store.setField('user-1', 'name', 'Kaelen');

      expect(session.draft.name).toBe('Kaelen');
      expect(session.step).toBe('character-drafting');
    });

    it('sets pronouns in profile', async () => {
      const session = await store.setField('user-1', 'pronouns', 'they/them');

      expect(session.draft.profile.pronouns).toBe('they/them');
    });

    it('sets hook in profile', async () => {
      const session = await store.setField(
        'user-1',
        'hook',
        'A mysterious backstory hook that is long enough.',
      );

      expect(session.draft.profile.hook).toBe('A mysterious backstory hook that is long enough.');
    });

    it('sets arbitrary profile keys', async () => {
      await store.setField('user-1', 'archetype', 'scout');
      const session = await store.setField('user-1', 'subclass', 'shadow');

      expect(session.draft.profile.archetype).toBe('scout');
      expect(session.draft.profile.subclass).toBe('shadow');
    });
  });

  describe('mergeDraft', () => {
    it('merges agent-provided draft fields', async () => {
      await store.getOrCreate('user-1');
      await store.mergeDraft('user-1', {
        name: 'Kaelen',
        profile: { archetype: 'scout', pronouns: 'he/him', hook: 'Sworn to find the thief.' },
      });

      const session = await store.getOrCreate('user-1');
      expect(session.draft.name).toBe('Kaelen');
      expect(session.draft.profile.archetype).toBe('scout');
      expect(session.draft.profile.pronouns).toBe('he/him');
      expect(session.draft.profile.hook).toBe('Sworn to find the thief.');
    });

    it('ignores unknown keys in merge', async () => {
      await store.getOrCreate('user-1');
      await store.mergeDraft('user-1', {
        name: 'Kaelen',
        unknown: 'value',
      });

      expect((await store.getOrCreate('user-1')).draft.name).toBe('Kaelen');
    });
  });

  describe('setLastComponents', () => {
    it('stores the latest component cache', async () => {
      const session = await store.setLastComponents('user-1', [
        {
          type: 'button',
          customId: 'onboard.continue',
          label: 'Continue',
          style: 'primary',
        },
      ]);

      expect(session.lastComponents).toHaveLength(1);
    });
  });

  describe('confirm', () => {
    it('sets step to completed', async () => {
      await store.getOrCreate('user-1');
      const session = await store.confirm('user-1');

      expect(session.step).toBe('completed');
    });
  });

  describe('reset', () => {
    it('removes the session', async () => {
      await store.getOrCreate('user-1');
      await store.reset('user-1');

      await expect(store.get('user-1')).resolves.toBeUndefined();
    });
  });
});
