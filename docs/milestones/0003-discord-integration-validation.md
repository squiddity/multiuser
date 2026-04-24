# Milestone 0003 — Discord Integration and UX Validation

## Status (2026-04-24)

**Active — kickoff after milestone 0002 closure.**

## Goal

Plug the proven runtime behaviors from prior milestones into the Discord adapter and verify they work reliably in real chat interaction surfaces.

## Focus

1. Project rooms/roles/scopes cleanly into Discord channels, roles, and commands.
2. Validate that milestone 0001 and 0002 behaviors survive transport/UI constraints.
3. Confirm that operator and player experience is understandable in actual chat usage.

## Scope

- Discord command and component wiring for core party/admin flows.
- Message/webhook rendering for narrator and system outputs.
- End-to-end validation of:
  - party narration loop,
  - open-question + canonization loop,
  - briefing and steering workflow loop.
- Drift/reconciliation checks for channel/role/webhook mappings.

## Validation criteria

- Prior milestone behaviors are reproducible in Discord without semantic regressions.
- Scope boundaries and permissions remain correct under Discord identity/mapping rules.
- Logs and statement records remain auditable and aligned with in-chat events.
- User-facing command flows are usable without CLI-only assumptions.

## Out of scope

- New mechanics systems or expanded rules coverage.
- Advanced moderation/safety UX beyond already-approved command surface.
- Multi-platform adapter expansion.
