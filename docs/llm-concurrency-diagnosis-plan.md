# LLM Concurrency Diagnosis Plan

## Purpose

Establish a repeatable diagnosis path for intermittent demo failures where narration/briefing LLM calls time out or return empty output, despite isolated connectivity checks succeeding.

## Current observation

- Single-call probe harness (`scripts/llm-probe.ts`) succeeds consistently across small to very large prompt sizes.
- Demo runs can fail when multiple workers invoke the model runtime around the same time (notably narrator + briefing-generator).
- This suggests contention/concurrency behavior, queueing limits, or request-handling differences under overlapping calls.

## Phase 1: Concurrency-focused reproduction

1. Extend the probe harness to support concurrent calls (`N` parallel requests), with configurable:
   - number of concurrent calls,
   - prompt size profile per call,
   - iteration count,
   - stagger delay between launches.
2. Capture per-call telemetry:
   - startedAt,
   - endedAt,
   - elapsedMs,
   - success/error,
   - empty response flag,
   - timeout flag,
   - model response length.
3. Run a matrix:
   - Concurrency: 1, 2, 4, 8,
   - Prompt profile: small/medium/large,
   - Iterations: enough to expose flake (e.g. 10+ per cell).
4. Summarize failure modes by concurrency level and prompt size.

## Decision branch after Phase 1

### Outcome A: failures appear only with concurrency

Likely bottleneck at provider/backend or local runtime under overlap.

Candidate options:

1. **Global LLM call serialization (strict mutex)**
   - One in-flight LLM call process-wide.
   - Lowest risk, easiest to reason about.
   - Throughput penalty; can increase latency for non-critical workers.

2. **Bounded concurrency (semaphore, e.g. max 2)**
   - Allows limited overlap while reducing overload.
   - Better throughput/latency tradeoff than strict serialization.
   - Slightly more operational complexity.

3. **Priority lanes + bounded concurrency**
   - Reserve capacity for narrator/live path; background workers defer.
   - Best UX under pressure.
   - Higher implementation complexity.

### Outcome B: failures appear even at concurrency=1 in probe

Likely provider/model/backend instability independent of app orchestration.

Candidate options:

1. Increase timeout and add retry with jitter for idempotent turns.
2. Add provider health gate before demo starts.
3. Add automatic fallback model for demo/test mode.

### Outcome C: probe stable, demo still flaky

Likely application-level sequencing/context behavior.

Candidate options:

1. Instrument each worker call path with request IDs and end-to-end timing.
2. Temporarily disable briefing generation during vertical-slice recall step to isolate narrator path.
3. Audit prompt assembly and response parsing differences between probe and demo.

## Initial implementation recommendation

If Outcome A is confirmed, implement in this order:

1. Introduce a process-wide LLM semaphore **keyed by model key** (`provider:modelSpec`), with env-configured per-key limit (`LLM_MAX_CONCURRENCY`, default `1` for diagnosis).
   - Requests targeting the same model key share a queue.
   - Requests targeting different model/provider specs do not block each other.
2. Re-run demo and concurrency matrix.
3. If stable, evaluate raising per-key limit to `2` and compare reliability vs latency.

## Session handoff checklist

Before ending a session, record:

- probe command matrix used,
- pass/fail counts per cell,
- whether failures correlate with concurrency,
- selected mitigation option and rationale,
- any env values changed (`LLM_CALL_TIMEOUT_MS`, future `LLM_MAX_CONCURRENCY`).
