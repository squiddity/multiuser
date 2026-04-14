import { and, desc, eq, or, sql } from 'drizzle-orm';
import { db } from './client.js';
import { statements } from './schema.js';
import { getRoom, getRole, getActiveGrantsForUserRoom } from './rooms.js';
import { getActingCharacter } from './characters.js';
import type { Scope } from '../core/statement.js';
import type { ScopePattern } from '../core/room.js';

export interface RetrieveOptions {
  limit?: number;
  kind?: string;
  // Reserved for Task 3 (embeddings + ANN). Ignored by scope-only retrieval.
  query?: string;
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
}

// Explicit projection — the embedding vector is 1536 floats we don't need on
// the live-responder path. Task 3's ANN path will add a retrieveSimilar variant
// that does project embeddings.
const selection = {
  id: statements.id,
  scopeType: statements.scopeType,
  scopeKey: statements.scopeKey,
  kind: statements.kind,
  authorType: statements.authorType,
  authorId: statements.authorId,
  icOoc: statements.icOoc,
  createdAt: statements.createdAt,
  supersedes: statements.supersedes,
  sources: statements.sources,
  content: statements.content,
  fields: statements.fields,
};

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
      // Wildcard character patterns must be narrowed by resolveReadPatterns
      // before reaching here. If one slips through, match nothing rather than
      // leaking every character scope.
      if (pattern.characterId) {
        return sql`${statements.scopeType} = 'character' AND ${statements.scopeKey} = ${pattern.characterId}`;
      }
      return sql`false`;
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

  const rawPatterns: ScopePattern[] = [...room.binding.readSet];
  const roles = await Promise.all(grants.map((g) => getRole(g.roleId)));
  for (const role of roles) {
    if (!role) continue;
    for (const s of role.readScopes) rawPatterns.push(s as ScopePattern);
  }

  // Narrow wildcard character patterns to the user's currently-acting character.
  // A wildcard with no active character drops — see memory-model.md.
  const acting = rawPatterns.some((p) => p.type === 'character' && !p.characterId)
    ? await getActingCharacter(userId, roomId)
    : null;

  const narrowed: ScopePattern[] = [];
  const seen = new Set<string>();
  for (const p of rawPatterns) {
    let resolved: ScopePattern | null = p;
    if (p.type === 'character' && !p.characterId) {
      resolved = acting ? { type: 'character', characterId: acting } : null;
    }
    if (!resolved) continue;
    const key = JSON.stringify(resolved);
    if (seen.has(key)) continue;
    seen.add(key);
    narrowed.push(resolved);
  }

  return { patterns: narrowed, hasGrants: true };
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
    .select(selection)
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
    .select(selection)
    .from(statements)
    .where(where)
    .orderBy(desc(statements.createdAt))
    .limit(opts.limit ?? 100);
  return rows as StatementRow[];
}
