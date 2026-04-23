import type { Logger } from 'pino';
import type { TSchema } from 'typebox';
import type { ValidatedSchema } from '../lib/typebox.js';

export interface WorkerContext {
  logger: Logger;
  now(): Date;
}

export interface Worker<TPayload> {
  readonly name: string;
  readonly schema: ValidatedSchema<TSchema>;
  handler(payload: TPayload, ctx: WorkerContext): Promise<void>;
}

export class WorkerRegistry {
  private readonly workers = new Map<string, Worker<unknown>>();

  register<T>(worker: Worker<T>): void {
    if (this.workers.has(worker.name)) {
      throw new Error(`worker already registered: ${worker.name}`);
    }
    this.workers.set(worker.name, worker as Worker<unknown>);
  }

  get(name: string): Worker<unknown> | undefined {
    return this.workers.get(name);
  }

  async dispatch(name: string, payload: unknown, ctx: WorkerContext): Promise<void> {
    const worker = this.workers.get(name);
    if (!worker) throw new Error(`unknown worker: ${name}`);
    const parsed = worker.schema.parse(payload);
    await worker.handler(parsed, ctx);
  }

  list(): string[] {
    return Array.from(this.workers.keys());
  }
}
