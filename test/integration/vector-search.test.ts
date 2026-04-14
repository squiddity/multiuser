import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, close } from '../../src/store/client.js';
import { migrate } from '../../src/store/migrate.js';
import { seed } from '../../src/store/seed.js';
import { appendAndIndex } from '../../src/store/vectors.js';
import { retrieveForUserRoom, retrieveByScopes } from '../../src/store/retrieval.js';
import { HashEmbedder } from '../../src/store/embedders/hash.js';
import { PgvectorSearchBackend } from '../../src/store/search/pgvector.js';
import { setEmbedder, setBackend } from '../../src/store/vectors.js';
import { roleGrants, statements } from '../../src/store/schema.js';
import { appendStatement } from '../../src/store/statements.js';
import { eq } from 'drizzle-orm';
import type { SearchBackend } from '../../src/core/search.js';

const PARTY_ROOM_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ROOM_ID = '22222222-2222-2222-2222-222222222222';
const PLAYER_ROLE_ID = '33333333-3333-3333-3333-333333333333';
const GM_ROLE_ID = '44444444-4444-4444-4444-444444444444';

const PLAYER_USER = 'vs-player-1';
const GM_USER = 'vs-gm-1';

const testStatementIds: string[] = [];
const testGrantIds: string[] = [
  'b0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000002',
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
    scope: { type: 'world' },
    kind: 'canon-reference',
    authorType: 'system',
    authorId: 'bootstrap',
    content: 'The ancient sword of kings lies in a forgotten crypt.',
  });
  testStatementIds.push(worldId);

  const partyId = await appendAndIndex({
    scope: { type: 'party', partyId: PARTY_ROOM_ID },
    kind: 'narration',
    authorType: 'agent',
    authorId: 'narrator',
    content: 'The party discovers a sword glinting in the darkness.',
  });
  testStatementIds.push(partyId);

  const govId = await appendAndIndex({
    scope: { type: 'governance', roomId: ADMIN_ROOM_ID },
    kind: 'governance',
    authorType: 'user',
    authorId: GM_USER,
    content: 'The ruling council meets in the ancient citadel.',
  });
  testStatementIds.push(govId);

  const metaId = await appendAndIndex({
    scope: { type: 'meta', roomId: ADMIN_ROOM_ID },
    kind: 'briefing',
    authorType: 'system',
    authorId: 'system',
    content: 'Briefing: the ancient lore must be consulted.',
  });
  testStatementIds.push(metaId);

  const charId = await appendAndIndex({
    scope: { type: 'character', characterId: 'cccc0000-0000-0000-0000-000000000001' },
    kind: 'dialogue',
    authorType: 'user',
    authorId: PLAYER_USER,
    content: 'I swing my sword at the ancient enemy!',
  });
  testStatementIds.push(charId);
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

describe('vector-search: retrieveForUserRoom with query', () => {
  it('player querying "sword" sees scored results in authorized scopes', async () => {
    const rows = await retrieveForUserRoom(PLAYER_USER, PARTY_ROOM_ID, {
      query: 'sword',
    });

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).toHaveProperty('score');
      expect(typeof row.score).toBe('number');
    }
    const scopeTypes = rows.map((r) => r.scopeType);
    expect(scopeTypes).toContain('world');
    expect(scopeTypes).toContain('party');
    expect(scopeTypes).not.toContain('governance');
  });

  it('GM querying "ancient" sees scored results in governance scopes', async () => {
    const rows = await retrieveForUserRoom(GM_USER, ADMIN_ROOM_ID, {
      query: 'ancient',
    });

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).toHaveProperty('score');
      expect(typeof row.score).toBe('number');
    }
    const scopeTypes = rows.map((r) => r.scopeType);
    expect(scopeTypes).toContain('governance');
    expect(scopeTypes).not.toContain('party');
  });

  it('query returns empty for user with no grants', async () => {
    const rows = await retrieveForUserRoom('vs-outsider', PARTY_ROOM_ID, {
      query: 'sword',
    });
    expect(rows).toHaveLength(0);
  });

  it('query with kind filter narrows results', async () => {
    const rows = await retrieveForUserRoom(PLAYER_USER, PARTY_ROOM_ID, {
      query: 'sword',
      kind: 'canon-reference',
    });
    for (const row of rows) {
      expect(row.kind).toBe('canon-reference');
    }
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe('vector-search: retrieveByScopes with query', () => {
  it('scope-filtered + query returns relevant results with scores', async () => {
    const rows = await retrieveByScopes([{ type: 'world' }], {
      query: 'ancient',
    });

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).toHaveProperty('score');
      expect(typeof row.score).toBe('number');
      expect(row.scopeType).toBe('world');
    }
  });

  it('multi-scope query returns results from all scopes', async () => {
    const rows = await retrieveByScopes(
      [{ type: 'world' }, { type: 'governance', roomId: ADMIN_ROOM_ID }],
      { query: 'ancient' },
    );

    const scopeTypes = rows.map((r) => r.scopeType);
    expect(scopeTypes).toContain('world');
    expect(scopeTypes).toContain('governance');
  });

  it('hash collisions for nonsense queries produce high-distance (low relevance) scores', async () => {
    const rows = await retrieveByScopes([{ type: 'world' }], {
      query: 'xyzzynonexistentterm',
    });
    if (rows.length > 0) {
      for (const row of rows) {
        expect(row.score).toBeGreaterThan(0.5);
      }
    }
  });
});

describe('vector-search: null-embedding exclusion', () => {
  it('statements without embeddings are excluded from search results', async () => {
    const nullId = await appendStatement({
      scope: { type: 'world' },
      kind: 'canon-reference',
      authorType: 'system',
      authorId: 'test',
      content: 'A statement with no embedding vector.',
    });
    testStatementIds.push(nullId);

    const rows = await retrieveByScopes([{ type: 'world' }], {
      query: 'statement no embedding',
    });

    const ids = rows.map((r) => r.id);
    expect(ids).not.toContain(nullId);

    await db.delete(statements).where(eq(statements.id, nullId));
    const idx = testStatementIds.indexOf(nullId);
    if (idx >= 0) testStatementIds.splice(idx, 1);
  });
});

describe('vector-search: HashEmbedder', () => {
  it('produces L2-normalized vectors', async () => {
    const embedder = new HashEmbedder();
    const [vec] = await embedder.embed(['hello world test']);
    expect(vec.length).toBeGreaterThan(0);
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it('produces identical vectors for identical text', async () => {
    const embedder = new HashEmbedder();
    const [a, b] = await embedder.embed(['hello world', 'hello world']);
    expect(a).toEqual(b);
  });

  it('produces different vectors for different text', async () => {
    const embedder = new HashEmbedder();
    const [a, b] = await embedder.embed(['sword fight', 'peaceful negotiation']);
    expect(a).not.toEqual(b);
  });

  it('handles empty string gracefully', async () => {
    const embedder = new HashEmbedder();
    const [vec] = await embedder.embed(['']);
    expect(vec.every((v) => v === 0)).toBe(true);
  });
});
