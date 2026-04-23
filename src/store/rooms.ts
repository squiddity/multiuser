import { eq, and, isNull } from 'drizzle-orm';
import { db } from './client.js';
import { rooms, roles, roleGrants } from './schema.js';
import { Role, ScopeBinding } from '../core/room.js';
import type { Scope } from '../core/statement.js';

export interface RoomRecord {
  id: string;
  name: string;
  binding: ScopeBinding;
  oversightOf: string[];
}

export async function getRoom(roomId: string): Promise<RoomRecord | null> {
  const [row] = await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
  if (!row) return null;
  const binding = ScopeBinding.parse(row.binding);
  return {
    id: row.id,
    name: row.name,
    binding,
    oversightOf: row.oversightOf as string[],
  };
}

export interface RoleRecord {
  id: string;
  name: string;
  readScopes: Scope[];
  writeScopes: Scope[];
  capabilities: string[];
  narrativeAttributes: string[];
}

export async function getRole(roleId: string): Promise<RoleRecord | null> {
  const [row] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
  if (!row) return null;
  const parsed = Role.parse({
    id: row.id,
    name: row.name,
    ...(row.definition as Record<string, unknown>),
  });
  return {
    id: row.id,
    name: row.name,
    readScopes: parsed.readScopes ?? [],
    writeScopes: parsed.writeScopes ?? [],
    capabilities: parsed.capabilities ?? [],
    narrativeAttributes: parsed.narrativeAttributes ?? [],
  };
}

export interface RoleGrantRecord {
  id: string;
  userId: string;
  roomId: string;
  roleId: string;
  precedence: number;
}

export async function getActiveGrantsForUserRoom(
  userId: string,
  roomId: string,
): Promise<RoleGrantRecord[]> {
  const rows = await db
    .select()
    .from(roleGrants)
    .where(
      and(
        eq(roleGrants.userId, userId),
        eq(roleGrants.roomId, roomId),
        isNull(roleGrants.revokedAt),
      ),
    )
    // Ordered ASC for now — all active grants are unioned for read-set
    // expansion, so order is informational. Per D5 / D6, precedence will
    // matter when conflicting narrative attributes or interception priorities
    // need resolution; revisit the sort direction (likely DESC so
    // highest-precedence wins first-match) when that resolver lands.
    .orderBy(roleGrants.precedence);
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    roomId: r.roomId,
    roleId: r.roleId,
    precedence: r.precedence,
  }));
}

export async function getActiveGrantsForRoom(roomId: string): Promise<RoleGrantRecord[]> {
  const rows = await db
    .select()
    .from(roleGrants)
    .where(and(eq(roleGrants.roomId, roomId), isNull(roleGrants.revokedAt)));
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    roomId: r.roomId,
    roleId: r.roleId,
    precedence: r.precedence,
  }));
}

export async function userHasCapability(
  userId: string,
  roomId: string,
  capability: string,
): Promise<boolean> {
  const grants = await getActiveGrantsForUserRoom(userId, roomId);
  if (!grants.length) return false;
  const roleRecords = await Promise.all(grants.map((g) => getRole(g.roleId)));
  return roleRecords.some((r) => r !== null && r.capabilities.includes(capability));
}
