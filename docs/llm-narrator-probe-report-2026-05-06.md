# Narrator Session Probe Report — 2026-05-06

## Purpose

Summarize live-model narrator profiling runs executed with `scripts/narrator-session-probe.ts`.

These runs measure narrator-style multi-turn behavior (latency, reliability, token usage, cache-read behavior) under real providers.

## Run artifacts

- `test-results/narrator-probe-matrix-20260506-164058.jsonl`
- `test-results/narrator-probe-or-matrix-20260506-184523.jsonl`
- `test-results/narrator-probe-gpt4omini-iter5-20260506-191036.jsonl`
- `test-results/narrator-probe-or-llama-qwen-20260506-191801.jsonl`

## Compared models and outcomes

### Baseline matrix (DeepSeek, GPT-4o-mini, local Qwen3.6)

- **openrouter:openai/gpt-4o-mini**
  - Fast and stable.
  - ~5s class latency (faster on growing-context).
  - Strong cache-read incidence on multi-turn scenarios.
- **openrouter:deepseek/deepseek-v4-flash**
  - Functional but slower/less consistent than GPT-4o-mini in these runs.
  - Cache-read appeared in growing-context scenarios.
- **local:Qwen3.6-35B-A3B-GGUF**
  - High latency and timeouts in this profile.
  - Usage metadata did not report token counts.

### OpenRouter experimental matrix (gpt-oss-120b, gemma-3-4b-it, hy3-preview:free)

- **openrouter:openai/gpt-oss-120b**
  - Returned empty responses in this runtime path (9/9 turns empty).
- **openrouter:google/gemma-3-4b-it**
  - Mixed reliability with many empty turns.
- **openrouter:tencent/hy3-preview:free**
  - Non-empty outputs but very high latency and one timeout.

### OpenRouter matrix (Llama/Nemotron/Qwen)

- **openrouter:nvidia/llama-3.3-nemotron-super-49b-v1.5**
  - Best performer in this set: stable, no empties/errors.
  - Average latency just under 4s in the sampled scenarios.
- **openrouter:qwen/qwen-2.5-72b-instruct**
  - Stable with no empties/errors, but slower than Nemotron.
- **openrouter:meta-llama/llama-3.1-70b-instruct**
  - Stable with no empties/errors, but slower than Nemotron and with larger p95 spikes.

### GPT-4o-mini stress rerun (5 iterations)

- **openrouter:openai/gpt-4o-mini** (45 turns)
  - Stable: 0 errors, 0 empty responses.
  - Overall avg latency: ~4.34s.
  - p95 latency: ~6.14s.
  - Cache-read on 34/45 turns.

## Decision

For demo bot and test-oriented live runs:

1. **Default model**: `openrouter:nvidia/llama-3.3-nemotron-super-49b-v1.5`
2. **Fallback model**: `openrouter:openai/gpt-4o-mini`

Rationale:

- Nemotron showed the best latency/reliability balance among high-quality non-empty OpenRouter candidates in this session.
- GPT-4o-mini remained very stable and fast in extended reruns and is a strong operational fallback.
- Both are cost-efficient in observed workloads; Nemotron was slightly cheaper in recent comparisons.

## Implementation status

- `.env.example` now defaults `DEFAULT_MODEL_SPEC` to Nemotron.
- Discord demo bot now defaults to Nemotron and retries `/say` narration once with GPT-4o-mini if the primary model call fails.
- Ops/docs updated to reflect the new default + fallback posture.
