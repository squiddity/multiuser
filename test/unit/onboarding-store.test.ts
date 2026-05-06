import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryOnboardingStore } from '../../src/adapters/discord/onboarding-store.js';

describe('InMemoryOnboardingStore', () => {
  let store: InMemoryOnboardingStore;

  beforeEach(() => {
    store = new InMemoryOnboardingStore();
  });

  describe('getOrCreate', () => {
    it('creates a new session with initial state', () => {
      const session = store.getOrCreate('user-1');

      expect(session.userId).toBe('user-1');
      expect(session.step).toBe('linked');
      expect(session.draft.profile).toEqual({});
      expect(session.draft.name).toBeUndefined();
      expect(session.draft.hook).toBeUndefined();
      expect(session.conversationHistory).toEqual([]);
      expect(session.lastComponents).toEqual([]);
      expect(session.retryCounts.name).toBe(0);
      expect(session.retryCounts.hook).toBe(0);
    });

    it('returns existing session for same user', () => {
      const first = store.getOrCreate('user-1');
      first.draft.name = 'Modified';

      const second = store.getOrCreate('user-1');
      expect(second.draft.name).toBe('Modified');
    });

    it('creates separate sessions for different users', () => {
      const user1 = store.getOrCreate('user-1');
      const user2 = store.getOrCreate('user-2');

      user1.draft.name = 'Alice';
      user2.draft.name = 'Bob';

      expect(store.getOrCreate('user-1').draft.name).toBe('Alice');
      expect(store.getOrCreate('user-2').draft.name).toBe('Bob');
    });
  });

  describe('get', () => {
    it('returns undefined for unknown user', () => {
      expect(store.get('nonexistent')).toBeUndefined();
    });

    it('returns session for known user', () => {
      store.getOrCreate('user-1');
      expect(store.get('user-1')).toBeDefined();
    });
  });

  describe('addHistory / getHistory', () => {
    it('appends entries to conversation history', () => {
      store.getOrCreate('user-1');
      store.addHistory('user-1', 'Agent: Hello.');
      store.addHistory('user-1', 'User: Hi!');

      const history = store.getHistory('user-1');
      expect(history).toContain('Agent: Hello.');
      expect(history).toContain('User: Hi!');
    });

    it('returns default message for no conversation', () => {
      expect(store.getHistory('nonexistent')).toBe('(no conversation yet)');
    });

    it('returns default message for empty history', () => {
      store.getOrCreate('user-1');
      expect(store.getHistory('user-1')).toBe('(no conversation yet)');
    });
  });

  describe('setField', () => {
    it('sets name field', () => {
      const session = store.getOrCreate('user-1');
      store.setField('user-1', 'name', 'Kaelen');

      expect(session.draft.name).toBe('Kaelen');
      expect(session.step).toBe('character-drafting');
    });

    it('sets pronouns field', () => {
      const session = store.getOrCreate('user-1');
      store.setField('user-1', 'pronouns', 'they/them');

      expect(session.draft.pronouns).toBe('they/them');
    });

    it('sets hook field', () => {
      const session = store.getOrCreate('user-1');
      store.setField('user-1', 'hook', 'A mysterious backstory hook that is long enough.');

      expect(session.draft.hook).toBe('A mysterious backstory hook that is long enough.');
    });

    it('sets arbitrary profile keys', () => {
      const session = store.getOrCreate('user-1');
      store.setField('user-1', 'archetype', 'scout');
      store.setField('user-1', 'subclass', 'shadow');

      expect(session.draft.profile.archetype).toBe('scout');
      expect(session.draft.profile.subclass).toBe('shadow');
    });
  });

  describe('mergeDraft', () => {
    it('merges agent-provided draft fields', () => {
      store.getOrCreate('user-1');
      store.mergeDraft('user-1', {
        name: 'Kaelen',
        pronouns: 'he/him',
        profile: { archetype: 'scout' },
        hook: 'Sworn to find the thief.',
      });

      const session = store.getOrCreate('user-1');
      expect(session.draft.name).toBe('Kaelen');
      expect(session.draft.pronouns).toBe('he/him');
      expect(session.draft.profile.archetype).toBe('scout');
      expect(session.draft.hook).toBe('Sworn to find the thief.');
    });

    it('ignores unknown keys in merge', () => {
      store.getOrCreate('user-1');
      store.mergeDraft('user-1', {
        name: 'Kaelen',
        unknown: 'value',
      });

      expect(store.getOrCreate('user-1').draft.name).toBe('Kaelen');
    });
  });

  describe('confirm', () => {
    it('sets step to completed', () => {
      store.getOrCreate('user-1');
      store.confirm('user-1');

      expect(store.getOrCreate('user-1').step).toBe('completed');
    });
  });

  describe('reset', () => {
    it('removes the session', () => {
      store.getOrCreate('user-1');
      store.reset('user-1');

      expect(store.get('user-1')).toBeUndefined();
    });
  });
});
