import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db, close } from '../../src/store/client.js';
import { migrate } from '../../src/store/migrate.js';
import { seed } from '../../src/store/seed.js';
import { HashEmbedder } from '../../src/store/embedders/hash.js';
import { PgvectorSearchBackend } from '../../src/store/search/pgvector.js';
import { setEmbedder, setBackend } from '../../src/store/vectors.js';
import { roleGrants, statements } from '../../src/store/schema.js';
import { EventBus } from '../../src/core/events.js';
import { emitSteeringRequest, listActiveSteeringFor } from '../../src/store/steering.js';
import { steeringFormalizerWorker } from '../../src/workers/steering-formalizer.js';
import { logger } from '../../src/config/logger.js';
import { appendStatement } from '../../src/store/statements.js';

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

const PLAYER_USER = 'steer-player-1';
const GM_USER = 'steer-gm-1';

const testStatementIds: string[] = [];
const testGrantIds: string[] = [
  'f0000000-0000-0000-0000-000000000001',
  'f0000000-0000-0000-0000-000000000002',
];

const ctx = { logger, now: () => new Date() };

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

  const embedder = new HashEmbedder();
  setEmbedder(embedder);
  setBackend(new PgvectorSearchBackend(embedder));
});

afterAll(async () => {
  if (testStatementIds.length > 0) {
    await db.delete(statements).where(inArray(statements.id, testStatementIds));
  }
  await db.delete(roleGrants).where(inArray(roleGrants.id, testGrantIds));
  await close();
});

beforeEach(async () => {
  mockLlmGenerate.mockClear();
  await db.delete(statements).where(eq(statements.scopeType, 'governance'));
  await db.delete(statements).where(eq(statements.scopeType, 'party'));
});

describe('integration: steering request → formalizer → active list', () => {
  it('emitSteeringRequest requires canonize capability on admin room', async () => {
    const events = new EventBus();
    await expect(
      emitSteeringRequest(
        {
          userId: PLAYER_USER, // player lacks gm role on admin room
          adminRoomId: ADMIN_ROOM_ID,
          partyRoomId: PARTY_ROOM_ID,
          intent: 'tone',
          direction: 'Keep it tense',
        },
        events,
      ),
    ).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('emitSteeringRequest emits a steering-request in governance scope', async () => {
    const events = new EventBus();
    const id = await emitSteeringRequest(
      {
        userId: GM_USER,
        adminRoomId: ADMIN_ROOM_ID,
        partyRoomId: PARTY_ROOM_ID,
        intent: 'direction',
        direction: 'Push them toward the chapel.',
      },
      events,
    );
    testStatementIds.push(id);

    const [row] = await db.select().from(statements).where(eq(statements.id, id));
    expect(row).toBeDefined();
    expect(row!.kind).toBe('steering-request');
    expect(row!.scopeType).toBe('governance');
    expect(row!.scopeKey).toBe(ADMIN_ROOM_ID);
    const fields = row!.fields as Record<string, unknown>;
    expect(fields.appliesToPartyRoomId).toBe(PARTY_ROOM_ID);
    expect(fields.intent).toBe('direction');
  });

  it('worker formalizes a steering-request into a steering statement', async () => {
    const events = new EventBus();
    const requestId = await emitSteeringRequest(
      {
        userId: GM_USER,
        adminRoomId: ADMIN_ROOM_ID,
        partyRoomId: PARTY_ROOM_ID,
        intent: 'tone',
        direction: 'Raise the pressure at the gate.',
        tone: 'tense and ominous',
        constraints: ['No slapstick', 'Keep focus on the sigil'],
      },
      events,
    );
    testStatementIds.push(requestId);

    await steeringFormalizerWorker.handler(
      {
        id: requestId,
        kind: 'steering-request',
        scopeType: 'governance',
        scopeKey: ADMIN_ROOM_ID,
      },
      ctx,
    );

    const governanceRows = await db
      .select()
      .from(statements)
      .where(eq(statements.scopeType, 'governance'));

    const steeringRow = governanceRows.find((r) => r.kind === 'steering');
    expect(steeringRow).toBeDefined();
    expect(steeringRow!.scopeKey).toBe(ADMIN_ROOM_ID);
    expect(steeringRow!.authorId).toBe('steering-formalizer');
    expect(steeringRow!.sources).toContain(requestId);

    const fields = steeringRow!.fields as Record<string, unknown>;
    expect(fields.status).toBe('active');
    expect(fields.intent).toBe('tone');
    expect(fields.tone).toBe('tense and ominous');
    expect(fields.appliesToPartyRoomId).toBe(PARTY_ROOM_ID);
    expect(fields.constraints).toEqual(['No slapstick', 'Keep focus on the sigil']);

    testStatementIds.push(steeringRow!.id);
  });

  it('listActiveSteeringFor returns only active steering for the target party, newest first', async () => {
    // Seed two active + one superseded steering directly
    const base = Date.now();
    const older = await appendStatement({
      scope: { type: 'governance', roomId: ADMIN_ROOM_ID },
      kind: 'steering',
      authorType: 'agent',
      authorId: 'steering-formalizer',
      content: 'Old direction',
      fields: {
        appliesToPartyRoomId: PARTY_ROOM_ID,
        issuedByUserId: GM_USER,
        intent: 'direction',
        direction: 'Old direction',
        status: 'active',
      },
    });
    testStatementIds.push(older);

    // Ensure the newer row has a later createdAt even when inserts happen within the same millisecond.
    await new Promise((resolve) => setTimeout(resolve, 10));

    const newer = await appendStatement({
      scope: { type: 'governance', roomId: ADMIN_ROOM_ID },
      kind: 'steering',
      authorType: 'agent',
      authorId: 'steering-formalizer',
      content: 'Raise the pressure',
      fields: {
        appliesToPartyRoomId: PARTY_ROOM_ID,
        issuedByUserId: GM_USER,
        intent: 'tone',
        tone: 'tense and ominous',
        direction: 'Raise the pressure',
        status: 'active',
      },
    });
    testStatementIds.push(newer);

    const superseded = await appendStatement({
      scope: { type: 'governance', roomId: ADMIN_ROOM_ID },
      kind: 'steering',
      authorType: 'agent',
      authorId: 'steering-formalizer',
      content: 'Should be ignored',
      fields: {
        appliesToPartyRoomId: PARTY_ROOM_ID,
        issuedByUserId: GM_USER,
        intent: 'direction',
        direction: 'Ignore me',
        status: 'superseded',
      },
    });
    testStatementIds.push(superseded);

    const active = await listActiveSteeringFor(PARTY_ROOM_ID, ADMIN_ROOM_ID);
    const ids = active.map((c) => c.id);
    expect(ids).toEqual([newer, older]);
    expect(active.every((c) => c.fields.status === 'active')).toBe(true);
  });
});

describe('integration: narrator prompt reflects active steering', () => {
  it('narrator prompt includes steering direction and tone when active', async () => {
    // Seed an active steering statement
    const steeringId = await appendStatement({
      scope: { type: 'governance', roomId: ADMIN_ROOM_ID },
      kind: 'steering',
      authorType: 'agent',
      authorId: 'steering-formalizer',
      content: 'Tense-and-ominous steering directive',
      fields: {
        appliesToPartyRoomId: PARTY_ROOM_ID,
        issuedByUserId: GM_USER,
        intent: 'tone',
        tone: 'tense and ominous',
        constraints: ['No slapstick'],
        direction: 'Escalate urgency before travel resumes.',
        status: 'active',
      },
    });
    testStatementIds.push(steeringId);

    mockLlmGenerate.mockResolvedValue({
      text: JSON.stringify({ kind: 'narration', content: 'The gate looms, ominous.' }),
    });

    const { Narrator } = await import('../../src/agents/narrator.js');
    const narrator = new Narrator({
      modelSpec: 'anthropic:claude-3-haiku-20240307',
      campaignId: null,
      adminRoomId: ADMIN_ROOM_ID,
    });

    await narrator.compose(PARTY_ROOM_ID, PLAYER_USER, 'We approach the gate.');

    expect(mockLlmGenerate).toHaveBeenCalled();
    const callArg = mockLlmGenerate.mock.calls[0]![0] as {
      systemPrompt: string;
      prompt: string;
    };

    expect(callArg.prompt).toContain('Active GM steering');
    expect(callArg.prompt).toContain('tense and ominous');
    expect(callArg.prompt).toContain('No slapstick');
    expect(callArg.prompt).toContain('Escalate urgency before travel resumes.');
    expect(callArg.prompt).toContain('intent=tone');
  });

  it('narrator prompt omits steering block when no active steering applies', async () => {
    mockLlmGenerate.mockResolvedValue({
      text: JSON.stringify({ kind: 'narration', content: 'All quiet.' }),
    });

    const { Narrator } = await import('../../src/agents/narrator.js');
    const narrator = new Narrator({
      modelSpec: 'anthropic:claude-3-haiku-20240307',
      campaignId: null,
      adminRoomId: ADMIN_ROOM_ID,
    });

    await narrator.compose(PARTY_ROOM_ID, PLAYER_USER, 'We look around.');

    const callArg = mockLlmGenerate.mock.calls[0]![0] as { prompt: string };
    expect(callArg.prompt).not.toContain('Active GM steering');
  });
});
