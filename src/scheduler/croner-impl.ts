import { Cron } from 'croner';
import { randomUUID } from 'node:crypto';
import type { Scheduler, TriggerSpec } from '../core/scheduler.js';
import type { WorkerRegistry } from '../core/worker.js';
import type { EventBus, StatementEvent } from '../core/events.js';
import type { Logger } from 'pino';

interface Entry {
  id: string;
  workerName: string;
  payload: unknown;
  trigger: TriggerSpec;
  cron?: Cron;
  timeout?: NodeJS.Timeout;
}

type EventPredicate = Extract<TriggerSpec, { type: 'event' }>['predicate'];

function matchesPredicate(event: StatementEvent, predicate: EventPredicate): boolean {
  if (predicate.kind !== undefined && predicate.kind !== event.kind) return false;
  if (predicate.scopeType !== undefined && predicate.scopeType !== event.scopeType) return false;
  if (predicate.scopeKey !== undefined && predicate.scopeKey !== event.scopeKey) return false;
  return true;
}

export class CronerScheduler implements Scheduler {
  private readonly entries = new Map<string, Entry>();
  private running = false;
  private unsubscribe?: () => void;

  constructor(
    private readonly workers: WorkerRegistry,
    private readonly logger: Logger,
    private readonly events?: EventBus,
  ) {}

  async schedule(trigger: TriggerSpec, workerName: string, payload: unknown): Promise<string> {
    const id = randomUUID();
    const entry: Entry = { id, workerName, payload, trigger };
    this.entries.set(id, entry);
    if (this.running) this.arm(entry);
    return id;
  }

  async cancel(scheduleId: string): Promise<void> {
    const e = this.entries.get(scheduleId);
    if (!e) return;
    e.cron?.stop();
    if (e.timeout) clearTimeout(e.timeout);
    this.entries.delete(scheduleId);
  }

  async fireNow(workerName: string, payload: unknown): Promise<void> {
    await this.workers.dispatch(workerName, payload, {
      logger: this.logger.child({ worker: workerName }),
      now: () => new Date(),
    });
  }

  async start(): Promise<void> {
    this.running = true;
    if (this.events) {
      this.unsubscribe = this.events.on<StatementEvent>('statement:created', (event) => {
        this.onStatementEvent(event);
      });
    }
    for (const e of this.entries.values()) this.arm(e);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }
    for (const e of this.entries.values()) {
      e.cron?.stop();
      if (e.timeout) clearTimeout(e.timeout);
    }
  }

  private onStatementEvent(event: StatementEvent): void {
    for (const entry of this.entries.values()) {
      if (entry.trigger.type !== 'event') continue;
      if (!matchesPredicate(event, entry.trigger.predicate)) continue;
      this.fireNow(entry.workerName, entry.payload).catch((err) =>
        this.logger.error({ err, worker: entry.workerName }, 'worker failed from event trigger'),
      );
    }
  }

  private arm(entry: Entry): void {
    const run = () =>
      this.fireNow(entry.workerName, entry.payload).catch((err) =>
        this.logger.error({ err, worker: entry.workerName }, 'worker failed'),
      );

    if (entry.trigger.type === 'cron') {
      entry.cron = new Cron(entry.trigger.expr, run);
    } else if (entry.trigger.type === 'once') {
      const at = new Date(entry.trigger.at).getTime();
      const ms = Math.max(0, at - Date.now());
      entry.timeout = setTimeout(run, ms);
    }
    // event triggers are handled by onStatementEvent — no arming needed
  }
}
