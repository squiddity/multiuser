import { z } from 'zod';

export const TriggerSpec = z.discriminatedUnion('type', [
  z.object({ type: z.literal('cron'), expr: z.string().min(1) }),
  z.object({ type: z.literal('once'), at: z.string().datetime() }),
  z.object({
    type: z.literal('event'),
    predicate: z.object({
      kind: z.string().optional(),
      scopeType: z.string().optional(),
      scopeKey: z.string().optional(),
    }),
  }),
]);
export type TriggerSpec = z.infer<typeof TriggerSpec>;

export interface Scheduler {
  schedule(trigger: TriggerSpec, workerName: string, payload: unknown): Promise<string>;
  cancel(scheduleId: string): Promise<void>;
  fireNow(workerName: string, payload: unknown): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
}
