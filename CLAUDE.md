# Project Instructions

## Documentation conventions

- Persist durable project details into standalone markdown files under `docs/`.
- Keep each doc **platform-agnostic**: describe intent, contracts, and decisions in plain prose — avoid tool-specific directives, IDE-specific syntax, or assistant-specific phrasing. Any capable reader (human or agent) should be able to use these docs.
- One topic per file. Prefer focused docs (e.g. `docs/architecture.md`, `docs/data-model.md`, `docs/decisions/0001-<slug>.md`) over a single sprawling document.
- Update the relevant doc **as soon as** a fact, decision, or contract becomes stable — don't let knowledge live only in chat.
- This file (`CLAUDE.md`) stays short. It is an index + working agreements. Detail belongs in `docs/`.
- Active-tier docs (current milestone, decisions, implementation stack, build/run) are auto-imported below. Design docs are discoverable via the on-demand index and should be read when a task touches their area.

## Imports (active tier — always loaded)

@docs/building.md
@docs/decisions.md
@docs/implementation.md
@docs/milestones/0001-vertical-slice.md

## On-demand docs (read when relevant)

- `docs/framework-evaluation.md` — criteria and candidates for the agent framework choice.
- `docs/memory-model.md` — statement store, scopes, canon vs. experience, invention pipeline.
- `docs/rooms-and-roles.md` — rooms, roles, scope bindings, cross-room flows, interception.
- `docs/runtime-and-processing.md` — workers, triggers, scheduler tiers, open-question protocol, consistency metrics.
- `docs/platform-adapter.md` — platform-agnostic adapter interface; Discord v1 specifics.
- `docs/ui-and-interactions.md` — interaction surfaces, Discord UI patterns, deferred media.
- `docs/rules-resolution.md` — Resolver interface; agent-backed vs. deterministic; rulings-as-canon.
- `docs/world-authoring.md` — ingestion pipeline, bootstrap flow, seed vs. play-invented canon.
- `docs/mud-precedents.md` — MUD/tabletop conventions adopted, roadmap, non-goals.
- `docs/consent-and-safety.md` — v1 safety primitives, capability integration, policy.
