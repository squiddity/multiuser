# Project Instructions

## Documentation conventions

- Persist durable project details into standalone markdown files under `docs/`.
- Keep each doc **platform-agnostic**: describe intent, contracts, and decisions in plain prose. Any capable reader (human or agent) should be able to use these docs.
- One topic per file. Update the relevant doc as soon as a fact, decision, or contract becomes stable.
- This file (`CLAUDE.md`) stays short — it is an index + working agreements. Detail belongs in `docs/`.
- Read on-demand docs when a task touches their area. Do not load them speculatively.

## Pre-commit & pre-push checklist

Run these before every commit and push:

```bash
pnpm typecheck      # required — CI gate
pnpm format:check   # required — CI gate (fix with: pnpm format)
pnpm test           # required — unit tests
pnpm test:integration  # when Postgres is available
```

Never push if `pnpm typecheck` or `pnpm format:check` fails. Fix locally in seconds rather than in CI.

After any `git push` to `origin`, include a GitHub URL to the pushed commit in the response.

## Current milestone

**0003 — Discord Integration and UX Validation** (Active)

Validates milestones 0001–0002 in real Discord UX, including invite-driven onboarding and guided character creation (agentic pattern per D63).

- Roadmap and status: `docs/milestones/README.md`
- Current milestone spec: `docs/milestones/0003-discord-integration-validation.md`
- Run sheet: `docs/milestones/0003-discord-validation-run-sheet.md`

## On-demand docs (read when a task touches the area)

### Build, run, test
- `docs/building.md` — prerequisites, install, Docker workflow, all test commands, CI checklist.

### Architecture and decisions
- `docs/decisions.md` — full decisions log (D1–D63); check here before re-litigating any design choice.
- `docs/implementation.md` — stack, component topology, directory layout, key types sketch, storage schema.
- `docs/framework-evaluation.md` — agent framework selection criteria and candidates.

### Domain model
- `docs/memory-model.md` — statement store, scopes, canon vs. experience, invention pipeline.
- `docs/rooms-and-roles.md` — rooms, roles, scope bindings, cross-room flows, interception.
- `docs/runtime-and-processing.md` — workers, triggers, scheduler tiers, open-question protocol, consistency metrics.
- `docs/rules-resolution.md` — Resolver interface; agent-backed vs. deterministic; rulings-as-canon.
- `docs/world-authoring.md` — ingestion pipeline, bootstrap flow, seed vs. play-invented canon.
- `docs/mud-precedents.md` — MUD/tabletop conventions adopted, roadmap, non-goals.
- `docs/consent-and-safety.md` — v1 safety primitives, capability integration, policy.

### Runtime and storage contracts
- `docs/llm-runtime.md` — LLM runtime layering and pi SDK integration posture.
- `docs/statement-store-abstraction.md` — canonical statement-store contract and backend swap constraints.
- `docs/workflow-session-store.md` — generic session-scope persistence for interruptible agent workflows.
- `docs/llm-context-efficiency.md` — future plan for cache-friendly context assembly and compaction.

### Platform and UI
- `docs/platform-adapter.md` — platform-agnostic adapter interface; Discord v1 specifics.
- `docs/ui-and-interactions.md` — interaction surfaces, Discord UI patterns, deferred media.
- `docs/discord-onboarding-and-character-creation.md` — onboarding flow spec and character creation design.
- `docs/discord-onboarding-interaction-script.md` — interaction script for Discord onboarding UX.
- `docs/discord-onboarding-schema-draft.md` — character profile schema draft.
- `docs/discord-demo-bot-ops.md` — local demo bot setup and operations runbook.
- `docs/research-discord-thinking-and-status-patterns.md` — Discord UX research notes (thinking indicators, status patterns).

### LLM profiling and observability
- `docs/llm-narrator-session-profiling.md` — narrator-style multi-turn session probe methodology.
- `docs/llm-narrator-probe-report-2026-05-06.md` — latest probe results.
- `docs/llm-observability-audit.md` — observability coverage audit.
- `docs/llm-provider-switching.md` — provider switching runbook.
- `docs/llm-concurrency-diagnosis-plan.md` — concurrency diagnosis approach.

### Tooling and migration
- `docs/typebox-migration.md` — migration record for TypeBox adoption (D59).
- `docs/cli-harness-driving.md` — reliable automation contract for driving the interactive CLI harness.

### Milestones
- `docs/milestones/README.md` — milestone status index and sequencing (authoritative roadmap).
- `docs/milestones/0001-vertical-slice.md` — closed; deferred-item record.
- `docs/milestones/0002-stateful-llm-evals-and-extraction.md` — closed; briefing and steering workflows.
- `docs/milestones/0003-discord-integration-validation.md` — **current** Discord UX validation.
- `docs/milestones/0004-rpg-mechanics-command-surface.md` — planned; mechanics dispatch and command surface.
- `docs/milestones/0005-llm-context-efficiency-and-session-caching.md` — planned; cache-friendly context and session caching.
- `docs/milestones/scorecard-schema.md` — machine-readable demo scorecard contract.
