# Milestone 0002 — PR-by-PR Delivery Plan

## Purpose

Break milestone 0002 into reviewable, low-risk pull requests that each leave the system in a verifiable state.

## PR1 — Contracts and policy baseline

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

### Exit checks

- A party activity fixture causes exactly one briefing emission in expected governance scope.
- Replaying the same trigger window does not emit duplicates.

## PR3 — Steering formalization + narrator application (admin → runtime)

### Scope

- Implement `steering-formalizer` worker from admin governance inputs.
- Persist structured `kind=steering` statements with explicit status.
- Add active-steering selection in narrator context assembly.
- Include steering evidence in prompt logging (`LOG_LLM_INPUT`).
- Add integration tests proving post-steering prompt/context changes.

### Exit checks

- Steering statements are emitted and persisted with valid contract fields.
- Narrator prompt assembly includes active steering after updates.

## PR4 — Demo scenarios + scorecard JSON

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

### Exit checks

- Demo run emits machine-readable scorecard JSON matching schema draft.
- Scorecard reflects scenario outcomes and provider failure handling.

## PR5 — Documentation and runbook closure

### Scope

- Update `docs/cli-harness-driving.md` for new scenarios and toggles.
- Update `docs/building.md` with exact milestone 0002 commands.
- Capture any new policy refinements in `docs/decisions.md`.

### Exit checks

- A new contributor can execute milestone 0002 demos/tests from docs alone.
- All milestone 0002 contracts and policies are discoverable in docs.
