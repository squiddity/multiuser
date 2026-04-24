import { afterAll, beforeAll, describe, expect, it, vi, beforeEach } from 'vitest';
import { db, close } from '../../src/store/client.js';
import { migrate } from '../../src/store/migrate.js';
import { seed } from '../../src/store/seed.js';
import { HashEmbedder } from '../../src/store/embedders/hash.js';
import { PgvectorSearchBackend } from '../../src/store/search/pgvector.js';
import { setEmbedder, setBackend } from '../../src/store/vectors.js';
import { roleGrants, statements } from '../../src/store/schema.js';
import { eq, inArray } from 'drizzle-orm';
import { createOpenQuestion, emitAgentStatement } from '../../src/store/agents.js';
import { logger } from '../../src/config/logger.js';
import type { Scope } from '../../src/core/statement.js';

const mockLlmGenerate = vi.fn();
vi.mock('../../src/models/pi-runtime.js', () => ({
  createPiAiLlmRuntime: vi.fn(() => ({
    generate: (...args: unknown[]) => mockLlmGenerate(...args),
  })),
}));

const ADMIN_ROOM_ID = '22222222-2222-2222-2222-222222222222';
const GM_ROLE_ID = '44444444-4444-4444-4444-444444444444';
const GM_USER = 'oqflow-gm-1';

const testGrantIds = ['e0000000-0000-0000-0000-000000000001'];
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

beforeEach(() => {
  mockLlmGenerate.mockClear();
});

async function makeOpenQuestion(subject: string, candidate: string): Promise<string> {
  const id = await createOpenQuestion(governanceScope, {
    subject,
    candidate,
    routedTo: ADMIN_ROOM_ID,
  });
  testStatementIds.push(id);
  return id;
}

describe('integration: DecisionFormalizer agent', () => {
  it('formalize() parses a promote response from mocked LLM', async () => {
    mockLlmGenerate.mockResolvedValueOnce({
      text: JSON.stringify({
        decision: 'promote',
        rationale: 'The candidate is a strong fit for world canon.',
      }),
    });

    const { DecisionFormalizer } = await import('../../src/agents/decision-formalizer.js');
    const formalizer = new DecisionFormalizer({ modelSpec: 'anthropic:claude-3-haiku-20240307' });

    const oqId = await makeOpenQuestion(
      'Dragon scar origin',
      'The scar came from a wyvern attack.',
    );
    const output = await formalizer.formalize(
      oqId,
      'Dragon scar origin',
      'The scar came from a wyvern attack.',
      'Looks good, approve it.',
    );

    expect(output.decision).toBe('promote');
    expect(output.rationale).toBeTruthy();
    expect(output.revisedCandidate).toBeUndefined();
  });

  it('formalize() parses a reject response from mocked LLM', async () => {
    mockLlmGenerate.mockResolvedValueOnce({
      text: JSON.stringify({
        decision: 'reject',
        rationale: 'This contradicts established lore.',
      }),
    });

    const { DecisionFormalizer } = await import('../../src/agents/decision-formalizer.js');
    const formalizer = new DecisionFormalizer({ modelSpec: 'anthropic:claude-3-haiku-20240307' });

    const oqId = await makeOpenQuestion('Dragon age', 'The dragon is only 50 years old.');
    const output = await formalizer.formalize(
      oqId,
      'Dragon age',
      'The dragon is only 50 years old.',
      'No, dragons in this world are ancient. Reject this.',
    );

    expect(output.decision).toBe('reject');
    expect(output.rationale).toBeTruthy();
    expect(output.revisedCandidate).toBeUndefined();
  });

  it('formalize() parses a supersede response with revisedCandidate', async () => {
    mockLlmGenerate.mockResolvedValueOnce({
      text: JSON.stringify({
        decision: 'supersede',
        rationale: 'Close but needs revision.',
        revisedCandidate: 'The scar came from the Battle of the Iron Peaks, not a wyvern.',
      }),
    });

    const { DecisionFormalizer } = await import('../../src/agents/decision-formalizer.js');
    const formalizer = new DecisionFormalizer({ modelSpec: 'anthropic:claude-3-haiku-20240307' });

    const oqId = await makeOpenQuestion('Scar source', 'A wyvern caused the scar.');
    const output = await formalizer.formalize(
      oqId,
      'Scar source',
      'A wyvern caused the scar.',
      'Change it to say the Iron Peaks battle instead.',
    );

    expect(output.decision).toBe('supersede');
    expect(output.revisedCandidate).toBe(
      'The scar came from the Battle of the Iron Peaks, not a wyvern.',
    );
  });

  it('emit() writes an authoring-decision statement with correct fields', async () => {
    const { DecisionFormalizer } = await import('../../src/agents/decision-formalizer.js');
    const formalizer = new DecisionFormalizer({ modelSpec: 'anthropic:claude-3-haiku-20240307' });

    const oqId = await makeOpenQuestion('Rune origin', 'An ancient ward left by elves.');
    const output = {
      decision: 'promote' as const,
      rationale: 'Fits the elven history perfectly.',
    };

    const adId = await formalizer.emit(governanceScope, oqId, output, GM_USER, [oqId]);
    testStatementIds.push(adId);

    const [row] = await db.select().from(statements).where(eq(statements.id, adId)).limit(1);

    expect(row).toBeDefined();
    expect(row!.kind).toBe('authoring-decision');
    expect(row!.scopeType).toBe('governance');
    expect(row!.scopeKey).toBe(ADMIN_ROOM_ID);
    expect(row!.authorId).toBe(GM_USER);
    expect((row!.fields as Record<string, unknown>).openQuestionId).toBe(oqId);
    expect((row!.fields as Record<string, unknown>).decision).toBe('promote');
    expect((row!.fields as Record<string, unknown>).rationale).toBe(
      'Fits the elven history perfectly.',
    );
  });
});

describe('integration: openQuestionResolverWorker', () => {
  it('promote: emits canon-reference to world + supersedes OQ as surfaced', async () => {
    const { openQuestionResolverWorker } =
      await import('../../src/workers/open-question-resolver.js');

    const oqId = await makeOpenQuestion('Dungeon origin', 'Built by dwarves in the Third Age.');

    const adId = await emitAgentStatement({
      scope: governanceScope,
      kind: 'authoring-decision',
      content: 'Decision: promote. Accepted.',
      authorId: GM_USER,
      fields: {
        openQuestionId: oqId,
        decision: 'promote',
        rationale: 'Accepted.',
      },
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
    expect(canon!.content).toBe('Built by dwarves in the Third Age.');
    testStatementIds.push(canon!.id);

    const superseding = await db.select().from(statements).where(eq(statements.supersedes, oqId));

    expect(superseding).toHaveLength(1);
    expect((superseding[0]!.fields as Record<string, unknown>).stage).toBe('surfaced');
    expect((superseding[0]!.fields as Record<string, unknown>).rejected).toBeUndefined();
    testStatementIds.push(superseding[0]!.id);
  });

  it('reject: supersedes OQ as surfaced with rejected:true, no world canon', async () => {
    const { openQuestionResolverWorker } =
      await import('../../src/workers/open-question-resolver.js');

    const oqId = await makeOpenQuestion('Castle age', 'The castle is 20 years old.');

    const adId = await emitAgentStatement({
      scope: governanceScope,
      kind: 'authoring-decision',
      content: 'Decision: reject. Contradicts lore.',
      authorId: GM_USER,
      fields: {
        openQuestionId: oqId,
        decision: 'reject',
        rationale: 'Contradicts established lore.',
      },
    });
    testStatementIds.push(adId);

    await openQuestionResolverWorker.handler(
      { id: adId, kind: 'authoring-decision', scopeType: 'governance', scopeKey: ADMIN_ROOM_ID },
      { logger, now: () => new Date() },
    );

    const superseding = await db.select().from(statements).where(eq(statements.supersedes, oqId));

    expect(superseding).toHaveLength(1);
    expect((superseding[0]!.fields as Record<string, unknown>).stage).toBe('surfaced');
    expect((superseding[0]!.fields as Record<string, unknown>).rejected).toBe(true);
    testStatementIds.push(superseding[0]!.id);

    const worldRows = await db.select().from(statements).where(eq(statements.scopeType, 'world'));
    const unrelated = worldRows.filter((r) => Array.isArray(r.sources) && r.sources.includes(adId));
    expect(unrelated).toHaveLength(0);
  });

  it('supersede: supersedes OQ with revisedCandidate, stage remains deferred', async () => {
    const { openQuestionResolverWorker } =
      await import('../../src/workers/open-question-resolver.js');

    const oqId = await makeOpenQuestion('Dragon name', 'The dragon is called Pyraxis.');

    const revised = 'The dragon is called Ignaroth the Scorched.';
    const adId = await emitAgentStatement({
      scope: governanceScope,
      kind: 'authoring-decision',
      content: 'Decision: supersede. Revised name.',
      authorId: GM_USER,
      fields: {
        openQuestionId: oqId,
        decision: 'supersede',
        rationale: 'Better name.',
        revisedCandidate: revised,
      },
    });
    testStatementIds.push(adId);

    await openQuestionResolverWorker.handler(
      { id: adId, kind: 'authoring-decision', scopeType: 'governance', scopeKey: ADMIN_ROOM_ID },
      { logger, now: () => new Date() },
    );

    const superseding = await db.select().from(statements).where(eq(statements.supersedes, oqId));

    expect(superseding).toHaveLength(1);
    const newOq = superseding[0]!;
    expect((newOq.fields as Record<string, unknown>).stage).toBe('deferred');
    expect((newOq.fields as Record<string, unknown>).candidate).toBe(revised);
    expect((newOq.fields as Record<string, unknown>).rejected).toBeUndefined();
    expect(newOq.content).toContain(revised);
    testStatementIds.push(newOq.id);
  });
});
