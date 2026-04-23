import { Type, type Static } from 'typebox';
import { ResolveKindSchema } from '../core/resolver.js';
import type { LlmRuntime } from '../core/llm-runtime.js';
import type { StatementStore } from '../core/statement-store.js';
import { NonEmptyString, RulesVariant } from '../lib/schema-primitives.js';
import { withValidation } from '../lib/typebox.js';

const ResolverActionMetadataSchema = Type.Record(
  Type.String(),
  Type.Object({
    name: Type.String(),
    label: Type.String(),
    kind: ResolveKindSchema,
  }),
);

const ResolverInstructionsSchema = Type.Object({
  systemPrompt: Type.String(),
  actionMetadata: Type.Optional(ResolverActionMetadataSchema),
});
export const ResolverInstructions = withValidation(ResolverInstructionsSchema);
export type ResolverInstructions = Static<typeof ResolverInstructionsSchema>;

const AgentBackedResolverConfigSchemaRaw = Type.Object({
  systemId: NonEmptyString,
  modelSpec: Type.String(),
  instructions: ResolverInstructionsSchema,
  rulesScope: Type.Optional(
    Type.Object({
      type: Type.Literal('rules'),
      system: Type.String(),
      variant: Type.Optional(RulesVariant),
    }),
  ),
});

export const AgentBackedResolverConfigSchema = withValidation(AgentBackedResolverConfigSchemaRaw);

export type AgentBackedResolverConfig = Static<typeof AgentBackedResolverConfigSchemaRaw> & {
  llmRuntime?: LlmRuntime;
  statementStore?: StatementStore;
};

export type ResolverRulesScope = AgentBackedResolverConfig['rulesScope'];
