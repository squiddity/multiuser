import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, close } from '../../src/store/client.js';
import { migrate } from '../../src/store/migrate.js';
import { seed } from '../../src/store/seed.js';
import { HashEmbedder } from '../../src/store/embedders/hash.js';
import { PgvectorSearchBackend } from '../../src/store/search/pgvector.js';
import { setEmbedder, setBackend } from '../../src/store/vectors.js';
import { roleGrants, statements } from '../../src/store/schema.js';
import { eq, inArray } from 'drizzle-orm';
import { createOpenQuestion } from '../../src/store/agents.js';
import { canonizeOpenQuestion, CanonizeError } from '../../src/store/canonize.js';
import { openQuestionResolverWorker } from '../../src/workers/open-question-resolver.js';
import { retrieveForUserRoom } from '../../src/store/retrieval.js';
import { logger } from '../../src/config/logger.js';
import type { Scope } from '../../src/core/statement.js';

const PARTY_ROOM_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ROOM_ID = '22222222-2222-2222-2222-222222222222';
const PLAYER_ROLE_ID = '33333333-3333-3333-3333-333333333333';
const GM_ROLE_ID = '44444444-4444-4444-4444-444444444444';

const GM_USER = 'canonize-gm-1';
const PLAYER_USER = 'canonize-player-1';

const testGrantIds = [
  'f1000000-0000-0000-0000-000000000001',
  'f1000000-0000-0000-0000-000000000002',
];
const testStatementIds: string[] = [];
const governanceScope: Scope = { type: 'governance', roomId: ADMIN_ROOM_ID };

beforeAll(async () => {
  await migrate();
  await seed();

  await db
    .insert(roleGrants)
    .values([
      {
        id: testGrantIds[0]!,
        userId: GM_USER,
        roomId: ADMIN_ROOM_ID,
        roleId: GM_ROLE_ID,
        grantedBy: 'system',
        precedence: 0,
      },
      {
        id: testGrantIds[1]!,
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

async function makeOQ(subject: string, candidate: string): Promise<string> {
  const id = await createOpenQuestion(governanceScope, {
    subject,
    candidate,
    routedTo: ADMIN_ROOM_ID,
  });
  testStatementIds.push(id);
  return id;
}

describe('integration: canonize flow', () => {
  it('GM with canonize capability creates authoring-decision statement', async () => {
    const oqId = await makeOQ('Temple origin', 'Built by the old empire.');

    const adId = await canonizeOpenQuestion({
      userId: GM_USER,
      roomId: ADMIN_ROOM_ID,
      openQuestionId: oqId,
      decision: 'promote',
      rationale: 'Fits the lore perfectly.',
    });
    testStatementIds.push(adId);

    const [row] = await db.select().from(statements).where(eq(statements.id, adId)).limit(1);
    expect(row).toBeDefined();
    expect(row!.kind).toBe('authoring-decision');
    expect(row!.authorType).toBe('user');
    expect(row!.authorId).toBe(GM_USER);
    expect(row!.scopeType).toBe('governance');
    expect(row!.scopeKey).toBe(ADMIN_ROOM_ID);
    expect((row!.fields as Record<string, unknown>).openQuestionId).toBe(oqId);
    expect((row!.fields as Record<string, unknown>).decision).toBe('promote');
    expect((row!.fields as Record<string, unknown>).rationale).toBe('Fits the lore perfectly.');
  });

  it('user without canonize capability is forbidden', async () => {
    const oqId = await makeOQ('Bridge origin', 'Built by dwarves.');

    await expect(
      canonizeOpenQuestion({
        userId: PLAYER_USER,
        roomId: ADMIN_ROOM_ID,
        openQuestionId: oqId,
        decision: 'promote',
      }),
    ).rejects.toThrow(CanonizeError);
  });

  it('supersede without revisedCandidate is a bad request', async () => {
    const oqId = await makeOQ('River name', 'Called the Silver Run.');

    await expect(
      canonizeOpenQuestion({
        userId: GM_USER,
        roomId: ADMIN_ROOM_ID,
        openQuestionId: oqId,
        decision: 'supersede',
      }),
    ).rejects.toThrow(CanonizeError);
  });

  it('promote: party invention becomes world canon', async () => {
    const oqId = await makeOQ('Dragon hoard location', 'The hoard lies beneath the fallen tower.');

    const adId = await canonizeOpenQuestion({
      userId: GM_USER,
      roomId: ADMIN_ROOM_ID,
      openQuestionId: oqId,
      decision: 'promote',
    });
    testStatementIds.push(adId);

    await openQuestionResolverWorker.handler(
      { id: adId, kind: 'authoring-decision', scopeType: 'governance', scopeKey: ADMIN_ROOM_ID },
      { logger, now: () => new Date() },
    );

    const worldRows = await db.select().from(statements).where(eq(statements.scopeType, 'world'));
    const canon = worldRows.find(
      (r) => r.kind === 'canon-reference' && Array.isArray(r.sources) && r.sources.includes(adId),
    );
    expect(canon).toBeDefined();
    expect(canon!.content).toBe('The hoard lies beneath the fallen tower.');
    testStatementIds.push(canon!.id);

    const superseding = await db.select().from(statements).where(eq(statements.supersedes, oqId));
    expect(superseding).toHaveLength(1);
    expect((superseding[0]!.fields as Record<string, unknown>).stage).toBe('surfaced');
    testStatementIds.push(superseding[0]!.id);
  });

  it('canonized world facts are visible in subsequent narrator context', async () => {
    // First canonize an open question so there is a world-scope canon-reference
    const oqId = await makeOQ(
      'Citadel history',
      'The citadel of Ashveil was founded three centuries ago.',
    );
    const adId = await canonizeOpenQuestion({
      userId: GM_USER,
      roomId: ADMIN_ROOM_ID,
      openQuestionId: oqId,
      decision: 'promote',
    });
    testStatementIds.push(adId);

    await openQuestionResolverWorker.handler(
      { id: adId, kind: 'authoring-decision', scopeType: 'governance', scopeKey: ADMIN_ROOM_ID },
      { logger, now: () => new Date() },
    );

    // The party player's read-set includes world scope, so the canon is retrievable
    const rows = await retrieveForUserRoom(PLAYER_USER, PARTY_ROOM_ID, { limit: 50 });
    const worldCanon = rows.filter((r) => r.scopeType === 'world' && r.kind === 'canon-reference');
    expect(worldCanon.length).toBeGreaterThan(0);
    const found = worldCanon.some((r) => r.content.includes('Ashveil'));
    expect(found).toBe(true);

    const canonIds = worldCanon.map((r) => r.id);
    testStatementIds.push(...canonIds);
  });
});
