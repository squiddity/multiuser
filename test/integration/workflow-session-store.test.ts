import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  deriveWorkflowSessionId,
  StatementBackedWorkflowSessionStore,
} from '../../src/store/workflow-sessions.js';
import { db, close } from '../../src/store/client.js';
import { migrate } from '../../src/store/migrate.js';
import { statements } from '../../src/store/schema.js';

interface TestState {
  counter: number;
  labels: string[];
}

const touchedOwnerIds = new Set<string>();

async function cleanupOwner(ownerId: string): Promise<void> {
  const sessionId = deriveWorkflowSessionId('test-workflow', ownerId);
  await db
    .delete(statements)
    .where(and(eq(statements.scopeType, 'session'), eq(statements.scopeKey, sessionId)));
}

describe('integration: StatementBackedWorkflowSessionStore', () => {
  beforeAll(async () => {
    await migrate();
  });

  afterEach(async () => {
    for (const ownerId of touchedOwnerIds) {
      await cleanupOwner(ownerId);
    }
    touchedOwnerIds.clear();
  });

  afterAll(async () => {
    await close();
  });

  it('reconstructs generic workflow state from session-scope statements', async () => {
    const ownerId = 'workflow-user-persist-1';
    touchedOwnerIds.add(ownerId);

    const store = new StatementBackedWorkflowSessionStore<TestState>({
      workflowType: 'test-workflow',
      createInitialState: () => ({ counter: 0, labels: [] }),
    });

    await store.getOrCreate(ownerId);
    await store.update(ownerId, {
      eventType: 'incremented',
      content: 'Incremented the generic workflow counter.',
      mutate: (state) => {
        state.counter += 1;
        state.labels.push('alpha');
      },
    });

    const reloaded = new StatementBackedWorkflowSessionStore<TestState>({
      workflowType: 'test-workflow',
      createInitialState: () => ({ counter: 0, labels: [] }),
    });
    const session = await reloaded.get(ownerId);

    expect(session).toBeDefined();
    expect(session?.sessionId).toBe(deriveWorkflowSessionId('test-workflow', ownerId));
    expect(session?.state).toEqual({ counter: 1, labels: ['alpha'] });
  });

  it('clears the active session on reset until a new one is created', async () => {
    const ownerId = 'workflow-user-reset-1';
    touchedOwnerIds.add(ownerId);

    const store = new StatementBackedWorkflowSessionStore<TestState>({
      workflowType: 'test-workflow',
      createInitialState: () => ({ counter: 0, labels: [] }),
    });

    await store.update(ownerId, {
      eventType: 'incremented',
      content: 'Incremented the generic workflow counter.',
      mutate: (state) => {
        state.counter += 1;
      },
    });
    await store.reset(ownerId);

    const reloaded = new StatementBackedWorkflowSessionStore<TestState>({
      workflowType: 'test-workflow',
      createInitialState: () => ({ counter: 0, labels: [] }),
    });

    await expect(reloaded.get(ownerId)).resolves.toBeUndefined();

    const recreated = await reloaded.getOrCreate(ownerId);
    expect(recreated.state).toEqual({ counter: 0, labels: [] });
  });
});
