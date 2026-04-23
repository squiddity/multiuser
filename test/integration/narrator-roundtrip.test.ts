import { afterAll, beforeAll, describe, expect, it, vi, beforeEach } from 'vitest';
import { db, close } from '../../src/store/client.js';
import { migrate } from '../../src/store/migrate.js';
import { seed } from '../../src/store/seed.js';
import { appendAndIndex } from '../../src/store/vectors.js';
import { retrieveForUserRoom } from '../../src/store/retrieval.js';
import { HashEmbedder } from '../../src/store/embedders/hash.js';
import { PgvectorSearchBackend } from '../../src/store/search/pgvector.js';
import { setEmbedder, setBackend } from '../../src/store/vectors.js';
import { roleGrants, statements } from '../../src/store/schema.js';
import { eq } from 'drizzle-orm';
import type { SearchBackend } from '../../src/core/search.js';
import type { Scope } from '../../src/core/statement.js';

const mockLlmGenerate = vi.fn();
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
  'd0000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000002',
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

beforeEach(() => {
  mockLlmGenerate.mockClear();
});

describe('integration: Narrator roundtrip', () => {
  it('narrator reads party scope context', async () => {
    const rows = await retrieveForUserRoom(PLAYER_USER, PARTY_ROOM_ID, { limit: 10 });

    expect(rows.length).toBeGreaterThan(0);
    const hasParty = rows.some((r) => r.scopeType === 'party' && r.scopeKey === PARTY_ROOM_ID);
    expect(hasParty).toBe(true);
  });

  it('narrator loads default prompt from file', async () => {
    const { loadAgentPrompt } = await import('../../src/store/content.js');
    const result = await loadAgentPrompt('narrator', null);

    expect(result.content).toBeTruthy();
    expect(result.source).toBe('file');
    expect(result.agentId).toBe('narrator');
  });

  it('narrator outputs valid narration from mock LLM', async () => {
    mockLlmGenerate.mockResolvedValue({
      text: JSON.stringify({
        kind: 'narration',
        content: 'The dragon roars, its voice shaking the mountains.',
      }),
    });

    const { Narrator } = await import('../../src/agents/narrator.js');
    const narrator = new Narrator({
      modelSpec: 'anthropic:claude-3-haiku-20240307',
      campaignId: null,
      adminRoomId: ADMIN_ROOM_ID,
    });

    const output = await narrator.compose(PARTY_ROOM_ID, PLAYER_USER, 'We look up at the dragon.');

    expect(output.kind).toBe('narration');
    expect(output.content).toBe('The dragon roars, its voice shaking the mountains.');
  });

  it('narrator outputs invention with openQuestion from mock LLM', async () => {
    mockLlmGenerate.mockResolvedValue({
      text: JSON.stringify({
        kind: 'invention',
        content: 'The dragon has a scarred left eye.',
        openQuestion: {
          subject: 'Dragon eye scar',
          candidate: 'The dragon has a distinctive scarred left eye from an old battle.',
          routedTo: ADMIN_ROOM_ID,
        },
      }),
    });

    const { Narrator } = await import('../../src/agents/narrator.js');
    const narrator = new Narrator({
      modelSpec: 'anthropic:claude-3-haiku-20240307',
      campaignId: null,
      adminRoomId: ADMIN_ROOM_ID,
    });

    const output = await narrator.compose(
      PARTY_ROOM_ID,
      PLAYER_USER,
      'What does the dragon look like?',
    );

    expect(output.kind).toBe('invention');
    expect(output.openQuestion).toBeDefined();
    expect(output.openQuestion!.subject).toBe('Dragon eye scar');
    expect(output.openQuestion!.routedTo).toBe(ADMIN_ROOM_ID);
  });

  it('narrator emits statements including open-question for invention', async () => {
    mockLlmGenerate.mockResolvedValue({
      text: JSON.stringify({
        kind: 'invention',
        content: 'The dragon has a scarred eye.',
        openQuestion: { subject: 'Dragon scar', candidate: 'Scarred eye', routedTo: ADMIN_ROOM_ID },
      }),
    });

    const { Narrator } = await import('../../src/agents/narrator.js');
    const narrator = new Narrator({
      modelSpec: 'anthropic:claude-3-haiku-20240307',
      campaignId: null,
      adminRoomId: ADMIN_ROOM_ID,
    });

    const output = await narrator.compose(PARTY_ROOM_ID, PLAYER_USER);
    const emitted = await narrator.emit(PARTY_ROOM_ID, output);

    expect(emitted).toHaveLength(2);

    const governanceStatements = await db
      .select()
      .from(statements)
      .where(eq(statements.scopeType, 'governance'))
      .where(eq(statements.scopeKey, ADMIN_ROOM_ID));

    expect(governanceStatements.length).toBeGreaterThan(0);
    const oqStatement = governanceStatements.find((s) => s.kind === 'open-question');
    expect(oqStatement).toBeDefined();
    expect(oqStatement!.fields).toHaveProperty('subject', 'Dragon scar');

    testStatementIds.push(...emitted);
  });
});
