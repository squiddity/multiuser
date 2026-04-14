import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from './client.js';
import { statements } from './schema.js';
import type { Scope } from '../core/statement.js';

export interface AppendStatementInput {
  scope: Scope;
  kind: string;
  authorType: string;
  authorId: string;
  content: string;
  icOoc?: 'ic' | 'ooc' | null;
  supersedes?: string | null;
  sources?: string[];
  fields?: Record<string, unknown>;
  embedding?: number[] | null;
}

export function scopeParts(scope: Scope): { scopeType: string; scopeKey: string | null } {
  switch (scope.type) {
    case 'world':
    case 'mapping':
    case 'eval':
      return { scopeType: scope.type, scopeKey: null };
    case 'party':
      return { scopeType: scope.type, scopeKey: scope.partyId };
    case 'character':
      return { scopeType: scope.type, scopeKey: scope.characterId };
    case 'session':
      return { scopeType: scope.type, scopeKey: scope.sessionId };
    case 'meta':
    case 'governance':
      return { scopeType: scope.type, scopeKey: scope.roomId };
    case 'rules':
      return { scopeType: scope.type, scopeKey: `${scope.system}:${scope.variant}` };
    case 'style':
      return { scopeType: scope.type, scopeKey: scope.worldId ?? null };
  }
}

export async function appendStatement(input: AppendStatementInput): Promise<string> {
  const { scopeType, scopeKey } = scopeParts(input.scope);
  const [row] = await db
    .insert(statements)
    .values({
      scopeType,
      scopeKey,
      kind: input.kind,
      authorType: input.authorType,
      authorId: input.authorId,
      icOoc: input.icOoc ?? null,
      supersedes: input.supersedes ?? null,
      sources: input.sources ?? [],
      content: input.content,
      fields: input.fields ?? {},
      embedding: input.embedding ?? null,
    })
    .returning({ id: statements.id });
  if (!row) throw new Error('append failed');
  return row.id;
}

export async function getStatement(id: string) {
  const [row] = await db.select().from(statements).where(eq(statements.id, id)).limit(1);
  return row ?? null;
}

export async function getStatements(ids: string[]) {
  if (ids.length === 0) return [];
  return db.select().from(statements).where(inArray(statements.id, ids));
}

export async function listByScope(
  scope: Scope,
  opts: { kind?: string; limit?: number } = {},
) {
  const { scopeType, scopeKey } = scopeParts(scope);
  const conds = [
    eq(statements.scopeType, scopeType),
    scopeKey === null ? isNull(statements.scopeKey) : eq(statements.scopeKey, scopeKey),
  ];
  if (opts.kind) conds.push(eq(statements.kind, opts.kind));
  return db
    .select()
    .from(statements)
    .where(and(...conds))
    .orderBy(desc(statements.createdAt))
    .limit(opts.limit ?? 100);
}
