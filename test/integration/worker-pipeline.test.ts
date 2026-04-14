import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, close } from '../../src/store/client.js';
import { migrate } from '../../src/store/migrate.js';
import { seed } from '../../src/store/seed.js';
import { appendAndIndex } from '../../src/store/vectors.js';
import { appendAndEmit } from '../../src/store/emit.js';
import { retrieveByScopes } from '../../src/store/retrieval.js';
import { HashEmbedder } from '../../src/store/embedders/hash.js';
import { PgvectorSearchBackend } from '../../src/store/search/pgvector.js';
import { setEmbedder, setBackend } from '../../src/store/vectors.js';
import { EventBus, type StatementEvent } from '../../src/core/events.js';
import { WorkerRegistry, type WorkerContext } from '../../src/core/worker.js';
import { CronerScheduler } from '../../src/scheduler/croner-impl.js';
import { logger } from '../../src/config/logger.js';
import { roleGrants, statements } from '../../src/store/schema.js';
import { eq } from 'drizzle-orm';
import type { SearchBackend } from '../../src/core/search.js';
import type { Scope } from '../../src/core/statement.js';

const PARTY_ROOM_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ROOM_ID = '22222222-2222-2222-2222-222222222222';
const PLAYER_ROLE_ID = '33333333-3333-3333-3333-333333333333';
const GM_ROLE_ID = '44444444-4444-4444-4444-444444444444';

const PLAYER_USER = 'int-player-1';
const GM_USER = 'int-gm-1';

const testStatementIds: string[] = [];
const testGrantIds: string[] = [
  'c0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000002',
];

let originalBackend: SearchBackend;

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

  originalBackend = await (async () => {
    const embedder = new HashEmbedder();
    const backend = new PgvectorSearchBackend(embedder);
    setEmbedder(embedder);
    setBackend(backend);
    return backend;
  })();

  const worldId = await appendAndIndex({
    scope: { type: 'world' } as Scope,
    kind: 'canon-reference',
    authorType: 'system',
    authorId: 'bootstrap',
    content: 'The dragon gods rule the eastern peaks with fiery breath.',
  });
  testStatementIds.push(worldId);

  const partyId = await appendAndIndex({
    scope: { type: 'party', partyId: PARTY_ROOM_ID } as Scope,
    kind: 'narration',
    authorType: 'agent',
    authorId: 'narrator',
    content: 'A dragon circled above the mountain, its shadow falling over the party.',
  });
  testStatementIds.push(partyId);
});

afterAll(async () => {
  for (const grantId of testGrantIds) {
    await db.delete(roleGrants).where(eq(roleGrants.id, grantId));
  }
  for (const id of testStatementIds) {
    await db.delete(statements).where(eq(statements.id, id));
  }
  await close();
});

describe('integration: EventBus + scheduler + worker dispatch', () => {
  it('statement:created event triggers a worker that reads and writes back', async () => {
    const bus = new EventBus();
    const reg = new WorkerRegistry();
    const workerCalls: StatementEvent[] = [];
    const writtenIds: string[] = [];

    const context: WorkerContext = { logger, now: () => new Date() };

    reg.register({
      name: 'on-dialogue',
      schema: {
        parse: (x: unknown) => x as { roomId: string },
      } as never,
      handler: async (payload, _ctx) => {
        const { roomId } = payload as { roomId: string };
        const results = await retrieveByScopes(
          [{ type: 'world' }, { type: 'party', partyId: PARTY_ROOM_ID }],
          { query: 'dragon', limit: 5 },
        );

        expect(results.length).toBeGreaterThan(0);
        expect(results.some((r) => r.scopeType === 'world')).toBe(true);
        expect(results.some((r) => r.scopeType === 'party')).toBe(true);

        const id = await appendAndIndex({
          scope: { type: 'party', partyId: roomId } as Scope,
          kind: 'narration',
          authorType: 'agent',
          authorId: 'narrator',
          content: `Narrator saw ${results.length} dragon references and responded in room ${roomId}.`,
        });
        writtenIds.push(id);
      },
    });

    const scheduler = new CronerScheduler(reg, logger, bus);
    await scheduler.start();

    await scheduler.schedule(
      { type: 'event', predicate: { kind: 'dialogue', scopeType: 'party' } },
      'on-dialogue',
      { roomId: PARTY_ROOM_ID },
    );

    const newId = await appendAndEmit(
      {
        scope: { type: 'party', partyId: PARTY_ROOM_ID } as Scope,
        kind: 'dialogue',
        authorType: 'user',
        authorId: PLAYER_USER,
        content: 'I shout a warning about the dragon!',
      },
      bus,
    );
    testStatementIds.push(newId);

    await new Promise((r) => setTimeout(r, 200));

    expect(writtenIds).toHaveLength(1);

    const response = await db
      .select()
      .from(statements)
      .where(eq(statements.id, writtenIds[0]!))
      .limit(1);
    expect(response).toHaveLength(1);
    expect(response[0]!.kind).toBe('narration');
    expect(response[0]!.authorId).toBe('narrator');

    for (const id of writtenIds) {
      testStatementIds.push(id);
    }

    await scheduler.stop();
  });

  it('event with empty predicate fires on any statement', async () => {
    const bus = new EventBus();
    const reg = new WorkerRegistry();
    let callCount = 0;

    reg.register({
      name: 'catch-all',
      schema: { parse: (x: unknown) => x } as never,
      handler: async (_payload, _ctx) => {
        callCount++;
      },
    });

    const scheduler = new CronerScheduler(reg, logger, bus);
    await scheduler.start();

    await scheduler.schedule({ type: 'event', predicate: {} }, 'catch-all', {});

    const id1 = await appendAndEmit(
      {
        scope: { type: 'world' } as Scope,
        kind: 'canon-reference',
        authorType: 'system',
        authorId: 'test',
        content: 'World event one',
      },
      bus,
    );
    testStatementIds.push(id1);

    const id2 = await appendAndEmit(
      {
        scope: { type: 'governance', roomId: ADMIN_ROOM_ID } as Scope,
        kind: 'governance',
        authorType: 'user',
        authorId: GM_USER,
        content: 'Governance event two',
      },
      bus,
    );
    testStatementIds.push(id2);

    await new Promise((r) => setTimeout(r, 100));

    expect(callCount).toBe(2);

    await scheduler.stop();
  });

  it('scheduler does not fire worker for non-matching events', async () => {
    const bus = new EventBus();
    const reg = new WorkerRegistry();
    let callCount = 0;

    reg.register({
      name: 'governance-only',
      schema: { parse: (x: unknown) => x } as never,
      handler: async (_payload, _ctx) => {
        callCount++;
      },
    });

    const scheduler = new CronerScheduler(reg, logger, bus);
    await scheduler.start();

    await scheduler.schedule(
      { type: 'event', predicate: { scopeType: 'governance' } },
      'governance-only',
      {},
    );

    const id = await appendAndEmit(
      {
        scope: { type: 'party', partyId: PARTY_ROOM_ID } as Scope,
        kind: 'dialogue',
        authorType: 'user',
        authorId: PLAYER_USER,
        content: 'A party event that should not trigger governance listener',
      },
      bus,
    );
    testStatementIds.push(id);

    await new Promise((r) => setTimeout(r, 100));

    expect(callCount).toBe(0);

    await scheduler.stop();
  });

  it('multiple workers can subscribe to the same event type', async () => {
    const bus = new EventBus();
    const reg = new WorkerRegistry();
    const log: string[] = [];

    reg.register({
      name: 'worker-a',
      schema: { parse: (x: unknown) => x } as never,
      handler: async (_payload, _ctx) => {
        log.push('a');
      },
    });
    reg.register({
      name: 'worker-b',
      schema: { parse: (x: unknown) => x } as never,
      handler: async (_payload, _ctx) => {
        log.push('b');
      },
    });

    const scheduler = new CronerScheduler(reg, logger, bus);
    await scheduler.start();

    await scheduler.schedule({ type: 'event', predicate: { kind: 'narration' } }, 'worker-a', {});
    await scheduler.schedule({ type: 'event', predicate: { kind: 'narration' } }, 'worker-b', {});

    const id = await appendAndEmit(
      {
        scope: { type: 'world' } as Scope,
        kind: 'narration',
        authorType: 'system',
        authorId: 'test',
        content: 'Narration event for multi-worker test',
      },
      bus,
    );
    testStatementIds.push(id);

    await new Promise((r) => setTimeout(r, 200));

    expect(log).toHaveLength(2);
    expect(log.sort()).toEqual(['a', 'b']);

    await scheduler.stop();
  });

  it('appendAndEmit stores the statement in the database', async () => {
    const bus = new EventBus();

    const id = await appendAndEmit(
      {
        scope: { type: 'world' } as Scope,
        kind: 'canon-reference',
        authorType: 'system',
        authorId: 'test',
        content: 'Stored via appendAndEmit',
      },
      bus,
    );
    testStatementIds.push(id);

    const [row] = await db.select().from(statements).where(eq(statements.id, id)).limit(1);

    expect(row).toBeDefined();
    expect(row!.kind).toBe('canon-reference');
    expect(row!.content).toBe('Stored via appendAndEmit');
    expect(row!.scopeType).toBe('world');
  });

  it('event bus event contains correct scope metadata', async () => {
    const bus = new EventBus();
    const received: StatementEvent[] = [];

    bus.on<StatementEvent>('statement:created', (e) => received.push(e));

    const id = await appendAndEmit(
      {
        scope: { type: 'party', partyId: PARTY_ROOM_ID } as Scope,
        kind: 'dialogue',
        authorType: 'user',
        authorId: 'test-meta',
        content: 'Checking event metadata',
      },
      bus,
    );
    testStatementIds.push(id);

    expect(received).toHaveLength(1);
    expect(received[0]!.id).toBe(id);
    expect(received[0]!.kind).toBe('dialogue');
    expect(received[0]!.scopeType).toBe('party');
    expect(received[0]!.scopeKey).toBe(PARTY_ROOM_ID);
  });
});
