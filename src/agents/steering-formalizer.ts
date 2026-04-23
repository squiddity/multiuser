import { loadAgentPrompt } from '../store/content.js';
import { createPiAiLlmRuntime } from '../models/pi-runtime.js';
import { createStatementStore } from '../store/statement-store.js';
import { logger } from '../config/logger.js';
import type { Scope } from '../core/statement.js';
import type { LlmRuntime } from '../core/llm-runtime.js';
import type { StatementStore } from '../core/statement-store.js';

export type SteeringDecision = 'promote' | 'reject' | 'supersede';

export interface SteeringFormalizerOutput {
  decision: SteeringDecision;
  rationale: string;
  revisedCandidate?: string;
}

export interface SteeringFormalizerConfig {
  modelSpec: string;
  campaignId?: string | null;
  llmRuntime?: LlmRuntime;
  statementStore?: StatementStore;
}

export class SteeringFormalizer {
  private readonly config: SteeringFormalizerConfig;
  private readonly llmRuntime: LlmRuntime;
  private readonly statementStore: StatementStore;

  constructor(config: SteeringFormalizerConfig) {
    this.config = config;
    this.llmRuntime = config.llmRuntime ?? createPiAiLlmRuntime();
    this.statementStore = config.statementStore ?? createStatementStore();
  }

  async formalize(
    openQuestionId: string,
    subject: string,
    candidate: string,
    freeformText: string,
  ): Promise<SteeringFormalizerOutput> {
    const prompt = await loadAgentPrompt('steering-formalizer', this.config.campaignId ?? null);
    try {
      const result = await this.llmRuntime.generate({
        modelSpec: this.config.modelSpec,
        systemPrompt: prompt.content,
        prompt: this.buildUserPrompt(subject, candidate, freeformText),
      });

      return this.parseOutput(result.text, openQuestionId);
    } catch (err) {
      logger.error({ err, openQuestionId }, 'steering-formalizer: formalize failed');
      return {
        decision: 'reject',
        rationale: 'LLM call failed; defaulting to reject for safety.',
      };
    }
  }

  async emit(
    scope: Scope,
    openQuestionId: string,
    output: SteeringFormalizerOutput,
    authorId: string,
    sources?: string[],
  ): Promise<string> {
    const id = await this.statementStore.emitAgentStatement({
      scope,
      kind: 'authoring-decision',
      content: `Decision: ${output.decision}. ${output.rationale}`,
      authorId,
      sources: sources ?? [],
      fields: {
        openQuestionId,
        decision: output.decision,
        rationale: output.rationale,
        ...(output.revisedCandidate !== undefined
          ? { revisedCandidate: output.revisedCandidate }
          : {}),
      },
    });

    logger.info({ id, openQuestionId, decision: output.decision }, 'steering-formalizer: emitted');
    return id;
  }

  private buildUserPrompt(subject: string, candidate: string, freeformText: string): string {
    return (
      `## Open Question\n` +
      `Subject: ${subject}\n\n` +
      `Current candidate: ${candidate}\n\n` +
      `## GM Decision\n${freeformText}\n\n` +
      `Respond with valid JSON only.`
    );
  }

  private parseOutput(text: string, openQuestionId: string): SteeringFormalizerOutput {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('no JSON found');

      const parsed = JSON.parse(jsonMatch[0]!) as Record<string, unknown>;

      if (!['promote', 'reject', 'supersede'].includes(parsed.decision as string)) {
        throw new Error(`invalid decision: ${parsed.decision}`);
      }
      if (typeof parsed.rationale !== 'string' || !parsed.rationale) {
        throw new Error('missing rationale');
      }

      const output: SteeringFormalizerOutput = {
        decision: parsed.decision as SteeringDecision,
        rationale: parsed.rationale,
      };

      if (parsed.decision === 'supersede') {
        if (typeof parsed.revisedCandidate !== 'string' || !parsed.revisedCandidate) {
          throw new Error('supersede requires revisedCandidate');
        }
        output.revisedCandidate = parsed.revisedCandidate;
      }

      return output;
    } catch (err) {
      logger.warn(
        { err, openQuestionId, text: text.substring(0, 200) },
        'steering-formalizer: failed to parse output, defaulting to reject',
      );
      return {
        decision: 'reject',
        rationale: 'Could not parse LLM output; defaulting to reject.',
      };
    }
  }
}

export function createSteeringFormalizer(config: SteeringFormalizerConfig): SteeringFormalizer {
  return new SteeringFormalizer(config);
}
