import { Type, type Static } from 'typebox';
import { DateTime, NonEmptyString, RulesVariant, UUID } from '../lib/schema-primitives.js';
import { withValidation } from '../lib/typebox.js';
import { Scope } from './statement.js';

const CapabilitySchema = NonEmptyString;
export const Capability = withValidation(CapabilitySchema);
export type Capability = Static<typeof CapabilitySchema>;

const ScopePatternSchema = Type.Union([
  Type.Object({ type: Type.Literal('world') }),
  Type.Object({
    type: Type.Literal('party'),
    partyId: Type.Optional(UUID),
  }),
  Type.Object({
    type: Type.Literal('character'),
    characterId: Type.Optional(UUID),
  }),
  Type.Object({
    type: Type.Literal('session'),
    sessionId: Type.Optional(UUID),
  }),
  Type.Object({
    type: Type.Literal('meta'),
    roomId: Type.Optional(UUID),
  }),
  Type.Object({
    type: Type.Literal('rules'),
    system: NonEmptyString,
    variant: Type.Optional(RulesVariant),
  }),
  Type.Object({
    type: Type.Literal('style'),
    worldId: Type.Optional(UUID),
  }),
  Type.Object({
    type: Type.Literal('governance'),
    roomId: Type.Optional(UUID),
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
  id: UUID,
  name: NonEmptyString,
  readScopes: Type.Optional(Type.Array(Scope, { default: [] })),
  writeScopes: Type.Optional(Type.Array(Scope, { default: [] })),
  capabilities: Type.Optional(Type.Array(CapabilitySchema, { default: [] })),
  narrativeAttributes: Type.Optional(Type.Array(Type.String(), { default: [] })),
});
export const Role = withValidation(RoleSchema);
export type Role = Static<typeof RoleSchema>;

const RoomSchema = Type.Object({
  id: UUID,
  name: NonEmptyString,
  binding: ScopeBindingSchema,
  oversightOf: Type.Optional(Type.Array(UUID, { default: [] })),
  createdAt: DateTime,
  archivedAt: Type.Optional(DateTime),
});
export const Room = withValidation(RoomSchema);
export type Room = Static<typeof RoomSchema>;

const RoleGrantSchema = Type.Object({
  userId: NonEmptyString,
  roomId: UUID,
  roleId: UUID,
  grantedAt: DateTime,
  grantedBy: NonEmptyString,
  precedence: Type.Optional(Type.Integer({ default: 0 })),
});
export const RoleGrant = withValidation(RoleGrantSchema);
export type RoleGrant = Static<typeof RoleGrantSchema>;
