import { Type, type Static } from 'typebox';
import { withValidation } from '../lib/typebox.js';

const BriefingUnresolvedItemSchema = Type.Object({
  question: Type.String({ minLength: 1 }),
  relatedSourceIds: Type.Optional(Type.Array(Type.String({ format: 'uuid' }), { default: [] })),
});
export const BriefingUnresolvedItem = withValidation(BriefingUnresolvedItemSchema);
export type BriefingUnresolvedItem = Static<typeof BriefingUnresolvedItemSchema>;

const BriefingFieldsSchema = Type.Object({
  partyRoomId: Type.String({ format: 'uuid' }),
  adminRoomId: Type.String({ format: 'uuid' }),
  sourceIds: Type.Array(Type.String({ format: 'uuid' }), { minItems: 1 }),
  windowStart: Type.String({ format: 'date-time' }),
  windowEnd: Type.String({ format: 'date-time' }),
  unresolved: Type.Optional(Type.Array(BriefingUnresolvedItemSchema, { default: [] })),
});
export const BriefingFields = withValidation(BriefingFieldsSchema);
export type BriefingFields = Static<typeof BriefingFieldsSchema>;

const BriefingStatementContractSchema = Type.Object({
  kind: Type.Literal('briefing'),
  scope: Type.Object({
    type: Type.Literal('governance'),
    roomId: Type.String({ format: 'uuid' }),
  }),
  content: Type.String({ minLength: 1 }),
  sources: Type.Array(Type.String({ format: 'uuid' }), { minItems: 1 }),
  fields: BriefingFieldsSchema,
});
export const BriefingStatementContract = withValidation(BriefingStatementContractSchema);
export type BriefingStatementContract = Static<typeof BriefingStatementContractSchema>;

const SteeringStatusSchema = Type.Union([
  Type.Literal('active'),
  Type.Literal('superseded'),
  Type.Literal('revoked'),
]);
export const SteeringStatus = withValidation(SteeringStatusSchema);
export type SteeringStatus = Static<typeof SteeringStatusSchema>;

const SteeringIntentSchema = Type.Union([
  Type.Literal('tone'),
  Type.Literal('constraint'),
  Type.Literal('direction'),
  Type.Literal('pacing'),
  Type.Literal('spotlight'),
  Type.Literal('safety'),
  Type.Literal('other'),
]);
export const SteeringIntent = withValidation(SteeringIntentSchema);
export type SteeringIntent = Static<typeof SteeringIntentSchema>;

const SteeringFieldsSchema = Type.Object({
  appliesToPartyRoomId: Type.String({ format: 'uuid' }),
  issuedByUserId: Type.String({ minLength: 1 }),
  intent: SteeringIntentSchema,
  tone: Type.Optional(Type.String({ minLength: 1 })),
  constraints: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { default: [] })),
  direction: Type.String({ minLength: 1 }),
  status: Type.Optional(
    Type.Union([Type.Literal('active'), Type.Literal('superseded'), Type.Literal('revoked')], {
      default: 'active',
    }),
  ),
});
export const SteeringFields = withValidation(SteeringFieldsSchema);
export type SteeringFields = Static<typeof SteeringFieldsSchema>;

const SteeringStatementContractSchema = Type.Object({
  kind: Type.Literal('steering'),
  scope: Type.Object({
    type: Type.Literal('governance'),
    roomId: Type.String({ format: 'uuid' }),
  }),
  content: Type.String({ minLength: 1 }),
  sources: Type.Array(Type.String({ format: 'uuid' }), { minItems: 1 }),
  fields: SteeringFieldsSchema,
});
export const SteeringStatementContract = withValidation(SteeringStatementContractSchema);
export type SteeringStatementContract = Static<typeof SteeringStatementContractSchema>;

export interface SteeringCandidate {
  id: string;
  createdAt: Date | string;
  fields: SteeringFields;
}

export function selectActiveSteering(candidates: SteeringCandidate[]): SteeringCandidate[] {
  return [...candidates]
    .filter((candidate) => candidate.fields.status === 'active')
    .sort((a, b) => {
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      return tb - ta;
    });
}
