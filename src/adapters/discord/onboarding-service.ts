import type { Archetype, CharacterDraft, OnboardingStep } from '../../core/onboarding.js';

export interface OnboardingSession {
  userId: string;
  step: OnboardingStep;
  draft: Partial<CharacterDraft>;
  retryCounts: Record<'name' | 'pronouns' | 'archetype' | 'hook', number>;
  updatedAt: string;
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
      draft: {},
      retryCounts: {
        name: 0,
        pronouns: 0,
        archetype: 0,
        hook: 0,
      },
      updatedAt: nowIso(),
    };
    this.sessions.set(userId, created);
    return created;
  }

  getSession(userId: string): OnboardingSession | undefined {
    return this.sessions.get(userId);
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

  setArchetype(userId: string, archetype: Archetype): OnboardingSession {
    const session = this.getOrCreateSession(userId);
    session.draft.archetype = archetype;
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
