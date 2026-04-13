import { z } from 'zod';

export const StatementKind = z.enum([
  'narration',
  'dialogue',
  'pose',
  'inner-monologue',
  'private-message',
  'mechanical',
  'ruling',
  'invention',
  'canon-reference',
  'briefing',
  'steering',
  'open-question',
  'authoring-decision',
  'safety-invocation',
  'governance',
  'mapping',
  'interception',
  'eval',
  'reaction',
  'decision',
  'command-query',
]);
export type StatementKind = z.infer<typeof StatementKind>;

export const Scope = z.discriminatedUnion('type', [
  z.object({ type: z.literal('world') }),
  z.object({ type: z.literal('party'), partyId: z.string().uuid() }),
  z.object({ type: z.literal('character'), characterId: z.string().uuid() }),
  z.object({ type: z.literal('session'), sessionId: z.string().uuid() }),
  z.object({ type: z.literal('meta'), roomId: z.string().uuid() }),
  z.object({
    type: z.literal('rules'),
    system: z.string().min(1),
    variant: z.enum(['base', 'house']).default('base'),
  }),
  z.object({ type: z.literal('style'), worldId: z.string().uuid().optional() }),
  z.object({ type: z.literal('governance'), roomId: z.string().uuid() }),
  z.object({ type: z.literal('mapping') }),
  z.object({ type: z.literal('eval') }),
]);
export type Scope = z.infer<typeof Scope>;

export const Statement = z.object({
  id: z.string().uuid(),
  scope: Scope,
  kind: StatementKind,
  authorType: z.enum(['user', 'agent', 'system']),
  authorId: z.string().min(1),
  icOoc: z.enum(['ic', 'ooc']).optional(),
  createdAt: z.string().datetime(),
  supersedes: z.string().uuid().optional(),
  sources: z.array(z.string().uuid()).default([]),
  content: z.string(),
  fields: z.record(z.unknown()).default({}),
  embedding: z.array(z.number()).optional(),
});
export type Statement = z.infer<typeof Statement>;

export const NewStatement = Statement.omit({ id: true, createdAt: true, embedding: true });
export type NewStatement = z.infer<typeof NewStatement>;
