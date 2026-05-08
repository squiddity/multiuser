/**
 * Integration tests for session-aware narrator continuity.
 *
 * Verifies that successive narrator.compose() calls with the same roomId
 * reuse the same session (persistent Agent), accumulate turns, and that
 * separate rooms get separate sessions.
 *
 * Uses the same mock pi-runtime approach as narrator-roundtrip.test.ts
 * and explicitly provides a SessionAwareRuntime to the Narrator.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, close } from '../../src/store/client.js';
import { migrate } from '../../src/store/migrate.js';
import { seed } from '../../src/store/seed.js';
import { appendAndIndex } from '../../src/store/vectors.js';
import { roleGrants, statements } from '../../src/store/schema.js';
import { eq } from 'drizzle-orm';
import type { Scope } from '../../src/core/statement.js';
import type { ProviderResponse, Model } from '@earendil-works/pi-ai';
import type { AgentMessage, AgentTool } from '@earendil-works/pi-agent-core';
import type { LlmRuntimeRequest } from '../../src/core/llm-runtime.js';
import { SessionAwareRuntime, type SessionRuntimeDeps } from '../../src/models/session-runtime.js';

// ---------------------------------------------------------------------------
// Mock pi-runtime (one-shot fallback won't be used since we pass sessionRuntime)
// ---------------------------------------------------------------------------

vi.mock('../../src/models/pi-runtime.js', () => ({
  createPiAiLlmRuntime: vi.fn(() => ({
    generate: () => {
      throw new Error('one-shot runtime should not be used');
    },
  })),
}));

// ---------------------------------------------------------------------------
// Mock pi Agent
// ---------------------------------------------------------------------------

interface MockAgent {
  state: {
    messages: AgentMessage[];
    isStreaming: boolean;
  };
  continue: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
  clearAllQueues: ReturnType<typeof vi.fn>;
  onResponse: ((response: ProviderResponse, model: Model<any>) => void) | undefined;
}

let mockAgents: MockAgent[] = [];

vi.mock('@earendil-works/pi-agent-core', () => ({
  Agent: vi.fn().mockImplementation(() => {
    const agent: MockAgent = {
      state: {
        messages: [],
        isStreaming: false,
      },
      continue: vi.fn().mockImplementation(function (this: MockAgent) {
        // Simulate an assistant response — push an assistant message with JSON output
        this.state.messages.push({
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: JSON.stringify({ kind: 'narration', content: 'The world turns.' }),
            },
          ],
          api: 'openai-completions',
          provider: 'test',
          model: 'test-model',
          usage: {
            input: 50,
            output: 10,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 60,
            cost: { input: 0.01, output: 0.01, cacheRead: 0, cacheWrite: 0, total: 0.02 },
          },
          stopReason: 'stop',
          timestamp: Date.now(),
        } satisfies AgentMessage);
        return Promise.resolve();
      }),
      reset: vi.fn(),
      clearAllQueues: vi.fn(),
      onResponse: undefined,
    };
    mockAgents.push(agent);
    return agent;
  }),
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const PARTY_ROOM_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ROOM_ID = '22222222-2222-2222-2222-222222222222';
const PLAYER_USER = 'int-player-1';

const testStatementIds: string[] = [];
const testGrantIds: string[] = [
  'c0000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000002',
];

// Mock model for session runtime deps
const testModel: Model<any> = {
  id: 'test-model',
  name: 'test',
  api: 'openai-completions',
  provider: 'test',
  baseUrl: 'http://test',
  reasoning: false,
  input: ['text'],
  cost: { input: 0.1, output: 0.4, cacheRead: 0.05, cacheWrite: 0.1 },
  contextWindow: 128000,
  maxTokens: 4096,
};

function createSessionDeps(): SessionRuntimeDeps {
  return {
    resolveModel: vi.fn(() => testModel),
    resolveApiKey: vi.fn(() => 'test-key'),
    toAgentTools: vi.fn(() => []),
    parseModelSpec: vi.fn((spec: string) => {
      const idx = spec.indexOf(':');
      return { provider: spec.slice(0, idx), modelId: spec.slice(idx + 1) };
    }),
    deriveSessionId: vi.fn((request: LlmRuntimeRequest) => {
      if (request.metadata?.roomId) return `narrator:${request.metadata.roomId}`;
      return 'test-session';
    }),
    extractCacheHeaders: vi.fn(() => ({})),
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  await migrate();
  await seed();

  // Clean statements, seed grants, and seed test data
  await db.delete(statements);
  await db.delete(roleGrants);

  // Insert grants for the test user into both rooms
  await db.insert(roleGrants).values([
    {
      id: testGrantIds[0],
      userId: PLAYER_USER,
      roomId: PARTY_ROOM_ID,
      roleId: '33333333-3333-3333-3333-333333333333',
      grantedBy: 'system',
      precedence: 0,
    },
    {
      id: testGrantIds[1],
      userId: PLAYER_USER,
      roomId: ADMIN_ROOM_ID,
      roleId: '44444444-4444-4444-4444-444444444444',
      grantedBy: 'system',
      precedence: 0,
    },
  ]);

  // World canon
  const worldId = await appendAndIndex({
    scope: { type: 'world' } as Scope,
    kind: 'canon-reference',
    authorType: 'system',
    authorId: 'bootstrap',
    content: 'The dragon gods rule the eastern peaks with fiery breath.',
  });
  testStatementIds.push(worldId);

  // Party-scope narration (user has grants for PARTY_ROOM_ID via seed)
  const partyId = await appendAndIndex({
    scope: { type: 'party', partyId: PARTY_ROOM_ID } as Scope,
    kind: 'narration',
    authorType: 'agent',
    authorId: 'narrator',
    content: 'A dragon circled above the mountain, its shadow falling over the party.',
  });
  testStatementIds.push(partyId);

  // Admin-scope statement for the second room
  const adminId = await appendAndIndex({
    scope: { type: 'meta', roomId: ADMIN_ROOM_ID } as Scope,
    kind: 'narration',
    authorType: 'agent',
    authorId: 'narrator',
    content: 'The GM chamber is quiet, maps spread across the table.',
  });
  testStatementIds.push(adminId);

  originalBackend = await (async () => {
    const backend = new PgvectorSearchBackend(embedder);
    setBackend(backend);
    return backend;
  })();
});

afterAll(async () => {
  for (const id of testStatementIds) {
    await db.delete(statements).where(eq(statements.id, id));
  }
  for (const id of testGrantIds) {
    await db.delete(roleGrants).where(eq(roleGrants.id, id));
  }
  await close();
});

beforeEach(() => {
  mockAgents = [];
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('integration: session-aware narrator continuity', () => {
  it('reuses the same session for successive compose() calls in the same room', async () => {
    const sessionDeps = createSessionDeps();
    const sessionRuntime = new SessionAwareRuntime(sessionDeps, false);
    const { Narrator } = await import('../../src/agents/narrator.js');

    const narrator = new Narrator({
      modelSpec: 'test:model',
      campaignId: null,
      adminRoomId: ADMIN_ROOM_ID,
      sessionRuntime,
    });

    // First turn
    const output1 = await narrator.compose(PARTY_ROOM_ID, PLAYER_USER, 'We look at the dragon.');
    expect(output1.content).toBe('The world turns.');

    // Only 1 Agent created
    expect(mockAgents.length).toBe(1);

    // Second turn — same room → same session → same Agent
    const output2 = await narrator.compose(PARTY_ROOM_ID, PLAYER_USER, 'We approach carefully.');
    expect(output2.content).toBe('The world turns.');

    // Still only 1 Agent (session reused)
    expect(mockAgents.length).toBe(1);

    // Session should have turnCount = 2
    const stats = sessionRuntime.getStats();
    const sessionStats = stats.find((s) => s.sessionId === `narrator:${PARTY_ROOM_ID}`);
    expect(sessionStats).toBeDefined();
    expect(sessionStats!.turnCount).toBe(2);

    sessionRuntime.dispose();
  });

  it('creates separate sessions for different rooms', async () => {
    const sessionDeps = createSessionDeps();
    const sessionRuntime = new SessionAwareRuntime(sessionDeps, false);
    const { Narrator } = await import('../../src/agents/narrator.js');

    const narrator = new Narrator({
      modelSpec: 'test:model',
      campaignId: null,
      adminRoomId: ADMIN_ROOM_ID,
      sessionRuntime,
    });

    // PARTY_ROOM_ID and ADMIN_ROOM_ID are both seeded with grants
    await narrator.compose(PARTY_ROOM_ID, PLAYER_USER, 'Hello party.');
    await narrator.compose(ADMIN_ROOM_ID, PLAYER_USER, 'Hello admin.');
    await narrator.compose(PARTY_ROOM_ID, PLAYER_USER, 'Hello party again.');

    // 2 Agents — one per room
    expect(mockAgents.length).toBe(2);

    const stats = sessionRuntime.getStats();
    const statsA = stats.find((s) => s.sessionId === `narrator:${PARTY_ROOM_ID}`);
    const statsB = stats.find((s) => s.sessionId === `narrator:${ADMIN_ROOM_ID}`);

    expect(statsA).toBeDefined();
    expect(statsA!.turnCount).toBe(2);
    expect(statsB).toBeDefined();
    expect(statsB!.turnCount).toBe(1);

    sessionRuntime.dispose();
  });

  it('accumulates messages in the session across turns', async () => {
    const sessionDeps = createSessionDeps();
    const sessionRuntime = new SessionAwareRuntime(sessionDeps, false);
    const { Narrator } = await import('../../src/agents/narrator.js');

    const narrator = new Narrator({
      modelSpec: 'test:model',
      campaignId: null,
      adminRoomId: ADMIN_ROOM_ID,
      sessionRuntime,
    });

    await narrator.compose(PARTY_ROOM_ID, PLAYER_USER, 'First action.');
    await narrator.compose(PARTY_ROOM_ID, PLAYER_USER, 'Second action.');
    await narrator.compose(PARTY_ROOM_ID, PLAYER_USER, 'Third action.');

    const agent = mockAgents[0]!;
    const userTexts = agent.state.messages
      .filter((m: AgentMessage) => m.role === 'user')
      .map((m: AgentMessage) => {
        if (typeof m.content === 'string') return m.content;
        if (Array.isArray(m.content)) return m.content.map((c: any) => c.text || '').join('');
        return '';
      });

    // Should see context from all three turns
    expect(userTexts.some((t: string) => t.includes('First action.'))).toBe(true);
    expect(userTexts.some((t: string) => t.includes('Second action.'))).toBe(true);
    expect(userTexts.some((t: string) => t.includes('Third action.'))).toBe(true);

    sessionRuntime.dispose();
  });

  it('includes statement store context in the first turn', async () => {
    const sessionDeps = createSessionDeps();
    const sessionRuntime = new SessionAwareRuntime(sessionDeps, false);
    const { Narrator } = await import('../../src/agents/narrator.js');

    const narrator = new Narrator({
      modelSpec: 'test:model',
      campaignId: null,
      adminRoomId: ADMIN_ROOM_ID,
      sessionRuntime,
    });

    const output = await narrator.compose(PARTY_ROOM_ID, PLAYER_USER, 'Tell me about the peaks.');

    // Agent should have received at least one user message with context
    const agent = mockAgents[0]!;
    const firstUserMsg = agent.state.messages.find((m: AgentMessage) => m.role === 'user');
    expect(firstUserMsg).toBeDefined();

    const content =
      typeof firstUserMsg!.content === 'string'
        ? firstUserMsg!.content
        : JSON.stringify(firstUserMsg!.content);

    // Should contain delimited sections
    expect(content).toContain('## Latest Player Action');
    expect(content).toContain('Tell me about the peaks.');

    // Should contain statement context with seeded party narration
    expect(content).toContain('## Statement Store Context');
    expect(content).toContain('dragon circled');

    expect(output.content).toBe('The world turns.');

    sessionRuntime.dispose();
  });

  it('reports session stats accurately', async () => {
    const sessionDeps = createSessionDeps();
    const sessionRuntime = new SessionAwareRuntime(sessionDeps, false);
    const { Narrator } = await import('../../src/agents/narrator.js');

    const narrator = new Narrator({
      modelSpec: 'test:model',
      campaignId: null,
      adminRoomId: ADMIN_ROOM_ID,
      sessionRuntime,
    });

    // No sessions yet
    expect(sessionRuntime.activeCount).toBe(0);

    await narrator.compose(PARTY_ROOM_ID, PLAYER_USER, 'Action 1.');
    expect(sessionRuntime.activeCount).toBe(1);

    await narrator.compose(PARTY_ROOM_ID, PLAYER_USER, 'Action 2.');
    expect(sessionRuntime.activeCount).toBe(1); // same session reused

    const stats = sessionRuntime.getStats();
    expect(stats.length).toBe(1);

    const s = stats[0]!;
    expect(s.sessionId).toBe(`narrator:${PARTY_ROOM_ID}`);
    expect(s.turnCount).toBe(2);
    expect(s.modelSpec).toBe('test:model');
    expect(s.ageMs).toBeGreaterThanOrEqual(0);
    expect(s.idleMs).toBeGreaterThanOrEqual(0);

    sessionRuntime.dispose();
    expect(sessionRuntime.activeCount).toBe(0);
  });

  it('falls back to one-shot when session runtime is unavailable', async () => {
    // Pass no sessionRuntime and no llmRuntime to the Narrator
    // The Narrator will lazily try to import getSessionRuntime from the mocked
    // pi-runtime, fail, and fall back to the (also-mocked) createPiAiLlmRuntime.
    const { Narrator } = await import('../../src/agents/narrator.js');

    // The mock for createPiAiLlmRuntime throws "one-shot runtime should not be used"
    // So this should still fail... let me use the MockAgent pattern differently.
    // Actually, we expect the fallback to be tried. Since the mock throws,
    // the Narrator should return its EMPTY_OUTPUT_FALLBACK.
    const narrator = new Narrator({
      modelSpec: 'test:model',
      campaignId: null,
      adminRoomId: ADMIN_ROOM_ID,
      // no sessionRuntime — uses fallback path
    });

    const output = await narrator.compose(PARTY_ROOM_ID, PLAYER_USER, 'Hello.');
    // The one-shot mock throws, so we get the error fallback
    expect(output.content).toBe(
      'The world stirs, but the answer catches in the wind before it can be spoken.',
    );
  });
});
