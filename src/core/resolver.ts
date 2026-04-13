import { z } from 'zod';

export const ResolveRequest = z.object({
  system: z.string().min(1),
  kind: z.enum([
    'attack',
    'saving-throw',
    'skill-check',
    'damage',
    'effect-application',
    'condition-check',
    'freeform',
    'initiative',
  ]),
  actor: z.string().uuid(),
  target: z.string().uuid().optional(),
  action: z.object({
    name: z.string(),
    params: z.record(z.unknown()).default({}),
  }),
  modifiers: z
    .object({
      advantage: z.boolean().optional(),
      disadvantage: z.boolean().optional(),
      bonus: z.number().optional(),
      penalty: z.number().optional(),
      circumstantial: z.array(z.string()).default([]),
    })
    .default({}),
  contextStatements: z.array(z.string().uuid()).default([]),
  rollPolicy: z.enum(['roll-now', 'use-provided', 'caller-rolls']).default('roll-now'),
  providedRoll: z.number().int().optional(),
  seed: z.string().optional(),
});
export type ResolveRequest = z.infer<typeof ResolveRequest>;

export const Roll = z.object({
  dice: z.string(),
  values: z.array(z.number().int()),
  modifier: z.number().int().default(0),
  total: z.number().int(),
  purpose: z.string(),
});
export type Roll = z.infer<typeof Roll>;

export const Effect = z.object({
  kind: z.enum(['damage', 'heal', 'condition-apply', 'condition-remove', 'resource', 'custom']),
  target: z.string().uuid().optional(),
  fields: z.record(z.unknown()).default({}),
});
export type Effect = z.infer<typeof Effect>;

export const Ruling = z.object({
  subject: z.string(),
  reasoning: z.string(),
  citations: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
});
export type Ruling = z.infer<typeof Ruling>;

export const ResolveResult = z.object({
  outcome: z.object({
    result: z.enum(['success', 'failure', 'crit-success', 'crit-failure', 'partial']),
    margin: z.number().int().optional(),
    degrees: z.number().int().optional(),
  }),
  rolls: z.array(Roll).default([]),
  effects: z.array(Effect).default([]),
  ruling: Ruling.optional(),
  narrationHook: z.string(),
  confidence: z.number().min(0).max(1).default(1),
});
export type ResolveResult = z.infer<typeof ResolveResult>;

export const ActionSpec = z.object({
  name: z.string(),
  label: z.string(),
  kind: ResolveRequest.shape.kind,
  paramsSchema: z.record(z.unknown()).default({}),
  valid: z.boolean().default(true),
  reason: z.string().optional(),
});
export type ActionSpec = z.infer<typeof ActionSpec>;

export interface Resolver {
  readonly system: string;
  resolve(req: ResolveRequest): Promise<ResolveResult>;
  describeActions(actor: string, contextStatementIds: string[]): Promise<ActionSpec[]>;
}
