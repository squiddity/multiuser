# Milestone 0003 — Discord Validation Run Sheet

## Purpose

Provide a repeatable, operator-friendly checklist for validating milestone 0003 behavior in a real Discord test server with a running bot.

Primary onboarding behavior and contracts are defined in `docs/discord-onboarding-and-character-creation.md`. Onboarding architecture is agentic (D63): markdown instructions, generic agent with shared tools, thin hardcoded boundary. The demo bot's hardcoded state machine was a proving ground for Discord interaction shapes; the run sheet validates the agentic replacement.

## Preconditions

- Dedicated Discord test guild is available.
- Bot is installed and online with required permissions (channels, roles, messages, threads, webhooks, interactions).
- Runtime service is running and connected to Postgres.
- At least three test users are available:
  - Operator/GM
  - Player A
  - Player B (or observer)
- Logging and statement inspection are enabled.

## Evidence capture standard

For each scenario, capture:

1. Discord-visible outcome (message, component, embed, webhook, refusal, etc.).
2. Statement evidence (ids/kinds/scopes/sources) showing the authoritative write path.
3. Reconciler or worker log evidence where relevant.
4. Pass/fail verdict and brief notes.

## Execution order

Run scenarios in this order so dependencies are validated before downstream loops:

1. Onboarding and identity bootstrap.
2. Room/role mapping projection.
3. Core party narration loop.
4. Open-question and canonization loop.
5. Briefing and steering loop.
6. NPC/webhook rendering.
7. Drift and reconciliation.
8. Permission boundaries and text parity.
9. Deferred/latency behavior.

## Scenario checklist

### A. Onboarding and identity bootstrap (critical UX)

- [ ] **D-001 Invite-driven onboarding happy path**  
       **Steps:** Send user a Discord invite URL targeting onboarding flow; user joins guild and enters intended onboarding room scope.  
       **Expected UX:** User is greeted in-room by narrator-guided onboarding and character creation prompt sequence.  
       **Expected evidence:** Mapping/governance statements created for user placement and onboarding session scope.

- [ ] **D-002 Auto-link established during onboarding**  
       **Steps:** Complete guided onboarding flow without running `/link` manually.  
       **Expected UX:** User is informed that account is linked and can act immediately in assigned room scope.  
       **Expected evidence:** User↔Discord identity mapping exists; role grants and room mapping present; no manual operator patch required.

- [ ] **D-003 Manual `/link` fallback path**  
       **Steps:** Simulate onboarding failure and recover with `/link`.  
       **Expected UX:** Recovery instructions are clear; command works as fallback only.  
       **Expected evidence:** Mapping repaired; fallback path logged distinctly from primary onboarding path.

- [ ] **D-004 Post-onboarding routing + visibility isolation**  
       **Steps:** Complete onboarding for two users with different routing outcomes (shared starter room vs solo narrator room).  
       **Expected UX:** Users are moved to the intended destination; onboarding surface is hidden/locked post-completion.  
       **Expected evidence:** Routing decision record (`destination-room-id`, decision source), role/mapping projection, and no residual unauthorized onboarding visibility.

### B. Room/role projection

- [ ] **D-010 Room/channel projection**  
       **Steps:** Create/enable room via governance flow.  
       **Expected UX:** Correct channel/category appears.  
       **Expected evidence:** Governance + mapping statements; reconciler apply logs.

- [ ] **D-011 Role/permission projection**  
       **Steps:** Assign and revoke room roles for test users.  
       **Expected UX:** Visibility/posting rights reflect intended scope immediately or after reconcile delay.  
       **Expected evidence:** Role mapping + membership sync statements.

### C. Core narration loop

- [ ] **D-020 Party narration loop**  
       **Steps:** Player submits action; narrator responds; repeat for multiple turns.  
       **Expected UX:** Clear turn-by-turn in-channel narrative.  
       **Expected evidence:** `narration`/related statements in correct room scope.

- [ ] **D-021 Multi-user turn clarity**  
       **Steps:** Player A and B submit near-simultaneous actions.  
       **Expected UX:** Ordering remains understandable and non-ambiguous.  
       **Expected evidence:** Ordered statements and coherent response trace.

### D. Open-question + canonization

- [ ] **D-030 Open-question creation/routing**  
       **Steps:** Trigger ambiguous canon detail.  
       **Expected UX:** Question appears in authoring path with actionable controls.  
       **Expected evidence:** `open-question` statement with routing metadata.

- [ ] **D-031 Canonization accept**  
       **Steps:** Authoring role accepts candidate.  
       **Expected UX:** Clear acceptance confirmation in relevant channel.  
       **Expected evidence:** `authoring-decision` plus canon-affecting statement chain.

- [ ] **D-032 Canonization reject/edit**  
       **Steps:** Reject candidate and test edit-overwrite path.  
       **Expected UX:** Rejection/edit outcome is explicit and traceable.  
       **Expected evidence:** Decision statements, supersedes trail, and replay-safe history.

### E. Briefing + steering

- [ ] **D-040 Briefing generation**  
       **Steps:** Run briefing workflow from current state.  
       **Expected UX:** Briefing is understandable and scoped correctly.  
       **Expected evidence:** `briefing` statements with source references.

- [ ] **D-041 Steering application**  
       **Steps:** Submit steering; continue narration.  
       **Expected UX:** Subsequent narrator output reflects steering intent.  
       **Expected evidence:** `steering` statements referenced by later turns.

### F. Rendering validation

- [ ] **D-050 NPC/webhook rendering**  
       **Steps:** Trigger NPC speech output.  
       **Expected UX:** Distinct NPC identity rendering (name/avatar), not generic bot voice.  
       **Expected evidence:** Proper authored statement provenance preserved.

### G. Drift + reconciliation

- [ ] **D-060 Unmanaged mutation drift**  
       **Steps:** Manually alter channel name/perms in Discord UI.  
       **Expected UX:** Drift is surfaced and corrected/handled per policy.  
       **Expected evidence:** Drift classification + reconciliation statements.

- [ ] **D-061 Unmanaged delete drift**  
       **Steps:** Delete mapped channel.  
       **Expected UX:** Mapping marked broken and operator notified.  
       **Expected evidence:** `unmanaged-delete` classification and follow-up governance records.

### H. Boundary, parity, and latency checks

- [ ] **D-070 Permission boundary hard check**  
       **Steps:** Unauthorized user attempts protected action/component.  
       **Expected UX:** Ephemeral refusal with clear reason.  
       **Expected evidence:** No unauthorized statement write; denial logged.

- [ ] **D-080 Text parity fallback**  
       **Steps:** Execute core flow with text commands only (no buttons/components).  
       **Expected UX:** Flow remains complete and understandable.  
       **Expected evidence:** Equivalent statement outputs to component path.

- [ ] **D-081 Deferred/latency behavior**  
       **Steps:** Trigger longer-running operation.  
       **Expected UX:** Ack/deferred response appears quickly; final result arrives later without confusion.  
       **Expected evidence:** Invocation trace and eventual completion statement.

## Session run log

### Run 001 — 2026-04-24 (live Discord smoke, hardcoded demo)

Environment:

- Guild-scoped command registration enabled.
- Demo bot launched from local runtime.

Observed results:

- ✅ `/ping` returned expected ephemeral `pong`.
- ✅ `/start-onboarding` flow entered successfully.
- ✅ User completed 4 onboarding fields end-to-end.
- ✅ Private-thread escalation path was exercised during onboarding.
- ✅ Completion event logged server-side with user/draft payload.

Scenario status updates from this run:

- `D-001` Invite-driven onboarding: **not fully exercised** in this run (join/invite issuance path not part of smoke).
- `D-002` Auto-link during onboarding: **partially exercised in demo mode** (flow path works; production mapping persistence still pending full adapter integration).
- `D-004` Post-onboarding routing + visibility isolation: **partially exercised** (private-thread path validated; destination routing policy matrix not yet fully tested).

Carry-over technical TODO:

- ✅ Resolved (2026-04-24): Replaced deprecated Discord interaction `ephemeral: true` responses with `flags`-based ephemeral responses in `src/adapters/discord/demo-bot.ts`.

### Run 002 — 2026-04-24 (startup warning cleanup)

Environment:

- Demo bot launched from local runtime (`API_PORT=3001 pnpm serve`).

Observed results:

- ✅ Startup completed with no Discord `ephemeral` deprecation warnings.
- ✅ Startup completed with no Discord `ready` event deprecation warning.
- ✅ Bot reached ready state and registered guild commands.

Code updates tied to this run:

- `src/adapters/discord/demo-bot.ts`
  - `ephemeral: true` → `flags: MessageFlags.Ephemeral`
  - `client.on('ready', ...)` → `client.on('clientReady', ...)`

### Run 003 — 2026-05-06 (live `/say` narration validation)

Environment:

- Demo bot launched from local runtime with guild-scoped command registration.
- `DEFAULT_MODEL_SPEC=openrouter:deepseek/deepseek-v4-flash`
- `ENABLE_BRIEFING_GENERATOR=1`
- Shared party narration exercised through `/say`.

Observed results:

- ✅ `/ping` returned expected ephemeral `pong`.
- ✅ `/say` produced a quick visible player echo followed by a narrator reply in-channel.
- ✅ Discord typing indicator remained active while longer narrator calls were in flight.
- ✅ Admin-only `/say user:Player A|Player B ...` override allowed one operator to exercise multi-actor validation flows.
- ✅ Two closely spaced actor turns both produced visible echoes and narrator follow-ups.
- ✅ Governance-scope `briefing` statements were emitted from Discord turns with source linkage.
- ✅ `open-question` statements were emitted when narrator responses took the `invention` path.
- ⚠️ Provider behavior was inconsistent: at least one turn returned an empty LLM response and fell back to deterministic narration.
- ⚠️ Narrator latency was high (observed ~12s to ~41s), making typing feedback necessary.
- ⚠️ Follow-up narrative coherence between nearby turns still needs deeper review in a future pass.

Representative evidence captured during this run:

- Party statement chain:
  - `dialogue` `3b0ae5a1-fe81-48b0-bd07-1cc0b4061587`
  - `invention` `9e8483c4-e65f-48cd-b488-027554c9d655`
- Governance statement chain:
  - `briefing` `324698ba-fc6a-4254-a389-d28453292b7a`
  - `open-question` `b6e8cb0d-981e-4b9f-b36c-507f9d037e30`
- Example narrator request profile:
  - request id `ce0a6250-4d75-47e1-8050-300796b13d6e`
  - elapsed `40804ms`
  - response chars `964`

Scenario status updates from this run:

- `D-020` Party narration loop: **validated**, with latency caveat.
- `D-021` Multi-user turn clarity: **validated via admin demo override**, with broader coherence review still pending.
- `D-030` Open-question creation/routing: **partially exercised** from Discord narration output.
- `D-040` Briefing generation: **partially exercised** from Discord party activity.

Carry-over technical TODO:

- Replace the current literal `/say` echo with an agentic, visibility-aware action-echo path that can choose public vs. private acknowledgment and render in narrator/campaign tone.

## Exit criteria for milestone 0003 validation

- All critical scenarios in sections A–E pass.
- No unresolved permission/scope violations.
- Drift scenarios are detected and policy-correct.
- Onboarding path is invite-driven and guided; manual `/link` is retained only as fallback.
- Run artifacts (notes, logs, statement ids) are stored with the milestone handoff.
