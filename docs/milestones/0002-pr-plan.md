# Milestone 0002 — PR-by-PR Delivery Plan

## Purpose

Break milestone 0002 into reviewable, low-risk pull requests that each leave the system in a verifiable state.

## Demo progression policy (added 2026-04-20)

Demo coverage is incremental, not end-loaded:

- PR2 adds a briefing-focused demo scenario/checkpoint in the CLI demo driver.
- PR3 adds steering-application checkpoint coverage.
- PR4 consolidates these into the full milestone scorecard JSON contract and provider-failure classification (`infra-flake`).

This keeps demo evidence aligned with implementation progress and avoids waiting until the end of 0002 for first observable behavior checks.

## PR1 — Contracts and policy baseline ✅ Completed (2026-04-20)

### Scope

- Add explicit schema contracts for `briefing` and `steering` statements.
- Define steering status/intent enums and active-steering precedence utility.
- Add unit tests covering valid and invalid payloads plus precedence behavior.
- Record steering precedence policy in `docs/decisions.md`.

### Exit checks

- Unit tests pass for the new contracts.
- Steering precedence policy is documented and stable.

## PR2 — Briefing generation path (party → admin)

### Scope

- Implement `briefing-generator` worker.
- Trigger on party activity windows.
- Emit `kind=briefing` statements in governance scope with source linkage.
- Add idempotency guardrails to avoid duplicate briefings for the same source window.
- Add integration tests for scope correctness and source coverage.
- Add/extend a demo scenario checkpoint to assess `briefing_emitted` and `briefing_scope_valid` (initially lightweight; full scorecard lands in PR4).

### Exit checks

- A party activity fixture causes exactly one briefing emission in expected governance scope.
- Replaying the same trigger window does not emit duplicates.

## PR3 — Steering formalization + narrator application (admin → runtime) ✅ Completed (2026-04-24)

### Scope

- Implement `steering-formalizer` worker from admin governance inputs.
- Persist structured `kind=steering` statements with explicit status.
- Add active-steering selection in narrator context assembly.
- Include steering evidence in prompt logging (`LOG_LLM_INPUT`).
- Add integration tests proving post-steering prompt/context changes.
- Extend demo checkpointing with steering before/after evidence (lightweight in PR3; full JSON scorecard in PR4).

### Delivered

- New `steering-request` statement kind and `SteeringRequestContract` as the
  admin input surface. Admin submits via `/steer <intent> <direction...>` (CLI)
  or `POST /api/rooms/:roomId/steering` (HTTP). Capability check requires the
  `canonize` grant on the admin room.
- `steering-formalizer` worker (`src/workers/steering-formalizer.ts`) consumes
  `steering-request` events and emits a structured `kind=steering` statement
  in governance scope with `status=active` and source linkage to the request.
- `listActiveSteeringFor(partyRoomId, adminRoomId)` uses `selectActiveSteering`
  to order newest-first and filter out superseded/revoked entries, matching
  decision D56.
- `Narrator.buildContext` fetches active steering for the current party room
  and renders an "Active GM steering" block in the user prompt; `LOG_LLM_INPUT`
  now includes a compact `activeSteering` summary so steering evidence is
  auditable in logs.
- Integration tests in `test/integration/steering-flow.test.ts` cover
  capability gating, worker emission, newest-first ordering, prompt inclusion
  when steering is active, and prompt omission when none is active.
- Demo driver gains a `steering-application` scenario with a pre-steering
  narration turn, an admin `/steer`, and a post-steering narration turn; the
  scorecard emits `steering_emitted` and `steering_applied_in_prompt` checks
  (lightweight; the full milestone scorecard consolidates in PR4).

### Naming note

The milestone 0001 agent previously named `SteeringFormalizer`
(authoring-decision formalizer) has been renamed to `DecisionFormalizer` and
its `author_id` is now `decision-formalizer`. This frees the
`steering-formalizer` name for the new worker that emits actual `kind=steering`
statements. The demo reset query and docs that referenced the old `author_id`
have been updated accordingly.

### Exit checks

- Steering statements are emitted and persisted with valid contract fields. ✅
- Narrator prompt assembly includes active steering after updates. ✅

## PR4 — Demo scenarios + scorecard JSON ✅ Completed (2026-04-24)

### Scope

- Extend CLI demo driver with:
  - briefing-focused scenario,
  - steering before/after scenario.
- Emit scorecard JSON with milestone 0002 checks:
  - `briefing_emitted`
  - `briefing_scope_valid`
  - `steering_emitted`
  - `steering_applied_in_prompt`
  - `post_steering_behavior_alignment`
- Classify infra/provider failures as `infra-flake`.

### Delivered

- `scripts/drive-cli-demo.mjs` now emits the milestone 0002 scorecard check set for both `briefing-only` and `steering-application` scenarios.
- Briefing assessment validates governance/admin scope, party/admin room binding fields, and source linkage.
- Steering assessment validates structured active steering emission, confirms prompt inclusion from `LOG_LLM_INPUT` output when enabled, and records post-steering narrator output for behavior-alignment review.
- Demo output is buffered for scorecard assessment so provider/runtime failure evidence can be classified as `infra-flake` where behavior cannot be evaluated.
- `docs/evals/scorecard-schema.md` now documents the milestone 0002 check names and `[demo-scorecard]` JSON line contract.
- Briefing generation falls back to deterministic content when the provider returns empty text, keeping `kind=briefing` contract validation stable during demos.

### Exit checks

- Demo run emits machine-readable scorecard JSON matching schema draft. ✅
- Scorecard reflects scenario outcomes and provider failure handling. ✅

## PR5 — Documentation and runbook closure ✅ Completed (2026-04-24)

### Scope

- Update `docs/cli-harness-driving.md` for new scenarios and toggles, including model-provider setup expectations for demos.
- Update `docs/building.md` with exact milestone 0002 commands and local/OpenAI-compatible provider examples.
- Replace fixed live-model waits in the demo driver with polling-based response detection so scenarios advance when expected statements appear.
- Capture any new policy refinements in `docs/decisions.md`.

### Delivered

- `scripts/drive-cli-demo.mjs` now uses polling-based async checkpoint detection for narrator replies, briefing emission, steering emission, and canon promotion; fixed live-response sleeps were removed from scenario flow control.
- Added poll configuration knobs:
  - `DEMO_POLL_TIMEOUT_MS`
  - `DEMO_POLL_INTERVAL_MS`
  - `DEMO_LIVE_WAIT_MS` remains as fallback when polling is unavailable.
- Updated `docs/cli-harness-driving.md` with milestone 0002 scenarios, model-provider methodology, and polling controls.
- Updated `docs/building.md` with exact milestone 0002 demo commands and local/OpenAI-compatible provider guidance.
- Added qualitative rubric examples for `post_steering_behavior_alignment` to `docs/evals/scorecard-schema.md`.
- Recorded demo polling strategy policy in `docs/decisions.md` (D61).

### Exit checks

- A new contributor can execute milestone 0002 demos/tests from docs alone. ✅
- All milestone 0002 contracts and policies are discoverable in docs. ✅
