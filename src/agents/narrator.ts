import { generateText } from 'ai';
import { resolveModel } from '../models/registry.js';
import { retrieveForUserRoom } from '../store/retrieval.js';
import { emitAgentStatement, createOpenQuestion } from '../store/agents.js';
import { loadAgentPrompt } from '../store/content.js';
import { getRoom, getActiveGrantsForUserRoom } from '../store/rooms.js';
import { logger } from '../config/logger.js';
import type { Scope } from '../core/statement.js';

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
}

export class Narrator {
  private readonly config: NarratorConfig;

  constructor(config: NarratorConfig) {
    this.config = config;
  }

  async compose(
    roomId: string,
    userId: string,
    recentContent?: string,
  ): Promise<NarratorOutput> {
    const prompt = await loadAgentPrompt('narrator', this.config.campaignId ?? null);
    const context = await this.buildContext(roomId, userId);
    const model = resolveModel(this.config.modelSpec);

    try {
      const result = await generateText({
        model,
        system: prompt.content,
        prompt: this.buildUserPrompt(context, recentContent),
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

  async emit(
    roomId: string,
    output: NarratorOutput,
    sources?: string[],
  ): Promise<string[]> {
    const room = await getRoom(roomId);
    if (!room) throw new Error(`room not found: ${roomId}`);

    const ids: string[] = [];

    const statementId = await emitAgentStatement({
      scope: room.binding.writeTarget,
      kind: output.kind,
      content: output.content,
      authorId: 'narrator',
      sources: sources ?? [],
    });
    ids.push(statementId);

    if (output.kind === 'invention' && output.openQuestion && this.config.adminRoomId) {
      const oqId = await createOpenQuestion(
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
  ): Promise<{ statements: string; worldCanon: string; partyExperience: string }> {
    const rows = await retrieveForUserRoom(userId, roomId, { limit: 20 });

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

    return {
      statements: recentStatements,
      worldCanon: worldCanon || '(no world canon yet)',
      partyExperience: partyExperience || '(no party experience yet)',
    };
  }

  private buildUserPrompt(
    context: { statements: string; worldCanon: string; partyExperience: string },
    recentContent?: string,
  ): string {
    let prompt = `## Recent statements in this session\n${context.statements}\n\n`;
    prompt += `## World canon\n${context.worldCanon}\n\n`;
    prompt += `## This party's experience\n${context.partyExperience}\n\n`;

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
      logger.warn({ text: text.substring(0, 200) }, 'narrator: failed to parse output, using as narration');

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