import { Type, type Static } from 'typebox';
import { withValidation } from '../lib/typebox.js';
import { Scope } from './statement.js';

const CapabilitySchema = Type.String({ minLength: 1 });
export const Capability = withValidation(CapabilitySchema);
export type Capability = Static<typeof CapabilitySchema>;

const ScopePatternSchema = Type.Union([
  Type.Object({ type: Type.Literal('world') }),
  Type.Object({
    type: Type.Literal('party'),
    partyId: Type.Optional(Type.String({ format: 'uuid' })),
  }),
  Type.Object({
    type: Type.Literal('character'),
    characterId: Type.Optional(Type.String({ format: 'uuid' })),
  }),
  Type.Object({
    type: Type.Literal('session'),
    sessionId: Type.Optional(Type.String({ format: 'uuid' })),
  }),
  Type.Object({
    type: Type.Literal('meta'),
    roomId: Type.Optional(Type.String({ format: 'uuid' })),
  }),
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
  Type.Object({
    type: Type.Literal('governance'),
    roomId: Type.Optional(Type.String({ format: 'uuid' })),
  }),
  Type.Object({ type: Type.Literal('mapping') }),
  Type.Object({ type: Type.Literal('eval') }),
]);
export const ScopePattern = withValidation(ScopePatternSchema);
export type ScopePattern = Static<typeof ScopePatternSchema>;

const ScopeBindingSchema = Type.Object({
  writeTarget: Scope,
  readSet: Type.Array(ScopePatternSchema),
  emitSet: Type.Optional(Type.Array(ScopePatternSchema, { default: [] })),
});
export const ScopeBinding = withValidation(ScopeBindingSchema);
export type ScopeBinding = Static<typeof ScopeBindingSchema>;

const RoleSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  name: Type.String({ minLength: 1 }),
  readScopes: Type.Optional(Type.Array(Scope, { default: [] })),
  writeScopes: Type.Optional(Type.Array(Scope, { default: [] })),
  capabilities: Type.Optional(Type.Array(CapabilitySchema, { default: [] })),
  narrativeAttributes: Type.Optional(Type.Array(Type.String(), { default: [] })),
});
export const Role = withValidation(RoleSchema);
export type Role = Static<typeof RoleSchema>;

const RoomSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  name: Type.String({ minLength: 1 }),
  binding: ScopeBindingSchema,
  oversightOf: Type.Optional(Type.Array(Type.String({ format: 'uuid' }), { default: [] })),
  createdAt: Type.String({ format: 'date-time' }),
  archivedAt: Type.Optional(Type.String({ format: 'date-time' })),
});
export const Room = withValidation(RoomSchema);
export type Room = Static<typeof RoomSchema>;

const RoleGrantSchema = Type.Object({
  userId: Type.String({ minLength: 1 }),
  roomId: Type.String({ format: 'uuid' }),
  roleId: Type.String({ format: 'uuid' }),
  grantedAt: Type.String({ format: 'date-time' }),
  grantedBy: Type.String({ minLength: 1 }),
  precedence: Type.Optional(Type.Integer({ default: 0 })),
});
export const RoleGrant = withValidation(RoleGrantSchema);
export type RoleGrant = Static<typeof RoleGrantSchema>;
