import type { OnboardingStep } from '../../core/onboarding.js';
import type { ComponentSpec } from '../../resolvers/tools/render.js';
import {
  deriveWorkflowSessionId,
  InMemoryWorkflowSessionStore,
  StatementBackedWorkflowSessionStore,
  type WorkflowSessionSnapshot,
  type WorkflowSessionStore,
} from '../../store/workflow-sessions.js';

const NO_HISTORY = '(no conversation yet)';
const ONBOARDING_WORKFLOW_TYPE = 'onboarding';

type OnboardingStoreEvent =
  | 'session-created'
  | 'history-appended'
  | 'field-set'
  | 'draft-merged'
  | 'components-updated'
  | 'confirmed';

interface StoredOnboardingState {
  step: OnboardingStep;
  draft: {
    name?: string;
    pronouns?: string;
    profile: Record<string, string>;
    hook?: string;
  };
  retryCounts: {
    name: number;
    pronouns: number;
    profile: number;
    hook: number;
  };
  conversationHistory: string[];
  lastComponents: ComponentSpec[];
}

/**
 * Represents the current state of an onboarding session.
 * Used by the thin adapter to track progress between agent turns.
 */
export interface OnboardingSessionState extends StoredOnboardingState {
  sessionId: string;
  userId: string;
  updatedAt: Date;
}

/**
 * Abstraction for onboarding session state persistence.
 */
export interface OnboardingStore {
  /** Get or create a session for a user. Returns existing if present. */
  getOrCreate(userId: string): Promise<OnboardingSessionState>;
  /** Get a session if it exists */
  get(userId: string): Promise<OnboardingSessionState | undefined>;
  /** Append a line to the conversation history */
  addHistory(userId: string, entry: string): Promise<OnboardingSessionState>;
  /** Get the full conversation history as a string for agent input */
  getHistory(userId: string): Promise<string>;
  /** Set a field value on the draft */
  setField(userId: string, field: string, value: string): Promise<OnboardingSessionState>;
  /** Merge an agent-provided draft into the session */
  mergeDraft(userId: string, draft: Record<string, unknown>): Promise<OnboardingSessionState>;
  /** Replace the cached component specs from the latest agent output */
  setLastComponents(userId: string, components: ComponentSpec[]): Promise<OnboardingSessionState>;
  /** Mark the session as confirmed/complete */
  confirm(userId: string): Promise<OnboardingSessionState>;
  /** Delete/reset the active session */
  reset(userId: string): Promise<void>;
}

function createInitialState(): StoredOnboardingState {
  return {
    step: 'linked',
    draft: { profile: {} },
    retryCounts: { name: 0, pronouns: 0, profile: 0, hook: 0 },
    conversationHistory: [],
    lastComponents: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const entries = Object.entries(value).filter((entry): entry is [string, string] => {
    const [, entryValue] = entry;
    return typeof entryValue === 'string';
  });
  return Object.fromEntries(entries);
}

function asRetryCounts(value: unknown): StoredOnboardingState['retryCounts'] {
  const source = isRecord(value) ? value : {};
  return {
    name: typeof source.name === 'number' ? source.name : 0,
    pronouns: typeof source.pronouns === 'number' ? source.pronouns : 0,
    profile: typeof source.profile === 'number' ? source.profile : 0,
    hook: typeof source.hook === 'number' ? source.hook : 0,
  };
}

function asComponentSpecs(value: unknown): ComponentSpec[] {
  return Array.isArray(value) ? (value as ComponentSpec[]) : [];
}

function deserializeStoredState(value: unknown): StoredOnboardingState | undefined {
  if (!isRecord(value)) return undefined;

  const draftSource = isRecord(value.draft) ? value.draft : {};

  return {
    step: typeof value.step === 'string' ? (value.step as OnboardingStep) : 'linked',
    draft: {
      name: typeof draftSource.name === 'string' ? draftSource.name : undefined,
      pronouns: typeof draftSource.pronouns === 'string' ? draftSource.pronouns : undefined,
      profile: asStringRecord(draftSource.profile),
      hook: typeof draftSource.hook === 'string' ? draftSource.hook : undefined,
    },
    retryCounts: asRetryCounts(value.retryCounts),
    conversationHistory: Array.isArray(value.conversationHistory)
      ? value.conversationHistory.filter((entry): entry is string => typeof entry === 'string')
      : [],
    lastComponents: asComponentSpecs(value.lastComponents),
  };
}

function toSessionState(
  userId: string,
  snapshot: WorkflowSessionSnapshot<StoredOnboardingState>,
): OnboardingSessionState {
  return {
    sessionId: snapshot.sessionId,
    userId,
    step: snapshot.state.step,
    draft: {
      name: snapshot.state.draft.name,
      pronouns: snapshot.state.draft.pronouns,
      profile: { ...snapshot.state.draft.profile },
      hook: snapshot.state.draft.hook,
    },
    retryCounts: { ...snapshot.state.retryCounts },
    conversationHistory: [...snapshot.state.conversationHistory],
    lastComponents: [...snapshot.state.lastComponents],
    updatedAt: new Date(snapshot.updatedAt),
  };
}

function describeEvent(event: OnboardingStoreEvent, details?: string): string {
  switch (event) {
    case 'session-created':
      return 'Onboarding session created.';
    case 'history-appended':
      return details ?? 'Onboarding history appended.';
    case 'field-set':
      return details ?? 'Onboarding field updated.';
    case 'draft-merged':
      return 'Onboarding draft merged.';
    case 'components-updated':
      return 'Onboarding components updated.';
    case 'confirmed':
      return 'Onboarding confirmed.';
  }
}

export function deriveOnboardingSessionId(userId: string): string {
  return deriveWorkflowSessionId(ONBOARDING_WORKFLOW_TYPE, userId);
}

abstract class BaseOnboardingStore implements OnboardingStore {
  protected abstract readonly sessions: WorkflowSessionStore<StoredOnboardingState>;

  async getOrCreate(userId: string): Promise<OnboardingSessionState> {
    const snapshot = await this.sessions.getOrCreate(userId);
    return toSessionState(userId, snapshot);
  }

  async get(userId: string): Promise<OnboardingSessionState | undefined> {
    const snapshot = await this.sessions.get(userId);
    return snapshot ? toSessionState(userId, snapshot) : undefined;
  }

  async addHistory(userId: string, entry: string): Promise<OnboardingSessionState> {
    const snapshot = await this.sessions.update(userId, {
      eventType: 'history-appended',
      content: describeEvent('history-appended', entry),
      mutate: (state) => {
        state.conversationHistory.push(entry);
      },
    });
    return toSessionState(userId, snapshot);
  }

  async getHistory(userId: string): Promise<string> {
    const session = await this.get(userId);
    if (!session) return NO_HISTORY;
    return session.conversationHistory.join('\n') || NO_HISTORY;
  }

  async setField(userId: string, field: string, value: string): Promise<OnboardingSessionState> {
    const snapshot = await this.sessions.update(userId, {
      eventType: 'field-set',
      content: describeEvent('field-set', `Onboarding field updated: ${field}.`),
      metadata: { field },
      mutate: (state) => {
        switch (field) {
          case 'name':
            state.draft.name = value;
            break;
          case 'pronouns':
            state.draft.pronouns = value;
            break;
          case 'hook':
            state.draft.hook = value;
            break;
          default:
            state.draft.profile[field] = value;
            break;
        }
        state.step = 'character-drafting';
      },
    });
    return toSessionState(userId, snapshot);
  }

  async mergeDraft(
    userId: string,
    draft: Record<string, unknown>,
  ): Promise<OnboardingSessionState> {
    const snapshot = await this.sessions.update(userId, {
      eventType: 'draft-merged',
      content: describeEvent('draft-merged'),
      mutate: (state) => {
        if (typeof draft.name === 'string') state.draft.name = draft.name;
        if (typeof draft.pronouns === 'string') state.draft.pronouns = draft.pronouns;
        if (draft.profile && typeof draft.profile === 'object') {
          state.draft.profile = draft.profile as Record<string, string>;
        }
        if (typeof draft.hook === 'string') state.draft.hook = draft.hook;
      },
    });
    return toSessionState(userId, snapshot);
  }

  async setLastComponents(
    userId: string,
    components: ComponentSpec[],
  ): Promise<OnboardingSessionState> {
    const snapshot = await this.sessions.update(userId, {
      eventType: 'components-updated',
      content: describeEvent('components-updated'),
      mutate: (state) => {
        state.lastComponents = [...components];
      },
    });
    return toSessionState(userId, snapshot);
  }

  async confirm(userId: string): Promise<OnboardingSessionState> {
    const snapshot = await this.sessions.update(userId, {
      eventType: 'confirmed',
      content: describeEvent('confirmed'),
      mutate: (state) => {
        state.step = 'completed';
      },
    });
    return toSessionState(userId, snapshot);
  }

  async reset(userId: string): Promise<void> {
    await this.sessions.reset(userId, { content: 'Onboarding session reset.' });
  }
}

// --- In-memory implementation ---

export class InMemoryOnboardingStore extends BaseOnboardingStore {
  protected readonly sessions = new InMemoryWorkflowSessionStore<StoredOnboardingState>({
    workflowType: ONBOARDING_WORKFLOW_TYPE,
    createInitialState: () => createInitialState(),
    deserializeState: deserializeStoredState,
  });
}

// --- Statement-backed implementation ---

export class StatementBackedOnboardingStore extends BaseOnboardingStore {
  protected readonly sessions = new StatementBackedWorkflowSessionStore<StoredOnboardingState>({
    workflowType: ONBOARDING_WORKFLOW_TYPE,
    createInitialState: () => createInitialState(),
    deserializeState: deserializeStoredState,
    authorId: 'onboarding-store',
  });
}
