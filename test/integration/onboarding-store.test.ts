import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  deriveOnboardingSessionId,
  StatementBackedOnboardingStore,
} from '../../src/adapters/discord/onboarding-store.js';
import { db, close } from '../../src/store/client.js';
import { migrate } from '../../src/store/migrate.js';
import { statements } from '../../src/store/schema.js';

const touchedUserIds = new Set<string>();

async function cleanupUser(userId: string): Promise<void> {
  const sessionId = deriveOnboardingSessionId(userId);
  await db
    .delete(statements)
    .where(and(eq(statements.scopeType, 'session'), eq(statements.scopeKey, sessionId)));
}

describe('integration: StatementBackedOnboardingStore', () => {
  beforeAll(async () => {
    await migrate();
  });

  afterEach(async () => {
    for (const userId of touchedUserIds) {
      await cleanupUser(userId);
    }
    touchedUserIds.clear();
  });

  afterAll(async () => {
    await close();
  });

  it('reconstructs onboarding state from persisted session statements', async () => {
    const userId = 'discord-user-persist-1';
    touchedUserIds.add(userId);

    const store = new StatementBackedOnboardingStore();
    await store.getOrCreate(userId);
    await store.addHistory(userId, 'Agent: Welcome to the inn.');
    await store.setField(userId, 'name', 'Kaelen');
    await store.setField(userId, 'archetype', 'scout');
    await store.setLastComponents(userId, [
      {
        type: 'button',
        customId: 'onboard.continue',
        label: 'Continue',
        style: 'primary',
      },
    ]);

    const reloaded = new StatementBackedOnboardingStore();
    const session = await reloaded.get(userId);

    expect(session).toBeDefined();
    expect(session?.sessionId).toBe(deriveOnboardingSessionId(userId));
    expect(session?.step).toBe('character-drafting');
    expect(session?.draft.name).toBe('Kaelen');
    expect(session?.draft.profile).toEqual({ archetype: 'scout' });
    expect(session?.conversationHistory).toContain('Agent: Welcome to the inn.');
    expect(session?.lastComponents).toHaveLength(1);
    await expect(reloaded.getHistory(userId)).resolves.toContain('Agent: Welcome to the inn.');
  });

  it('treats reset as clearing the active session until recreated', async () => {
    const userId = 'discord-user-reset-1';
    touchedUserIds.add(userId);

    const store = new StatementBackedOnboardingStore();
    await store.getOrCreate(userId);
    await store.setField(userId, 'name', 'Mira');
    await store.addHistory(userId, 'User: I would like to start over.');
    await store.reset(userId);

    const reloaded = new StatementBackedOnboardingStore();
    await expect(reloaded.get(userId)).resolves.toBeUndefined();
    await expect(reloaded.getHistory(userId)).resolves.toBe('(no conversation yet)');

    const recreated = await reloaded.getOrCreate(userId);
    expect(recreated.sessionId).toBe(deriveOnboardingSessionId(userId));
    expect(recreated.step).toBe('linked');
    expect(recreated.draft.profile).toEqual({});
    expect(recreated.draft.name).toBeUndefined();
    expect(recreated.conversationHistory).toEqual([]);
  });
});
