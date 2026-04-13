# Project Instructions

## Documentation conventions

- Persist durable project details into standalone markdown files under `docs/`.
- Keep each doc **platform-agnostic**: describe intent, contracts, and decisions in plain prose — avoid tool-specific directives, IDE-specific syntax, or assistant-specific phrasing. Any capable reader (human or agent) should be able to use these docs.
- One topic per file. Prefer focused docs (e.g. `docs/architecture.md`, `docs/data-model.md`, `docs/decisions/0001-<slug>.md`) over a single sprawling document.
- Update the relevant doc **as soon as** a fact, decision, or contract becomes stable — don't let knowledge live only in chat.
- This file (`CLAUDE.md`) stays short. It is an index + working agreements. Detail belongs in `docs/`.
- Pull docs into context with `@docs/<file>.md` imports below, added as the docs are created.

## Imports

@docs/framework-evaluation.md
@docs/memory-model.md
@docs/rooms-and-roles.md
@docs/runtime-and-processing.md
@docs/platform-adapter.md
