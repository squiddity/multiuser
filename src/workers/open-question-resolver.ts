import { Type, type Static } from 'typebox';
import { withValidation } from '../lib/typebox.js';
import type { Worker } from '../core/worker.js';
import { getStatement } from '../store/statements.js';
import { emitAgentStatement } from '../store/agents.js';

const OpenQuestionResolverPayloadSchema = Type.Object({
  // merged from StatementEvent by CronerScheduler:
  id: Type.String({ format: 'uuid' }),
  kind: Type.String(),
  scopeType: Type.String(),
  scopeKey: Type.Union([Type.String(), Type.Null()]),
  // no static config needed
});

export const OpenQuestionResolverPayload = withValidation(OpenQuestionResolverPayloadSchema);
export type OpenQuestionResolverPayload = Static<typeof OpenQuestionResolverPayloadSchema>;

export const openQuestionResolverWorker: Worker<OpenQuestionResolverPayload> = {
  name: 'open-question-resolver',
  schema: OpenQuestionResolverPayload,

  async handler(payload, ctx) {
    const { id, scopeKey: adminRoomId } = payload;

    if (!adminRoomId) {
      ctx.logger.warn({ id }, 'open-question-resolver: no scopeKey in event, skipping');
      return;
    }

    const adStmt = await getStatement(id);
    if (!adStmt) {
      ctx.logger.warn({ id }, 'open-question-resolver: authoring-decision statement not found');
      return;
    }

    const adFields = adStmt.fields as {
      openQuestionId?: string;
      decision?: string;
      rationale?: string;
      revisedCandidate?: string;
    };

    const { openQuestionId, decision, revisedCandidate } = adFields;

    if (!openQuestionId || !decision) {
      ctx.logger.warn(
        { id, adFields },
        'open-question-resolver: missing openQuestionId or decision',
      );
      return;
    }

    const oqStmt = await getStatement(openQuestionId);
    if (!oqStmt) {
      ctx.logger.warn(
        { openQuestionId },
        'open-question-resolver: open-question statement not found',
      );
      return;
    }

    const oqFields = oqStmt.fields as {
      subject?: string;
      candidate?: string;
      routedTo?: string;
      blocks?: string[];
      stage?: string;
    };

    const governanceScope = { type: 'governance' as const, roomId: adminRoomId };

    if (decision === 'promote') {
      const canonId = await emitAgentStatement({
        scope: { type: 'world' },
        kind: 'canon-reference',
        content: oqFields.candidate ?? oqStmt.content,
        authorId: 'decision-formalizer',
        sources: [id, openQuestionId],
      });

      await emitAgentStatement({
        scope: governanceScope,
        kind: 'open-question',
        content: oqStmt.content,
        authorId: 'decision-formalizer',
        supersedes: openQuestionId,
        sources: [id],
        fields: { ...oqFields, stage: 'surfaced' },
      });

      ctx.logger.info(
        { openQuestionId, canonId, adminRoomId },
        'open-question-resolver: promoted to world canon',
      );
    } else if (decision === 'reject') {
      await emitAgentStatement({
        scope: governanceScope,
        kind: 'open-question',
        content: oqStmt.content,
        authorId: 'decision-formalizer',
        supersedes: openQuestionId,
        sources: [id],
        fields: { ...oqFields, stage: 'surfaced', rejected: true },
      });

      ctx.logger.info({ openQuestionId, adminRoomId }, 'open-question-resolver: rejected');
    } else if (decision === 'supersede') {
      if (!revisedCandidate) {
        ctx.logger.warn(
          { openQuestionId },
          'open-question-resolver: supersede missing revisedCandidate',
        );
        return;
      }

      await emitAgentStatement({
        scope: governanceScope,
        kind: 'open-question',
        content: `Subject: ${oqFields.subject ?? ''}\n\nCandidate: ${revisedCandidate}`,
        authorId: 'decision-formalizer',
        supersedes: openQuestionId,
        sources: [id],
        fields: { ...oqFields, candidate: revisedCandidate, stage: 'deferred' },
      });

      ctx.logger.info(
        { openQuestionId, adminRoomId },
        'open-question-resolver: superseded with revised candidate',
      );
    } else {
      ctx.logger.warn(
        { openQuestionId, decision },
        'open-question-resolver: unknown decision value',
      );
    }
  },
};
