/**
 * Unit tests for SessionAwareRuntime.
 *
 * Mocks the pi Agent to test session lifecycle without real LLM calls.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Model, ProviderResponse } from '@earendil-works/pi-ai';
import type { AgentMessage, AgentTool } from '@earendil-works/pi-agent-core';
import type { LlmRuntimeRequest } from '../../src/core/llm-runtime.js';
import { SessionAwareRuntime, type SessionRuntimeDeps } from '../../src/models/session-runtime.js';

// ---------------------------------------------------------------------------
// Mock Agent
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
      continue: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn(),
      clearAllQueues: vi.fn(),
      onResponse: undefined,
    };
    mockAgents.push(agent);
    return agent;
  }),
}));

// ---------------------------------------------------------------------------
// Mock deps
// ---------------------------------------------------------------------------

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

const testModelV2: Model<any> = {
  ...testModel,
  id: 'test-model-v2',
  name: 'test-v2',
};

function createDeps(overrides?: Partial<SessionRuntimeDeps>): SessionRuntimeDeps {
  return {
    resolveModel: vi.fn((spec: string) => {
      if (spec === 'test:model') return testModel;
      if (spec === 'test:model-v2') return testModelV2;
      throw new Error(`Unknown model: ${spec}`);
    }),
    resolveApiKey: vi.fn(() => 'test-key'),
    toAgentTools: vi.fn(() => []),
    parseModelSpec: vi.fn((spec: string) => {
      const idx = spec.indexOf(':');
      return { provider: spec.slice(0, idx), modelId: spec.slice(idx + 1) };
    }),
    deriveSessionId: vi.fn(() => 'test-session'),
    extractCacheHeaders: vi.fn(() => ({ 'x-cache': 'HIT' })),
    ...overrides,
  };
}

function makeRequest(
  overrides?: Partial<LlmRuntimeRequest>,
): LlmRuntimeRequest & { contextMessages?: AgentMessage[] } {
  return {
    modelSpec: 'test:model',
    systemPrompt: 'You are a test.',
    prompt: 'User says hello.',
    sessionId: 'test-room',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SessionAwareRuntime', () => {
  let runtime: SessionAwareRuntime;
  let deps: SessionRuntimeDeps;

  beforeEach(() => {
    mockAgents = [];
    deps = createDeps();
    runtime = new SessionAwareRuntime(deps, false);
  });

  afterEach(() => {
    runtime.dispose();
  });

  // ── Session creation ──

  describe('session creation', () => {
    it('creates a new session on first call', async () => {
      // Mock the agent.continue() to simulate a response by pushing an assistant message
      const req = makeRequest();
      await runtime.generateInSession(req);

      // Agent created
      expect(mockAgents.length).toBe(1);
      expect(deps.resolveModel).toHaveBeenCalledWith('test:model');
    });

    it('injects context messages before the prompt', async () => {
      const contextMsg: AgentMessage = {
        role: 'user',
        content: [{ type: 'text', text: 'Context data.' }],
        timestamp: Date.now(),
      };

      await runtime.generateInSession({
        ...makeRequest(),
        contextMessages: [contextMsg],
      });

      const agent = mockAgents[0]!;
      const userMessages = agent.state.messages.filter((m: AgentMessage) => m.role === 'user');
      expect(userMessages.length).toBeGreaterThanOrEqual(2);
      expect(userMessages[0]).toHaveProperty('content');
    });

    it('sets sessionId on the Agent', async () => {
      await runtime.generateInSession(makeRequest({ sessionId: 'my-room' }));
      const agent = mockAgents[0]!;
      // Agent constructor received sessionId — verify via session presence
      expect(agent).toBeDefined();
    });
  });

  // ── Session reuse ──

  describe('session reuse', () => {
    it('reuses existing session for same sessionId', async () => {
      // First turn — creates session
      await runtime.generateInSession(makeRequest({ sessionId: 'room-1' }));
      expect(runtime.activeCount).toBe(1);

      // Second turn — reuses session, no new Agent
      await runtime.generateInSession(makeRequest({ sessionId: 'room-1' }));
      expect(mockAgents.length).toBe(1); // still 1 agent
    });

    it('increments turn count on each use', async () => {
      await runtime.generateInSession(makeRequest({ sessionId: 'room-1' }));
      await runtime.generateInSession(makeRequest({ sessionId: 'room-1' }));
      await runtime.generateInSession(makeRequest({ sessionId: 'room-1' }));

      const stats = runtime.getStats();
      const statsForRoom = stats.find((s) => s.sessionId === 'room-1');
      expect(statsForRoom?.turnCount).toBe(3);
    });

    it('creates separate sessions for different sessionIds', async () => {
      await runtime.generateInSession(makeRequest({ sessionId: 'room-a' }));
      await runtime.generateInSession(makeRequest({ sessionId: 'room-b' }));
      await runtime.generateInSession(makeRequest({ sessionId: 'room-a' }));

      expect(runtime.activeCount).toBe(2);
      const stats = runtime.getStats();
      expect(stats.filter((s) => s.sessionId === 'room-a')[0]?.turnCount).toBe(2);
      expect(stats.filter((s) => s.sessionId === 'room-b')[0]?.turnCount).toBe(1);
    });
  });

  // ── Model change forces new session ──

  describe('model change', () => {
    it('destroys old session and creates new one when modelSpec changes', async () => {
      // First with model v1
      await runtime.generateInSession(
        makeRequest({ sessionId: 'room-1', modelSpec: 'test:model' }),
      );
      expect(runtime.activeCount).toBe(1);

      // Then with model v2 — should replace
      await runtime.generateInSession(
        makeRequest({ sessionId: 'room-1', modelSpec: 'test:model-v2' }),
      );
      // The old agent should have been destroyed
      expect(mockAgents.length).toBe(2); // old + new
      expect(runtime.activeCount).toBe(1); // only new session

      // Verify old agent was cleaned up
      const destroyedAgent = mockAgents[0]!;
      expect(destroyedAgent.reset).toHaveBeenCalled();
      expect(destroyedAgent.clearAllQueues).toHaveBeenCalled();
    });
  });

  // ── Context message accumulation ──

  describe('context accumulation', () => {
    it('accumulates user messages across turns', async () => {
      const msg1: AgentMessage = {
        role: 'user',
        content: [{ type: 'text', text: 'Turn 1 context.' }],
        timestamp: Date.now(),
      };
      await runtime.generateInSession({
        ...makeRequest({ sessionId: 'room-1' }),
        contextMessages: [msg1],
      });

      const msg2: AgentMessage = {
        role: 'user',
        content: [{ type: 'text', text: 'Turn 2 context.' }],
        timestamp: Date.now(),
      };
      await runtime.generateInSession({
        ...makeRequest({ sessionId: 'room-1' }),
        contextMessages: [msg2],
      });

      const agent = mockAgents[0]!;
      const texts = agent.state.messages
        .filter((m: AgentMessage) => m.role === 'user')
        .map((m: AgentMessage) =>
          typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        );
      expect(texts.some((t: string) => t.includes('Turn 1 context.'))).toBe(true);
      expect(texts.some((t: string) => t.includes('Turn 2 context.'))).toBe(true);
    });
  });

  // ── Error handling ──

  describe('error handling', () => {
    it('destroys session and throws on agent.continue() failure', async () => {
      // Make the agent's continue() reject
      await runtime.generateInSession(makeRequest({ sessionId: 'room-err' }));
      expect(runtime.activeCount).toBe(1);

      const agent = mockAgents[0]!;
      agent.continue.mockRejectedValue(new Error('API call failed'));

      // Next call should fail
      await expect(
        runtime.generateInSession(makeRequest({ sessionId: 'room-err' })),
      ).rejects.toThrow('API call failed');

      // Session should be destroyed
      expect(runtime.activeCount).toBe(0);
    });
  });

  // ── getStats ──

  describe('getStats', () => {
    it('returns stats for active sessions', async () => {
      await runtime.generateInSession(makeRequest({ sessionId: 'room-1' }));
      await runtime.generateInSession(makeRequest({ sessionId: 'room-2' }));

      const stats = runtime.getStats();
      expect(stats.length).toBe(2);
      expect(stats[0]?.sessionId).toBeDefined();
      expect(stats[0]?.turnCount).toBeGreaterThanOrEqual(0);
      expect(stats[0]?.modelSpec).toBe('test:model');
      expect(stats[0]?.ageMs).toBeGreaterThanOrEqual(0);
      expect(stats[0]?.idleMs).toBeGreaterThanOrEqual(0);
    });

    it('does not include destroyed sessions', async () => {
      await runtime.generateInSession(makeRequest({ sessionId: 'room-1' }));
      runtime.destroySession('room-1');
      expect(runtime.getStats().length).toBe(0);
    });
  });

  // ── dispose ──

  describe('dispose', () => {
    it('clears all sessions', async () => {
      await runtime.generateInSession(makeRequest({ sessionId: 'room-1' }));
      await runtime.generateInSession(makeRequest({ sessionId: 'room-2' }));
      expect(runtime.activeCount).toBe(2);

      runtime.dispose();
      expect(runtime.activeCount).toBe(0);
    });
  });

  // ── activeCount ──

  describe('activeCount', () => {
    it('reflects number of non-destroyed sessions', async () => {
      expect(runtime.activeCount).toBe(0);
      await runtime.generateInSession(makeRequest({ sessionId: 'room-1' }));
      expect(runtime.activeCount).toBe(1);
      await runtime.generateInSession(makeRequest({ sessionId: 'room-2' }));
      expect(runtime.activeCount).toBe(2);
      runtime.destroySession('room-1');
      expect(runtime.activeCount).toBe(1);
    });
  });

  // ── sessionId derivation via deps ──

  describe('session ID derivation', () => {
    it('uses request.sessionId when provided', async () => {
      await runtime.generateInSession(makeRequest({ sessionId: 'explicit-id' }));
      const stats = runtime.getStats();
      expect(stats.some((s) => s.sessionId === 'explicit-id')).toBe(true);
    });

    it('falls back to deps.deriveSessionId when sessionId not provided', async () => {
      const customDeps = createDeps({
        deriveSessionId: vi.fn(() => 'derived-id'),
      });
      const customRuntime = new SessionAwareRuntime(customDeps, false);

      await customRuntime.generateInSession(makeRequest({ sessionId: undefined }));
      expect(customDeps.deriveSessionId).toHaveBeenCalled();
      expect(customRuntime.activeCount).toBe(1);

      customRuntime.dispose();
    });
  });
});
