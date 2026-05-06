import { describe, expect, it } from 'vitest';
import {
  createContextAssembler,
  type ContextStatement,
  type ContextInput,
} from '../../src/core/context-assembler.js';
import type { SteeringCandidate } from '../../src/core/briefing-steering.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stmt(kind: string, authorId: string, content: string): ContextStatement {
  return { kind, authorId, content };
}

function steering(
  fields: Partial<{
    intent: string;
    tone: string;
    constraints: string[];
    direction: string;
  }>,
): SteeringCandidate {
  return {
    id: 'test-steering',
    createdAt: new Date(),
    fields: {
      appliesToPartyRoomId: 'test-room',
      issuedByUserId: 'test-gm',
      intent: fields.intent ?? 'direction',
      tone: fields.tone,
      constraints: fields.constraints ?? [],
      direction: fields.direction ?? 'Proceed with caution.',
      status: 'active',
    },
  };
}

const assembler = createContextAssembler();

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ContextAssembler', () => {
  describe('full assembly — all sections present', () => {
    const result = assembler.assemble({
      statements: [
        stmt('narration', 'narrator', 'The dragon circles above.'),
        stmt('dialogue', 'player-1', '"What should we do?"'),
        stmt('pose', 'player-2', 'Kaelen draws his sword.'),
      ],
      steering: [
        steering({
          intent: 'tone',
          tone: 'tense and ominous',
          constraints: ['No slapstick'],
          direction: 'Escalate urgency.',
        }),
      ],
      playerAction: 'We approach the gate.',
      playerName: 'Aria',
    });

    it('contains Statement Store Context section', () => {
      expect(result.userPrompt).toContain('## Statement Store Context');
    });

    it('contains Active Steering section', () => {
      expect(result.userPrompt).toContain('## Active Steering');
    });

    it('contains Latest Player Action section', () => {
      expect(result.userPrompt).toContain('## Latest Player Action');
    });

    it('includes player name in action section', () => {
      expect(result.userPrompt).toContain('Aria says:');
    });

    it('includes player action text', () => {
      expect(result.userPrompt).toContain('We approach the gate.');
    });

    it('includes steering priority reminder', () => {
      expect(result.userPrompt).toContain(
        'Active steering directives override default narrative behavior',
      );
    });

    it('includes steering intent and tone', () => {
      expect(result.userPrompt).toContain('**intent:** tone');
      expect(result.userPrompt).toContain('**tone:** tense and ominous');
    });

    it('includes steering constraints', () => {
      expect(result.userPrompt).toContain('**constraints:** No slapstick');
    });

    it('includes steering direction', () => {
      expect(result.userPrompt).toContain('**direction:** Escalate urgency.');
    });

    it('includes response instruction', () => {
      expect(result.userPrompt).toContain('Compose your response to the latest action');
    });

    it('uses visual section boundaries', () => {
      // Each section separated by ─── delimiter
      expect(result.userPrompt).toContain('───');
      // 3 sections = 2 boundaries between them + trailing empty → 3 occurrences of ───
      // Actually there's the trailing ─── before the instruction which is counted
      const count = result.userPrompt.split('───').length - 1;
      expect(count).toBeGreaterThanOrEqual(2);
    });

    it('groups statements by kind', () => {
      expect(result.userPrompt).toContain('### Established canon & narration');
      expect(result.userPrompt).toContain('### Recent dialogue');
      expect(result.userPrompt).toContain('### Character actions');
      expect(result.userPrompt).toMatch(/\[narrator\] The dragon circles above/);
      expect(result.userPrompt).toMatch(/\[player-1\] "What should we do\?"/);
      expect(result.userPrompt).toMatch(/\[player-2\] Kaelen draws his sword/);
    });

    it('reports correct stats', () => {
      expect(result.stats.statementCount).toBe(3);
      expect(result.stats.steeringCount).toBe(1);
      expect(result.stats.actionChars).toBe('We approach the gate.'.length);
      expect(result.stats.totalPromptChars).toBeGreaterThan(0);
    });
  });

  describe('no steering — section omitted', () => {
    const result = assembler.assemble({
      statements: [stmt('narration', 'narrator', 'All quiet.')],
      steering: [],
      playerAction: 'We look around.',
    });

    it('omits Active Steering section when no steering', () => {
      expect(result.userPrompt).not.toContain('## Active Steering');
    });

    it('still includes other sections', () => {
      expect(result.userPrompt).toContain('## Statement Store Context');
      expect(result.userPrompt).toContain('## Latest Player Action');
    });

    it('reports zero steering count', () => {
      expect(result.stats.steeringCount).toBe(0);
    });
  });

  describe('no statements — section omitted', () => {
    const result = assembler.assemble({
      statements: [],
      steering: [steering({ intent: 'pacing', direction: 'Speed up the scene.' })],
      playerAction: 'We run.',
    });

    it('omits Statement Store Context when no statements', () => {
      expect(result.userPrompt).not.toContain('## Statement Store Context');
    });

    it('still includes other sections', () => {
      expect(result.userPrompt).toContain('## Active Steering');
      expect(result.userPrompt).toContain('## Latest Player Action');
    });

    it('reports zero statement count', () => {
      expect(result.stats.statementCount).toBe(0);
    });
  });

  describe('action only — no statements, no steering', () => {
    const result = assembler.assemble({
      statements: [],
      steering: [],
      playerAction: 'Hello?',
    });

    it('only shows Latest Player Action and response instruction', () => {
      expect(result.userPrompt).toContain('## Latest Player Action');
      expect(result.userPrompt).toContain('Compose your response');
    });

    it('omits other sections', () => {
      expect(result.userPrompt).not.toContain('## Statement Store Context');
      expect(result.userPrompt).not.toContain('## Active Steering');
    });

    it('reports zero for both counts', () => {
      expect(result.stats.statementCount).toBe(0);
      expect(result.stats.steeringCount).toBe(0);
    });
  });

  describe('empty player action — shows fallback', () => {
    const result = assembler.assemble({
      statements: [],
      steering: [],
      playerAction: '',
    });

    it('shows fallback text for empty action', () => {
      expect(result.userPrompt).toContain('(silence — continue the scene unprompted)');
    });
  });

  describe('statement grouping', () => {
    it('groups canon-reference and narration under canon heading', () => {
      const result = assembler.assemble({
        statements: [
          stmt('canon-reference', 'system', 'The world was created in fire.'),
          stmt('narration', 'narrator', 'A dragon flies overhead.'),
          stmt('world', 'bootstrap', 'The peaks are treacherous.'),
        ],
        steering: [],
        playerAction: 'We look up.',
      });

      expect(result.userPrompt).toContain('### Established canon & narration');
      expect(result.userPrompt).toMatch(/\[system\] The world was created/);
      expect(result.userPrompt).toMatch(/\[narrator\] A dragon flies/);
      expect(result.userPrompt).toMatch(/\[bootstrap\] The peaks are treacherous/);
    });

    it('puts mechanical and ruling under a separate heading', () => {
      const result = assembler.assemble({
        statements: [
          stmt('mechanical', 'system', 'DC 15 Strength check.'),
          stmt('ruling', 'gm-1', 'Advantage on perception in fog.'),
        ],
        steering: [],
        playerAction: 'I roll.',
      });

      expect(result.userPrompt).toContain('### Mechanical / rules context');
    });

    it('puts unknown kinds in a generic line', () => {
      const result = assembler.assemble({
        statements: [
          stmt('briefing', 'system', 'Summary of events.'),
          stmt('invention', 'narrator', 'A new NPC appears.'),
        ],
        steering: [],
        playerAction: 'Continue.',
      });

      expect(result.userPrompt).toContain('[briefing]');
      expect(result.userPrompt).toContain('[invention]');
    });
  });

  describe('steering formatting', () => {
    it('includes constraint text when present', () => {
      const result = assembler.assemble({
        statements: [],
        steering: [
          steering({
            intent: 'constraint',
            constraints: ['No combat', 'Stealth required'],
            direction: 'Avoid detection.',
          }),
        ],
        playerAction: 'We sneak.',
      });

      expect(result.userPrompt).toContain('**constraints:** No combat; Stealth required');
    });

    it('omits constraints line when no constraints', () => {
      const result = assembler.assemble({
        statements: [],
        steering: [steering({ intent: 'direction', direction: 'Go north.' })],
        playerAction: 'Move.',
      });

      expect(result.userPrompt).not.toContain('**constraints:**');
    });

    it('includes multiple steering entries', () => {
      const result = assembler.assemble({
        statements: [],
        steering: [
          steering({ intent: 'tone', tone: 'mysterious', direction: 'Add suspense.' }),
          steering({ intent: 'pacing', direction: 'Speed up.' }),
        ],
        playerAction: 'Proceed.',
      });

      expect(result.userPrompt).toContain('**intent:** tone');
      expect(result.userPrompt).toContain('**intent:** pacing');
    });
  });

  describe('player name formatting', () => {
    it('includes player name when provided', () => {
      const result = assembler.assemble({
        statements: [],
        steering: [],
        playerAction: 'I attack.',
        playerName: 'Kaelen',
      });

      expect(result.userPrompt).toContain('Kaelen says:');
      expect(result.userPrompt).toContain('I attack.');
    });

    it('omits player name when not provided', () => {
      const result = assembler.assemble({
        statements: [],
        steering: [],
        playerAction: 'I attack.',
      });

      expect(result.userPrompt).toContain('## Latest Player Action\nI attack.');
    });
  });
});
