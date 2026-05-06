import type { CharacterDraft, OnboardingStep } from '../../core/onboarding.js';

export interface OnboardingSession {
  userId: string;
  step: OnboardingStep;
  draft: Partial<CharacterDraft>;
  retryCounts: Record<'name' | 'pronouns' | 'profile' | 'hook', number>;
  updatedAt: string;
  /** Agent conversation history for the agentic flow */
  conversationHistory: string[];
  /** Cached component specs from last agent output (for modal lookup) */
  lastComponents: unknown[];
}

function nowIso(): string {
  return new Date().toISOString();
}

export class InMemoryOnboardingService {
  private readonly sessions = new Map<string, OnboardingSession>();

  getOrCreateSession(userId: string): OnboardingSession {
    const existing = this.sessions.get(userId);
    if (existing) {
      return existing;
    }

    const created: OnboardingSession = {
      userId,
      step: 'linked',
      draft: { profile: {} },
      retryCounts: {
        name: 0,
        pronouns: 0,
        profile: 0,
        hook: 0,
      },
      updatedAt: nowIso(),
      conversationHistory: [],
      lastComponents: [],
    };
    this.sessions.set(userId, created);
    return created;
  }

  getSession(userId: string): OnboardingSession | undefined {
    return this.sessions.get(userId);
  }

  addHistory(userId: string, entry: string): OnboardingSession {
    const session = this.getOrCreateSession(userId);
    session.conversationHistory.push(entry);
    session.updatedAt = nowIso();
    return session;
  }

  getConversationHistory(userId: string): string {
    const session = this.sessions.get(userId);
    if (!session) return '(no conversation yet)';
    return session.conversationHistory.join('\n') || '(no conversation yet)';
  }

  setName(userId: string, name: string): OnboardingSession {
    const session = this.getOrCreateSession(userId);
    session.draft.name = name;
    session.step = 'character-drafting';
    session.updatedAt = nowIso();
    return session;
  }

  setPronouns(userId: string, pronouns: string | undefined): OnboardingSession {
    const session = this.getOrCreateSession(userId);
    session.draft.pronouns = pronouns;
    session.step = 'character-drafting';
    session.updatedAt = nowIso();
    return session;
  }

  setProfileValue(userId: string, key: string, value: string): OnboardingSession {
    const session = this.getOrCreateSession(userId);
    const currentProfile = session.draft.profile ?? {};
    session.draft.profile = { ...currentProfile, [key]: value };
    session.step = 'character-drafting';
    session.updatedAt = nowIso();
    return session;
  }

  setHook(userId: string, hook: string): OnboardingSession {
    const session = this.getOrCreateSession(userId);
    session.draft.hook = hook;
    session.step = 'character-confirmed';
    session.updatedAt = nowIso();
    return session;
  }

  /**
   * Merge agent-provided draft back into session.
   * Used when the agent returns a complete draft.
   */
  mergeDraft(userId: string, draft: Record<string, unknown>): OnboardingSession {
    const session = this.getOrCreateSession(userId);
    if (typeof draft.name === 'string') session.draft.name = draft.name;
    if (typeof draft.pronouns === 'string') session.draft.pronouns = draft.pronouns;
    if (draft.profile && typeof draft.profile === 'object') {
      session.draft.profile = draft.profile as Record<string, string>;
    }
    if (typeof draft.hook === 'string') session.draft.hook = draft.hook;
    session.updatedAt = nowIso();
    return session;
  }

  confirm(userId: string): OnboardingSession {
    const session = this.getOrCreateSession(userId);
    session.step = 'completed';
    session.updatedAt = nowIso();
    return session;
  }

  reset(userId: string): void {
    this.sessions.delete(userId);
  }
}
