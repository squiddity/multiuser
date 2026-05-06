/**
 * Context Assembler — tiered prompt composition for session-aware LLM turns.
 *
 * Produces structured user messages with clearly delimited sections so the
 * agent can reason about each source of information independently while the
 * provider can cache the stable prefix across turns.
 *
 * ### Prompt structure (per-turn user message):
 *
 * ```
 * ## Statement Store Context
 * [retrieved canon, party history, character knowledge]
 * ─── section boundary ───
 * ## Active Steering
 * [GM tone/direction/constraints — highest priority]
 * ─── section boundary ───
 * ## Latest Player Action
 * [the user's /say text or interaction]
 * ───
 * ```
 *
 * Each turn the system prompt (stable) does not change, the session transcript
 * grows by appending these structured user+assistant pairs, and the volatile
 * retrieval (statements + steering) only affects the tail of each user message.
 */

import type { SteeringCandidate } from './briefing-steering.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContextStatement {
  kind: string;
  authorId: string;
  content: string;
  /** Number of tokens approximate (chars/4) for telemetry */
  approxTokens?: number;
}

export interface ContextInput {
  /** Retrieved statements from the store (world canon, party history, etc.) */
  statements: ContextStatement[];
  /** Active GM steering directives */
  steering: SteeringCandidate[];
  /** The latest player action (/say text) */
  playerAction: string;
  /** Optional player/character display name */
  playerName?: string;
}

export interface ContextAssembly {
  /** The per-turn user prompt with delimited sections */
  userPrompt: string;
  /** Summary stats for logging */
  stats: {
    statementCount: number;
    steeringCount: number;
    actionChars: number;
    totalPromptChars: number;
  };
}

// ---------------------------------------------------------------------------
// Delimiters
// ---------------------------------------------------------------------------

const SECTION_BOUNDARY = '\n───\n';
const SECTION_HEADER_PREFIX = '## ';

// ---------------------------------------------------------------------------
// Assembler
// ---------------------------------------------------------------------------

export class ContextAssembler {
  /**
   * Assemble a per-turn user prompt from the given inputs.
   *
   * The prompt is structured in three sections, separated by clear visual
   * boundaries so the model can distinguish each source of information.
   */
  assemble(input: ContextInput): ContextAssembly {
    const sections: string[] = [];

    // Section 1: Statement Store Context
    if (input.statements.length > 0) {
      const body = this.formatStatements(input.statements);
      sections.push(`${SECTION_HEADER_PREFIX}Statement Store Context\n${body}`);
    }

    // Section 2: Active Steering
    if (input.steering.length > 0) {
      const body = this.formatSteering(input.steering);
      sections.push(`${SECTION_HEADER_PREFIX}Active Steering\n${body}`);
    }

    // Section 3: Latest Player Action
    const actionName = input.playerName ? `\n${input.playerName} says:` : '';
    sections.push(
      `${SECTION_HEADER_PREFIX}Latest Player Action${actionName}\n${input.playerAction || '(silence — continue the scene unprompted)'}`,
    );

    // Close the prompt with the instruction to respond
    sections.push('');
    sections.push(
      'Compose your response to the latest action, applying any active steering directives and respecting established canon.',
    );

    const userPrompt = sections.join(SECTION_BOUNDARY);

    return {
      userPrompt,
      stats: {
        statementCount: input.statements.length,
        steeringCount: input.steering.length,
        actionChars: input.playerAction.length,
        totalPromptChars: userPrompt.length,
      },
    };
  }

  // -----------------------------------------------------------------------
  // Formatting helpers
  // -----------------------------------------------------------------------

  private formatStatements(statements: ContextStatement[]): string {
    // Group by type for clarity
    const canon = statements.filter(
      (s) => s.kind === 'canon-reference' || s.kind === 'narration' || s.kind === 'world',
    );
    const dialogue = statements.filter((s) => s.kind === 'dialogue');
    const poses = statements.filter((s) => s.kind === 'pose');
    const mechanical = statements.filter((s) => s.kind === 'mechanical' || s.kind === 'ruling');
    const other = statements.filter(
      (s) =>
        ![
          'canon-reference',
          'narration',
          'world',
          'dialogue',
          'pose',
          'mechanical',
          'ruling',
        ].includes(s.kind),
    );

    const lines: string[] = [];

    if (canon.length > 0) {
      lines.push('### Established canon & narration');
      for (const s of canon) {
        lines.push(`[${s.authorId}] ${s.content}`);
      }
    }

    if (dialogue.length > 0) {
      lines.push('### Recent dialogue');
      for (const s of dialogue) {
        lines.push(`[${s.authorId}] ${s.content}`);
      }
    }

    if (poses.length > 0) {
      lines.push('### Character actions');
      for (const s of poses) {
        lines.push(`[${s.authorId}] ${s.content}`);
      }
    }

    if (mechanical.length > 0) {
      lines.push('### Mechanical / rules context');
      for (const s of mechanical) {
        lines.push(`[${s.authorId}] ${s.content}`);
      }
    }

    if (other.length > 0) {
      for (const s of other) {
        lines.push(`[${s.kind}] [${s.authorId}] ${s.content}`);
      }
    }

    return lines.join('\n');
  }

  private formatSteering(steering: ContextStatement[] | SteeringCandidate[]): string {
    // Cast safely — SteeringCandidate has fields
    const candidates = steering as SteeringCandidate[];
    const lines: string[] = [];

    // Show a brief reminder about steering priority
    lines.push(
      '> **Priority:** Active steering directives override default narrative behavior. Apply these before defaulting to your usual style.',
    );
    lines.push('');

    for (const s of candidates) {
      const bits: string[] = [];
      bits.push(`**intent:** ${s.fields.intent}`);
      if (s.fields.tone) bits.push(`**tone:** ${s.fields.tone}`);

      if (s.fields.constraints && s.fields.constraints.length > 0) {
        bits.push(`**constraints:** ${s.fields.constraints.join('; ')}`);
      }

      bits.push(`**direction:** ${s.fields.direction}`);
      lines.push(`- ${bits.join(' | ')}`);
    }

    lines.push('');
    lines.push(
      '*These directives apply to the current turn. Where they conflict, follow the more specific constraint over the general one.*',
    );

    return lines.join('\n');
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createContextAssembler(): ContextAssembler {
  return new ContextAssembler();
}
