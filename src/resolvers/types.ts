import { Type, type Static } from 'typebox';
import { withValidation } from '../lib/typebox.js';
import type { LlmRuntime } from '../core/llm-runtime.js';
import type { StatementStore } from '../core/statement-store.js';

const ResolverActionMetadataSchema = Type.Record(
  Type.String(),
  Type.Object({
    name: Type.String(),
    label: Type.String(),
    kind: Type.Union([
      Type.Literal('attack'),
      Type.Literal('saving-throw'),
      Type.Literal('skill-check'),
      Type.Literal('damage'),
      Type.Literal('effect-application'),
      Type.Literal('condition-check'),
      Type.Literal('freeform'),
      Type.Literal('initiative'),
    ]),
  }),
);

const ResolverInstructionsSchema = Type.Object({
  systemPrompt: Type.String(),
  actionMetadata: Type.Optional(ResolverActionMetadataSchema),
});
export const ResolverInstructions = withValidation(ResolverInstructionsSchema);
export type ResolverInstructions = Static<typeof ResolverInstructionsSchema>;

const AgentBackedResolverConfigSchemaRaw = Type.Object({
  systemId: Type.String({ minLength: 1 }),
  modelSpec: Type.String(),
  instructions: ResolverInstructionsSchema,
  rulesScope: Type.Optional(
    Type.Object({
      type: Type.Literal('rules'),
      system: Type.String(),
      variant: Type.Optional(
        Type.Union([Type.Literal('base'), Type.Literal('house')], { default: 'base' }),
      ),
    }),
  ),
});

export const AgentBackedResolverConfigSchema = withValidation(AgentBackedResolverConfigSchemaRaw);

export type AgentBackedResolverConfig = Static<typeof AgentBackedResolverConfigSchemaRaw> & {
  llmRuntime?: LlmRuntime;
  statementStore?: StatementStore;
};

export type ResolverRulesScope = AgentBackedResolverConfig['rulesScope'];
