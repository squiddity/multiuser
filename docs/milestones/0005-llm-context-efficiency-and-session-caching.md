# Milestone 0005 — LLM Context Efficiency and Session Caching

## Purpose

Optimize how agent turns combine canonical statement-store context with active runtime session context so repeated LLM calls become more cache-friendly, more append-oriented, and less wasteful.

This milestone does not change the authority model: the statement store remains canonical. The optimization target is how active turns are assembled and carried forward while a room or workflow is live.

## Why this milestone exists

The current runtime is correct but conservative:

- prompt sections are rebuilt from fresh statement-store reads each turn,
- runtime agent instances are effectively one-shot,
- stable and volatile context are not yet separated into explicit tiers,
- cache effectiveness is not yet measured as a first-class concern.

That means we preserve correctness and replayability, but we are not yet taking full advantage of pi runtime session features or provider-side prompt caching.

## Scope

### A. Session-aware runtime contract

- Extend the local LLM runtime boundary to carry stable session identity per room or workflow.
- Allow callers to express cache-retention preferences where supported.
- Support explicit context segmentation by stability tier.
- Preserve provider-agnostic behavior so cache features remain optimizations, not correctness dependencies.

### B. Context assembly by stability tier

- Introduce a shared context-assembly component for agent turns.
- Separate stable instructions and durable summaries from append-only live transcript.
- Push volatile turn-specific retrieval later in the request so stable prefixes remain reusable.
- Reduce hand-built prompt formatting spread across narrator, briefing, onboarding, and resolver paths.

### C. Active session carry-forward

- Maintain room- or workflow-scoped active session context for long-lived flows.
- Keep live context append-oriented rather than fully rebuilt each turn.
- Ensure restart/recovery remains possible from canonical statements plus persisted summaries.

### D. Summary and compaction artifacts

- Add durable summaries for world, party, scene, governance, and pending-question state.
- Refresh summaries on appropriate sync or async schedules.
- Preserve back-pointers to underlying statement IDs so provenance and audit remain intact.

### E. Efficiency telemetry and evals

- Measure prompt size, cache read/write usage, latency, and retrieval payload size.
- Add evaluation coverage for grounding, contradiction, and steering fidelity after compaction.
- Define acceptance thresholds showing efficiency gains without safety or consistency regressions.

## Recommended prompt shape

The target turn structure is:

1. **Stable prefix** — instructions, contracts, stable room/campaign rules, compact durable summaries.
2. **Append-oriented session body** — recent live transcript, active steering, latest player/admin action.
3. **Volatile retrieval suffix** — only the statement-store excerpts needed for this turn.

This means statement-store use still changes the request from turn to turn, but it should mostly affect a small trailing region instead of forcing wholesale prompt regeneration.

## Exit criteria

- A stable-session-aware LLM runtime contract exists and is used by at least the narrator path.
- Prompt assembly is tiered into stable, append-oriented, and volatile sections.
- Long-running room context can be compacted without losing provenance or scope safety.
- Telemetry shows measurable efficiency improvement over the current one-shot prompt assembly path.
- Regression checks confirm no material loss in grounding, scope isolation, or steering application quality.

## Relationship to other docs

- `docs/llm-context-efficiency.md` — detailed architecture and implementation plan for this milestone.
- `docs/llm-runtime.md` — current runtime boundary and integration posture.
- `docs/memory-model.md` — canonical memory and summarization posture.
- `docs/statement-store-abstraction.md` — statement-store contract that remains authoritative.
