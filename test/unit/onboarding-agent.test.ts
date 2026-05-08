import { describe, expect, it, vi, beforeEach } from 'vitest';
import { OnboardingAgent } from '../../src/agents/onboarding-agent.js';

const mockLlmGenerate = vi.fn();
const mockCreatePiAiLlmRuntime = vi.fn(() => ({
  generate: (...args: unknown[]) => mockLlmGenerate(...args),
}));

vi.mock('../../src/models/pi-runtime.js', () => ({
  createPiAiLlmRuntime: (...args: unknown[]) => mockCreatePiAiLlmRuntime(...args),
}));

vi.mock('../../src/config/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../src/config/env.js', () => ({
  env: {
    SQLITE_URL: 'file::memory:?cache=shared',
    DEFAULT_MODEL_SPEC: 'openrouter:test-model',
    LOG_LLM_INPUT: false,
    LLM_SERIALIZE_CALLS: false,
  },
}));

const MOCK_VALID_OUTPUT = JSON.stringify({
  message: 'Choose your character name.',
  progress: '1/4',
  components: [
    { type: 'button', customId: 'onboard.name.open', label: 'Set name', style: 'primary' },
    { type: 'button', customId: 'onboard.cancel', label: 'Cancel', style: 'danger' },
  ],
});

const MOCK_COMPLETE_OUTPUT = JSON.stringify({
  message: 'Here is your character. Ready to confirm?',
  complete: true,
  progress: '4/4',
  draft: {
    name: 'Kaelen',
    pronouns: 'he/him',
    profile: { archetype: 'scout' },
    hook: 'Sworn to find the thief who stole his heirloom blade.',
  },
  components: [{ type: 'button', customId: 'onboard.confirm', label: 'Confirm', style: 'success' }],
});

const MOCK_NO_COMPONENTS_OUTPUT = JSON.stringify({
  message: 'Tell me about your character.',
  progress: '1/4',
});

function makeAgent(modelSpec = 'openrouter:test-model'): OnboardingAgent {
  return new OnboardingAgent({ modelSpec });
}

describe('OnboardingAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('turn', () => {
    it('returns structured output from valid LLM response', async () => {
      mockLlmGenerate.mockResolvedValue({ text: MOCK_VALID_OUTPUT });

      const agent = makeAgent();
      const output = await agent.turn({
        draft: { profile: {} },
        actionDescription: 'User started onboarding.',
        conversationHistory: '(no conversation yet)',
      });

      expect(output.message).toBe('Choose your character name.');
      expect(output.progress).toBe('1/4');
      expect(output.complete).toBe(false);
      expect(output.components).toHaveLength(2);
      expect(output.components[0]!.type).toBe('button');
    });

    it('returns complete: true when agent says draft is ready', async () => {
      mockLlmGenerate.mockResolvedValue({ text: MOCK_COMPLETE_OUTPUT });

      const agent = makeAgent();
      const output = await agent.turn({
        draft: {
          name: 'Kaelen',
          pronouns: 'he/him',
          profile: { archetype: 'scout' },
          hook: 'Sworn to find the thief who stole his heirloom blade.',
        },
        actionDescription: 'User confirmed character.',
        conversationHistory: 'Agent: Choose name. User: Set name to Kaelen.',
      });

      expect(output.complete).toBe(true);
      expect(output.draft).toBeDefined();
      if (output.draft) {
        const d = output.draft as Record<string, unknown>;
        expect(d.name).toBe('Kaelen');
      }
    });

    it('handles response with no components gracefully', async () => {
      mockLlmGenerate.mockResolvedValue({ text: MOCK_NO_COMPONENTS_OUTPUT });

      const agent = makeAgent();
      const output = await agent.turn({
        draft: { profile: {} },
        actionDescription: 'User started.',
        conversationHistory: '',
      });

      expect(output.message).toBe('Tell me about your character.');
      expect(output.components).toEqual([]);
    });

    it('passes model spec to LLM runtime', async () => {
      mockLlmGenerate.mockResolvedValue({ text: MOCK_VALID_OUTPUT });

      const agent = makeAgent('anthropic:claude-sonnet');
      await agent.turn({
        draft: { profile: {} },
        actionDescription: 'User started.',
        conversationHistory: '',
      });

      expect(mockLlmGenerate).toHaveBeenCalledWith(
        expect.objectContaining({ modelSpec: 'anthropic:claude-sonnet' }),
      );
    });

    it('includes conversation history in prompt', async () => {
      mockLlmGenerate.mockResolvedValue({ text: MOCK_VALID_OUTPUT });

      const agent = makeAgent();
      await agent.turn({
        draft: { profile: {} },
        actionDescription: 'User started onboarding.',
        conversationHistory: 'Agent: Welcome. User: Hi there.',
      });

      const callArgs = mockLlmGenerate.mock.calls[0]![0] as { prompt: string };
      expect(callArgs.prompt).toContain('Agent: Welcome. User: Hi there.');
      expect(callArgs.prompt).toContain('User started onboarding.');
    });

    it('includes draft state in prompt', async () => {
      mockLlmGenerate.mockResolvedValue({ text: MOCK_VALID_OUTPUT });

      const agent = makeAgent();
      await agent.turn({
        draft: {
          name: 'Kaelen',
          profile: { archetype: 'scout', pronouns: 'he/him' },
        },
        actionDescription: 'User selected archetype.',
        conversationHistory: '',
      });

      const callArgs = mockLlmGenerate.mock.calls[0]![0] as { prompt: string };
      expect(callArgs.prompt).toContain('"Kaelen"');
      expect(callArgs.prompt).toContain('he/him');
      expect(callArgs.prompt).toContain('archetype');
    });

    it('includes validation errors in prompt when present', async () => {
      mockLlmGenerate.mockResolvedValue({ text: MOCK_VALID_OUTPUT });

      const agent = makeAgent();
      await agent.turn({
        draft: { profile: {} },
        actionDescription: 'User clicked confirm.',
        conversationHistory: '',
        validationErrors: 'name: Character name is required',
      });

      const callArgs = mockLlmGenerate.mock.calls[0]![0] as { prompt: string };
      expect(callArgs.prompt).toContain('Validation Errors');
      expect(callArgs.prompt).toContain('name: Character name is required');
    });

    it('shows "(no fields filled yet)" for empty draft', async () => {
      mockLlmGenerate.mockResolvedValue({ text: MOCK_VALID_OUTPUT });

      const agent = makeAgent();
      await agent.turn({
        draft: { profile: {} },
        actionDescription: 'User started.',
        conversationHistory: '',
      });

      const callArgs = mockLlmGenerate.mock.calls[0]![0] as { prompt: string };
      expect(callArgs.prompt).toContain('(no fields filled yet)');
    });

    it('falls back on LLM error', async () => {
      mockLlmGenerate.mockRejectedValue(new Error('API error'));

      const agent = makeAgent();
      const output = await agent.turn({
        draft: { profile: {} },
        actionDescription: 'User started.',
        conversationHistory: '',
      });

      expect(output.message).toBeTruthy();
      expect(output.complete).toBe(false);
      expect(output.components).toEqual([]);
    });

    it('falls back on invalid JSON from LLM', async () => {
      mockLlmGenerate.mockResolvedValue({ text: 'not json at all' });

      const agent = makeAgent();
      const output = await agent.turn({
        draft: { profile: {} },
        actionDescription: 'User started.',
        conversationHistory: '',
      });

      expect(output.message).toBeTruthy();
      expect(output.complete).toBe(false);
    });

    it('falls back on empty LLM response', async () => {
      mockLlmGenerate.mockResolvedValue({ text: '' });

      const agent = makeAgent();
      const output = await agent.turn({
        draft: { profile: {} },
        actionDescription: 'User started.',
        conversationHistory: '',
      });

      expect(output.message).toBeTruthy();
      expect(output.complete).toBe(false);
    });

    it('falls back on missing message field', async () => {
      mockLlmGenerate.mockResolvedValue({
        text: JSON.stringify({ progress: '1/4', components: [] }),
      });

      const agent = makeAgent();
      const output = await agent.turn({
        draft: { profile: {} },
        actionDescription: 'User started.',
        conversationHistory: '',
      });

      expect(output.message).toBeTruthy();
      expect(output.complete).toBe(false);
    });
  });

  describe('start', () => {
    it('passes an initial turn with start description', async () => {
      mockLlmGenerate.mockResolvedValue({ text: MOCK_VALID_OUTPUT });

      const agent = makeAgent();
      const output = await agent.start('user-1');

      expect(output.message).toBeTruthy();
      expect(mockLlmGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('User started onboarding.') as unknown,
        }),
      );
    });
  });
});
