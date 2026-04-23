import { Type, type Static } from 'typebox';
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
  Type.Object({ type: Type.Literal('party'), partyId: Type.String({ format: 'uuid' }) }),
  Type.Object({ type: Type.Literal('character'), characterId: Type.String({ format: 'uuid' }) }),
  Type.Object({ type: Type.Literal('session'), sessionId: Type.String({ format: 'uuid' }) }),
  Type.Object({ type: Type.Literal('meta'), roomId: Type.String({ format: 'uuid' }) }),
  Type.Object({
    type: Type.Literal('rules'),
    system: Type.String({ minLength: 1 }),
    variant: Type.Optional(
      Type.Union([Type.Literal('base'), Type.Literal('house')], { default: 'base' }),
    ),
  }),
  Type.Object({
    type: Type.Literal('style'),
    worldId: Type.Optional(Type.String({ format: 'uuid' })),
  }),
  Type.Object({ type: Type.Literal('governance'), roomId: Type.String({ format: 'uuid' }) }),
  Type.Object({ type: Type.Literal('mapping') }),
  Type.Object({ type: Type.Literal('eval') }),
]);
export const Scope = withValidation(ScopeSchema);
export type Scope = Static<typeof ScopeSchema>;

const StatementSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  scope: ScopeSchema,
  kind: StatementKindSchema,
  authorType: Type.Union([Type.Literal('user'), Type.Literal('agent'), Type.Literal('system')]),
  authorId: Type.String({ minLength: 1 }),
  icOoc: Type.Optional(Type.Union([Type.Literal('ic'), Type.Literal('ooc')])),
  createdAt: Type.String({ format: 'date-time' }),
  supersedes: Type.Optional(Type.String({ format: 'uuid' })),
  sources: Type.Optional(Type.Array(Type.String({ format: 'uuid' }), { default: [] })),
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
  authorId: Type.String({ minLength: 1 }),
  icOoc: Type.Optional(Type.Union([Type.Literal('ic'), Type.Literal('ooc')])),
  supersedes: Type.Optional(Type.String({ format: 'uuid' })),
  sources: Type.Optional(Type.Array(Type.String({ format: 'uuid' }), { default: [] })),
  content: Type.String(),
  fields: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { default: {} })),
});
export const NewStatement = withValidation(NewStatementSchema);
export type NewStatement = Static<typeof NewStatementSchema>;
