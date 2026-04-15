import { describe, expect, it, vi, beforeEach } from 'vitest';
import { rollDice, createRollTool, RollParams } from '../../src/resolvers/tools/roll.js';

describe('rollDice', () => {
  it('produces deterministic results with same seed', () => {
    const result1 = rollDice({ count: 2, sides: 6, modifier: 3, seed: 'test-seed' });
    const result2 = rollDice({ count: 2, sides: 6, modifier: 3, seed: 'test-seed' });
    expect(result1.values).toEqual(result2.values);
    expect(result1.total).toBe(result2.total);
  });

  it('produces different results with different seeds', () => {
    const result1 = rollDice({ count: 2, sides: 6, modifier: 0, seed: 'seed1' });
    const result2 = rollDice({ count: 2, sides: 6, modifier: 0, seed: 'seed2' });
    expect(result1.values).not.toEqual(result2.values);
  });

  it('applies modifier to total', () => {
    const result = rollDice({ count: 1, sides: 6, modifier: 5 });
    expect(result.total).toBe(result.values[0]! + 5);
  });

  it('handles zero dice', () => {
    const result = rollDice({ count: 0, sides: 6, modifier: 3 });
    expect(result.values).toEqual([]);
    expect(result.total).toBe(3);
  });
});

describe('createRollTool', () => {
  it('creates a tool with correct structure', () => {
    const tool = createRollTool();
    expect(tool.description).toBeDefined();
    expect(typeof tool.execute).toBe('function');
  });

  it('executes and returns result', async () => {
    const tool = createRollTool();
    const result = await tool.execute({ count: 2, sides: 6, modifier: 2 });
    expect(result).toHaveProperty('dice');
    expect(result).toHaveProperty('values');
    expect(result).toHaveProperty('total');
  });

  it('uses seed for deterministic results', async () => {
    const tool = createRollTool();
    const result1 = await tool.execute({ count: 2, sides: 6, modifier: 0, seed: 'fixed-seed' });
    const result2 = await tool.execute({ count: 2, sides: 6, modifier: 0, seed: 'fixed-seed' });
    expect(result1.values).toEqual(result2.values);
  });
});

describe('RollParams validation', () => {
  it('validates positive count', () => {
    expect(() => RollParams.parse({ count: -1, sides: 6 })).toThrow();
    expect(() => RollParams.parse({ count: 0, sides: 6 })).toThrow();
  });

  it('validates positive sides', () => {
    expect(() => RollParams.parse({ count: 1, sides: -1 })).toThrow();
    expect(() => RollParams.parse({ count: 1, sides: 0 })).toThrow();
  });

  it('allows optional modifier and seed', () => {
    const result = RollParams.parse({ count: 1, sides: 6 });
    expect(result.modifier).toBe(0);
    expect(result.seed).toBeUndefined();

    const resultWithOptional = RollParams.parse({ count: 1, sides: 6, modifier: 5, seed: 'abc' });
    expect(resultWithOptional.modifier).toBe(5);
    expect(resultWithOptional.seed).toBe('abc');
  });
});