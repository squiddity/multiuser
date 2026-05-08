import { randomUUID } from 'node:crypto';
import { loadAgentPrompt } from '../store/content.js';
import { getRoom } from '../store/rooms.js';
import { listActiveSteeringFor } from '../store/steering.js';
import { transcriptRegistry } from '../store/markdown/transcript-registry.js';
import {
  createContextAssembler,
  type ContextAssembler,
  type ContextStatement,
} from '../core/context-assembler.js';
import { createStatementStore } from '../store/statement-store.js';
import type { StatementStore, StatementStoreRow } from '../core/statement-store.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

import type { SessionAwareRuntime } from '../models/session-runtime.js';
import { createPiAiLlmRuntime } from '../models/pi-runtime.js';
import type { LlmRuntime } from '../core/llm-runtime.js';
import type { SteeringCandidate } from '../core/briefing-steering.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NarratorOutputKind = 'narration' | 'pose' | 'invention';

export interface NarratorOutput {
  kind: NarratorOutputKind;
  content: string;
  openQuestion?: {
    subject: string;
    candidate: string;
    routedTo: string;
  };
}

export interface NarratorConfig {
  modelSpec: string;
  campaignId?: string | null;
  adminRoomId?: string | null;
  /** Session-aware runtime (preferred) or fallback one-shot runtime */
  sessionRuntime?: SessionAwareRuntime;
  llmRuntime?: LlmRuntime;
  statementStore?: StatementStore;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMPTY_OUTPUT_FALLBACK =
  'The world stirs, but the answer catches in the wind before it can be spoken.';

// ---------------------------------------------------------------------------
// Narrator
// ---------------------------------------------------------------------------

export class Narrator {
  private readonly config: NarratorConfig;
  private sessionRuntime: SessionAwareRuntime | null;
  private readonly fallbackLlmRuntime: LlmRuntime;
  private readonly statementStore: StatementStore;
  private readonly assembler: ContextAssembler;

  constructor(config: NarratorConfig) {
    this.config = config;
    this.sessionRuntime = null; // lazily initialized via getSessionRuntime()
    this.fallbackLlmRuntime = config.llmRuntime ?? createPiAiLlmRuntime();
    this.statementStore = config.statementStore ?? createStatementStore();
    this.assembler = createContextAssembler();
  }

  /**
   * Compose a narrative response for the given room and player action.
   *
   * Uses the session-aware runtime when possible. If the runtime rejects the
   * session-aware call (e.g., session destroyed mid-turn), falls back to the
   * one-shot PiAiLlmRuntime.generate().
   */
  async compose(roomId: string, userId: string, recentContent?: string): Promise<NarratorOutput> {
    const prompt = await loadAgentPrompt('narrator', this.config.campaignId ?? null);
    const context = await this.buildContext(roomId, userId);
    const assembly = this.assembler.assemble({
      statements: context.statements as ContextStatement[],
      steering: context.activeSteering,
      playerAction: recentContent ?? '',
      playerName: context.playerName ?? undefined,
    });

    if (env.LOG_LLM_INPUT) {
      logger.info(
        {
          roomId,
          userId,
          modelSpec: this.config.modelSpec,
          systemPrompt: prompt.content,
          userPrompt: assembly.userPrompt,
          contextStats: assembly.stats,
          activeSteering: context.activeSteering.map((s) => ({
            id: s.id,
            intent: s.fields.intent,
            direction: s.fields.direction,
          })),
        },
        'narrator: session turn context',
      );
    }

    // Lazily initialize session runtime on first compose
    if (!this.sessionRuntime && !this.config.sessionRuntime) {
      try {
        const { getSessionRuntime } = await import('../models/pi-runtime.js');
        this.sessionRuntime = getSessionRuntime();
      } catch {
        // Module not available (e.g., mocked in tests) — use one-shot only
      }
    }
    const runtime = this.config.sessionRuntime ?? this.sessionRuntime;

    // Try session-aware path first (if runtime is available)
    if (runtime) {
      try {
        const result = await runtime.generateInSession({
          modelSpec: this.config.modelSpec,
          systemPrompt: prompt.content,
          sessionId: this.sessionIdFor(roomId),
          prompt: assembly.userPrompt,
          metadata: {
            requestId: randomUUID(),
            caller: 'narrator.compose',
            roomId,
            userId,
          },
        });

        logger.info(
          {
            roomId,
            userId,
            modelSpec: this.config.modelSpec,
            responseChars: result.text.length,
            usage: result.usage
              ? {
                  inputTokens: result.usage.inputTokens,
                  outputTokens: result.usage.outputTokens,
                  cacheRead: result.usage.cacheRead,
                  totalTokens: result.usage.totalTokens,
                }
              : undefined,
            tokensPerSecond: result.tokensPerSecond?.toFixed(1),
            turnStats: assembly.stats,
          },
          'narrator: session turn success',
        );

        return this.parseOutput(result.text);
      } catch (sessionErr) {
        logger.warn(
          { err: sessionErr, roomId, userId },
          'narrator: session-aware turn failed; falling back to one-shot',
        );
      }
    } else {
      logger.debug({ roomId }, 'narrator: no session runtime available; using one-shot');
    }

    // Fallback: one-shot generation (also used when session runtime unavailable)
    try {
      const fallbackResult = await this.fallbackLlmRuntime.generate({
        modelSpec: this.config.modelSpec,
        systemPrompt: prompt.content,
        prompt: assembly.userPrompt,
        metadata: {
          requestId: randomUUID(),
          caller: 'narrator.compose.fallback',
          roomId,
          userId,
        },
      });

      logger.info(
        { roomId, userId, responseChars: fallbackResult.text.length },
        'narrator: one-shot turn success',
      );

      return this.parseOutput(fallbackResult.text);
    } catch (fallbackErr) {
      logger.error({ err: fallbackErr, roomId, userId }, 'narrator: one-shot also failed');
      return {
        kind: 'narration',
        content: EMPTY_OUTPUT_FALLBACK,
      };
    }
  }

  /**
   * Emit the narrator's output as a statement and optionally as an open question.
   */
  async emit(roomId: string, output: NarratorOutput, sources?: string[]): Promise<string[]> {
    const room = await getRoom(roomId);
    if (!room) throw new Error(`room not found: ${roomId}`);

    const ids: string[] = [];

    const statementId = await this.statementStore.emitAgentStatement({
      scope: room.binding.writeTarget,
      kind: output.kind,
      content: output.content,
      authorId: 'narrator',
      sources: sources ?? [],
    });
    ids.push(statementId);

    // Dual-write to narration transcript (Phase 1).
    transcriptRegistry
      .get(roomId, 'narration')
      .append('*narrator*', output.content)
      .catch((err) => logger.warn({ err }, 'transcript-writer: narration append failed'));

    if (output.kind === 'invention' && output.openQuestion && this.config.adminRoomId) {
      const oqId = await this.statementStore.createOpenQuestion(
        { type: 'governance', roomId: this.config.adminRoomId },
        {
          subject: output.openQuestion.subject,
          candidate: output.openQuestion.candidate,
          routedTo: this.config.adminRoomId,
          sources,
        },
      );
      ids.push(oqId);
    }

    return ids;
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  /**
   * Build a stable session ID from the room ID.
   */
  private sessionIdFor(roomId: string): string {
    return `narrator:${roomId}`;
  }

  /**
   * Retrieve context from the statement store and active steering.
   */
  private async buildContext(
    roomId: string,
    userId: string,
  ): Promise<{
    statements: ContextStatement[];
    worldCanon: string;
    partyExperience: string;
    activeSteering: SteeringCandidate[];
    playerName?: string;
  }> {
    const rows = await this.statementStore.retrieveForUserRoom(userId, roomId, { limit: 20 });

    const statements: ContextStatement[] = rows.map((r: StatementStoreRow) => ({
      kind: r.kind,
      authorId: r.authorId,
      content: r.content,
      approxTokens: Math.ceil(r.content.length / 4),
    }));

    const worldCanon = rows
      .filter((r) => r.scopeType === 'world')
      .map((r) => r.content)
      .join('\n\n');

    const partyExperience = rows
      .filter((r) => r.scopeType === 'party' && r.scopeKey === roomId)
      .map((r) => `[${r.kind}] ${r.content}`)
      .join('\n\n');

    const activeSteering = this.config.adminRoomId
      ? await listActiveSteeringFor(roomId, this.config.adminRoomId)
      : [];

    return {
      statements,
      worldCanon: worldCanon || '(no world canon yet)',
      partyExperience: partyExperience || '(no party experience yet)',
      activeSteering,
    };
  }

  /**
   * Parse a JSON response from the narrator.
   */
  private parseOutput(text: string): NarratorOutput {
    const trimmed = text.trim();
    if (!trimmed) {
      logger.error('narrator: llm returned empty output; using deterministic fallback narration');
      return {
        kind: 'narration',
        content: EMPTY_OUTPUT_FALLBACK,
      };
    }

    try {
      const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('no JSON found');
      }
      const parsed = JSON.parse(jsonMatch[0]!);

      if (!parsed.kind || typeof parsed.content !== 'string') {
        throw new Error('missing required fields');
      }

      if (!['narration', 'pose', 'invention'].includes(parsed.kind)) {
        throw new Error(`invalid kind: ${parsed.kind}`);
      }

      const content = parsed.content.trim();
      if (!content) {
        throw new Error('empty content');
      }

      return {
        kind: parsed.kind,
        content,
        openQuestion: parsed.openQuestion,
      };
    } catch (err) {
      logger.warn(
        {
          err,
          responseChars: text.length,
          textPreview: text.substring(0, 200),
        },
        'narrator: failed to parse output, using fallback narration',
      );

      return {
        kind: 'narration',
        content: EMPTY_OUTPUT_FALLBACK,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createNarrator(config: NarratorConfig): Narrator {
  return new Narrator(config);
}
