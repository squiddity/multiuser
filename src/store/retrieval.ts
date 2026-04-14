import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from './client.js';
import { statements } from './schema.js';
import { scopeParts } from './statements.js';
import { getRoom, getActiveGrantsForUserRoom } from './rooms.js';
import { getRole } from './rooms.js';
import type { Scope } from '../core/statement.js';
import type { ScopePattern } from '../core/room.js';

export interface RetrieveOptions {
  limit?: number;
  kind?: string;
}

export interface StatementRow {
  id: string;
  scopeType: string;
  scopeKey: string | null;
  kind: string;
  authorType: string;
  authorId: string;
  icOoc: string | null;
  createdAt: Date;
  supersedes: string | null;
  sources: string[];
  content: string;
  fields: Record<string, unknown>;
  embedding: number[] | null;
}

function patternToSql(pattern: ScopePattern) {
  switch (pattern.type) {
    case 'world':
    case 'mapping':
    case 'eval':
      return sql`${statements.scopeType} = ${pattern.type} AND ${statements.scopeKey} IS NULL`;
    case 'party':
      if (pattern.partyId) {
        return sql`${statements.scopeType} = 'party' AND ${statements.scopeKey} = ${pattern.partyId}`;
      }
      return sql`${statements.scopeType} = 'party'`;
    case 'character':
      if (pattern.characterId) {
        return sql`${statements.scopeType} = 'character' AND ${statements.scopeKey} = ${pattern.characterId}`;
      }
      return sql`${statements.scopeType} = 'character'`;
    case 'session':
      if (pattern.sessionId) {
        return sql`${statements.scopeType} = 'session' AND ${statements.scopeKey} = ${pattern.sessionId}`;
      }
      return sql`${statements.scopeType} = 'session'`;
    case 'meta':
      if (pattern.roomId) {
        return sql`${statements.scopeType} = 'meta' AND ${statements.scopeKey} = ${pattern.roomId}`;
      }
      return sql`${statements.scopeType} = 'meta'`;
    case 'governance':
      if (pattern.roomId) {
        return sql`${statements.scopeType} = 'governance' AND ${statements.scopeKey} = ${pattern.roomId}`;
      }
      return sql`${statements.scopeType} = 'governance'`;
    case 'rules': {
      const variant = pattern.variant ?? 'base';
      return sql`${statements.scopeType} = 'rules' AND ${statements.scopeKey} = ${pattern.system}:${variant}`;
    }
    case 'style':
      if (pattern.worldId) {
        return sql`${statements.scopeType} = 'style' AND ${statements.scopeKey} = ${pattern.worldId}`;
      }
      return sql`${statements.scopeType} = 'style'`;
  }
}

async function resolveReadPatterns(
  userId: string,
  roomId: string,
): Promise<{ patterns: ScopePattern[]; hasGrants: boolean }> {
  const room = await getRoom(roomId);
  if (!room) throw new Error(`room not found: ${roomId}`);

  const grants = await getActiveGrantsForUserRoom(userId, roomId);
  if (grants.length === 0) return { patterns: [], hasGrants: false };

  const patterns: ScopePattern[] = [];
  const seen = new Set<string>();

  function addPattern(p: ScopePattern) {
    const key = JSON.stringify(p);
    if (!seen.has(key)) {
      seen.add(key);
      patterns.push(p);
    }
  }

  for (const s of room.binding.readSet) {
    addPattern(s);
  }

  for (const grant of grants) {
    const role = await getRole(grant.roleId);
    if (!role) continue;
    for (const s of role.readScopes) {
      addPattern(s as ScopePattern);
    }
  }

  return { patterns, hasGrants: true };
}

function buildWhere(patterns: ScopePattern[], kind?: string) {
  const scopeClauses = patterns.map(patternToSql);
  const conditions = [or(...scopeClauses)!];
  if (kind) conditions.push(eq(statements.kind, kind));
  return and(...conditions);
}

export async function retrieveForUserRoom(
  userId: string,
  roomId: string,
  opts: RetrieveOptions = {},
): Promise<StatementRow[]> {
  const { patterns, hasGrants } = await resolveReadPatterns(userId, roomId);
  if (!hasGrants || patterns.length === 0) return [];
  const where = buildWhere(patterns, opts.kind);
  const rows = await db
    .select()
    .from(statements)
    .where(where)
    .orderBy(desc(statements.createdAt))
    .limit(opts.limit ?? 100);
  return rows as StatementRow[];
}

export async function retrieveByScopes(
  scopes: Scope[],
  opts: RetrieveOptions = {},
): Promise<StatementRow[]> {
  if (scopes.length === 0) return [];
  const patterns: ScopePattern[] = scopes.map((s) => s as ScopePattern);
  const where = buildWhere(patterns, opts.kind);
  const rows = await db
    .select()
    .from(statements)
    .where(where)
    .orderBy(desc(statements.createdAt))
    .limit(opts.limit ?? 100);
  return rows as StatementRow[];
}
