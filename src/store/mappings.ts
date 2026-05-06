import { desc, eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from './client.js';
import { mappings } from './schema.js';
import { appendStatement } from './statements.js';

export interface MappingRecord {
  id: string;
  kind: string;
  sourceId: string;
  platform: string;
  platformId: string;
  fields: Record<string, unknown>;
  createdAt: Date;
  supersedes: string | null;
}

function toRecord(row: typeof mappings.$inferSelect): MappingRecord {
  return {
    id: row.id,
    kind: row.kind,
    sourceId: row.sourceId,
    platform: row.platform,
    platformId: row.platformId,
    fields: (row.fields ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt,
    supersedes: row.supersedes,
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export async function getLatestMappingBySource(
  kind: string,
  sourceId: string,
): Promise<MappingRecord | null> {
  const [row] = await db
    .select()
    .from(mappings)
    .where(and(eq(mappings.kind, kind), eq(mappings.sourceId, sourceId)))
    .orderBy(desc(mappings.createdAt))
    .limit(1);
  return row ? toRecord(row) : null;
}

export async function getLatestMappingByPlatform(
  kind: string,
  platform: string,
  platformId: string,
): Promise<MappingRecord | null> {
  const [row] = await db
    .select()
    .from(mappings)
    .where(
      and(
        eq(mappings.kind, kind),
        eq(mappings.platform, platform),
        eq(mappings.platformId, platformId),
      ),
    )
    .orderBy(desc(mappings.createdAt))
    .limit(1);
  return row ? toRecord(row) : null;
}

export async function recordMapping(input: {
  kind: string;
  sourceId: string;
  platform: string;
  platformId: string;
  fields?: Record<string, unknown>;
  authorId?: string;
  content?: string;
}): Promise<MappingRecord> {
  const fields = input.fields ?? {};
  const existing = await getLatestMappingBySource(input.kind, input.sourceId);
  if (
    existing &&
    existing.platform === input.platform &&
    existing.platformId === input.platformId &&
    stableJson(existing.fields) === stableJson(fields)
  ) {
    return existing;
  }

  const [row] = await db
    .insert(mappings)
    .values({
      id: randomUUID(),
      kind: input.kind,
      sourceId: input.sourceId,
      platform: input.platform,
      platformId: input.platformId,
      fields,
      supersedes: existing?.id ?? null,
    })
    .returning();

  if (!row) {
    throw new Error('failed to record mapping');
  }

  await appendStatement({
    scope: { type: 'mapping' },
    kind: 'mapping',
    authorType: 'system',
    authorId: input.authorId ?? 'mapping-store',
    content: input.content ?? `Recorded mapping ${input.kind} for ${input.sourceId}.`,
    fields: {
      mappingKind: input.kind,
      sourceId: input.sourceId,
      platform: input.platform,
      platformId: input.platformId,
      supersedes: existing?.id ?? null,
      ...fields,
    },
    embedding: null,
  });

  return toRecord(row);
}
