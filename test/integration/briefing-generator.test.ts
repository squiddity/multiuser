import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { inArray } from 'drizzle-orm';
import { db, close } from '../../src/store/client.js';
import { migrate } from '../../src/store/migrate.js';
import { seed } from '../../src/store/seed.js';
import { appendAndIndex } from '../../src/store/vectors.js';
import { listByScope } from '../../src/store/statements.js';
import { roleGrants, statements } from '../../src/store/schema.js';
import type { Scope } from '../../src/core/statement.js';
import { WorkerRegistry, type WorkerContext } from '../../src/core/worker.js';
import { CronerScheduler } from '../../src/scheduler/croner-impl.js';
import { logger } from '../../src/config/logger.js';
import { briefingGeneratorWorker } from '../../src/workers/briefing-generator.js';

const mockLlmGenerate = vi.fn().mockResolvedValue({
  text: 'Briefing: The party investigated suspicious tracks near a cave. Potential encounter ahead; GM should prepare an ambush beat.',
});

vi.mock('../../src/models/pi-runtime.js', () => ({
  createPiAiLlmRuntime: vi.fn(() => ({
    generate: (...args: unknown[]) => mockLlmGenerate(...args),
  })),
}));

const PARTY_ROOM_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ROOM_ID = '22222222-2222-2222-2222-222222222222';
const PLAYER_ROLE_ID = '33333333-3333-3333-3333-333333333333';
const GM_ROLE_ID = '44444444-4444-4444-4444-444444444444';

const PLAYER_USER = 'int-player-1';
const GM_USER = 'int-gm-1';

const testStatementIds: string[] = [];
const testGrantIds: string[] = [
  'b0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000002',
];

describe('briefing-generator', () => {
  let workers: WorkerRegistry;
  let scheduler: CronerScheduler;
  let ctx: WorkerContext;

  beforeEach(() => {
    mockLlmGenerate.mockClear();
  });

  beforeAll(async () => {
    await migrate();
    await seed();

    await db.delete(roleGrants);
    await db.delete(statements);

    await db.insert(roleGrants).values([
      {
        id: testGrantIds[0],
        userId: PLAYER_USER,
        roomId: PARTY_ROOM_ID,
        roleId: PLAYER_ROLE_ID,
        grantedBy: 'system',
        precedence: 0,
      },
      {
        id: testGrantIds[1],
        userId: GM_USER,
        roomId: ADMIN_ROOM_ID,
        roleId: GM_ROLE_ID,
        grantedBy: 'system',
        precedence: 0,
      },
    ]);

    workers = new WorkerRegistry();
    workers.register(briefingGeneratorWorker);
    scheduler = new CronerScheduler(workers, logger);
    ctx = { logger, now: () => new Date() };
  });

  afterAll(async () => {
    await db.delete(statements).where(inArray(statements.id, testStatementIds));
    await db.delete(roleGrants).where(inArray(roleGrants.id, testGrantIds));
    await close();
  });

  it('emits a briefing in admin scope when party has dialogue', async () => {
    // Emit party dialogue
    const dialogueId = await appendAndIndex({
      scope: { type: 'party', partyId: PARTY_ROOM_ID } as Scope,
      kind: 'dialogue',
      authorType: 'user',
      authorId: PLAYER_USER,
      content: 'The rogue spots fresh tracks leading toward the cave entrance.',
    });
    testStatementIds.push(dialogueId);

    // Trigger briefing generator WITH the statement's ID (simulating event trigger)
    // This is what CronerScheduler does when merging event data
    await workers.dispatch(
      'briefing-generator',
      {
        partyRoomId: PARTY_ROOM_ID,
        adminRoomId: ADMIN_ROOM_ID,
        modelSpec: 'test-model',
        id: dialogueId, // The triggering statement's ID
        scopeType: 'party', // From the event
        scopeKey: PARTY_ROOM_ID,
        kind: 'dialogue',
      },
      ctx,
    );

    // Assert briefing was emitted in governance scope
    const adminBriefings = await listByScope(
      { type: 'governance', roomId: ADMIN_ROOM_ID },
      { kind: 'briefing', limit: 5 },
    );

    expect(adminBriefings.length).toBeGreaterThan(0);
    const latest = adminBriefings[0]!;
    expect(latest.kind).toBe('briefing');
    expect(latest.scopeType).toBe('governance');
    expect(latest.scopeKey).toBe(ADMIN_ROOM_ID);
    expect(latest.sources).toContain(dialogueId);
  });

  it('idempotency: does not re-brief the same sources', async () => {
    const dialogueId = await appendAndIndex({
      scope: { type: 'party', partyId: PARTY_ROOM_ID } as Scope,
      kind: 'pose',
      authorType: 'user',
      authorId: PLAYER_USER,
      content: 'Mara examines the old map on the tavern wall.',
    });
    testStatementIds.push(dialogueId);

    // First trigger - include the statement ID to simulate event trigger
    await workers.dispatch(
      'briefing-generator',
      {
        partyRoomId: PARTY_ROOM_ID,
        adminRoomId: ADMIN_ROOM_ID,
        modelSpec: 'test-model',
        id: dialogueId,
        scopeType: 'party',
        scopeKey: PARTY_ROOM_ID,
        kind: 'pose',
      },
      ctx,
    );

    // Count briefings before second trigger
    const beforeCount = (
      await listByScope(
        { type: 'governance', roomId: ADMIN_ROOM_ID },
        { kind: 'briefing', limit: 100 },
      )
    ).length;

    // Trigger again immediately with SAME ID (should skip due to idempotency)
    await workers.dispatch(
      'briefing-generator',
      {
        partyRoomId: PARTY_ROOM_ID,
        adminRoomId: ADMIN_ROOM_ID,
        modelSpec: 'test-model',
        id: dialogueId, // Same trigger ID = should skip
        scopeType: 'party',
        scopeKey: PARTY_ROOM_ID,
        kind: 'pose',
      },
      ctx,
    );

    // Count after second trigger
    const afterCount = (
      await listByScope(
        { type: 'governance', roomId: ADMIN_ROOM_ID },
        { kind: 'briefing', limit: 100 },
      )
    ).length;

    // Should not have created a new briefing (same sources already briefed)
    expect(afterCount).toBe(beforeCount);
  });
});
