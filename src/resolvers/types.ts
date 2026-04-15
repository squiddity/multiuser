import { z } from 'zod';

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

export const AgentBackedResolverConfig = z.object({
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
export type AgentBackedResolverConfig = z.infer<typeof AgentBackedResolverConfig>;

export type ResolverRulesScope = z.infer<typeof AgentBackedResolverConfig>['rulesScope'];