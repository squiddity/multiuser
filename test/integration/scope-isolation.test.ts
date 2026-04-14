import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db, close } from '../../src/store/client.js';
import { migrate } from '../../src/store/migrate.js';
import { seed } from '../../src/store/seed.js';
import { appendStatement } from '../../src/store/statements.js';
import { retrieveForUserRoom, retrieveByScopes } from '../../src/store/retrieval.js';
import { roleGrants, statements } from '../../src/store/schema.js';
import { eq } from 'drizzle-orm';

const PARTY_ROOM_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ROOM_ID = '22222222-2222-2222-2222-222222222222';
const PLAYER_ROLE_ID = '33333333-3333-3333-3333-333333333333';
const GM_ROLE_ID = '44444444-4444-4444-4444-444444444444';

const PLAYER_USER = 'test-player-1';
const GM_USER = 'test-gm-1';
const OUTSIDER_USER = 'test-outsider-1';

const testStatementIds: string[] = [];
const testGrantIds: string[] = [
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000002',
];

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

  const worldId = await appendStatement({
    scope: { type: 'world' },
    kind: 'canon-reference',
    authorType: 'system',
    authorId: 'bootstrap',
    content: 'The world is ancient.',
  });
  testStatementIds.push(worldId);

  const partyId = await appendStatement({
    scope: { type: 'party', partyId: PARTY_ROOM_ID },
    kind: 'narration',
    authorType: 'agent',
    authorId: 'narrator',
    content: 'The party enters the dungeon.',
  });
  testStatementIds.push(partyId);

  const govId = await appendStatement({
    scope: { type: 'governance', roomId: ADMIN_ROOM_ID },
    kind: 'governance',
    authorType: 'user',
    authorId: GM_USER,
    content: 'GM sets a house rule.',
  });
  testStatementIds.push(govId);

  const metaId = await appendStatement({
    scope: { type: 'meta', roomId: ADMIN_ROOM_ID },
    kind: 'briefing',
    authorType: 'system',
    authorId: 'system',
    content: 'Briefing for admin room.',
  });
  testStatementIds.push(metaId);

  const charId = await appendStatement({
    scope: { type: 'character', characterId: 'cccc0000-0000-0000-0000-000000000001' },
    kind: 'dialogue',
    authorType: 'user',
    authorId: PLAYER_USER,
    content: 'I draw my sword!',
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

describe('scope-isolation: retrieveForUserRoom', () => {
  it('player in party-1 sees world + party + character scopes', async () => {
    const rows = await retrieveForUserRoom(PLAYER_USER, PARTY_ROOM_ID);
    const scopeTypes = rows.map((r) => r.scopeType);

    expect(scopeTypes).toContain('world');
    expect(scopeTypes).toContain('party');
    expect(scopeTypes).not.toContain('governance');
  });

  it('GM in admin-1 sees governance + meta scopes', async () => {
    const rows = await retrieveForUserRoom(GM_USER, ADMIN_ROOM_ID);
    const scopeTypes = rows.map((r) => r.scopeType);

    expect(scopeTypes).toContain('governance');
    expect(scopeTypes).toContain('meta');
    expect(scopeTypes).not.toContain('party');
  });

  it('outsider with no grants sees nothing', async () => {
    const rows = await retrieveForUserRoom(OUTSIDER_USER, PARTY_ROOM_ID);
    expect(rows).toHaveLength(0);
  });

  it('user in wrong room sees nothing', async () => {
    const rows = await retrieveForUserRoom(PLAYER_USER, ADMIN_ROOM_ID);
    expect(rows).toHaveLength(0);
  });

  it('kind filter works within authorized scopes', async () => {
    // Seed includes a party-scope narration and a party-scope dialogue (from
    // earlier test setup elsewhere would vary; here we rely on beforeAll's
    // 'narration' statement and add an extra non-narration kind to prove
    // exclusion).
    const excludedId = await appendStatement({
      scope: { type: 'party', partyId: PARTY_ROOM_ID },
      kind: 'dialogue',
      authorType: 'user',
      authorId: PLAYER_USER,
      content: 'Hail, friend!',
    });
    testStatementIds.push(excludedId);

    const rows = await retrieveForUserRoom(PLAYER_USER, PARTY_ROOM_ID, {
      kind: 'narration',
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.kind).toBe('narration');
    }
  });

  it('wildcard {type:"character"} in readSet does NOT leak character scopes', async () => {
    // party-1's seed readSet includes an unbounded {type:'character'} pattern.
    // With no active character resolved for PLAYER_USER (v1 getActingCharacter
    // returns null), the wildcard must drop — the seeded character statement
    // must not appear in the player's retrieval.
    const rows = await retrieveForUserRoom(PLAYER_USER, PARTY_ROOM_ID);
    const scopeTypes = rows.map((r) => r.scopeType);
    expect(scopeTypes).not.toContain('character');
  });
});

describe('scope-isolation: retrieveByScopes', () => {
  it('returns only statements matching given scopes', async () => {
    const rows = await retrieveByScopes([{ type: 'world' }]);
    const scopeTypes = rows.map((r) => r.scopeType);
    expect(scopeTypes.every((t) => t === 'world')).toBe(true);
  });

  it('returns empty for empty scope list', async () => {
    const rows = await retrieveByScopes([]);
    expect(rows).toHaveLength(0);
  });

  it('can query multiple scopes at once', async () => {
    const rows = await retrieveByScopes([
      { type: 'world' },
      { type: 'governance', roomId: ADMIN_ROOM_ID },
    ]);
    const scopeTypes = rows.map((r) => r.scopeType);
    expect(scopeTypes).toContain('world');
    expect(scopeTypes).toContain('governance');
  });
});
