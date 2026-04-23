import type { Resolver as ResolverInterface } from '../core/resolver.js';
import {
  ResolveRequest,
  ResolveResult,
  ActionSpec,
  type ResolveRequest as ResolveRequestType,
  type ResolveResult as ResolveResultType,
  type ActionSpec as ActionSpecType,
} from '../core/resolver.js';
import { createRollTool } from './tools/roll.js';
import { createRetrieveTool } from './tools/retrieve.js';
import { createAiSdkLlmRuntime } from '../models/ai-sdk-runtime.js';
import { createStatementStore } from '../store/statement-store.js';
import type { AgentBackedResolverConfig } from './types.js';
import { logger } from '../config/logger.js';
import type { LlmRuntime } from '../core/llm-runtime.js';
import type { StatementStore } from '../core/statement-store.js';

export class AgentBackedResolver implements ResolverInterface {
  readonly system: string;
  private readonly config: AgentBackedResolverConfig;
  private readonly rollTool;
  private readonly retrieveTool;
  private readonly llmRuntime: LlmRuntime;
  private readonly statementStore: StatementStore;

  constructor(config: AgentBackedResolverConfig) {
    this.system = config.systemId;
    this.config = config;
    this.rollTool = createRollTool();
    this.retrieveTool = createRetrieveTool();
    this.llmRuntime = config.llmRuntime ?? createAiSdkLlmRuntime();
    this.statementStore = config.statementStore ?? createStatementStore();
  }

  async resolve(req: ResolveRequestType): Promise<ResolveResultType> {
    const rulesScope = this.config.rulesScope;

    let contextStatements: { id: string; content: string }[] = [];
    if (rulesScope && req.contextStatements.length > 0) {
      try {
        const scope = { type: 'rules' as const, system: this.system, variant: 'base' as const };
        const results = await this.statementStore.retrieveByScopes([scope], {
          limit: 10,
        });
        contextStatements = results.map((r) => ({
          id: r.id,
          content: r.content.substring(0, 300),
        }));
      } catch (err) {
        logger.warn(
          { err, system: this.system },
          'resolver: retrieveByScopes failed, proceeding without context',
        );
      }
    }

    const systemPrompt = this.buildSystemPrompt(req, contextStatements);

    try {
      const textResult = await this.llmRuntime.generate({
        modelSpec: this.config.modelSpec,
        systemPrompt: systemPrompt,
        tools: {
          roll: this.rollTool,
          retrieve: this.retrieveTool,
        },
        prompt: this.buildUserPrompt(req),
      });

      const parsed = ResolveResult.safeParse(JSON.parse(textResult.text));
      if (parsed.success) {
        return parsed.data;
      }
      logger.warn(
        { result: textResult.text.substring(0, 500) },
        'resolver: failed to parse LLM response as ResolveResult',
      );
      throw new Error('Failed to parse resolver response');
    } catch (err) {
      logger.error({ err, req }, 'resolver: generateText failed');

      return {
        outcome: { result: 'failure' as const },
        rolls: [],
        effects: [],
        narrationHook: `The ${req.action.name} could not be resolved. Please try again or describe what happens narratively.`,
        confidence: 0,
      };
    }
  }

  async describeActions(_actor: string, _contextStatementIds: string[]): Promise<ActionSpecType[]> {
    if (!this.config.instructions.actionMetadata) {
      return [];
    }

    return Object.entries(this.config.instructions.actionMetadata).map(([, action]) => ({
      name: action.name,
      label: action.label,
      kind: action.kind,
      valid: true,
      paramsSchema: {},
    }));
  }

  private buildSystemPrompt(
    req: ResolveRequestType,
    context: { id: string; content: string }[],
  ): string {
    let prompt = this.config.instructions.systemPrompt;
    prompt += '\n\n## Output Format\n';
    prompt += 'Return a valid JSON object with these fields:\n';
    prompt +=
      '- outcome: { result: "success" | "failure" | "crit-success" | "crit-failure" | "partial", margin?: number, degrees?: number }\n';
    prompt +=
      '- rolls: [{ dice: string, values: number[], modifier: number, total: number, purpose: string }]\n';
    prompt += '- effects: [{ kind: string, target?: string, fields: object }]\n';
    prompt += '- narrationHook: string\n';
    prompt += '- confidence: number between 0 and 1\n';
    prompt +=
      '- ruling?: { subject: string, reasoning: string, citations: string[], confidence: number }\n';
    prompt += '\n## Current Request\n';
    prompt += `Action: ${req.action.name}\n`;
    prompt += `Kind: ${req.kind}\n`;
    prompt += `Actor: ${req.actor}\n`;
    if (req.target) {
      prompt += `Target: ${req.target}\n`;
    }
    if (req.action.params && Object.keys(req.action.params).length > 0) {
      prompt += `Parameters: ${JSON.stringify(req.action.params)}\n`;
    }
    if (req.modifiers.advantage) {
      prompt += 'Modifier: advantage\n';
    }
    if (req.modifiers.disadvantage) {
      prompt += 'Modifier: disadvantage\n';
    }
    if (context.length > 0) {
      prompt += '\n## Relevant Rules & Rulings\n';
      context.forEach((ctx) => {
        prompt += `- [${ctx.id}]: ${ctx.content}\n`;
      });
    }
    return prompt;
  }

  private buildUserPrompt(req: ResolveRequestType): string {
    let prompt = `Resolve the ${req.kind} "${req.action.name}" for actor ${req.actor}.`;
    if (req.rollPolicy === 'use-provided' && req.providedRoll !== undefined) {
      prompt += ` Use the pre-rolled value: ${req.providedRoll}.`;
    } else if (req.rollPolicy === 'caller-rolls') {
      prompt += ' Do not roll; return the structure with rolls empty for the caller to provide.';
    }
    if (req.seed) {
      prompt += ` Use seed "${req.seed}" for deterministic results.`;
    }
    return prompt;
  }
}
