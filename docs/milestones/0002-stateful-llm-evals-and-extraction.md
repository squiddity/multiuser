# Milestone 0002 — Admin/Player Context, Briefing, and Steering Workflows

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

- [ ] Define briefing statement schema contract (required fields, sources, scope).
- [ ] Define steering statement schema contract (intent categories, scope binding, status).
- [ ] Add deterministic fixture scenarios for two loops:
  - briefing generation from party play
  - steering update reflected in next narrator turn

### 1) Briefing generation path

- [ ] Implement/finish briefing worker trigger strategy.
- [ ] Emit admin-facing briefing statements with source linkage.
- [ ] Add dedupe/idempotency guardrails for repeated trigger windows.
- [ ] Add integration tests asserting scope correctness and source coverage.

### 2) Steering formalization and application path

- [ ] Implement/finish admin steering formalization into structured statements.
- [ ] Define active-steering selection logic for narrator prompt assembly.
- [ ] Include active steering snippets in logged prompt context when enabled.
- [ ] Add integration tests proving narrator context changes after steering updates.

### 3) End-to-end demo flows

- [ ] Extend CLI demo script with a briefing-focused scenario.
- [ ] Extend CLI demo script with a steering-change scenario showing before/after behavior.
- [ ] Add end-of-run scorecard for:
  - `briefing_emitted`
  - `briefing_scope_valid`
  - `steering_emitted`
  - `steering_applied_in_prompt`
  - `post_steering_behavior_alignment`

### 4) Evaluation/reporting

- [ ] Add machine-readable demo report output (JSON).
- [ ] Classify infra/provider failures separately as `infra-flake`.
- [ ] Document qualitative rubric examples for alignment judgments.

### 5) Documentation updates

- [ ] Update `docs/cli-harness-driving.md` with briefing/steering scenarios and flags.
- [ ] Update `docs/building.md` with exact commands for milestone 0002 demos.
- [ ] Update `docs/decisions.md` for any new policy decisions (for example steering precedence rules).

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
