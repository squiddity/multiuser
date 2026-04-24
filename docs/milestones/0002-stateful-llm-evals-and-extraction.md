# Milestone 0002 — Admin/Player Context, Briefing, and Steering Workflows

## Status (2026-04-24)

**Closed — PR5 landed.**

Delivery progress per `docs/milestones/0002-pr-plan.md`:

- **PR1** (contracts and policy baseline) — closed. Briefing and steering contracts, steering status/intent enums, `selectActiveSteering` precedence utility, and decision D56 recorded in `docs/decisions.md`.
- **PR2** (briefing generation path) — closed. `briefing-generator` worker triggers on party activity, emits `kind=briefing` in governance scope with source linkage and strict per-trigger idempotency; integration tests and `briefing-only` demo scenario cover the path.
- **PR3** (steering formalization + narrator application) — closed. `steering-formalizer` worker consumes `steering-request` events and emits structured `kind=steering` statements with `status=active`; `Narrator.buildContext` pulls active steering (newest-first per D56) and includes it in the user prompt and `LOG_LLM_INPUT` logs. `/steer` CLI verb and `POST /api/rooms/:roomId/steering` are the admin input surfaces. The milestone 0001 agent previously named `SteeringFormalizer` is now `DecisionFormalizer` (`author_id=decision-formalizer`) to free the worker name.
- **PR4** (demo scenarios + scorecard JSON) — closed. The CLI demo driver emits milestone 0002 scorecard JSON for briefing and steering scenarios, including `briefing_emitted`, `briefing_scope_valid`, `steering_emitted`, `steering_applied_in_prompt`, and `post_steering_behavior_alignment`. Demo assessment classifies detected provider/runtime failures as `infra-flake`; prompt-inclusion and behavior-alignment evidence is attached when available.
- **PR5** (documentation and runbook closure) — closed. `docs/cli-harness-driving.md` and `docs/building.md` now document milestone 0002 scenarios and provider setup methodology; the CLI demo driver now uses polling-based response detection (`DEMO_POLL_TIMEOUT_MS`, `DEMO_POLL_INTERVAL_MS`) instead of fixed live-response waits.

## Goal

Round out cross-room context handling between party and admin roles by fully implementing briefing and steering workflows.

Milestone 0002 shifts focus from basic pipeline proof to **operational authoring loops**:

1. Party activity is summarized into actionable admin briefings.
2. Admin steering decisions are captured in structured form.
3. Steering outputs flow back into subsequent narrator behavior for players.

## Why this is the next milestone

Milestone 0001 proved statement plumbing, room isolation, and canonization mechanics. The next gap is sustained collaboration quality between players and human admins.

This milestone establishes the practical loop needed for long-running campaigns:

- party play produces digestible governance context,
- admins steer with clear intent,
- narrator behavior reflects that steering in future turns.

## Current baseline (starting point)

Before 0002 work begins, the existing demo/runtime already provides:

- repeatable CLI demo driver (`pnpm demo:cli`) with data reset and deterministic seeded governance open-question,
- canonization flow from admin room to world canon (`/canonize ... promote`),
- player-room recall prompt validating that narrator can consume canonized context,
- optional LLM input logging (`LOG_LLM_INPUT`) to audit system+user prompt payload,
- optional suppression of noisy Postgres NOTICE output (`LOG_DB_NOTICES`).

These baseline capabilities should be reused, not rebuilt, when adding briefing/steering scenarios.

## Scope

### A. Briefing workflow (party → admin)

Implement reliable briefing generation from party scope into governance/meta surfaces.

Requirements:

1. Summarize recent party events into concise admin-facing briefing statements.
2. Preserve provenance (link summary to source statement IDs).
3. Surface unresolved tensions/questions relevant for admin steering.
4. Avoid leaking private or out-of-scope content across room boundaries.

### B. Steering workflow (admin → runtime behavior)

Implement robust steering capture and application loop.

Requirements:

1. Admin inputs are formalized into structured steering statements.
2. Steering is bound to explicit scope and intent (tone, constraints, direction).
3. Live narrator prompt assembly includes active steering context.
4. Subsequent narrator outputs demonstrably reflect steering changes.

### C. Context-handling evaluation

Add demonstration and test paths proving that:

- briefings are timely and relevant,
- steering is applied to narrator context,
- context remains scope-correct and auditable.

## Implementation checklist

### 0) Contracts and fixtures

- [x] Define briefing statement schema contract (required fields, sources, scope).
- [x] Define steering statement schema contract (intent categories, scope binding, status).
- [x] Add deterministic fixture scenarios for two loops:
  - briefing generation from party play
  - steering update reflected in next narrator turn

### 1) Briefing generation path

- [x] Implement/finish briefing worker trigger strategy.
- [x] Emit admin-facing briefing statements with source linkage.
- [x] Add dedupe/idempotency guardrails for repeated trigger windows.
- [x] Add integration tests asserting scope correctness and source coverage.

### 2) Steering formalization and application path

- [x] Implement/finish admin steering formalization into structured statements.
- [x] Define active-steering selection logic for narrator prompt assembly.
- [x] Include active steering snippets in logged prompt context when enabled.
- [x] Add integration tests proving narrator context changes after steering updates.

### 3) End-to-end demo flows

- [x] Extend CLI demo script with a briefing-focused scenario.
- [x] Extend CLI demo script with a steering-change scenario showing before/after behavior.
- [x] Add end-of-run scorecard for:
  - `briefing_emitted`
  - `briefing_scope_valid`
  - `steering_emitted`
  - `steering_applied_in_prompt`
  - `post_steering_behavior_alignment`

### 4) Evaluation/reporting

- [x] Add machine-readable demo report output (JSON).
- [x] Classify infra/provider failures separately as `infra-flake`.
- [x] Document qualitative rubric examples for alignment judgments.

### 5) Documentation updates

- [x] Update `docs/cli-harness-driving.md` with briefing/steering scenarios and flags.
- [x] Update `docs/building.md` with exact commands for milestone 0002 demos.
- [x] Update `docs/decisions.md` for any new policy decisions (for example steering precedence rules).

### 6) Demo harness robustness follow-up

- [x] Replace fixed live-model wait timings with polling-based response detection so demos proceed when the expected statement appears rather than sleeping for a provider-specific timeout.

## Out of scope

- RPG mechanics command path (`/roll`, tactical actions, mechanical resolver dispatch).
- Safety pause/fade command UX and enforcement path.
- Discord-specific interaction UX validation.
- Full extraction/digest intelligence beyond briefing + steering operational loop.

## Exit criteria

1. Briefing statements are generated from party activity with valid provenance.
2. Admin steering statements are structured and persisted with clear scope.
3. Narrator prompt input includes active steering context in auditable logs.
4. Demo scenarios show steering affecting subsequent narrator behavior.
5. Deterministic tests for routing/schema invariants pass in CI.

## Relationship to other docs

- `docs/milestones/0001-vertical-slice.md` — prerequisite runtime/store baseline.
- `docs/milestones/0002-pr-plan.md` — staged PR delivery and exit checks.
- `docs/runtime-and-processing.md` — worker orchestration and trigger model.
- `docs/rooms-and-roles.md` — scope boundaries and cross-room governance flow.
- `docs/world-authoring.md` — canon lifecycle constraints that steering must respect.
