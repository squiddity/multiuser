import { z } from 'zod';
import type { LlmRuntime } from '../core/llm-runtime.js';
import type { StatementStore } from '../core/statement-store.js';

export const ResolverInstructions = z.object({
  systemPrompt: z.string(),
  actionMetadata: z
    .record(
      z.object({
        name: z.string(),
        label: z.string(),
        kind: z.enum([
          'attack',
          'saving-throw',
          'skill-check',
          'damage',
          'effect-application',
          'condition-check',
          'freeform',
          'initiative',
        ]),
      }),
    )
    .optional(),
});
export type ResolverInstructions = z.infer<typeof ResolverInstructions>;

export const AgentBackedResolverConfigSchema = z.object({
  systemId: z.string().min(1),
  modelSpec: z.string(),
  instructions: ResolverInstructions,
  rulesScope: z
    .object({
      type: z.literal('rules'),
      system: z.string(),
      variant: z.enum(['base', 'house']).default('base'),
    })
    .optional(),
});

export type AgentBackedResolverConfig = z.infer<typeof AgentBackedResolverConfigSchema> & {
  llmRuntime?: LlmRuntime;
  statementStore?: StatementStore;
};

export type ResolverRulesScope = AgentBackedResolverConfig['rulesScope'];
