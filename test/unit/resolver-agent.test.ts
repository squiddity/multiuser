import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AgentBackedResolver } from '../../src/resolvers/agent.js';
import type { AgentBackedResolverConfig } from '../../src/resolvers/types.js';
import type { ResolveRequest as ResolveRequestType } from '../../src/core/resolver.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const DND5E_INSTRUCTIONS = readFileSync(
  join(__dirname, '../../src/resolvers/dnd5e/instructions.md'),
  'utf-8',
);

const mockResolveResult = {
  outcome: { result: 'success' as const, margin: 3 },
  rolls: [{ dice: '1d20+3', values: [15], modifier: 3, total: 18, purpose: 'Stealth check' }],
  effects: [],
  narrationHook: 'The character slips past the guards unseen.',
  confidence: 1,
};

const mockResolveResultJSON = JSON.stringify(mockResolveResult);

const mockLlmGenerate = vi.fn();
const mockCreatePiAiLlmRuntime = vi.fn(() => ({
  generate: (...args: unknown[]) => mockLlmGenerate(...args),
}));

vi.mock('../../src/models/pi-runtime.js', () => ({
  createPiAiLlmRuntime: (...args: unknown[]) => mockCreatePiAiLlmRuntime(...args),
}));

vi.mock('../../src/store/retrieval.js', () => ({
  retrieveByScopes: vi.fn(async () => []),
}));

vi.mock('../../src/config/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function makeConfig(overrides: Partial<AgentBackedResolverConfig> = {}): AgentBackedResolverConfig {
  return {
    systemId: 'dnd5e',
    modelSpec: 'openai:test-model',
    instructions: {
      systemPrompt: DND5E_INSTRUCTIONS,
    },
    ...overrides,
  };
}

function makeRequest(overrides: Partial<ResolveRequestType> = {}): ResolveRequestType {
  return {
    system: 'dnd5e',
    kind: 'skill-check',
    actor: '00000000-0000-0000-0000-000000000001',
    action: { name: 'Stealth', params: {} },
    modifiers: {},
    contextStatements: [],
    rollPolicy: 'roll-now',
    ...overrides,
  };
}

describe('AgentBackedResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves a skill-check with mocked LLM response', async () => {
    mockLlmGenerate.mockResolvedValue({ text: mockResolveResultJSON });

    const resolver = new AgentBackedResolver(makeConfig());
    const result = await resolver.resolve(makeRequest());

    expect(result.outcome.result).toBe('success');
    expect(result.outcome.margin).toBe(3);
    expect(result.rolls).toHaveLength(1);
    expect(result.rolls[0]!.purpose).toBe('Stealth check');
    expect(result.narrationHook).toBe('The character slips past the guards unseen.');
    expect(result.confidence).toBe(1);
  });

  it('passes model spec to runtime', async () => {
    mockLlmGenerate.mockResolvedValue({ text: mockResolveResultJSON });

    const resolver = new AgentBackedResolver(
      makeConfig({ modelSpec: 'anthropic:claude-opus-4-6' }),
    );
    await resolver.resolve(makeRequest());

    expect(mockCreatePiAiLlmRuntime).toHaveBeenCalled();
    expect(mockLlmGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ modelSpec: 'anthropic:claude-opus-4-6' }),
    );
  });

  it('returns failure fallback when LLM throws', async () => {
    mockLlmGenerate.mockRejectedValue(new Error('API error'));

    const resolver = new AgentBackedResolver(makeConfig());
    const result = await resolver.resolve(makeRequest());

    expect(result.outcome.result).toBe('failure');
    expect(result.rolls).toEqual([]);
    expect(result.confidence).toBe(0);
    expect(result.narrationHook).toContain('Stealth');
  });

  it('returns failure fallback when LLM returns invalid JSON', async () => {
    mockLlmGenerate.mockResolvedValue({ text: 'not json at all' });

    const resolver = new AgentBackedResolver(makeConfig());
    const result = await resolver.resolve(makeRequest());

    expect(result.outcome.result).toBe('failure');
    expect(result.confidence).toBe(0);
  });

  it('returns failure fallback when LLM returns valid JSON that does not match schema', async () => {
    mockLlmGenerate.mockResolvedValue({
      text: JSON.stringify({ wrong: 'shape' }),
    });

    const resolver = new AgentBackedResolver(makeConfig());
    const result = await resolver.resolve(makeRequest());

    expect(result.outcome.result).toBe('failure');
  });

  it('includes action name in user prompt', async () => {
    mockLlmGenerate.mockResolvedValue({ text: mockResolveResultJSON });

    const resolver = new AgentBackedResolver(makeConfig());
    await resolver.resolve(makeRequest({ action: { name: 'Perception', params: {} } }));

    const callArgs = mockLlmGenerate.mock.calls[0]![0] as { prompt: string };
    expect(callArgs.prompt).toContain('Perception');
    expect(callArgs.prompt).toContain('skill-check');
  });

  it('includes seed in user prompt when provided', async () => {
    mockLlmGenerate.mockResolvedValue({ text: mockResolveResultJSON });

    const resolver = new AgentBackedResolver(makeConfig());
    await resolver.resolve(makeRequest({ seed: 'deterministic-test' }));

    const callArgs = mockLlmGenerate.mock.calls[0]![0] as { prompt: string };
    expect(callArgs.prompt).toContain('deterministic-test');
  });

  it('includes advantage modifier in system prompt', async () => {
    mockLlmGenerate.mockResolvedValue({ text: mockResolveResultJSON });

    const resolver = new AgentBackedResolver(makeConfig());
    await resolver.resolve(makeRequest({ modifiers: { advantage: true, circumstantial: [] } }));

    const callArgs = mockLlmGenerate.mock.calls[0]![0] as { systemPrompt: string };
    expect(callArgs.systemPrompt).toContain('advantage');
  });

  it('uses instructions systemPrompt', async () => {
    mockLlmGenerate.mockResolvedValue({ text: mockResolveResultJSON });

    const customPrompt = 'You are a Pathfinder 2e resolver.';
    const resolver = new AgentBackedResolver(
      makeConfig({ instructions: { systemPrompt: customPrompt } }),
    );
    await resolver.resolve(makeRequest());

    const callArgs = mockLlmGenerate.mock.calls[0]![0] as { systemPrompt: string };
    expect(callArgs.systemPrompt).toContain('Pathfinder 2e');
  });

  it('stores system id', () => {
    const resolver = new AgentBackedResolver(makeConfig({ systemId: 'pf2e' }));
    expect(resolver.system).toBe('pf2e');
  });
});

describe('AgentBackedResolver describeActions', () => {
  it('returns empty array when no action metadata', async () => {
    const resolver = new AgentBackedResolver(makeConfig());
    const actions = await resolver.describeActions('actor-id', []);
    expect(actions).toEqual([]);
  });

  it('returns configured actions from actionMetadata', async () => {
    const resolver = new AgentBackedResolver(
      makeConfig({
        instructions: {
          systemPrompt: DND5E_INSTRUCTIONS,
          actionMetadata: {
            stealth: { name: 'Stealth', label: 'Stealth (DEX)', kind: 'skill-check' as const },
            athletics: {
              name: 'Athletics',
              label: 'Athletics (STR)',
              kind: 'skill-check' as const,
            },
          },
        },
      }),
    );
    const actions = await resolver.describeActions('actor-id', []);

    expect(actions).toHaveLength(2);
    expect(actions[0]!.name).toBe('Stealth');
    expect(actions[0]!.valid).toBe(true);
    expect(actions[1]!.name).toBe('Athletics');
  });
});
