import type { Tool } from 'ai';
import { z } from 'zod';

export const RollParams = z.object({
  count: z.number().int().positive().describe('Number of dice to roll'),
  sides: z.number().int().positive().describe('Number of sides per die'),
  modifier: z.number().int().default(0).describe('Modifier added to the total'),
  seed: z.string().optional().describe('Optional seed for deterministic results'),
});
export type RollParams = z.infer<typeof RollParams>;

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
  const { count, sides, modifier, seed } = params;
  const rand = seed ? seededRandom(seed) : Math.random;

  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    values.push(Math.floor(rand() * sides) + 1);
  }
  const total = values.reduce((a, b) => a + b, 0) + modifier;
  return { values, total };
}

export function createRollTool(): Tool {
  return {
    description: 'Roll dice for skill checks, attacks, and damage. Uses a seed for deterministic results.',
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