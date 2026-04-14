import { z } from 'zod';
import { Scope } from './statement.js';

export const Capability = z.string().min(1).brand<'Capability'>();
export type Capability = z.infer<typeof Capability>;

export const Role = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  readScopes: z.array(Scope).default([]),
  writeScopes: z.array(Scope).default([]),
  capabilities: z.array(Capability).default([]),
  narrativeAttributes: z.array(z.string()).default([]),
});
export type Role = z.infer<typeof Role>;

export const ScopePattern = z.discriminatedUnion('type', [
  z.object({ type: z.literal('world') }),
  z.object({ type: z.literal('party'), partyId: z.string().uuid().optional() }),
  z.object({ type: z.literal('character'), characterId: z.string().uuid().optional() }),
  z.object({ type: z.literal('session'), sessionId: z.string().uuid().optional() }),
  z.object({ type: z.literal('meta'), roomId: z.string().uuid().optional() }),
  z.object({
    type: z.literal('rules'),
    system: z.string().min(1),
    variant: z.enum(['base', 'house']).default('base'),
  }),
  z.object({ type: z.literal('style'), worldId: z.string().uuid().optional() }),
  z.object({ type: z.literal('governance'), roomId: z.string().uuid().optional() }),
  z.object({ type: z.literal('mapping') }),
  z.object({ type: z.literal('eval') }),
]);
export type ScopePattern = z.infer<typeof ScopePattern>;

export const ScopeBinding = z.object({
  writeTarget: Scope,
  readSet: z.array(ScopePattern),
  emitSet: z.array(ScopePattern).default([]),
});
export type ScopeBinding = z.infer<typeof ScopeBinding>;

export const Room = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  binding: ScopeBinding,
  oversightOf: z.array(z.string().uuid()).default([]),
  createdAt: z.string().datetime(),
  archivedAt: z.string().datetime().optional(),
});
export type Room = z.infer<typeof Room>;

export const RoleGrant = z.object({
  userId: z.string().min(1),
  roomId: z.string().uuid(),
  roleId: z.string().uuid(),
  grantedAt: z.string().datetime(),
  grantedBy: z.string().min(1),
  precedence: z.number().int().default(0),
});
export type RoleGrant = z.infer<typeof RoleGrant>;
