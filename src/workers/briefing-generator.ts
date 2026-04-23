import { z } from 'zod';
import type { Worker } from '../core/worker.js';
import { appendStatement } from '../store/statements.js';
import { listByScope } from '../store/statements.js';
import type { Scope } from '../core/statement.js';
import { BriefingStatementContract } from '../core/briefing-steering.js';
import { generateText } from 'ai';
import { resolveModel } from '../models/registry.js';
import type { EventBus } from '../core/events.js';

const BRIEFING_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// Payload includes BOTH static config AND event fields so CronerScheduler can merge them
export const BriefingGeneratorPayload = z.object({
  // Static config (registered at boot)
  partyRoomId: z.string().uuid(),
  adminRoomId: z.string().uuid(),
  modelSpec: z.string(),
  // Event fields (merged from StatementEvent by CronerScheduler)
  id: z.string().uuid().optional(),
  kind: z.string().optional(),
  scopeType: z.string().optional(),
  scopeKey: z.string().nullable().optional(),
});
export type BriefingGeneratorPayload = z.infer<typeof BriefingGeneratorPayload>;

function makeBriefingContent(
  partyInputs: Array<{ id: string; kind: string; content: string }>,
): string {
  if (partyInputs.length === 0) {
    return 'No activity to report.';
  }

  const lines = partyInputs.map((i) => `[${i.kind}] ${i.content}`).join('\n');
  return `Party activity summary:\n${lines}`;
}

export const briefingGeneratorWorker: Worker<BriefingGeneratorPayload> = {
  name: 'briefing-generator',
  schema: BriefingGeneratorPayload,

  async handler(payload, ctx) {
    const {
      partyRoomId,
      adminRoomId,
      modelSpec,
      id: triggerId,
      scopeType: triggerScopeType,
    } = payload;
    const windowStart = new Date(Date.now() - BRIEFING_WINDOW_MS);

    // Validate that we have a valid trigger from a party statement
    if (!triggerId) {
      ctx.logger.info({ partyRoomId }, 'briefing-generator: no trigger ID, skipping');
      return;
    }

    if (triggerScopeType !== 'party') {
      ctx.logger.info(
        { partyRoomId, triggerScopeType },
        'briefing-generator: trigger not from party scope, skipping',
      );
      return;
    }

    const recentInputs = await listByScope({ type: 'party', partyId: partyRoomId }, { limit: 20 });

    const partyInputs = recentInputs
      .filter((r) => {
        const created = new Date(r.createdAt);
        return created >= windowStart && ['dialogue', 'pose', 'narration'].includes(r.kind);
      })
      .map((r) => ({
        id: r.id,
        kind: r.kind,
        content: r.content,
      }));

    if (partyInputs.length === 0) {
      ctx.logger.info({ partyRoomId }, 'briefing-generator: no recent party activity, skipping');
      return;
    }

    const existingBriefings = await listByScope(
      { type: 'governance', roomId: adminRoomId },
      { kind: 'briefing', limit: 10 },
    );

    // STRICT idempotency: only skip if the EXACT triggering statement was already briefed
    // This is the only truly idempotent approach - each statement gets briefed exactly once
    const alreadyBriefed = existingBriefings.some((b) => {
      return b.sources && b.sources.length > 0 && b.sources.includes(triggerId);
    });

    if (alreadyBriefed) {
      ctx.logger.info(
        { partyRoomId, adminRoomId, triggerId },
        'briefing-generator: trigger statement already briefed, skipping',
      );
      return;
    }

    // Generate briefing content via LLM
    let briefingContent: string;
    try {
      const model = resolveModel(modelSpec);
      const summaryPrompt = `Summarize the following party activity into a concise admin briefing (2-3 sentences). Focus on key events, any items requiring GM attention, and unresolved questions.\n\n${partyInputs.map((i) => `- [${i.kind}] ${i.content}`).join('\n')}\n\nBriefing:`;

      const result = await generateText({
        model,
        prompt: summaryPrompt,
      });

      briefingContent = result.text.trim();
    } catch (err) {
      ctx.logger.error({ err, partyRoomId }, 'briefing-generator: LLM call failed');
      briefingContent = makeBriefingContent(partyInputs);
    }

    const sourceIdsOut = partyInputs.map((p) => p.id);
    const now = new Date().toISOString();

    const scope: Scope = { type: 'governance', roomId: adminRoomId };

    // Build fields for the briefing statement
    const fields = {
      partyRoomId,
      adminRoomId,
      sourceIds: sourceIdsOut,
      windowStart: new Date(Date.now() - BRIEFING_WINDOW_MS).toISOString(),
      windowEnd: now,
      unresolved: [] as Array<{ question: string; relatedSourceIds: string[] }>,
    };

    // Validate schema
    const briefingInput = {
      kind: 'briefing' as const,
      scope: { type: 'governance' as const, roomId: adminRoomId },
      content: briefingContent,
      sources: sourceIdsOut,
      fields,
    };

    try {
      BriefingStatementContract.parse(briefingInput);
    } catch (err) {
      ctx.logger.error({ err, partyRoomId }, 'briefing-generator: schema validation failed');
      return;
    }

    // Emit the statement
    let briefingId: string;
    try {
      briefingId = await appendStatement({
        scope,
        kind: 'briefing',
        authorType: 'agent',
        authorId: 'briefing-generator',
        content: briefingContent,
        sources: sourceIdsOut,
        fields,
      });
    } catch (err) {
      ctx.logger.error({ err, partyRoomId }, 'briefing-generator: failed to emit briefing');
      return;
    }

    ctx.logger.info(
      { briefingId, partyRoomId, adminRoomId, sourceCount: sourceIdsOut.length },
      'briefing-generator: emitted',
    );
  },
};
