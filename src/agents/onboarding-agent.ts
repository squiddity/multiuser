import { randomUUID } from 'node:crypto';
import { loadAgentPrompt } from '../store/content.js';
import { createPiAiLlmRuntime } from '../models/pi-runtime.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import type { LlmRuntime } from '../core/llm-runtime.js';
import type { CharacterDraft } from '../core/onboarding.js';
import type { ComponentSpec } from '../resolvers/tools/render.js';

// --- Agent output types ---

export interface OnboardingAgentOutput {
  message: string;
  progress: string;
  /** When true, the agent believes all required fields are complete */
  complete: boolean;
  /** The draft the agent believes is ready for validation (only when complete: true) */
  draft?: unknown;
  /** Discord component specs to render */
  components: ComponentSpec[];
}

export interface OnboardingTurnInput {
  /** The current in-progress draft (what's filled so far) */
  draft: Record<string, unknown>;
  /** Human-readable description of what the user just did */
  actionDescription: string;
  /** Previous conversation context from the statement store */
  conversationHistory: string;
  /** If the previous turn's draft failed validation, the error messages */
  validationErrors?: string;
}

export interface OnboardingAgentConfig {
  modelSpec: string;
  campaignId?: string | null;
  llmRuntime?: LlmRuntime;
}

const EMPTY_OUTPUT_FALLBACK = 'Welcome, traveler. Something stirs in the air.';

export class OnboardingAgent {
  private readonly config: OnboardingAgentConfig;
  private readonly llmRuntime: LlmRuntime;

  constructor(config: OnboardingAgentConfig) {
    this.config = config;
    this.llmRuntime = config.llmRuntime ?? createPiAiLlmRuntime();
  }

  /**
   * Start the onboarding flow. Returns the agent's greeting and initial components.
   */
  async start(userId: string): Promise<OnboardingAgentOutput> {
    return this.turn({
      draft: { profile: {} },
      actionDescription: 'User started onboarding.',
      conversationHistory: '(no conversation yet)',
    });
  }

  /**
   * Process a user interaction turn. Returns the agent's response with components.
   */
  async turn(input: OnboardingTurnInput): Promise<OnboardingAgentOutput> {
    const prompt = await loadAgentPrompt('onboarding-narrator', this.config.campaignId ?? null);
    const userPrompt = this.buildUserPrompt(input);

    if (env.LOG_LLM_INPUT) {
      logger.info(
        {
          systemPromptChars: prompt.content.length,
          userPromptChars: userPrompt.length,
          draftFields: Object.keys(input.draft),
          action: input.actionDescription,
        },
        'onboarding-agent: llm input',
      );
    }

    try {
      const llmRequestId = randomUUID();
      const result = await this.llmRuntime.generate({
        modelSpec: this.config.modelSpec,
        systemPrompt: prompt.content,
        prompt: userPrompt,
        metadata: {
          requestId: llmRequestId,
          caller: 'onboarding-agent.turn',
        },
      });

      logger.info(
        {
          responseChars: result.text.length,
          responsePreview: result.text.slice(0, 240),
        },
        'onboarding-agent: llm output received',
      );

      return this.parseOutput(result.text);
    } catch (err) {
      logger.error({ err }, 'onboarding-agent: turn failed');
      return {
        message: EMPTY_OUTPUT_FALLBACK,
        progress: '?/?',
        complete: false,
        components: [],
      };
    }
  }

  private buildUserPrompt(input: OnboardingTurnInput): string {
    let prompt = '## Conversation History\n';
    prompt += input.conversationHistory;
    prompt += '\n\n';

    if (input.validationErrors) {
      prompt += '## Validation Errors (from previous attempt)\n';
      prompt += input.validationErrors;
      prompt += '\n';
      prompt +=
        'The draft you submitted was invalid. Please address these errors conversationally and re-collect the affected fields.\n\n';
    }

    prompt += '## Current Draft State\n';
    if (input.draft.name) prompt += `- name: "${input.draft.name}"\n`;
    if (input.draft.pronouns !== undefined) prompt += `- pronouns: "${input.draft.pronouns}"\n`;
    if (
      input.draft.profile &&
      typeof input.draft.profile === 'object' &&
      Object.keys(input.draft.profile as object).length > 0
    ) {
      prompt += `- profile: ${JSON.stringify(input.draft.profile)}\n`;
    }
    if (input.draft.hook) prompt += `- hook: "${input.draft.hook}"\n`;

    if (
      !input.draft.name &&
      !input.draft.hook &&
      Object.keys(input.draft.profile ?? {}).length === 0
    ) {
      prompt += '(no fields filled yet)\n';
    }

    prompt += '\n';
    prompt += '## Latest User Action\n';
    prompt += input.actionDescription;
    prompt += '\n\n';
    prompt +=
      'Respond with JSON. If all required fields (name, archetype, hook) are filled, set complete: true and include the full draft. Otherwise, continue collecting with components.';

    return prompt;
  }

  private parseOutput(text: string): OnboardingAgentOutput {
    const trimmed = text.trim();
    if (!trimmed) {
      logger.error('onboarding-agent: llm returned empty output; using fallback');
      return {
        message: EMPTY_OUTPUT_FALLBACK,
        progress: '?/?',
        complete: false,
        components: [],
      };
    }

    try {
      const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('no JSON found');
      }
      const parsed = JSON.parse(jsonMatch[0]!);

      if (!parsed.message || typeof parsed.message !== 'string') {
        throw new Error('missing message field');
      }

      const components: ComponentSpec[] = Array.isArray(parsed.components) ? parsed.components : [];
      const complete = parsed.complete === true;

      return {
        message: parsed.message.trim(),
        progress: typeof parsed.progress === 'string' ? parsed.progress : '?/?',
        complete,
        draft: complete ? parsed.draft : undefined,
        components,
      };
    } catch (err) {
      logger.warn(
        {
          err,
          responseChars: text.length,
          textPreview: text.substring(0, 300),
        },
        'onboarding-agent: failed to parse output, using fallback',
      );

      return {
        message: EMPTY_OUTPUT_FALLBACK,
        progress: '?/?',
        complete: false,
        components: [],
      };
    }
  }
}

export function createOnboardingAgent(config: OnboardingAgentConfig): OnboardingAgent {
  return new OnboardingAgent(config);
}
