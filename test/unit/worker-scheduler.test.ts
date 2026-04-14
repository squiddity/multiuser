import { describe, expect, it, vi } from 'vitest';
import { EventBus, type StatementEvent } from '../../src/core/events.js';
import { TriggerSpec, type TriggerSpec as TriggerSpecType } from '../../src/core/scheduler.js';
import { WorkerRegistry, type WorkerContext } from '../../src/core/worker.js';
import { CronerScheduler } from '../../src/scheduler/croner-impl.js';
import { logger } from '../../src/config/logger.js';

function makeWorkerContext(): WorkerContext {
  return { logger, now: () => new Date() };
}

describe('EventBus', () => {
  it('calls registered handler on emit', () => {
    const bus = new EventBus();
    const received: StatementEvent[] = [];
    bus.on<StatementEvent>('statement:created', (e) => received.push(e));

    bus.emit<StatementEvent>('statement:created', {
      id: 'abc',
      kind: 'narration',
      scopeType: 'party',
      scopeKey: 'party-1',
    });

    expect(received).toHaveLength(1);
    expect(received[0]!.id).toBe('abc');
  });

  it('does not call handler for different event', () => {
    const bus = new EventBus();
    const received: unknown[] = [];
    bus.on('statement:created', (e) => received.push(e));

    bus.emit('other:event', { foo: 1 });
    expect(received).toHaveLength(0);
  });

  it('supports multiple handlers on same event', () => {
    const bus = new EventBus();
    const calls: string[] = [];
    bus.on('test', () => calls.push('a'));
    bus.on('test', () => calls.push('b'));

    bus.emit('test', null);
    expect(calls).toEqual(['a', 'b']);
  });

  it('unsubscribe removes handler', () => {
    const bus = new EventBus();
    const calls: string[] = [];
    const unsub = bus.on('test', () => calls.push('a'));

    unsub();
    bus.emit('test', null);
    expect(calls).toHaveLength(0);
    expect(bus.listenerCount('test')).toBe(0);
  });

  it('catches handler errors without stopping other handlers', () => {
    const bus = new EventBus();
    const calls: string[] = [];
    bus.on('test', () => {
      throw new Error('boom');
    });
    bus.on('test', () => calls.push('ok'));

    bus.emit('test', null);
    expect(calls).toEqual(['ok']);
  });

  it('listenerCount returns 0 for unknown events', () => {
    const bus = new EventBus();
    expect(bus.listenerCount('unknown')).toBe(0);
  });
});

describe('WorkerRegistry', () => {
  it('dispatches to registered worker with parsed payload', async () => {
    const reg = new WorkerRegistry();
    const received: unknown[] = [];
    reg.register({
      name: 'test-worker',
      schema: TriggerSpec,
      handler: async (payload, _ctx) => {
        received.push(payload);
      },
    });

    const payload = { type: 'cron' as const, expr: '*/5 * * * *' };
    await reg.dispatch('test-worker', payload, makeWorkerContext());
    expect(received).toHaveLength(1);
    expect((received[0] as TriggerSpecType).type).toBe('cron');
  });

  it('throws on unknown worker', async () => {
    const reg = new WorkerRegistry();
    await expect(reg.dispatch('missing', {}, makeWorkerContext())).rejects.toThrow(
      /unknown worker/,
    );
  });

  it('throws on duplicate registration', () => {
    const reg = new WorkerRegistry();
    const w = {
      name: 'dup',
      schema: { parse: (x: unknown) => x } as never,
      handler: async () => {},
    };
    reg.register(w);
    expect(() => reg.register(w)).toThrow(/already registered/);
  });

  it('list returns registered worker names', () => {
    const reg = new WorkerRegistry();
    reg.register({
      name: 'a',
      schema: { parse: (x: unknown) => x } as never,
      handler: async () => {},
    });
    reg.register({
      name: 'b',
      schema: { parse: (x: unknown) => x } as never,
      handler: async () => {},
    });
    expect(reg.list()).toContain('a');
    expect(reg.list()).toContain('b');
  });
});

describe('CronerScheduler', () => {
  it('fireNow dispatches worker immediately', async () => {
    const reg = new WorkerRegistry();
    const received: unknown[] = [];
    reg.register({
      name: 'immediate',
      schema: { parse: (x: unknown) => x } as never,
      handler: async (payload, _ctx) => received.push(payload),
    });

    const scheduler = new CronerScheduler(reg, logger);
    await scheduler.fireNow('immediate', { x: 1 });
    expect(received).toHaveLength(1);
  });

  it('schedule with event trigger fires on matching statement event', async () => {
    const bus = new EventBus();
    const reg = new WorkerRegistry();
    const received: unknown[] = [];
    reg.register({
      name: 'live-responder',
      schema: { parse: (x: unknown) => x } as never,
      handler: async (payload, _ctx) => received.push(payload),
    });

    const scheduler = new CronerScheduler(reg, logger, bus);
    await scheduler.start();

    await scheduler.schedule(
      { type: 'event', predicate: { kind: 'dialogue', scopeType: 'party' } },
      'live-responder',
      { roomId: 'party-1' },
    );

    bus.emit<StatementEvent>('statement:created', {
      id: 's1',
      kind: 'dialogue',
      scopeType: 'party',
      scopeKey: 'party-1-uuid',
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(received).toHaveLength(1);
    expect((received[0] as { roomId: string }).roomId).toBe('party-1');

    await scheduler.stop();
    expect(bus.listenerCount('statement:created')).toBe(0);
  });

  it('event trigger does not fire on non-matching kind', async () => {
    const bus = new EventBus();
    const reg = new WorkerRegistry();
    const received: unknown[] = [];
    reg.register({
      name: 'live-responder',
      schema: { parse: (x: unknown) => x } as never,
      handler: async (payload, _ctx) => received.push(payload),
    });

    const scheduler = new CronerScheduler(reg, logger, bus);
    await scheduler.start();

    await scheduler.schedule({ type: 'event', predicate: { kind: 'dialogue' } }, 'live-responder', {
      roomId: 'party-1',
    });

    bus.emit<StatementEvent>('statement:created', {
      id: 's2',
      kind: 'narration',
      scopeType: 'party',
      scopeKey: 'party-1-uuid',
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(received).toHaveLength(0);

    await scheduler.stop();
  });

  it('event trigger matches on scopeType and scopeKey', async () => {
    const bus = new EventBus();
    const reg = new WorkerRegistry();
    const received: unknown[] = [];
    reg.register({
      name: 'governance-worker',
      schema: { parse: (x: unknown) => x } as never,
      handler: async (payload, _ctx) => received.push(payload),
    });

    const scheduler = new CronerScheduler(reg, logger, bus);
    await scheduler.start();

    await scheduler.schedule(
      {
        type: 'event',
        predicate: { scopeType: 'governance', scopeKey: 'admin-room-uuid' },
      },
      'governance-worker',
      { action: 'resolve-open-question' },
    );

    bus.emit<StatementEvent>('statement:created', {
      id: 's3',
      kind: 'open-question',
      scopeType: 'governance',
      scopeKey: 'admin-room-uuid',
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(received).toHaveLength(1);

    await scheduler.stop();
  });

  it('event trigger with empty predicate matches all statements', async () => {
    const bus = new EventBus();
    const reg = new WorkerRegistry();
    const received: unknown[] = [];
    reg.register({
      name: 'audit-all',
      schema: { parse: (x: unknown) => x } as never,
      handler: async (payload, _ctx) => received.push(payload),
    });

    const scheduler = new CronerScheduler(reg, logger, bus);
    await scheduler.start();

    await scheduler.schedule({ type: 'event', predicate: {} }, 'audit-all', { audit: true });

    bus.emit<StatementEvent>('statement:created', {
      id: 's4',
      kind: 'narration',
      scopeType: 'world',
      scopeKey: null,
    });

    bus.emit<StatementEvent>('statement:created', {
      id: 's5',
      kind: 'governance',
      scopeType: 'governance',
      scopeKey: 'some-room',
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(received).toHaveLength(2);

    await scheduler.stop();
  });

  it('schedule with once trigger fires after delay', async () => {
    vi.useFakeTimers();
    const reg = new WorkerRegistry();
    const received: unknown[] = [];
    reg.register({
      name: 'delayed',
      schema: { parse: (x: unknown) => x } as never,
      handler: async (payload, _ctx) => received.push(payload),
    });

    const scheduler = new CronerScheduler(reg, logger);
    await scheduler.start();

    const future = new Date(Date.now() + 5000).toISOString();
    await scheduler.schedule({ type: 'once', at: future }, 'delayed', { once: true });

    vi.advanceTimersByTime(5000);
    await vi.advanceTimersByTimeAsync(0);

    expect(received).toHaveLength(1);

    await scheduler.stop();
    vi.useRealTimers();
  });

  it('cancel removes scheduled trigger', async () => {
    const reg = new WorkerRegistry();
    const received: unknown[] = [];
    reg.register({
      name: 'cancel-me',
      schema: { parse: (x: unknown) => x } as never,
      handler: async (payload, _ctx) => received.push(payload),
    });

    const scheduler = new CronerScheduler(reg, logger);
    await scheduler.start();

    const id = await scheduler.schedule({ type: 'event', predicate: {} }, 'cancel-me', { data: 1 });
    await scheduler.cancel(id);

    await scheduler.stop();
  });

  it('stop unsubscribes from event bus', async () => {
    const bus = new EventBus();
    const reg = new WorkerRegistry();
    reg.register({
      name: 'noop',
      schema: { parse: (x: unknown) => x } as never,
      handler: async () => {},
    });

    const scheduler = new CronerScheduler(reg, logger, bus);
    await scheduler.start();
    expect(bus.listenerCount('statement:created')).toBe(1);

    await scheduler.stop();
    expect(bus.listenerCount('statement:created')).toBe(0);
  });
});

describe('TriggerSpec schema', () => {
  it('parses event trigger with partial predicate', () => {
    const spec = TriggerSpec.parse({
      type: 'event',
      predicate: { kind: 'narration' },
    });
    expect(spec.type).toBe('event');
    if (spec.type === 'event') {
      expect(spec.predicate.kind).toBe('narration');
      expect(spec.predicate.scopeType).toBeUndefined();
    }
  });

  it('parses event trigger with empty predicate', () => {
    const spec = TriggerSpec.parse({
      type: 'event',
      predicate: {},
    });
    expect(spec.type).toBe('event');
    if (spec.type === 'event') {
      expect(spec.predicate.kind).toBeUndefined();
    }
  });

  it('parses cron trigger', () => {
    const spec = TriggerSpec.parse({ type: 'cron', expr: '0 * * * *' });
    expect(spec.type).toBe('cron');
  });

  it('parses once trigger', () => {
    const spec = TriggerSpec.parse({
      type: 'once',
      at: new Date().toISOString(),
    });
    expect(spec.type).toBe('once');
  });
});
