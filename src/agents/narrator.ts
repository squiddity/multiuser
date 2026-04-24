import { loadAgentPrompt } from '../store/content.js';
import { getRoom } from '../store/rooms.js';
import { listActiveSteeringFor } from '../store/steering.js';
import { createPiAiLlmRuntime } from '../models/pi-runtime.js';
import { createStatementStore } from '../store/statement-store.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import type { LlmRuntime } from '../core/llm-runtime.js';
import type { StatementStore } from '../core/statement-store.js';
import type { SteeringCandidate } from '../core/briefing-steering.js';

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
  llmRuntime?: LlmRuntime;
  statementStore?: StatementStore;
}

export class Narrator {
  private readonly config: NarratorConfig;
  private readonly llmRuntime: LlmRuntime;
  private readonly statementStore: StatementStore;

  constructor(config: NarratorConfig) {
    this.config = config;
    this.llmRuntime = config.llmRuntime ?? createPiAiLlmRuntime();
    this.statementStore = config.statementStore ?? createStatementStore();
  }

  async compose(roomId: string, userId: string, recentContent?: string): Promise<NarratorOutput> {
    const prompt = await loadAgentPrompt('narrator', this.config.campaignId ?? null);
    const context = await this.buildContext(roomId, userId);
    const userPrompt = this.buildUserPrompt(context, recentContent);

    if (env.LOG_LLM_INPUT) {
      logger.info(
        {
          roomId,
          userId,
          modelSpec: this.config.modelSpec,
          systemPrompt: prompt.content,
          userPrompt,
          activeSteering: context.activeSteering.map((s) => ({
            id: s.id,
            intent: s.fields.intent,
            direction: s.fields.direction,
          })),
        },
        'narrator: llm input',
      );
    }

    try {
      const result = await this.llmRuntime.generate({
        modelSpec: this.config.modelSpec,
        systemPrompt: prompt.content,
        prompt: userPrompt,
      });

      const parsed = this.parseOutput(result.text);
      return parsed;
    } catch (err) {
      logger.error({ err, roomId, userId }, 'narrator: compose failed');

      return {
        kind: 'narration',
        content: 'The world falls silent. Something interrupts the narrative flow.',
      };
    }
  }

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

  private async buildContext(
    roomId: string,
    userId: string,
  ): Promise<{
    statements: string;
    worldCanon: string;
    partyExperience: string;
    activeSteering: SteeringCandidate[];
  }> {
    const rows = await this.statementStore.retrieveForUserRoom(userId, roomId, { limit: 20 });

    const worldCanon = rows
      .filter((r) => r.scopeType === 'world')
      .map((r) => r.content)
      .join('\n\n');

    const partyExperience = rows
      .filter((r) => r.scopeType === 'party' && r.scopeKey === roomId)
      .map((r) => `[${r.kind}] ${r.content}`)
      .join('\n\n');

    const recentStatements = rows
      .slice(0, 10)
      .map((r) => `[${r.authorId}] ${r.content}`)
      .join('\n');

    const activeSteering = this.config.adminRoomId
      ? await listActiveSteeringFor(roomId, this.config.adminRoomId)
      : [];

    return {
      statements: recentStatements,
      worldCanon: worldCanon || '(no world canon yet)',
      partyExperience: partyExperience || '(no party experience yet)',
      activeSteering,
    };
  }

  private buildUserPrompt(
    context: {
      statements: string;
      worldCanon: string;
      partyExperience: string;
      activeSteering: SteeringCandidate[];
    },
    recentContent?: string,
  ): string {
    let prompt = `## Recent statements in this session\n${context.statements}\n\n`;
    prompt += `## World canon\n${context.worldCanon}\n\n`;
    prompt += `## This party's experience\n${context.partyExperience}\n\n`;

    if (context.activeSteering.length > 0) {
      prompt += `## Active GM steering (apply to this turn)\n`;
      for (const s of context.activeSteering) {
        const bits: string[] = [`intent=${s.fields.intent}`];
        if (s.fields.tone) bits.push(`tone: ${s.fields.tone}`);
        if (s.fields.constraints && s.fields.constraints.length > 0) {
          bits.push(`constraints: ${s.fields.constraints.join('; ')}`);
        }
        bits.push(`direction: ${s.fields.direction}`);
        prompt += `- ${bits.join(' | ')}\n`;
      }
      prompt += `\n`;
    }

    if (recentContent) {
      prompt += `## Player action\n${recentContent}\n\n`;
    }

    prompt += `Respond to continue the narrative. Your response should be JSON with fields:
- kind: "narration" | "pose" | "invention"
- content: your response text
- (only for invention) openQuestion: { subject: string, candidate: string, routedTo: string }

Return valid JSON only, no additional text.`;

    return prompt;
  }

  private parseOutput(text: string): NarratorOutput {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('no JSON found');
      }
      const parsed = JSON.parse(jsonMatch[0]!);

      if (!parsed.kind || !parsed.content) {
        throw new Error('missing required fields');
      }

      if (!['narration', 'pose', 'invention'].includes(parsed.kind)) {
        throw new Error(`invalid kind: ${parsed.kind}`);
      }

      return {
        kind: parsed.kind,
        content: parsed.content,
        openQuestion: parsed.openQuestion,
      };
    } catch (err) {
      logger.warn(
        { text: text.substring(0, 200) },
        'narrator: failed to parse output, using as narration',
      );

      return {
        kind: 'narration',
        content: text.substring(0, 500),
      };
    }
  }
}

export function createNarrator(config: NarratorConfig): Narrator {
  return new Narrator(config);
}
