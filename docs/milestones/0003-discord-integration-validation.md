# Milestone 0003 — Discord Integration and UX Validation

## Status (2026-05-06)

\*\*Active — substantial progress toward identity bootstrap, onboarding-backed player definition, room/channel projection, and /say gating. Full end-to-end flow validated in live Discord.

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

## Progress snapshot (2026-04-24 through 2026-05-06)

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

- ✅ **Markdown instructions** — `content/agents/onboarding-narrator.md` defining innkeeper persona, profile schema (name only hardcoded; pronouns, archetype, hook are agent-defined profile fields), structured JSON output format (`{ message, progress, components }` / `{ message, complete: true, draft }`), component spec vocabulary, action key reference, validation recovery instructions.
- ✅ **Generic agent** (`src/agents/onboarding-agent.ts`) — loads markdown instructions, builds prompts from conversation history + draft state, calls `LlmRuntime.generate()`, parses JSON output with fallback recovery. Stateless; each Discord interaction is a fresh turn with full context.
- ✅ **Shared tools:**
  - `src/resolvers/tools/render.ts` — component spec types (ButtonSpec, SelectSpec, ModalSpec, PrivateThreadSpec) and Discord.js rendering functions.
  - `src/resolvers/tools/validate.ts` — TypeBox `CharacterDraft` validation wrapper with per-field structured errors for conversational recovery.
- ✅ **Thin adapter** (`src/adapters/discord/demo-bot.ts`) — rewritten to delegate all flow decisions to `OnboardingAgent`. Adapter serializes user interactions into text descriptions, renders agent component specs as Discord UI, handles modal dispatch from component specs, runs validation on agent completion, feeds validation errors back conversationally.
- Interaction timeouts mitigated via `deferReply()`/`update()` before blocking LLM calls (slash commands, modals, buttons, selects); visual feedback via immediate message update with `_Thinking..._` / `_Registering your character..._` text.
- ✅ **State abstraction** (`src/store/workflow-sessions.ts`, `src/adapters/discord/onboarding-store.ts`) — onboarding now sits on a generic workflow session store built on `session`-scope `kind=governance` statements. The Discord demo bot still exposes an `OnboardingStore`, but persistence is no longer onboarding-specific: workflow identity is metadata (`workflowType`, `workflowEventType`), and onboarding is simply the first consumer.
- ✅ **Tests** — onboarding coverage now includes unit coverage for the onboarding wrapper plus unit/integration coverage for the generic workflow session substrate:
  - `test/unit/onboarding-schemas.test.ts` (17 tests) — `CharacterDraft` validation, `normalizeOnboardingInput`, `isValidOnboardingTransition`
  - `test/unit/onboarding-validate.test.ts` (10 tests) — `validateCharacterDraft` complete/incomplete/invalid drafts, per-field errors, formatted output (only `name` + `profile` are hardcoded)
  - `test/unit/onboarding-render.test.ts` (13 tests) — `renderComponentSpec` for all component types, modal lookup, extraction
  - `test/unit/onboarding-store.test.ts` (18 tests) — `InMemoryOnboardingStore` CRUD, conversation history, field setting, merge, component caching, confirm, reset, defensive copies
  - `test/unit/workflow-session-store.test.ts` (4 tests) — generic in-memory workflow session creation, updates, copy semantics, reset
  - `test/unit/onboarding-agent.test.ts` (13 tests) — `OnboardingAgent.turn()` valid/invalid/malformed JSON, prompt content verification, validation errors in prompt, fallback recovery
  - `test/integration/onboarding-store.test.ts` (2 tests) — onboarding wrapper restart-safe reconstruction and reset semantics
  - `test/integration/workflow-session-store.test.ts` (2 tests) — generic statement-backed workflow session reconstruction and reset semantics

### Discord narration command surface (2026-05-06)

- ✅ Added `/say` to the Discord demo bot as the first shared-channel party narration input.
- ✅ `/say` now:
  - rejects Discord users who have not completed onboarding for the demo party room,
  - resolves the acting player from the onboarding-created player definition instead of treating the raw Discord account as the in-world actor,
  - enforces the mapped destination channel for that player before accepting the turn,
  - appends a `dialogue` statement in party scope,
  - shows the visible player/action echo before waiting for narrator completion,
  - invokes the existing `Narrator` path directly for Discord turns,
  - emits follow-on statement events for narrator output so downstream workers can react.
- ✅ Added an admin-only demo actor override on `/say` (`user=Player A|Player B`) so a single operator can still exercise multi-actor validation flows without multiple live Discord accounts. The override is explicitly for validation/demo use, not the intended player privilege model.
- ✅ Added `src/adapters/discord/party-turns.ts` as the thin Discord-side party-turn service.
- ✅ Registered `briefing-generator` in the main service lifecycle and disabled duplicate `live-responder` scheduling when the Discord adapter is active, so Discord-driven turns can produce briefings without duplicate narrator responses.
- ✅ Added integration coverage in `test/integration/discord-party-turns.test.ts` for statement writes, event emission, and onboarding-gated access.

### Onboarding-backed player definition and room projection (2026-05-06)

- ✅ Discord startup now ensures a minimal demo projection in the target guild:
  - `onboarding-intake`
  - `party-1`
  - `gm-briefings`
- ✅ Room↔channel projection is now persisted through append-only `mappings` rows plus `kind=mapping` audit statements.
- ✅ `/start-onboarding` now auto-links the Discord account on entry and records the link through the mapping layer before the conversational flow continues.
- ✅ On onboarding confirmation, the bot now:
  - creates a durable player definition tying `userId`, `userAccountId`, `characterId`, and destination room/channel together,
  - emits a `character-definition` governance record in character scope,
  - grants the seeded player role for the party room,
  - applies Discord channel access for the assigned player,
  - writes a session-scope routing/completion governance record,
  - posts a first-turn handoff message in the destination party channel.
- ✅ Added integration coverage in `test/integration/discord-demo-state.test.ts` for link creation, player definition persistence, room grant creation, and routing records.

### Live Discord validation snapshot (2026-05-06)

A live Discord validation pass covered the currently implemented `/say` path:

- ✅ `/ping` health check succeeded.
- ✅ `D-020` core party narration loop was exercised successfully with visible player echo, Discord typing indicator during long narrator waits, and in-channel narrator follow-up.
- ✅ `D-021` multi-actor turn clarity was exercised using the admin-only demo actor override (`user=Player A|Player B`); both echoes and both narrator follow-ups arrived clearly enough for validation.
- ✅ `D-030` open-question creation/routing was partially demonstrated from Discord turns when narrator output produced `invention` records.
- ✅ `D-040` briefing generation was partially demonstrated from Discord turns; governance-scope `briefing` statements were emitted with source references.
- ⚠️ Provider/runtime behavior remains flaky under live use: some turns returned rich output, while others returned an empty model response and fell back to deterministic narration. Latency was also high enough to require explicit typing feedback.
- ⚠️ Multi-turn narrative coherence across closely related follow-ups still needs dedicated review in a later session.

### Still to do

- [ ] Run a fresh live pass covering the new onboarding-backed player definition and room/channel projection behavior.
- [ ] Run the remaining run-sheet scenarios against the live bot and capture artifacts in the run log.
- [ ] Room and role projection checks (channels, permissions, mappings).
- [ ] Open-question and canonization loop in Discord.
- [ ] Briefing and steering loop in Discord.
- [ ] NPC/webhook rendering checks.
- [ ] Drift and reconciliation fault tests.
- [ ] Permission-boundary hard checks.
- [ ] Replace the literal `/say` echo with an agentic, visibility-aware action-echo path that can choose public vs. private acknowledgment and render it in campaign/narrator tone.
- [ ] Refactor `src/adapters/discord/demo-bot.ts` interaction handlers to reduce duplication of `update-LLM-editReply` pattern; extract a shared helper that handles defer/feedback/LLM/error uniformly across buttons, selects, modals, and slash commands.

## Out of scope

- New mechanics systems or expanded rules coverage.
- Advanced moderation workflows beyond already-approved command surface.
- Multi-platform adapter expansion.
