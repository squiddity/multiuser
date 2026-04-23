import { Type, type Static } from 'typebox';
import { withValidation } from '../lib/typebox.js';

const TriggerSpecSchema = Type.Union([
  Type.Object({ type: Type.Literal('cron'), expr: Type.String({ minLength: 1 }) }),
  Type.Object({ type: Type.Literal('once'), at: Type.String({ format: 'date-time' }) }),
  Type.Object({
    type: Type.Literal('event'),
    predicate: Type.Object({
      kind: Type.Optional(Type.String()),
      scopeType: Type.Optional(Type.String()),
      scopeKey: Type.Optional(Type.String()),
    }),
  }),
]);

export const TriggerSpec = withValidation(TriggerSpecSchema);
export type TriggerSpec = Static<typeof TriggerSpecSchema>;

export interface Scheduler {
  schedule(trigger: TriggerSpec, workerName: string, payload: unknown): Promise<string>;
  cancel(scheduleId: string): Promise<void>;
  fireNow(workerName: string, payload: unknown): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
}
