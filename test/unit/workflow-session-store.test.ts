import { beforeEach, describe, expect, it } from 'vitest';
import {
  deriveWorkflowSessionId,
  InMemoryWorkflowSessionStore,
} from '../../src/store/workflow-sessions.js';

interface TestState {
  counter: number;
  history: string[];
}

describe('InMemoryWorkflowSessionStore', () => {
  let store: InMemoryWorkflowSessionStore<TestState>;

  beforeEach(() => {
    store = new InMemoryWorkflowSessionStore<TestState>({
      workflowType: 'test-workflow',
      createInitialState: () => ({ counter: 0, history: [] }),
    });
  });

  it('creates deterministic session ids per workflow type and owner', async () => {
    const session = await store.getOrCreate('user-1');

    expect(session.sessionId).toBe(deriveWorkflowSessionId('test-workflow', 'user-1'));
    expect(session.workflowType).toBe('test-workflow');
    expect(session.ownerId).toBe('user-1');
    expect(session.state).toEqual({ counter: 0, history: [] });
  });

  it('persists updates through the generic workflow session API', async () => {
    await store.update('user-1', {
      eventType: 'incremented',
      content: 'Incremented counter.',
      mutate: (state) => {
        state.counter += 1;
        state.history.push('incremented');
      },
    });

    const session = await store.get('user-1');
    expect(session?.state.counter).toBe(1);
    expect(session?.state.history).toEqual(['incremented']);
  });

  it('returns defensive copies on reads', async () => {
    const first = await store.getOrCreate('user-1');
    first.state.counter = 99;
    first.state.history.push('mutated');

    const second = await store.get('user-1');
    expect(second?.state.counter).toBe(0);
    expect(second?.state.history).toEqual([]);
  });

  it('resets the active session for an owner', async () => {
    await store.update('user-1', {
      eventType: 'incremented',
      content: 'Incremented counter.',
      mutate: (state) => {
        state.counter += 1;
      },
    });

    await store.reset('user-1');

    await expect(store.get('user-1')).resolves.toBeUndefined();
  });
});
