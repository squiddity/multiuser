import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, close } from '../../src/store/client.js';
import { migrate } from '../../src/store/migrate.js';
import { seed } from '../../src/store/seed.js';
import { appendIndexAndEmit } from '../../src/store/emit.js';
import { HashEmbedder } from '../../src/store/embedders/hash.js';
import { PgvectorSearchBackend } from '../../src/store/search/pgvector.js';
import { setEmbedder, setBackend } from '../../src/store/vectors.js';
import { EventBus } from '../../src/core/events.js';
import { WorkerRegistry } from '../../src/core/worker.js';
import { CronerScheduler } from '../../src/scheduler/croner-impl.js';
import { liveResponderWorker } from '../../src/workers/live-responder.js';
import { logger } from '../../src/config/logger.js';
import { roleGrants, statements } from '../../src/store/schema.js';
import { eq, inArray } from 'drizzle-orm';
import type { Scope } from '../../src/core/statement.js';

const mockLlmGenerate = vi.fn().mockResolvedValue({
  text: JSON.stringify({
    kind: 'narration',
    content: 'The party hears footsteps echo through the dungeon corridor.',
  }),
});

vi.mock('../../src/models/pi-runtime.js', () => ({
  createPiAiLlmRuntime: vi.fn(() => ({
    generate: (...args: unknown[]) => mockLlmGenerate(...args),
  })),
}));

const PARTY_ROOM_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ROOM_ID = '22222222-2222-2222-2222-222222222222';
const PLAYER_ROLE_ID = '33333333-3333-3333-3333-333333333333';

const PLAYER_USER = 'lr-test-player-1';
const testGrantIds = ['d0000000-0000-0000-0000-000000000001'];
const testStatementIds: string[] = [];

beforeAll(async () => {
  await migrate();
  await seed();

  await db
    .insert(roleGrants)
    .values([
      {
        id: testGrantIds[0],
        userId: PLAYER_USER,
        roomId: PARTY_ROOM_ID,
        roleId: PLAYER_ROLE_ID,
        grantedBy: 'system',
        precedence: 0,
      },
    ])
    .onConflictDoNothing();

  const embedder = new HashEmbedder();
  setEmbedder(embedder);
  setBackend(new PgvectorSearchBackend(embedder));
});

afterAll(async () => {
  for (const id of testGrantIds) {
    await db.delete(roleGrants).where(eq(roleGrants.id, id));
  }
  if (testStatementIds.length > 0) {
    await db.delete(statements).where(inArray(statements.id, testStatementIds));
  }
  await close();
});

describe('integration: live-responder worker', () => {
  it('narrator emits a narration statement in response to a player dialogue', async () => {
    const bus = new EventBus();
    const reg = new WorkerRegistry();
    reg.register(liveResponderWorker);

    const scheduler = new CronerScheduler(reg, logger, bus);
    await scheduler.start();

    await scheduler.schedule(
      { type: 'event', predicate: { kind: 'dialogue', scopeType: 'party' } },
      'live-responder',
      { adminRoomId: ADMIN_ROOM_ID, modelSpec: 'mock:model' },
    );

    const dialogueId = await appendIndexAndEmit(
      {
        scope: { type: 'party', partyId: PARTY_ROOM_ID } as Scope,
        kind: 'dialogue',
        authorType: 'user',
        authorId: PLAYER_USER,
        content: 'I cautiously push open the dungeon door.',
      },
      bus,
    );
    testStatementIds.push(dialogueId);

    await new Promise((r) => setTimeout(r, 300));

    const narrations = await db
      .select()
      .from(statements)
      .where(eq(statements.authorId, 'narrator'));

    const partyNarrations = narrations.filter(
      (r) => r.scopeType === 'party' && r.scopeKey === PARTY_ROOM_ID,
    );

    expect(partyNarrations.length).toBeGreaterThan(0);

    const latest = partyNarrations.at(-1)!;
    expect(latest.kind).toBe('narration');
    expect(latest.authorType).toBe('agent');
    expect(latest.content).toBeTruthy();
    testStatementIds.push(latest.id);

    await scheduler.stop();
  });

  it('narrator emits an invention and open-question for novel content', async () => {
    mockLlmGenerate.mockResolvedValueOnce({
      text: JSON.stringify({
        kind: 'invention',
        content: 'A mysterious rune glows on the far wall — its origin unknown.',
        openQuestion: {
          subject: 'the glowing rune',
          candidate: 'An ancient ward placed by the former dungeon master',
          routedTo: ADMIN_ROOM_ID,
        },
      }),
    });

    const bus = new EventBus();
    const reg = new WorkerRegistry();
    reg.register(liveResponderWorker);

    const scheduler = new CronerScheduler(reg, logger, bus);
    await scheduler.start();

    await scheduler.schedule(
      { type: 'event', predicate: { kind: 'dialogue', scopeType: 'party' } },
      'live-responder',
      { adminRoomId: ADMIN_ROOM_ID, modelSpec: 'mock:model' },
    );

    const dialogueId = await appendIndexAndEmit(
      {
        scope: { type: 'party', partyId: PARTY_ROOM_ID } as Scope,
        kind: 'dialogue',
        authorType: 'user',
        authorId: PLAYER_USER,
        content: 'What is that strange symbol carved into the stone?',
      },
      bus,
    );
    testStatementIds.push(dialogueId);

    await new Promise((r) => setTimeout(r, 300));

    const openQs = await db.select().from(statements).where(eq(statements.kind, 'open-question'));

    const relevant = openQs.filter(
      (r) => r.scopeType === 'governance' && r.scopeKey === ADMIN_ROOM_ID,
    );

    expect(relevant.length).toBeGreaterThan(0);
    const oq = relevant.at(-1)!;
    expect((oq.fields as any).subject).toBe('the glowing rune');
    expect((oq.fields as any).stage).toBe('deferred');
    testStatementIds.push(oq.id);

    const invStatements = await db
      .select()
      .from(statements)
      .where(eq(statements.kind, 'invention'));
    const partyInvs = invStatements.filter((r) => r.scopeType === 'party');
    expect(partyInvs.length).toBeGreaterThan(0);
    testStatementIds.push(...partyInvs.map((r) => r.id));

    await scheduler.stop();
  });
});
