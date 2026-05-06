#!/usr/bin/env tsx
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import type { LlmTokenUsage, CacheRetention } from '../src/core/llm-runtime.js';
import { createContextAssembler, type ContextStatement } from '../src/core/context-assembler.js';
import type { SteeringCandidate } from '../src/core/briefing-steering.js';
import { env } from '../src/config/env.js';
import { loadAgentPrompt } from '../src/store/content.js';
import { createSessionRuntime, onLlmTelemetry } from '../src/models/pi-runtime.js';

type TurnSpec = {
  action: string;
  steering?: Array<{
    intent: string;
    direction: string;
    tone?: string;
    constraints?: string[];
  }>;
};

type ScenarioSpec = {
  name: string;
  description: string;
  baseStatements: number;
  baseStatementChars: number;
  turns: TurnSpec[];
};

type TurnMetric = {
  modelSpec: string;
  scenario: string;
  iteration: number;
  turn: number;
  requestId: string;
  sessionId: string;
  elapsedMs: number;
  promptChars: number;
  systemPromptChars: number;
  responseChars: number;
  usage?: LlmTokenUsage;
  tokensPerSecond?: number;
  cacheHeaders?: Record<string, string>;
  empty: boolean;
  parseKind?: string;
};

type RequestTelemetry = {
  promptChars?: number;
  systemPromptChars?: number;
  cacheHeaders?: Record<string, string>;
};

const DEFAULT_SCENARIOS: ScenarioSpec[] = [
  {
    name: 'short-scene',
    description: 'Two quick turns with light context; baseline latency and usage.',
    baseStatements: 3,
    baseStatementChars: 120,
    turns: [
      { action: 'I step through the tavern door and quietly scan the room for danger.' },
      { action: 'I approach the barkeep and ask about the red tower on the hill.' },
    ],
  },
  {
    name: 'growing-context',
    description: 'Four turns where context grows between turns as narration is appended.',
    baseStatements: 8,
    baseStatementChars: 180,
    turns: [
      { action: 'I lift the old map and trace the route toward the marsh crossing.' },
      { action: 'I ask Mara to watch the alley while I question the ferryman.' },
      {
        action: 'I press the ferryman for details about who paid him in silver last night.',
      },
      {
        action: 'I relay what we learned and propose we move before the patrol returns.',
      },
    ],
  },
  {
    name: 'steered-scene',
    description: 'Three turns with active steering directives to simulate GM guidance.',
    baseStatements: 6,
    baseStatementChars: 150,
    turns: [
      {
        action: 'I kneel by the broken ward-stone and test whether any magic still hums inside it.',
        steering: [
          {
            intent: 'Maintain ominous tension',
            direction: 'Emphasize unsettling sensory details and uncertain consequences.',
            tone: 'ominous',
            constraints: ['avoid slapstick', 'no instant resolution'],
          },
        ],
      },
      {
        action: 'I ask the sentry what happened here before we arrived.',
        steering: [
          {
            intent: 'Reveal clues gradually',
            direction: 'Offer one concrete clue and leave at least one open question.',
            tone: 'measured',
          },
        ],
      },
      {
        action: 'I signal the party to move and prepare for contact near the gate.',
        steering: [
          {
            intent: 'Escalate pace',
            direction: 'Shift from investigation to immediate urgency.',
            tone: 'urgent',
          },
        ],
      },
    ],
  },
];

function parseCsv(name: string, fallback: string[]): string[] {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function pickScenarios(names: string[]): ScenarioSpec[] {
  if (names.length === 0) return DEFAULT_SCENARIOS;
  const selected = DEFAULT_SCENARIOS.filter((s) => names.includes(s.name));
  if (selected.length === 0) {
    throw new Error(
      `NARRATOR_PROBE_SCENARIOS did not match any scenario. Available: ${DEFAULT_SCENARIOS.map((s) => s.name).join(', ')}`,
    );
  }
  return selected;
}

function makeText(chars: number, seed: string): string {
  if (chars <= 0) return '';
  const chunk = `${seed} `;
  return chunk.repeat(Math.ceil(chars / chunk.length)).slice(0, chars);
}

function seedStatements(count: number, chars: number): ContextStatement[] {
  const out: ContextStatement[] = [];
  for (let i = 0; i < count; i += 1) {
    const kind = i % 3 === 0 ? 'narration' : i % 3 === 1 ? 'dialogue' : 'canon-reference';
    out.push({
      kind,
      authorId: kind === 'dialogue' ? `player-${(i % 3) + 1}` : 'narrator',
      content: makeText(chars, `${kind}-seed-${i + 1}`),
      approxTokens: Math.ceil(chars / 4),
    });
  }
  return out;
}

function toSteeringCandidates(turn: number, steering?: TurnSpec['steering']): SteeringCandidate[] {
  if (!steering || steering.length === 0) return [];
  return steering.map((item, idx) => ({
    id: `probe-steering-${turn}-${idx + 1}`,
    createdAt: new Date().toISOString(),
    fields: {
      intent: item.intent,
      direction: item.direction,
      tone: item.tone,
      constraints: item.constraints,
      status: 'active',
    },
  }));
}

function parseNarratorKind(text: string): string | undefined {
  try {
    const parsed = JSON.parse(text) as { kind?: string };
    return typeof parsed.kind === 'string' ? parsed.kind : undefined;
  } catch {
    return undefined;
  }
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function p95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.max(0, index)] ?? 0;
}

async function main(): Promise<void> {
  const modelSpecs = parseCsv('NARRATOR_PROBE_MODEL_SPECS', [env.DEFAULT_MODEL_SPEC || '']).filter(
    Boolean,
  );
  if (modelSpecs.length === 0) {
    throw new Error('Set NARRATOR_PROBE_MODEL_SPECS or DEFAULT_MODEL_SPEC before running probe.');
  }

  const iterations = parseNumber('NARRATOR_PROBE_ITERATIONS', 1);
  const scenarioNames = parseCsv('NARRATOR_PROBE_SCENARIOS', []);
  const scenarios = pickScenarios(scenarioNames);
  const cacheRetention = (process.env.NARRATOR_PROBE_CACHE_RETENTION?.trim() ||
    'short') as CacheRetention;
  const sleepMs = parseNumber('NARRATOR_PROBE_SLEEP_MS', 0);

  const prompt = await loadAgentPrompt('narrator', null);
  const runtime = createSessionRuntime();
  const assembler = createContextAssembler();
  const metrics: TurnMetric[] = [];
  const telemetryByRequestId = new Map<string, RequestTelemetry>();

  const stopTelemetry = onLlmTelemetry((event) => {
    const current = telemetryByRequestId.get(event.requestId) ?? {};
    if (event.type === 'request_start') {
      current.promptChars = event.promptChars;
      current.systemPromptChars = event.systemPromptChars;
    }
    if (event.type === 'response_complete') {
      current.cacheHeaders = event.cacheHeaders;
    }
    telemetryByRequestId.set(event.requestId, current);
  });

  console.log(
    JSON.stringify({
      event: 'narrator-probe.start',
      modelSpecs,
      iterations,
      scenarios: scenarios.map((s) => s.name),
      cacheRetention,
      systemPromptChars: prompt.content.length,
    }),
  );

  try {
    for (const modelSpec of modelSpecs) {
      for (let iteration = 1; iteration <= iterations; iteration += 1) {
        for (const scenario of scenarios) {
          const sessionId = `probe:narrator:${modelSpec}:${scenario.name}:${iteration}`;
          const statements = seedStatements(scenario.baseStatements, scenario.baseStatementChars);

          for (let turn = 0; turn < scenario.turns.length; turn += 1) {
            const turnSpec = scenario.turns[turn]!;
            const steering = toSteeringCandidates(turn + 1, turnSpec.steering);

            const assembled = assembler.assemble({
              statements,
              steering,
              playerAction: turnSpec.action,
              playerName: 'Probe Player',
            });

            const requestId = randomUUID();
            const startedAt = Date.now();

            console.log(
              JSON.stringify({
                event: 'narrator-probe.turn.start',
                requestId,
                modelSpec,
                scenario: scenario.name,
                iteration,
                turn: turn + 1,
                promptChars: assembled.userPrompt.length,
                statementCount: statements.length,
                steeringCount: steering.length,
              }),
            );

            try {
              const response = await runtime.generateInSession({
                modelSpec,
                systemPrompt: prompt.content,
                prompt: assembled.userPrompt,
                sessionId,
                cacheRetention,
                metadata: {
                  requestId,
                  caller: 'scripts.narrator-session-probe',
                  roomId: `probe-room:${scenario.name}`,
                  userId: 'probe-user',
                },
              });

              const elapsedMs = Date.now() - startedAt;
              const telemetry = telemetryByRequestId.get(requestId) ?? {};
              const text = response.text ?? '';
              const metric: TurnMetric = {
                modelSpec,
                scenario: scenario.name,
                iteration,
                turn: turn + 1,
                requestId,
                sessionId,
                elapsedMs,
                promptChars: telemetry.promptChars ?? assembled.userPrompt.length,
                systemPromptChars: telemetry.systemPromptChars ?? prompt.content.length,
                responseChars: text.length,
                usage: response.usage,
                tokensPerSecond: response.tokensPerSecond,
                cacheHeaders: telemetry.cacheHeaders,
                empty: text.trim().length === 0,
                parseKind: parseNarratorKind(text),
              };
              metrics.push(metric);

              console.log(
                JSON.stringify({
                  event: 'narrator-probe.turn.success',
                  ...metric,
                  usage: metric.usage
                    ? {
                        inputTokens: metric.usage.inputTokens,
                        outputTokens: metric.usage.outputTokens,
                        cacheRead: metric.usage.cacheRead,
                        cacheWrite: metric.usage.cacheWrite,
                        totalTokens: metric.usage.totalTokens,
                        costTotal: metric.usage.cost.total,
                      }
                    : undefined,
                }),
              );

              const parsedKind = metric.parseKind ?? 'narration';
              statements.push({
                kind: parsedKind,
                authorId: 'narrator',
                content: text.slice(0, 500),
                approxTokens: Math.ceil(text.length / 4),
              });
              statements.push({
                kind: 'dialogue',
                authorId: 'probe-user',
                content: turnSpec.action,
                approxTokens: Math.ceil(turnSpec.action.length / 4),
              });
            } catch (error) {
              const elapsedMs = Date.now() - startedAt;
              const message = error instanceof Error ? error.message : String(error);
              console.log(
                JSON.stringify({
                  event: 'narrator-probe.turn.error',
                  requestId,
                  modelSpec,
                  scenario: scenario.name,
                  iteration,
                  turn: turn + 1,
                  elapsedMs,
                  error: message,
                }),
              );
            }

            if (sleepMs > 0) {
              await new Promise((resolve) => setTimeout(resolve, sleepMs));
            }
          }
        }
      }
    }
  } finally {
    stopTelemetry();
    runtime.dispose();
  }

  const grouped = new Map<string, TurnMetric[]>();
  for (const metric of metrics) {
    const key = `${metric.modelSpec}::${metric.scenario}`;
    const arr = grouped.get(key) ?? [];
    arr.push(metric);
    grouped.set(key, arr);
  }

  const summary = Array.from(grouped.entries()).map(([key, rows]) => {
    const [modelSpec, scenario] = key.split('::');
    const latencies = rows.map((r) => r.elapsedMs);
    const inputTokens = rows.map((r) => r.usage?.inputTokens ?? 0);
    const outputTokens = rows.map((r) => r.usage?.outputTokens ?? 0);
    const cacheReadTokens = rows.map((r) => r.usage?.cacheRead ?? 0);
    return {
      modelSpec,
      scenario,
      turns: rows.length,
      emptyResponses: rows.filter((r) => r.empty).length,
      avgLatencyMs: Math.round(average(latencies)),
      p95LatencyMs: Math.round(p95(latencies)),
      avgInputTokens: Math.round(average(inputTokens)),
      avgOutputTokens: Math.round(average(outputTokens)),
      avgCacheReadTokens: Math.round(average(cacheReadTokens)),
      cacheHitTurns: rows.filter((r) => (r.usage?.cacheRead ?? 0) > 0).length,
    };
  });

  console.log(
    JSON.stringify({
      event: 'narrator-probe.finish',
      totalTurns: metrics.length,
      summary,
    }),
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(JSON.stringify({ event: 'narrator-probe.fatal', error: message }));
  process.exit(1);
});
