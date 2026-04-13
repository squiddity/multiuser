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

export const ScopeBinding = z.object({
  writeTarget: Scope,
  readSet: z.array(Scope),
  emitSet: z.array(Scope).default([]),
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
