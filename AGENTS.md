# Agent Instructions

## Documentation conventions

- Persist durable agent details into standalone markdown files under `docs/`.
- Keep each doc **platform-agnostic**: describe intent, contracts, and decisions in plain prose — avoid tool-specific directives, IDE-specific syntax, or agent-specific phrasing. Any capable reader (human or agent) should be able to use these docs.
- One topic per file. Prefer focused docs (e.g. `docs/architecture.md`, `docs/data-model.md`, `docs/decisions/0001-<slug>.md`) over a single sprawling document.
- Update the relevant doc **as soon as** a fact, decision, or contract becomes stable — don't let knowledge live only in chat.
- This file (`AGENTS.md`) stays short. It is an index + working agreements. Detail belongs in `docs/`.
- Active-tier docs (current milestone, decisions, implementation stack, build/run) are auto-imported below. Design docs are discoverable via the on-demand index and should be read when a task touches their area.
- After any `git push` to `origin`, include a GitHub URL to the pushed commit in the handoff response (and include compare/range link if requested).

## Pre-commit & Pre-push checklist

**Run these before every commit and push**:

```bash
# 1. Type check (required)
pnpm typecheck

# 2. Format (required)
pnpm format:check  # or fix with: pnpm format

# 3. Unit tests (required)
pnpm test

# 4. Integration tests (if Postgres available)
pnpm test:integration
```

**Why this matters:**

- CI gates include `typecheck` and `format:check` as **required** checks
- Failing these gates blocks merge and wastes reviewer time
- Fixing locally takes seconds; fixing in CI requires a new push cycle
- **Rule:** Never push if `pnpm typecheck` or `pnpm format:check` fails

**Quick fix pattern:**

```bash
# If typecheck fails:
#   - Read the error, fix the type issue, re-run `pnpm typecheck`
#   - Don't suppress with @ts-ignore unless absolutely necessary

# If format fails:
#   - Run `pnpm format` to auto-fix
#   - Verify with `pnpm format:check` that it passes

# If tests fail:
#   - Run `pnpm test` to see failures
#   - Fix the code or update tests as appropriate
#   - Re-run until all pass
```

**Running tests**:

- **Unit tests** (no DB): `pnpm test` or `npx vitest run`
- **Integration tests** (require Postgres): `pnpm test:integration` or `npx vitest run test/integration`
  - Start Postgres first: `docker compose -f docker/compose.yml up -d postgres`
  - Tests self-migrate and clean up. Safe to re-run.
- **Hermetic API tests**: `pnpm test:api`
  - Script auto-creates `.venv-api-tests` and installs `pytest`/`httpx` when missing.
  - Optional overrides: `PYTHON_BIN=/path/to/python3` and `API_TEST_VENV=/custom/path`.
  - **HTTP contract only** (CRUD, scope isolation). Worker features require model config, so they're tested in integration tests.
- **Type check**: `npx tsc --noEmit`
- **Format**: `npx prettier --write .` (fix) or `npx prettier --check .` (check)
- **All CI**: typecheck, unit tests, integration tests, format check

## Imports (active tier — always loaded)

@docs/building.md
@docs/decisions.md
@docs/implementation.md
@docs/milestones/0002-stateful-llm-evals-and-extraction.md

## On-demand docs (read when relevant)

- `docs/framework-evaluation.md` — criteria and candidates for the agent framework choice.
- `docs/memory-model.md` — statement store, scopes, canon vs. experience, invention pipeline.
- `docs/rooms-and-roles.md` — rooms, roles, scope bindings, cross-room flows, interception.
- `docs/runtime-and-processing.md` — workers, triggers, scheduler tiers, open-question protocol, consistency metrics.
- `docs/llm-runtime.md` — LLM runtime layering and pi SDK integration posture.
- `docs/statement-store-abstraction.md` — canonical statement-store contract and backend swap constraints.
- `docs/typebox-migration.md` — migration record for TypeBox adoption.
- `docs/platform-adapter.md` — platform-agnostic adapter interface; Discord v1 specifics.
- `docs/ui-and-interactions.md` — interaction surfaces, Discord UI patterns, deferred media.
- `docs/rules-resolution.md` — Resolver interface; agent-backed vs. deterministic; rulings-as-canon.
- `docs/world-authoring.md` — ingestion pipeline, bootstrap flow, seed vs. play-invented canon.
- `docs/mud-precedents.md` — MUD/tabletop conventions adopted, roadmap, non-goals.
- `docs/consent-and-safety.md` — v1 safety primitives, capability integration, policy.
- `docs/cli-harness-driving.md` — reliable automation contract for driving the interactive CLI harness.
- `docs/evals/scorecard-schema.md` — stub machine-readable demo scorecard contract for milestone 0002.
- `docs/milestones/README.md` — milestone status index and sequencing.
- `docs/milestones/0001-vertical-slice.md` — completed baseline vertical slice and deferred-item record.
- `docs/milestones/0002-stateful-llm-evals-and-extraction.md` — current milestone for briefing + steering context workflows.
- `docs/milestones/0003-discord-integration-validation.md` — Discord adapter integration and behavior validation plan.
- `docs/milestones/0004-rpg-mechanics-command-surface.md` — deferred mechanics and command-surface roadmap.
