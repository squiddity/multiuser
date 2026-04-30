# Milestone 0003 — Discord Integration and UX Validation

## Status (2026-04-24)

**Active — kickoff after milestone 0002 closure.**

## Goal

Plug the proven runtime behaviors from prior milestones into the Discord adapter and verify they work reliably in real chat interaction surfaces.

## Focus

1. Project rooms/roles/scopes cleanly into Discord channels, roles, and commands.
2. Validate that milestone 0001 and 0002 behaviors survive transport/UI constraints.
3. Confirm that operator and player experience is understandable in actual chat usage.
4. Validate onboarding UX end-to-end (invite, identity link, room placement, character creation) without requiring manual operator intervention per user.

## Scope

- Discord command and component wiring for core party/admin flows.
- Message/webhook rendering for narrator and system outputs.
- End-to-end validation of:
  - party narration loop,
  - open-question + canonization loop,
  - briefing and steering workflow loop.
- End-to-end onboarding validation:
  - user receives invite link,
  - user enters the intended room scope,
  - narrator-guided character creation runs in chat,
  - identity and role mapping are established automatically as part of onboarding.
- Drift/reconciliation checks for channel/role/webhook mappings.

## Validation criteria

- Prior milestone behaviors are reproducible in Discord without semantic regressions.
- Scope boundaries and permissions remain correct under Discord identity/mapping rules.
- Logs and statement records remain auditable and aligned with in-chat events.
- User-facing command flows are usable without CLI-only assumptions.
- First-time user onboarding works via invite-driven flow and guided in-chat setup; manual `/link` remains fallback/admin recovery, not the primary path.

## Execution order (validation sequence)

1. Identity + onboarding bootstrap (invite, auto-link, room placement).
2. Room and role projection checks (channels, permissions, mappings).
3. Core party narration loop in Discord.
4. Open-question and canonization loop.
5. Briefing and steering loop.
6. NPC/webhook rendering checks.
7. Drift and reconciliation fault tests.
8. Permission-boundary hard checks.
9. Text-parity + deferred response behavior checks.

Detailed per-scenario checklists live in `docs/milestones/0003-discord-validation-run-sheet.md`.
Onboarding UX and state contracts are defined in `docs/discord-onboarding-and-character-creation.md`.
Message-level interaction flow is defined in `docs/discord-onboarding-interaction-script.md`.
Type-level onboarding contract draft is in `docs/discord-onboarding-schema-draft.md`.
Discord status/thinking UX research notes are captured in `docs/research-discord-thinking-and-status-patterns.md`.

## Progress snapshot (2026-04-24)

- Implemented a runnable Discord demo bot path in the main service lifecycle (env-gated start/stop).
- Added demo onboarding command surface:
  - `/ping` (liveness)
  - `/start-onboarding` (ephemeral-first guided flow)
- Added private-thread escalation path from onboarding flow.
- Added TypeBox onboarding contracts and local onboarding state scaffolding for implementation alignment.
- Added operations/run docs for local bot lifecycle and monitoring.

### First live run summary (2026-04-24)

- Bot connected and registered guild commands successfully.
- `/ping` succeeded (ephemeral `pong`).
- `/start-onboarding` succeeded.
- User completed all 4 onboarding fields through private-thread-assisted flow and received completion.
- Runtime logged onboarding completion with captured draft payload.

### Carry-over TODO (next session)

- ✅ Resolved (2026-04-24): Updated Discord interaction replies to use `flags`-based ephemeral responses everywhere.
- ✅ Resolved (2026-04-24): Updated Discord client startup hook to `clientReady` (replacing deprecated `ready`) so startup is warning-free for this demo path.

## Out of scope

- New mechanics systems or expanded rules coverage.
- Advanced moderation workflows beyond already-approved command surface.
- Multi-platform adapter expansion.
