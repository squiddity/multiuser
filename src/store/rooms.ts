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
  const parsed = Role.pick({
    readScopes: true,
    writeScopes: true,
    capabilities: true,
    narrativeAttributes: true,
  }).parse(row.definition);
  return { id: row.id, name: row.name, ...parsed };
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
