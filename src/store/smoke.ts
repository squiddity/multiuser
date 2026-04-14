import { sql } from 'drizzle-orm';
import { db } from './client.js';
import { statements } from './schema.js';
import { appendAndIndex } from './vectors.js';
import { env } from '../config/env.js';
import type { Logger } from 'pino';

export async function runSmoke(logger: Logger): Promise<void> {
  const probeRoomId = '00000000-0000-0000-0000-000000000001';

  const id = await appendAndIndex({
    scope: { type: 'governance', roomId: probeRoomId },
    kind: 'governance',
    authorType: 'system',
    authorId: 'smoke',
    content: 'substrate probe',
    fields: { probe: true, at: new Date().toISOString() },
  });

  const embedId = await appendAndIndex({
    scope: { type: 'eval' },
    kind: 'eval',
    authorType: 'system',
    authorId: 'smoke',
    content: 'vector probe',
  });

  logger.info({ id, scope: 'governance', key: probeRoomId }, 'smoke: round-trip ok');

  const vec = Array.from({ length: env.EMBED_DIM }, (_, i) => (i === 0 ? 1 : 0));
  const vecLit = `[${vec.join(',')}]`;
  const [nearest] = await db.execute<{ id: string; distance: number }>(sql`
    SELECT id, (embedding <=> ${vecLit}::vector) AS distance
    FROM statements
    WHERE embedding IS NOT NULL AND id = ${embedId}::uuid
    LIMIT 1
  `);
  if (!nearest) throw new Error('smoke: embedding probe returned no rows');
  logger.info({ id: embedId, distance: nearest.distance }, 'smoke: pgvector ok');

  await db.delete(statements).where(sql`id IN (${id}::uuid, ${embedId}::uuid)`);
}
