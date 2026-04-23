import { Type, type Static } from 'typebox';
import { withValidation } from '../../lib/typebox.js';
import type { LlmToolDefinition } from '../../core/llm-runtime.js';

const RollParamsSchema = Type.Object({
  count: Type.Integer({ minimum: 1, description: 'Number of dice to roll' }),
  sides: Type.Integer({ minimum: 1, description: 'Number of sides per die' }),
  modifier: Type.Optional(Type.Integer({ default: 0, description: 'Modifier added to the total' })),
  seed: Type.Optional(Type.String({ description: 'Optional seed for deterministic results' })),
});

export const RollParams = withValidation(RollParamsSchema);
export type RollParams = Static<typeof RollParamsSchema>;

function seededRandom(seed: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return function () {
    h = Math.imul(h, 0x01000193);
    return (h >>> 0) / 4294967296;
  };
}

export function rollDice(params: RollParams): { values: number[]; total: number } {
  const { count, sides, seed } = params;
  const modifier = params.modifier ?? 0;
  const rand = seed ? seededRandom(seed) : Math.random;

  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    values.push(Math.floor(rand() * sides) + 1);
  }
  const total = values.reduce((a, b) => a + b, 0) + modifier;
  return { values, total };
}

export function createRollTool(): LlmToolDefinition {
  return {
    description:
      'Roll dice for skill checks, attacks, and damage. Uses a seed for deterministic results.',
    parameters: RollParams,
    execute: async (params) => {
      const result = rollDice(params);
      return {
        dice: `${params.count}d${params.sides}${params.modifier ? `+${params.modifier}` : ''}`,
        values: result.values,
        total: result.total,
      };
    },
  };
}
