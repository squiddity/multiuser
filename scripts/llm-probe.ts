#!/usr/bin/env tsx
import 'dotenv/config';
import { createPiAiLlmRuntime } from '../src/models/pi-runtime.js';
import { env } from '../src/config/env.js';

type ProbeCase = {
  name: string;
  contextChars: number;
  userChars: number;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function makeText(chars: number, seed: string): string {
  if (chars <= 0) return '';
  const chunk = `${seed} `;
  return chunk.repeat(Math.ceil(chars / chunk.length)).slice(0, chars);
}

function parseCases(): ProbeCase[] {
  const raw = process.env.LLM_PROBE_CASES?.trim();
  if (!raw) {
    return [
      { name: 'small', contextChars: 500, userChars: 120 },
      { name: 'medium', contextChars: 4000, userChars: 300 },
      { name: 'large', contextChars: 12000, userChars: 600 },
    ];
  }

  return raw.split(',').map((entry, i) => {
    const [nameRaw, contextRaw, userRaw] = entry.split(':');
    return {
      name: nameRaw || `case-${i + 1}`,
      contextChars: Number(contextRaw ?? '0'),
      userChars: Number(userRaw ?? '0'),
    };
  });
}

async function main(): Promise<void> {
  const modelSpec = process.env.LLM_PROBE_MODEL_SPEC?.trim() || env.DEFAULT_MODEL_SPEC;
  if (!modelSpec) throw new Error('LLM_PROBE_MODEL_SPEC or DEFAULT_MODEL_SPEC is required');

  const iterations = Number(process.env.LLM_PROBE_ITERATIONS ?? '1');
  const concurrency = Number(process.env.LLM_PROBE_CONCURRENCY ?? '1');
  const staggerMs = Number(process.env.LLM_PROBE_STAGGER_MS ?? '0');
  const cases = parseCases();
  const runtime = createPiAiLlmRuntime();

  console.log(
    JSON.stringify({
      event: 'probe.start',
      modelSpec,
      iterations,
      concurrency,
      staggerMs,
      caseCount: cases.length,
      llmCallTimeoutMs: env.LLM_CALL_TIMEOUT_MS,
    }),
  );

  const systemPrompt =
    'You are a JSON-only test assistant. Respond with {"ok":true,"answer":"..."} and nothing else.';

  let failures = 0;

  for (let iter = 1; iter <= iterations; iter += 1) {
    for (const probeCase of cases) {
      const context = makeText(probeCase.contextChars, 'context-token');
      const userBody = makeText(probeCase.userChars, 'user-token');
      const prompt = [
        '## Context',
        context || '(none)',
        '',
        '## Instruction',
        'Answer with JSON only. Confirm whether the context mentions "context-token".',
        '',
        '## User input',
        userBody || '(none)',
      ].join('\n');

      const runOne = async (slot: number) => {
        if (staggerMs > 0 && slot > 1) {
          await sleep((slot - 1) * staggerMs);
        }

        const startedAt = Date.now();
        console.log(
          JSON.stringify({
            event: 'probe.call.start',
            iteration: iter,
            case: probeCase.name,
            slot,
            contextChars: probeCase.contextChars,
            userChars: probeCase.userChars,
            promptChars: prompt.length,
            startedAt: new Date(startedAt).toISOString(),
          }),
        );

        try {
          const response = await runtime.generate({ modelSpec, systemPrompt, prompt });
          const elapsedMs = Date.now() - startedAt;
          const text = response.text ?? '';
          const empty = text.trim().length === 0;

          console.log(
            JSON.stringify({
              event: 'probe.call.success',
              iteration: iter,
              case: probeCase.name,
              slot,
              elapsedMs,
              responseChars: text.length,
              empty,
              preview: text.slice(0, 240),
            }),
          );

          if (empty) {
            failures += 1;
            console.log(
              JSON.stringify({
                event: 'probe.call.empty',
                iteration: iter,
                case: probeCase.name,
                slot,
                reason: 'empty response text',
              }),
            );
          }
        } catch (error) {
          failures += 1;
          const elapsedMs = Date.now() - startedAt;
          const message = error instanceof Error ? error.message : String(error);
          console.log(
            JSON.stringify({
              event: 'probe.call.error',
              iteration: iter,
              case: probeCase.name,
              slot,
              elapsedMs,
              error: message,
            }),
          );
        }
      };

      await Promise.all(Array.from({ length: concurrency }, (_, i) => runOne(i + 1)));
    }
  }

  console.log(JSON.stringify({ event: 'probe.finish', failures, passed: failures === 0 }));
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(JSON.stringify({ event: 'probe.fatal', error: message }));
  process.exit(1);
});
