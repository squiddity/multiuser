import { z } from 'zod';
import type { Worker } from '../core/worker.js';
import { getStatement } from '../store/statements.js';
import { Narrator } from '../agents/narrator.js';

export const LiveResponderPayload = z.object({
  // merged from StatementEvent by CronerScheduler:
  id: z.string().uuid(),
  kind: z.string(),
  scopeType: z.string(),
  scopeKey: z.string().nullable(),
  // static config registered at boot:
  adminRoomId: z.string().uuid(),
  modelSpec: z.string(),
});
export type LiveResponderPayload = z.infer<typeof LiveResponderPayload>;

export const liveResponderWorker: Worker<LiveResponderPayload> = {
  name: 'live-responder',
  schema: LiveResponderPayload,

  async handler(payload, ctx) {
    const { id, kind, scopeKey: roomId, adminRoomId, modelSpec } = payload;

    if (!roomId) {
      ctx.logger.warn({ id }, 'live-responder: no roomId in event, skipping');
      return;
    }

    const stmt = await getStatement(id);
    if (!stmt) {
      ctx.logger.warn({ id }, 'live-responder: triggering statement not found');
      return;
    }

    if (kind === 'command-query') {
      ctx.logger.info({ id, roomId }, 'live-responder: mechanical action detected; resolver path not yet wired (task 9)');
    }

    const narrator = new Narrator({ modelSpec, adminRoomId });
    const output = await narrator.compose(roomId, stmt.authorId, stmt.content);
    const emittedIds = await narrator.emit(roomId, output, [id]);

    ctx.logger.info(
      { triggerId: id, kind: output.kind, emittedIds },
      'live-responder: narrator emitted',
    );
  },
};
