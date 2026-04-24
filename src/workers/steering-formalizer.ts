import { Type, type Static } from 'typebox';
import { withValidation } from '../lib/typebox.js';
import type { Worker } from '../core/worker.js';
import { appendStatement, getStatement } from '../store/statements.js';
import { SteeringStatementContract, type SteeringFields } from '../core/briefing-steering.js';

const SteeringFormalizerPayloadSchema = Type.Object({
  // Merged from StatementEvent by CronerScheduler:
  id: Type.String({ format: 'uuid' }),
  kind: Type.String(),
  scopeType: Type.String(),
  scopeKey: Type.Union([Type.String(), Type.Null()]),
});

export const SteeringFormalizerPayload = withValidation(SteeringFormalizerPayloadSchema);
export type SteeringFormalizerPayload = Static<typeof SteeringFormalizerPayloadSchema>;

export const steeringFormalizerWorker: Worker<SteeringFormalizerPayload> = {
  name: 'steering-formalizer',
  schema: SteeringFormalizerPayload,

  async handler(payload, ctx) {
    const { id, kind, scopeKey: adminRoomId } = payload;

    if (kind !== 'steering-request') {
      ctx.logger.debug({ id, kind }, 'steering-formalizer: ignoring non-request event');
      return;
    }
    if (!adminRoomId) {
      ctx.logger.warn({ id }, 'steering-formalizer: no scopeKey in event, skipping');
      return;
    }

    const request = await getStatement(id);
    if (!request) {
      ctx.logger.warn({ id }, 'steering-formalizer: triggering request not found');
      return;
    }

    const reqFields = (request.fields ?? {}) as Partial<SteeringFields>;

    const fields: SteeringFields = {
      appliesToPartyRoomId: reqFields.appliesToPartyRoomId!,
      issuedByUserId: reqFields.issuedByUserId ?? request.authorId,
      intent: reqFields.intent!,
      direction: reqFields.direction!,
      status: 'active',
      ...(reqFields.tone !== undefined ? { tone: reqFields.tone } : {}),
      ...(reqFields.constraints !== undefined ? { constraints: reqFields.constraints } : {}),
    };

    const steeringInput = {
      kind: 'steering' as const,
      scope: { type: 'governance' as const, roomId: adminRoomId },
      content: request.content,
      sources: [id],
      fields,
    };

    const validated = SteeringStatementContract.safeParse(steeringInput);
    if (!validated.success) {
      ctx.logger.error(
        { err: validated.error.message, id, adminRoomId },
        'steering-formalizer: schema validation failed',
      );
      return;
    }

    const steeringId = await appendStatement({
      scope: steeringInput.scope,
      kind: 'steering',
      authorType: 'agent',
      authorId: 'steering-formalizer',
      content: request.content,
      sources: [id],
      fields: fields as unknown as Record<string, unknown>,
    });

    ctx.logger.info(
      { steeringId, requestId: id, adminRoomId, intent: fields.intent },
      'steering-formalizer: emitted',
    );
  },
};
