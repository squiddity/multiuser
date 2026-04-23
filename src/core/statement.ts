import { Type, type Static } from 'typebox';
import { DateTime, NonEmptyString, RulesVariant, UUID } from '../lib/schema-primitives.js';
import { withValidation } from '../lib/typebox.js';

const StatementKindSchema = Type.Union([
  Type.Literal('narration'),
  Type.Literal('dialogue'),
  Type.Literal('pose'),
  Type.Literal('inner-monologue'),
  Type.Literal('private-message'),
  Type.Literal('mechanical'),
  Type.Literal('ruling'),
  Type.Literal('invention'),
  Type.Literal('canon-reference'),
  Type.Literal('briefing'),
  Type.Literal('steering'),
  Type.Literal('open-question'),
  Type.Literal('authoring-decision'),
  Type.Literal('safety-invocation'),
  Type.Literal('governance'),
  Type.Literal('mapping'),
  Type.Literal('interception'),
  Type.Literal('eval'),
  Type.Literal('reaction'),
  Type.Literal('decision'),
  Type.Literal('command-query'),
]);
export const StatementKind = withValidation(StatementKindSchema);
export type StatementKind = Static<typeof StatementKindSchema>;

const ScopeSchema = Type.Union([
  Type.Object({ type: Type.Literal('world') }),
  Type.Object({ type: Type.Literal('party'), partyId: UUID }),
  Type.Object({ type: Type.Literal('character'), characterId: UUID }),
  Type.Object({ type: Type.Literal('session'), sessionId: UUID }),
  Type.Object({ type: Type.Literal('meta'), roomId: UUID }),
  Type.Object({
    type: Type.Literal('rules'),
    system: NonEmptyString,
    variant: Type.Optional(RulesVariant),
  }),
  Type.Object({
    type: Type.Literal('style'),
    worldId: Type.Optional(UUID),
  }),
  Type.Object({ type: Type.Literal('governance'), roomId: UUID }),
  Type.Object({ type: Type.Literal('mapping') }),
  Type.Object({ type: Type.Literal('eval') }),
]);
export const Scope = withValidation(ScopeSchema);
export type Scope = Static<typeof ScopeSchema>;

const StatementSchema = Type.Object({
  id: UUID,
  scope: ScopeSchema,
  kind: StatementKindSchema,
  authorType: Type.Union([Type.Literal('user'), Type.Literal('agent'), Type.Literal('system')]),
  authorId: NonEmptyString,
  icOoc: Type.Optional(Type.Union([Type.Literal('ic'), Type.Literal('ooc')])),
  createdAt: DateTime,
  supersedes: Type.Optional(UUID),
  sources: Type.Optional(Type.Array(UUID, { default: [] })),
  content: Type.String(),
  fields: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { default: {} })),
  embedding: Type.Optional(Type.Array(Type.Number())),
});
export const Statement = withValidation(StatementSchema);
export type Statement = Static<typeof StatementSchema>;

const NewStatementSchema = Type.Object({
  scope: ScopeSchema,
  kind: StatementKindSchema,
  authorType: Type.Union([Type.Literal('user'), Type.Literal('agent'), Type.Literal('system')]),
  authorId: NonEmptyString,
  icOoc: Type.Optional(Type.Union([Type.Literal('ic'), Type.Literal('ooc')])),
  supersedes: Type.Optional(UUID),
  sources: Type.Optional(Type.Array(UUID, { default: [] })),
  content: Type.String(),
  fields: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { default: {} })),
});
export const NewStatement = withValidation(NewStatementSchema);
export type NewStatement = Static<typeof NewStatementSchema>;
