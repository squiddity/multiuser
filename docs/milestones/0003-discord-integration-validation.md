# Milestone 0003 — Discord Integration and UX Validation

## Status (2026-04-24)

**Active — kickoff after milestone 0002 closure.**

## Goal

Plug the proven runtime behaviors from prior milestones into the Discord adapter and verify they work reliably in real chat interaction surfaces.

## Architecture approach: agentic onboarding

Onboarding is one instantiation of the general agentic pattern shared across narration, rules resolution, and other agent-driven flows. The same architecture that powers `AgentBackedResolver` (D52) and the `Narrator` applies here:

- **Markdown instructions as data** (`content/agents/onboarding-narrator.md`) — defines persona, tone, conversational style, and the profile schema the agent should collect. Campaign-level overrides via `agent-prompt` statements in governance scope (same mechanism as the Narrator).
- **Generic inference engine** — the agent receives conversation history, current draft state, and the profile schema. It decides what to ask next, outputs structured JSON (`{ message, components }` or `{ message, complete: true, draft }`), and recovers from validation failures conversationally.
- **Shared tool primitives** — `render(components)` translates JSON component specs into Discord UI; `validate(draft)` runs the TypeBox `CharacterDraft` schema; `retrieve()` looks up existing state.
- **Thin hardcoded boundary** — only schema validation, scope enforcement, and platform-specific Discord component rendering are code. Flow control, field ordering, and messaging are agent-driven.
- **State in the statement store** — onboarding sessions, drafts, and completions are statements with provenance. The agent is stateless; state reconstruction is deterministic from statements.

This means the same agentic infrastructure (pi-agent-core turn loop, tool execution, markdown instructions, statement-store persistence) serves narration, rules resolution, and onboarding — only the instructions file and tool set differ per domain.

## Focus

1. Project rooms/roles/scopes cleanly into Discord channels, roles, and commands.
2. Validate that milestone 0001 and 0002 behaviors survive transport/UI constraints.
3. Confirm that operator and player experience is understandable in actual chat usage.
4. Validate agentic onboarding UX end-to-end (invite, identity link, room placement, character creation) without requiring manual operator intervention per user.

## Scope

- Discord command and component wiring for core party/admin flows.
- Message/webhook rendering for narrator and system outputs.
- End-to-end validation of:
  - party narration loop,
  - open-question + canonization loop,
  - briefing and steering workflow loop.
- Agentic onboarding implementation and end-to-end validation:
  - user receives invite link,
  - user enters the intended room scope,
  - onboarding agent (markdown-instructed, tool-equipped) conducts character creation in chat,
  - profile schema is data (not hardcoded per field), agent drives flow and recovers from validation failures,
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

## Progress snapshot (2026-04-24 through 2026-05-05)

### Completed (hardcoded demo phase)

- Implemented a runnable Discord demo bot path in the main service lifecycle (env-gated start/stop).
- Added demo onboarding command surface:
  - `/ping` (liveness)
  - `/start-onboarding` (ephemeral-first guided flow)
- Added private-thread escalation path from onboarding flow.
- Added TypeBox onboarding contracts and local onboarding state scaffolding for implementation alignment.
- Added operations/run docs for local bot lifecycle and monitoring.
- ✅ Resolved: Updated Discord interaction replies to use `flags`-based ephemeral responses everywhere.
- ✅ Resolved: Updated Discord client startup hook to `clientReady` (replacing deprecated `ready`).

### First live run summary (2026-04-24)

- Bot connected and registered guild commands successfully.
- `/ping` succeeded (ephemeral `pong`).
- `/start-onboarding` succeeded.
- User completed all 4 onboarding fields through private-thread-assisted flow and received completion.
- Runtime logged onboarding completion with captured draft payload.

### Agentic onboarding implementation (2026-05-05)

The demo bot's hardcoded state machine has been replaced with the agentic pattern:

- ✅ **Markdown instructions** — `content/agents/onboarding-narrator.md` defining innkeeper persona, profile schema (name, pronouns, archetype, hook), structured JSON output format (`{ message, progress, components }` / `{ message, complete: true, draft }`), component spec vocabulary, action key reference, validation recovery instructions.
- ✅ **Generic agent** (`src/agents/onboarding-agent.ts`) — loads markdown instructions, builds prompts from conversation history + draft state, calls `LlmRuntime.generate()`, parses JSON output with fallback recovery. Stateless; each Discord interaction is a fresh turn with full context.
- ✅ **Shared tools:**
  - `src/resolvers/tools/render.ts` — component spec types (ButtonSpec, SelectSpec, ModalSpec, PrivateThreadSpec) and Discord.js rendering functions.
  - `src/resolvers/tools/validate.ts` — TypeBox `CharacterDraft` validation wrapper with per-field structured errors for conversational recovery.
- ✅ **Thin adapter** (`src/adapters/discord/demo-bot.ts`) — rewritten to delegate all flow decisions to `OnboardingAgent`. Adapter serializes user interactions into text descriptions, renders agent component specs as Discord UI, handles modal dispatch from component specs, runs validation on agent completion, feeds validation errors back conversationally.
- ✅ **State abstraction** (`src/adapters/discord/onboarding-store.ts`) — `OnboardingStore` interface + `InMemoryOnboardingStore` with conversation history tracking. Clean separation from the statement store; production persistence via statements is a deferred follow-up.
- ✅ **Unit tests** — 72 new tests across 5 files covering onboarding schemas, validate, render, store, and agent output parsing with mocked LLM:
  - `test/unit/onboarding-schemas.test.ts` (17 tests) — `CharacterDraft` validation, `normalizeOnboardingInput`, `isValidOnboardingTransition`
  - `test/unit/onboarding-validate.test.ts` (13 tests) — `validateCharacterDraft` complete/incomplete/invalid drafts, per-field errors, formatted output
  - `test/unit/onboarding-render.test.ts` (13 tests) — `renderComponentSpec` for all component types, modal lookup, extraction
  - `test/unit/onboarding-store.test.ts` (16 tests) — `InMemoryOnboardingStore` CRUD, conversation history, field setting, merge, confirm, reset
  - `test/unit/onboarding-agent.test.ts` (13 tests) — `OnboardingAgent.turn()` valid/invalid/malformed JSON, prompt content verification, validation errors in prompt, fallback recovery

### Still to do

- [ ] Persist onboarding session state as statements (replace `InMemoryOnboardingStore` — requires schema decisions for onboarding statement kinds/scopes).
- [ ] Run full run-sheet validation against the agentic flow (live Discord bot test).
- [ ] Room and role projection checks (channels, permissions, mappings).
- [ ] Core party narration loop in Discord.
- [ ] Open-question and canonization loop in Discord.
- [ ] Briefing and steering loop in Discord.
- [ ] NPC/webhook rendering checks.
- [ ] Drift and reconciliation fault tests.
- [ ] Permission-boundary hard checks.

## Out of scope

- New mechanics systems or expanded rules coverage.
- Advanced moderation workflows beyond already-approved command surface.
- Multi-platform adapter expansion.
