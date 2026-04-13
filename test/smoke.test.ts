import { describe, expect, it } from 'vitest';
import { StatementKind, Scope } from '../src/core/statement.js';
import { TriggerSpec } from '../src/core/scheduler.js';
import { WorkerRegistry } from '../src/core/worker.js';

describe('core schemas', () => {
  it('parses a world scope', () => {
    expect(Scope.parse({ type: 'world' })).toEqual({ type: 'world' });
  });

  it('parses a rules scope with default variant', () => {
    const s = Scope.parse({ type: 'rules', system: 'dnd5e' });
    expect(s).toEqual({ type: 'rules', system: 'dnd5e', variant: 'base' });
  });

  it('knows statement kinds', () => {
    expect(StatementKind.parse('narration')).toBe('narration');
  });

  it('parses a cron trigger', () => {
    expect(TriggerSpec.parse({ type: 'cron', expr: '*/5 * * * *' }).type).toBe('cron');
  });
});

describe('worker registry', () => {
  it('rejects duplicate registration', () => {
    const reg = new WorkerRegistry();
    const w = {
      name: 'noop',
      schema: { parse: (x: unknown) => x } as never,
      handler: async () => {},
    };
    reg.register(w);
    expect(() => reg.register(w)).toThrow(/already registered/);
  });
});
