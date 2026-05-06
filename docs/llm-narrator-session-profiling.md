# Narrator Session Profiling Probe

## Purpose

Provide a repeatable, live-model profiling suite for narrator-style multi-turn requests.

This probe is intentionally separate from unit/integration tests because it calls external model providers and measures runtime behavior (latency, token usage, cache-read behavior).

## Entry point

- Script: `scripts/narrator-session-probe.ts`
- Command: `pnpm probe:narrator-session`

## What it does

For each selected model, scenario, and iteration, the probe:

1. Loads the real narrator system prompt from `content/agents/narrator.md`.
2. Builds narrator-like turn prompts using the same `ContextAssembler` used in runtime.
3. Sends multiple turns through the session-aware runtime (`generateInSession`) with a stable session id.
4. Emits JSON-line telemetry for each turn and a summary at the end.

Per-turn metrics include:

- elapsed latency (`elapsedMs`)
- prompt/system prompt chars
- token usage (`inputTokens`, `outputTokens`, `cacheRead`, `cacheWrite`, `totalTokens`)
- estimated cost from provider/model pricing table
- parsed narrator `kind` when response is valid JSON
- cache headers (when provided by upstream)

## Scenarios

Built-in scenarios:

- `short-scene` — 2 turns, light context
- `growing-context` — 4 turns, expanding context each turn
- `steered-scene` — 3 turns with active steering directives

## Configuration

Set via environment variables:

- `NARRATOR_PROBE_MODEL_SPECS` — comma-separated model specs (defaults to `DEFAULT_MODEL_SPEC`)
- `NARRATOR_PROBE_ITERATIONS` — repeat count per model/scenario (default `1`)
- `NARRATOR_PROBE_SCENARIOS` — comma-separated scenario names; unset = all built-ins
- `NARRATOR_PROBE_CACHE_RETENTION` — `short` or `long` (default `short`)
- `NARRATOR_PROBE_SLEEP_MS` — pause between turns (default `0`)

## Example runs

Single model, all scenarios:

```bash
NARRATOR_PROBE_MODEL_SPECS=openrouter:deepseek/deepseek-v4-flash \
pnpm probe:narrator-session
```

Two models, one scenario, repeated:

```bash
NARRATOR_PROBE_MODEL_SPECS=openrouter:deepseek/deepseek-v4-flash,openrouter:anthropic/claude-sonnet-4 \
NARRATOR_PROBE_SCENARIOS=growing-context \
NARRATOR_PROBE_ITERATIONS=3 \
pnpm probe:narrator-session
```

## Output format

The probe prints JSON lines to stdout:

- `narrator-probe.start`
- `narrator-probe.turn.start`
- `narrator-probe.turn.success` / `narrator-probe.turn.error`
- `narrator-probe.finish`

`narrator-probe.finish` includes grouped summaries with averages/p95 latency and cache-hit counts per model+scenario.

## Interpretation notes

- `inputTokens` come from provider usage for the full request input (system prompt + effective prompt/session context), subject to provider accounting behavior.
- `cacheRead` > 0 indicates provider-reported prompt-cache reads for that turn.
- `cacheRead = 0` across all turns usually means either no provider-side cache support, cache misses, or account/provider settings that do not expose cache hits.
