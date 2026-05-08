import { db } from './client.js';
import { statements } from './schema.js';
import { appendStatement } from './statements.js';
import { eq } from 'drizzle-orm';
import type { Logger } from 'pino';

export async function runSmoke(logger: Logger): Promise<void> {
  const probeRoomId = '00000000-0000-0000-0000-000000000001';

  const id = await appendStatement({
    scope: { type: 'governance', roomId: probeRoomId },
    kind: 'governance',
    authorType: 'system',
    authorId: 'smoke',
    content: 'substrate probe',
    fields: { probe: true, at: new Date().toISOString() },
  });

  const [row] = await db.select().from(statements).where(eq(statements.id, id)).limit(1);
  if (!row) throw new Error('smoke: round-trip returned no rows');

  logger.info({ id, scope: 'governance', key: probeRoomId }, 'smoke: SQLite round-trip ok');

  await db.delete(statements).where(eq(statements.id, id));
}
