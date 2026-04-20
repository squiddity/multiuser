import { z } from 'zod';

export const BriefingUnresolvedItem = z.object({
  question: z.string().min(1),
  relatedSourceIds: z.array(z.string().uuid()).default([]),
});
export type BriefingUnresolvedItem = z.infer<typeof BriefingUnresolvedItem>;

export const BriefingFields = z.object({
  partyRoomId: z.string().uuid(),
  adminRoomId: z.string().uuid(),
  sourceIds: z.array(z.string().uuid()).min(1),
  windowStart: z.string().datetime(),
  windowEnd: z.string().datetime(),
  unresolved: z.array(BriefingUnresolvedItem).default([]),
});
export type BriefingFields = z.infer<typeof BriefingFields>;

export const BriefingStatementContract = z.object({
  kind: z.literal('briefing'),
  scope: z.object({
    type: z.literal('governance'),
    roomId: z.string().uuid(),
  }),
  content: z.string().min(1),
  sources: z.array(z.string().uuid()).min(1),
  fields: BriefingFields,
});
export type BriefingStatementContract = z.infer<typeof BriefingStatementContract>;

export const SteeringStatus = z.enum(['active', 'superseded', 'revoked']);
export type SteeringStatus = z.infer<typeof SteeringStatus>;

export const SteeringIntent = z.enum([
  'tone',
  'constraint',
  'direction',
  'pacing',
  'spotlight',
  'safety',
  'other',
]);
export type SteeringIntent = z.infer<typeof SteeringIntent>;

export const SteeringFields = z.object({
  appliesToPartyRoomId: z.string().uuid(),
  issuedByUserId: z.string().min(1),
  intent: SteeringIntent,
  tone: z.string().min(1).optional(),
  constraints: z.array(z.string().min(1)).default([]),
  direction: z.string().min(1),
  status: SteeringStatus.default('active'),
});
export type SteeringFields = z.infer<typeof SteeringFields>;

export const SteeringStatementContract = z.object({
  kind: z.literal('steering'),
  scope: z.object({
    type: z.literal('governance'),
    roomId: z.string().uuid(),
  }),
  content: z.string().min(1),
  sources: z.array(z.string().uuid()).min(1),
  fields: SteeringFields,
});
export type SteeringStatementContract = z.infer<typeof SteeringStatementContract>;

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
