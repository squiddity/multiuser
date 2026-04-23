import { Type, type Static } from 'typebox';
import { withValidation } from '../lib/typebox.js';

const ResolveKind = Type.Union([
  Type.Literal('attack'),
  Type.Literal('saving-throw'),
  Type.Literal('skill-check'),
  Type.Literal('damage'),
  Type.Literal('effect-application'),
  Type.Literal('condition-check'),
  Type.Literal('freeform'),
  Type.Literal('initiative'),
]);

const ResolveRequestSchema = Type.Object({
  system: Type.String({ minLength: 1 }),
  kind: ResolveKind,
  actor: Type.String({ format: 'uuid' }),
  target: Type.Optional(Type.String({ format: 'uuid' })),
  action: Type.Object({
    name: Type.String(),
    params: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { default: {} })),
  }),
  modifiers: Type.Optional(
    Type.Object({
      advantage: Type.Optional(Type.Boolean()),
      disadvantage: Type.Optional(Type.Boolean()),
      bonus: Type.Optional(Type.Number()),
      penalty: Type.Optional(Type.Number()),
      circumstantial: Type.Optional(Type.Array(Type.String(), { default: [] })),
    }),
  ),
  contextStatements: Type.Optional(Type.Array(Type.String({ format: 'uuid' }), { default: [] })),
  rollPolicy: Type.Optional(
    Type.Union(
      [Type.Literal('roll-now'), Type.Literal('use-provided'), Type.Literal('caller-rolls')],
      {
        default: 'roll-now',
      },
    ),
  ),
  providedRoll: Type.Optional(Type.Integer()),
  seed: Type.Optional(Type.String()),
});
export const ResolveRequest = withValidation(ResolveRequestSchema);
export type ResolveRequest = Static<typeof ResolveRequestSchema>;

const RollSchema = Type.Object({
  dice: Type.String(),
  values: Type.Array(Type.Integer()),
  modifier: Type.Optional(Type.Integer({ default: 0 })),
  total: Type.Integer(),
  purpose: Type.String(),
});
export const Roll = withValidation(RollSchema);
export type Roll = Static<typeof RollSchema>;

const EffectSchema = Type.Object({
  kind: Type.Union([
    Type.Literal('damage'),
    Type.Literal('heal'),
    Type.Literal('condition-apply'),
    Type.Literal('condition-remove'),
    Type.Literal('resource'),
    Type.Literal('custom'),
  ]),
  target: Type.Optional(Type.String({ format: 'uuid' })),
  fields: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { default: {} })),
});
export const Effect = withValidation(EffectSchema);
export type Effect = Static<typeof EffectSchema>;

const RulingSchema = Type.Object({
  subject: Type.String(),
  reasoning: Type.String(),
  citations: Type.Optional(Type.Array(Type.String(), { default: [] })),
  confidence: Type.Number({ minimum: 0, maximum: 1 }),
});
export const Ruling = withValidation(RulingSchema);
export type Ruling = Static<typeof RulingSchema>;

const ResolveResultSchema = Type.Object({
  outcome: Type.Object({
    result: Type.Union([
      Type.Literal('success'),
      Type.Literal('failure'),
      Type.Literal('crit-success'),
      Type.Literal('crit-failure'),
      Type.Literal('partial'),
    ]),
    margin: Type.Optional(Type.Integer()),
    degrees: Type.Optional(Type.Integer()),
  }),
  rolls: Type.Optional(Type.Array(RollSchema, { default: [] })),
  effects: Type.Optional(Type.Array(EffectSchema, { default: [] })),
  ruling: Type.Optional(RulingSchema),
  narrationHook: Type.String(),
  confidence: Type.Optional(Type.Number({ minimum: 0, maximum: 1, default: 1 })),
});
export const ResolveResult = withValidation(ResolveResultSchema);
export type ResolveResult = Static<typeof ResolveResultSchema>;

const ActionSpecSchema = Type.Object({
  name: Type.String(),
  label: Type.String(),
  kind: ResolveKind,
  paramsSchema: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { default: {} })),
  valid: Type.Optional(Type.Boolean({ default: true })),
  reason: Type.Optional(Type.String()),
});
export const ActionSpec = withValidation(ActionSpecSchema);
export type ActionSpec = Static<typeof ActionSpecSchema>;

export interface Resolver {
  readonly system: string;
  resolve(req: ResolveRequest): Promise<ResolveResult>;
  describeActions(actor: string, contextStatementIds: string[]): Promise<ActionSpec[]>;
}
