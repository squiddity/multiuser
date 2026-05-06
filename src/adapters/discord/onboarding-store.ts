import type { OnboardingStep } from '../../core/onboarding.js';
import type { ComponentSpec } from '../../resolvers/tools/render.js';

/**
 * Represents the current state of an onboarding session.
 * Used by the thin adapter to track progress between agent turns.
 */
export interface OnboardingSessionState {
  userId: string;
  step: OnboardingStep;
  /** Current draft — what's been filled so far */
  draft: {
    name?: string;
    pronouns?: string;
    profile: Record<string, string>;
    hook?: string;
  };
  /** Per-field validation retry counters */
  retryCounts: {
    name: number;
    pronouns: number;
    profile: number;
    hook: number;
  };
  /** Conversation history entries for agent context */
  conversationHistory: string[];
  /** Cached component specs from last agent output (for modal lookup) */
  lastComponents: ComponentSpec[];
  updatedAt: Date;
}

/**
 * Abstraction for onboarding session state persistence.
 *
 * In-memory implementation for demo/development.
 * Statement-store implementation planned for production persistence (milestone 0003).
 */
export interface OnboardingStore {
  /** Get or create a session for a user. Returns existing if present. */
  getOrCreate(userId: string): OnboardingSessionState;
  /** Get a session if it exists */
  get(userId: string): OnboardingSessionState | undefined;
  /** Append a line to the conversation history */
  addHistory(userId: string, entry: string): void;
  /** Get the full conversation history as a string for agent input */
  getHistory(userId: string): string;
  /** Set a field value on the draft */
  setField(userId: string, field: string, value: string): void;
  /** Merge an agent-provided draft into the session */
  mergeDraft(userId: string, draft: Record<string, unknown>): void;
  /** Mark the session as confirmed/complete */
  confirm(userId: string): void;
  /** Delete the session (cancel/reset) */
  reset(userId: string): void;
}

// --- In-memory implementation ---

function now(): Date {
  return new Date();
}

export class InMemoryOnboardingStore implements OnboardingStore {
  private readonly sessions = new Map<string, OnboardingSessionState>();

  getOrCreate(userId: string): OnboardingSessionState {
    const existing = this.sessions.get(userId);
    if (existing) return existing;

    const created: OnboardingSessionState = {
      userId,
      step: 'linked',
      draft: { profile: {} },
      retryCounts: { name: 0, pronouns: 0, profile: 0, hook: 0 },
      conversationHistory: [],
      lastComponents: [],
      updatedAt: now(),
    };
    this.sessions.set(userId, created);
    return created;
  }

  get(userId: string): OnboardingSessionState | undefined {
    return this.sessions.get(userId);
  }

  addHistory(userId: string, entry: string): void {
    const session = this.getOrCreate(userId);
    session.conversationHistory.push(entry);
    session.updatedAt = now();
  }

  getHistory(userId: string): string {
    const session = this.sessions.get(userId);
    if (!session) return '(no conversation yet)';
    return session.conversationHistory.join('\n') || '(no conversation yet)';
  }

  setField(userId: string, field: string, value: string): void {
    const session = this.getOrCreate(userId);
    switch (field) {
      case 'name':
        session.draft.name = value;
        break;
      case 'pronouns':
        session.draft.pronouns = value;
        break;
      case 'hook':
        session.draft.hook = value;
        break;
      default:
        session.draft.profile[field] = value;
        break;
    }
    session.step = 'character-drafting';
    session.updatedAt = now();
  }

  mergeDraft(userId: string, draft: Record<string, unknown>): void {
    const session = this.getOrCreate(userId);
    if (typeof draft.name === 'string') session.draft.name = draft.name;
    if (typeof draft.pronouns === 'string') session.draft.pronouns = draft.pronouns;
    if (draft.profile && typeof draft.profile === 'object') {
      session.draft.profile = draft.profile as Record<string, string>;
    }
    if (typeof draft.hook === 'string') session.draft.hook = draft.hook;
    session.updatedAt = now();
  }

  confirm(userId: string): void {
    const session = this.getOrCreate(userId);
    session.step = 'completed';
    session.updatedAt = now();
  }

  reset(userId: string): void {
    this.sessions.delete(userId);
  }
}
