# LLM Context Efficiency Plan

## Purpose

Define a future optimization milestone for how agent turns use durable statement-store context and runtime session context together.

This plan is tracked as `docs/milestones/0005-llm-context-efficiency-and-session-caching.md`.

The goal is to reduce repeated prompt churn, improve provider-side cache reuse, and keep prompt growth append-oriented without weakening scope isolation or canonical provenance.

## Current state

The current runtime is deliberately conservative:

- The statement store remains the only authoritative memory.
- Each turn is assembled from fresh reads against the statement store.
- Narration, briefing generation, resolver calls, and onboarding all build one-shot prompts from current inputs.
- Runtime session state is treated as disposable and reconstructable.

This is correct for safety and replay, but it is not yet optimized for cache reuse.

### What is inefficient today

1. **Whole prompt sections are rebuilt each turn.** World canon, party history, recent statements, and other context blocks are re-rendered into fresh prompt text.
2. **New runtime instances are created per request.** The runtime does not yet preserve a room- or workflow-scoped conversation state that grows turn by turn.
3. **The most volatile context appears early.** If the prompt starts with freshly regenerated history text, provider prompt caches lose much of the stable prefix benefit.
4. **Retrieval output is not yet separated by stability tier.** Durable canon, session transcript, and ad hoc retrieval are all treated as plain prompt text rather than as distinct layers with different churn rates.
5. **We do not yet measure cache effectiveness directly.** Token and cost telemetry exist, but context reuse efficiency is not yet a first-class evaluation target.

## Architectural stance

Two rules should remain true:

1. **The statement store stays authoritative.** No provider session, transcript file, or runtime object becomes canonical memory.
2. **Runtime session context is still worth optimizing.** If a conversation can be reconstructed, it can also be carried forward in a cache-friendly form while it is active.

This means the system should use two memory modes at once:

- **Durable memory** for truth, retrieval, provenance, and recovery.
- **Session context** for efficient repeated LLM calls during an active room or workflow.

## Recommended turn shape

The prompt should be organized so the highest-value stable content remains unchanged for as many turns as possible.

### Stable prefix

These sections should change rarely and appear first:

- role instructions,
- output contract,
- stable room/campaign rules,
- compact world summary,
- compact standing party summary.

### Append-oriented session body

These sections should grow mainly by appending new material:

- recent live transcript for the active room,
- active steering or pending open-question constraints,
- the latest player/admin action.

### Volatile retrieval suffix

These sections should be added only when needed and should appear late:

- statement-store excerpts retrieved for the specific turn,
- citations or provenance snippets,
- rulebook or canon passages that are relevant now but not every turn.

## Answer to the central design question

Yes, statement-store use will still change the LLM request from turn to turn.

The optimization target is **not** to make every request identical. The target is to make the request look like:

1. a large stable prefix,
2. an append-oriented live-session middle,
3. a small volatile suffix for turn-specific retrieval.

So the recommended pattern is:

- always carry forward the current session activity in a cache-friendly, append-oriented form,
- keep stable summaries and instructions unchanged as long as possible,
- append statement-store retrieval only when relevant,
- avoid rebuilding the entire room/world context as fresh prose every turn.

## Future milestone scope

A dedicated milestone should introduce five capabilities.

### 1. Session-aware runtime contract

Extend the local LLM runtime boundary so callers can express:

- a stable session identifier per room or workflow,
- cache-retention preference where providers support it,
- context segments by stability tier,
- compaction or summary inputs for long-running sessions.

The runtime contract should stay provider-agnostic. Provider-specific caching remains an optimization, not a correctness dependency.

### 2. Context assembler with stability tiers

Introduce a single context-assembly component that separates:

- stable instructions,
- durable summaries,
- append-only recent transcript,
- dynamic retrieval.

This assembler should stop callers from hand-formatting large prompt blocks independently.

### 3. Room- and workflow-scoped active sessions

Maintain active session state for long-lived flows such as:

- party narration,
- governance/briefing workflows,
- onboarding threads,
- resolver conversations when they become multi-turn.

If a process restarts, the session must be reconstructable from the statement store plus persisted summaries. Active session state is a performance optimization, not a hidden source of truth.

### 4. Summary and compaction artifacts

Create explicit summary artifacts for:

- world canon,
- party history,
- current scene,
- governance state,
- pending open questions.

These summaries should be refreshed asynchronously and cited back to the statements they compress.

### 5. Efficiency-focused evals and telemetry

Track whether the new structure actually helps. The milestone should measure:

- total prompt tokens per turn,
- prompt-cache read/write usage where available,
- average stable-prefix reuse,
- retrieval payload size,
- latency change,
- contradiction or grounding regressions after compaction.

## Retrieval policy

The statement store should not be dumped wholesale into every turn.

A better default policy is:

- **Always include**: stable summaries, recent live transcript, active steering, and the newest user/admin action.
- **Usually include**: a small current-scene or current-task summary.
- **Conditionally include**: retrieved world, party, character, or rules statements only when the turn materially benefits from them.
- **Avoid including**: raw historical blocks that merely duplicate information already present in the session transcript or summaries.

## Proposed implementation order

### Phase A — Baseline measurement

Measure current prompt size, latency, and cache fields by role and turn type.

Use `pnpm probe:narrator-session` (see `docs/llm-narrator-session-profiling.md`) as the repeatable narrator-path baseline harness before and after context-assembly changes.

### Phase B — Runtime contract upgrade

Add session identity, cache preferences, and structured context segments to the LLM runtime boundary.

### Phase C — Narrator-first adoption

Apply the new assembly strategy to narrator turns first, since they are the highest-frequency path and the clearest place to benefit from append-oriented context.

### Phase D — Summary and compaction layer

Add durable summaries and session compaction rules so long-running rooms stop replaying raw history.

### Phase E — Other agent paths

Migrate briefing generation, onboarding, and resolver flows onto the same context-assembly model.

### Phase F — Evaluation gate

Require evidence that token efficiency and cache reuse improve without harming grounding, scope isolation, or steering fidelity.

## Expected outcome

If the milestone succeeds, the system will still be statement-store-first, but live turns will stop behaving like fully rebuilt one-shot prompts.

Instead, they will behave like durable sessions with:

- stable cached prefixes,
- append-oriented recent activity,
- selective retrieval overlays,
- explicit compaction boundaries,
- measurable efficiency gains.

## Relationship to other docs

- `docs/memory-model.md` — canonical memory, scope isolation, and summarization posture.
- `docs/runtime-and-processing.md` — stateless worker model and trigger system.
- `docs/llm-runtime.md` — runtime boundary and current pi integration posture.
- `docs/statement-store-abstraction.md` — canonical store contract that remains authoritative.
- `docs/llm-narrator-session-profiling.md` — live-model narrator session probe for latency/token/cache comparisons.

## Open questions

- Which providers in the supported model set actually reward stable session identifiers with meaningful cache or affinity gains?
- Should active session state be held only in memory, or also snapshotted in a lightweight runtime-session record for warmer restarts?
- Which summaries should refresh synchronously on write versus asynchronously on schedule?
- How aggressively should retrieval be suppressed when the live transcript already contains the needed fact?
- When a role changes model providers, should the session be rebuilt, forked, or treated as cache-cold but semantically continuous?
