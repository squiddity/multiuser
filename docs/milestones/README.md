# Milestones Index

## Purpose

Provide a single roadmap index for milestone status, sequencing, and handoff context.

## Current sequence

1. **0001 — Vertical Slice (Party + Admin)**
   - File: `docs/milestones/0001-vertical-slice.md`
   - Status: **Closed**
   - Outcome: core statement pipeline, scope isolation, live narration loop, governance canonization loop.
   - Deferred items: mechanics command surface and safety command controls.

2. **0002 — Admin/Player Context, Briefing, and Steering Workflows**
   - File: `docs/milestones/0002-stateful-llm-evals-and-extraction.md`
   - Delivery plan: `docs/milestones/0002-pr-plan.md`
   - Status: **Closed** — PR1 through PR5 landed.
   - Focus: completed briefing and steering loops so governance guidance reliably shapes player-facing narration.

3. **0003 — Discord Integration and UX Validation**
   - File: `docs/milestones/0003-discord-integration-validation.md`
   - Run sheet: `docs/milestones/0003-discord-validation-run-sheet.md`
   - Status: **Active**
   - Focus: verify milestones 0001–0002 behavior in real Discord chat interaction surfaces, including agentic invite-driven onboarding and guided character creation.
   - Architecture: onboarding is one instantiation of the general agentic pattern (markdown instructions → generic agent + tools → structured output → thin hardcoded boundary), consistent with narration and rules resolution. See D63.
   - Related spec: `docs/discord-onboarding-and-character-creation.md`
   - Interaction script: `docs/discord-onboarding-interaction-script.md`
   - Schema draft: `docs/discord-onboarding-schema-draft.md`
   - UX research notes: `docs/research-discord-thinking-and-status-patterns.md`
   - Local demo bot ops: `docs/discord-demo-bot-ops.md`

4. **0004 — RPG Mechanics and Command Surface**
   - File: `docs/milestones/0004-rpg-mechanics-command-surface.md`
   - Status: **Planned**
   - Focus: deferred mechanics dispatch, gameplay commands (starting with `/roll`), and deferred safety command controls.

## Notes for handoff

- Milestone status and scope boundaries are also captured in `docs/decisions.md` (D53–D55).
- When a milestone status changes, update both this index and the milestone file in the same change.
