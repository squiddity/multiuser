import { afterEach, describe, expect, it, vi } from 'vitest';

const mockAnthropic = vi.fn((slug: string) => ({ modelId: `anthropic:${slug}` }));
const mockOpenai = vi.fn((slug: string) => ({ modelId: `openai:${slug}` }));
const mockOpenrouter = vi.fn((slug: string) => ({ modelId: `openrouter:${slug}` }));

let anthropicProvider: typeof mockAnthropic | null = mockAnthropic;
let openaiProvider: typeof mockOpenai | null = mockOpenai;
let openrouterProvider: typeof mockOpenrouter | null = mockOpenrouter;

vi.mock('../../src/models/providers.js', () => ({
  get anthropic() {
    return anthropicProvider;
  },
  get openai() {
    return openaiProvider;
  },
  get openrouter() {
    return openrouterProvider;
  },
}));

import { resolveModel } from '../../src/models/registry.js';

describe('resolveModel', () => {
  afterEach(() => {
    anthropicProvider = mockAnthropic;
    openaiProvider = mockOpenai;
    openrouterProvider = mockOpenrouter;
    vi.clearAllMocks();
  });

  it('resolves anthropic spec', () => {
    const model = resolveModel('anthropic:claude-opus-4-6');
    expect(mockAnthropic).toHaveBeenCalledWith('claude-opus-4-6');
    expect(model).toEqual({ modelId: 'anthropic:claude-opus-4-6' });
  });

  it('resolves openai spec', () => {
    const model = resolveModel('openai:gpt-4o-mini');
    expect(mockOpenai).toHaveBeenCalledWith('gpt-4o-mini');
    expect(model).toEqual({ modelId: 'openai:gpt-4o-mini' });
  });

  it('resolves openrouter spec', () => {
    const model = resolveModel('openrouter:qwen/qwen-2.5-72b-instruct');
    expect(mockOpenrouter).toHaveBeenCalledWith('qwen/qwen-2.5-72b-instruct');
    expect(model).toEqual({ modelId: 'openrouter:qwen/qwen-2.5-72b-instruct' });
  });

  it('throws on unknown provider', () => {
    expect(() => resolveModel('groq:foo')).toThrow(/unknown model provider/i);
  });

  it('throws on missing colon', () => {
    expect(() => resolveModel('anthropic')).toThrow(/must be.*provider.*slug/i);
  });

  it('throws on empty slug', () => {
    expect(() => resolveModel('anthropic:')).toThrow(/missing slug/i);
  });

  it('throws when anthropic API key not configured', () => {
    anthropicProvider = null;
    expect(() => resolveModel('anthropic:claude-opus-4-6')).toThrow(
      /ANTHROPIC_API_KEY not configured/,
    );
  });

  it('throws when openai API key not configured', () => {
    openaiProvider = null;
    expect(() => resolveModel('openai:gpt-4o-mini')).toThrow(/OPENAI_API_KEY not configured/);
  });

  it('throws when openrouter API key not configured', () => {
    openrouterProvider = null;
    expect(() => resolveModel('openrouter:qwen/qwen-2.5-72b-instruct')).toThrow(
      /OPENROUTER_API_KEY not configured/,
    );
  });
});