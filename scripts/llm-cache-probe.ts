#!/usr/bin/env tsx
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { env } from '../src/config/env.js';
import type { CacheRetention, LlmTokenUsage } from '../src/core/llm-runtime.js';
import {
  createSessionRuntime,
  createPiAiLlmRuntime,
  onLlmTelemetry,
} from '../src/models/pi-runtime.js';

type ProbeMode = 'session-append' | 'stateless-rebuild';

type TurnMetric = {
  mode: ProbeMode;
  modelSpec: string;
  iteration: number;
  turn: number;
  requestId: string;
  sessionId: string;
  elapsedMs: number;
  promptChars: number;
  responseChars: number;
  empty: boolean;
  usage?: LlmTokenUsage;
  cacheHeaders?: Record<string, string>;
  error?: string;
};

type RequestTelemetry = {
  promptChars?: number;
  cacheHeaders?: Record<string, string>;
};

function parseNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseModes(raw: string | undefined): ProbeMode[] {
  const value = raw?.trim();
  if (!value) return ['session-append'];
  const entries = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  const modes: ProbeMode[] = [];
  for (const entry of entries) {
    if (entry === 'session-append' || entry === 'stateless-rebuild') {
      modes.push(entry);
    }
  }
  return modes.length > 0 ? modes : ['session-append'];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function buildTurnPrompt(turn: number, userMessage: string): string {
  return [
    `Turn ${turn}.`,
    `New user message: ${userMessage}`,
    'Task: respond briefly and keep continuity with prior turns in this same session.',
    'Return JSON only: {"turn": number, "reply": string, "memoryHint": string}.',
    'Keep reply <= 30 words.',
  ].join('\n');
}

function buildUserMessage(turn: number): string {
  return `Fact ${turn}: beacon-${turn} glows ${turn % 2 === 0 ? 'blue' : 'amber'}. Remember beacon-1 and beacon-${turn}.`;
}

async function main(): Promise<void> {
  const modelSpec = process.env.CACHE_PROBE_MODEL_SPEC?.trim() || env.DEFAULT_MODEL_SPEC;
  if (!modelSpec) {
    throw new Error('Set CACHE_PROBE_MODEL_SPEC or DEFAULT_MODEL_SPEC before running probe.');
  }

  const turns = parseNumber('CACHE_PROBE_TURNS', 12);
  const iterations = parseNumber('CACHE_PROBE_ITERATIONS', 1);
  const sleepMs = parseNumber('CACHE_PROBE_SLEEP_MS', 0);
  const cacheRetention =
    (process.env.CACHE_PROBE_CACHE_RETENTION?.trim() as CacheRetention | undefined) ||
    ('short' as CacheRetention);
  const modes = parseModes(process.env.CACHE_PROBE_MODES);

  const systemPrompt =
    'You are a concise chat assistant for cache profiling. Follow JSON-only output format exactly.';

  const sessionRuntime = createSessionRuntime();
  const statelessRuntime = createPiAiLlmRuntime();
  const telemetryByRequestId = new Map<string, RequestTelemetry>();
  const metrics: TurnMetric[] = [];

  const stopTelemetry = onLlmTelemetry((event) => {
    const current = telemetryByRequestId.get(event.requestId) ?? {};
    if (event.type === 'request_start') {
      current.promptChars = event.promptChars;
    }
    if (event.type === 'response_complete') {
      current.cacheHeaders = event.cacheHeaders;
    }
    telemetryByRequestId.set(event.requestId, current);
  });

  console.log(
    JSON.stringify({
      event: 'cache-probe.start',
      modelSpec,
      modes,
      turns,
      iterations,
      cacheRetention,
      llmCallTimeoutMs: env.LLM_CALL_TIMEOUT_MS,
    }),
  );

  try {
    for (const mode of modes) {
      for (let iteration = 1; iteration <= iterations; iteration += 1) {
        const sharedSessionId = `probe:cache:${mode}:${modelSpec}:${iteration}`;
        const transcript: string[] = [];

        for (let turn = 1; turn <= turns; turn += 1) {
          const requestId = randomUUID();
          const userMessage = buildUserMessage(turn);
          const incrementalPrompt = buildTurnPrompt(turn, userMessage);

          const prompt =
            mode === 'session-append'
              ? incrementalPrompt
              : [
                  'Conversation so far:',
                  transcript.length > 0 ? transcript.join('\n') : '(none yet)',
                  '',
                  'Current turn:',
                  incrementalPrompt,
                ].join('\n');

          const sessionId =
            mode === 'session-append' ? sharedSessionId : `${sharedSessionId}:turn-${turn}`;
          const startedAt = Date.now();

          console.log(
            JSON.stringify({
              event: 'cache-probe.turn.start',
              mode,
              modelSpec,
              iteration,
              turn,
              requestId,
              sessionId,
              promptChars: prompt.length,
            }),
          );

          try {
            const response =
              mode === 'session-append'
                ? await sessionRuntime.generateInSession({
                    modelSpec,
                    systemPrompt,
                    prompt,
                    sessionId,
                    cacheRetention,
                    metadata: {
                      requestId,
                      caller: 'scripts.llm-cache-probe',
                      roomId: `cache-probe:${mode}`,
                      userId: 'probe-user',
                    },
                  })
                : await statelessRuntime.generate({
                    modelSpec,
                    systemPrompt,
                    prompt,
                    sessionId,
                    cacheRetention,
                    metadata: {
                      requestId,
                      caller: 'scripts.llm-cache-probe',
                      roomId: `cache-probe:${mode}`,
                      userId: 'probe-user',
                    },
                  });

            const elapsedMs = Date.now() - startedAt;
            const telemetry = telemetryByRequestId.get(requestId) ?? {};
            const text = response.text ?? '';
            const metric: TurnMetric = {
              mode,
              modelSpec,
              iteration,
              turn,
              requestId,
              sessionId,
              elapsedMs,
              promptChars: telemetry.promptChars ?? prompt.length,
              responseChars: text.length,
              empty: text.trim().length === 0,
              usage: response.usage,
              cacheHeaders: telemetry.cacheHeaders,
            };
            metrics.push(metric);

            transcript.push(`user-${turn}: ${userMessage}`);
            transcript.push(`assistant-${turn}: ${text.slice(0, 240)}`);

            console.log(
              JSON.stringify({
                event: 'cache-probe.turn.success',
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
          } catch (error) {
            const elapsedMs = Date.now() - startedAt;
            const message = error instanceof Error ? error.message : String(error);
            const metric: TurnMetric = {
              mode,
              modelSpec,
              iteration,
              turn,
              requestId,
              sessionId,
              elapsedMs,
              promptChars: prompt.length,
              responseChars: 0,
              empty: true,
              error: message,
            };
            metrics.push(metric);
            console.log(
              JSON.stringify({
                event: 'cache-probe.turn.error',
                ...metric,
              }),
            );
          }

          if (sleepMs > 0) {
            await sleep(sleepMs);
          }
        }
      }
    }
  } finally {
    stopTelemetry();
    sessionRuntime.dispose();
  }

  const grouped = new Map<string, TurnMetric[]>();
  for (const metric of metrics) {
    const key = `${metric.mode}::${metric.modelSpec}`;
    const list = grouped.get(key) ?? [];
    list.push(metric);
    grouped.set(key, list);
  }

  const summary = Array.from(grouped.entries()).map(([key, rows]) => {
    const [mode, model] = key.split('::');
    const successful = rows.filter((r) => !r.error);
    const latencies = successful.map((r) => r.elapsedMs);
    const cacheHits = successful.filter((r) => (r.usage?.cacheRead ?? 0) > 0).length;
    const firstHalf = successful.slice(0, Math.floor(successful.length / 2));
    const secondHalf = successful.slice(Math.floor(successful.length / 2));

    return {
      mode,
      modelSpec: model,
      totalTurns: rows.length,
      successTurns: successful.length,
      errorTurns: rows.filter((r) => Boolean(r.error)).length,
      timeoutTurns: rows.filter((r) => r.error?.includes('timed out')).length,
      emptyResponses: successful.filter((r) => r.empty).length,
      avgLatencyMs: Math.round(average(latencies)),
      p95LatencyMs: Math.round(p95(latencies)),
      firstHalfAvgLatencyMs: Math.round(average(firstHalf.map((r) => r.elapsedMs))),
      secondHalfAvgLatencyMs: Math.round(average(secondHalf.map((r) => r.elapsedMs))),
      avgInputTokens: Math.round(average(successful.map((r) => r.usage?.inputTokens ?? 0))),
      avgOutputTokens: Math.round(average(successful.map((r) => r.usage?.outputTokens ?? 0))),
      cacheHitTurns: cacheHits,
    };
  });

  console.log(
    JSON.stringify({
      event: 'cache-probe.finish',
      totalTurns: metrics.length,
      summary,
    }),
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(JSON.stringify({ event: 'cache-probe.fatal', error: message }));
  process.exit(1);
});
