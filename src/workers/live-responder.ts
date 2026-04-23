import { Type, type Static } from 'typebox';
import { withValidation } from '../lib/typebox.js';
import type { Worker } from '../core/worker.js';
import { getStatement } from '../store/statements.js';
import { Narrator } from '../agents/narrator.js';

const LiveResponderPayloadSchema = Type.Object({
  // merged from StatementEvent by CronerScheduler:
  id: Type.String({ format: 'uuid' }),
  kind: Type.String(),
  scopeType: Type.String(),
  scopeKey: Type.Union([Type.String(), Type.Null()]),
  // static config registered at boot:
  adminRoomId: Type.String({ format: 'uuid' }),
  modelSpec: Type.String(),
});

export const LiveResponderPayload = withValidation(LiveResponderPayloadSchema);
export type LiveResponderPayload = Static<typeof LiveResponderPayloadSchema>;

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
      ctx.logger.info(
        { id, roomId },
        'live-responder: mechanical action detected; resolver path not yet wired (task 9)',
      );
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
