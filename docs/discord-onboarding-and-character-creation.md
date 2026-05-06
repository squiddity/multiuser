# Discord Onboarding and Guided Character Creation Spec (Milestone 0003)

## Purpose

Define the primary user-bootstrap path for Discord: invite-driven entry, automatic identity linking, agentic guided character creation, and placement into the intended room scope.

This spec establishes the **default path** for first-time users. Manual `/link` remains a fallback/recovery path, not the normal experience.

## Architecture: agentic onboarding

Onboarding is one instantiation of the general agentic pattern shared across narration, rules resolution, and other agent-driven flows (see `docs/implementation.md` and decisions D52, D63).

### Components

```
┌──────────────────────────────────────────────────────┐
│  content/agents/onboarding-narrator.md              │
│  • Agent persona and tone                           │
│  • Profile schema (required/optional fields)        │
│  • Conversational flow guidelines                   │
│  • Validation recovery instructions                 │
│  • Campaign overrides via agent-prompt statements   │
└────────────────────┬─────────────────────────────────┘
                     │ loadAgentPrompt()
                     ▼
┌──────────────────────────────────────────────────────┐
│  Onboarding Agent (pi-agent-core turn loop)          │
│  • Receives: conversation history + draft state      │
│  • Decides: what to ask next                         │
│  • Outputs: { message, components } or               │
│             { message, complete: true, draft }       │
│  • Recovers from validation failures conversationally│
└────────┬──────────────────────────────┬──────────────┘
         │                              │
         ▼                              ▼
┌────────────────────┐    ┌──────────────────────────┐
│  Tools              │    │  Hardcoded Boundary       │
│  • render(comps)    │    │  • CharacterDraft schema  │
│    → Discord UI     │    │    validation (TypeBox)   │
│  • validate(draft)  │    │  • Scope enforcement      │
│    → schema check   │    │  • Discord component      │
│  • retrieve(query)  │    │    rendering              │
│    → state lookup   │    │  • Interaction lifecycle  │
└────────────────────┘    └──────────────────────────┘
```

### Split of responsibilities

| Layer                     | What it owns                                                                                  | How it's configured                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Markdown instructions** | Persona, tone, field descriptions, conversational style                                       | `content/agents/onboarding-narrator.md` + campaign `agent-prompt` overrides |
| **Agent (LLM)**           | Flow control, field ordering, messaging, validation recovery                                  | Instructions + profile schema as data                                       |
| **Tools**                 | Discord UI rendering, schema validation, state retrieval                                      | Shared tool primitives, no onboarding-specific logic                        |
| **Hardcoded boundary**    | Only `name` in `CharacterDraft` TypeBox schema; scope enforcement; Discord component builders | Code; the narrowest possible surface                                        |

### State persistence

Onboarding session state lives in the **statement store**, not in-memory, by using the generic workflow-session pattern described in `docs/workflow-session-store.md`:

- The active onboarding session is stored in **`session` scope**; onboarding is a `workflowType`, not a special scope kind.
- Each user-facing onboarding event appends a `kind=governance` statement with `workflowType=onboarding`, `workflowEventType`, and the latest structured `state` snapshot.
- The onboarding state snapshot carries draft fields, step, retry counts, conversation history, and cached component specs.
- Character draft values are stored as structured fields on those session statements rather than hidden adapter memory.
- The agent is stateless — state reconstruction is deterministic from statements.
- This survives process restarts and enables interrupted-session resumption (F3).

Concrete message-by-message interaction script lives in `docs/discord-onboarding-interaction-script.md`.

## Goals

1. A new player can join from a Discord invite and start play without operator hand-holding.
2. Identity linking happens automatically as part of onboarding.
3. Character creation is narrator-guided in Discord using prompts from active rules/onboarding configuration.
4. User is placed into the correct room scope and can act immediately.
5. Every onboarding step is auditable via statements and governance logs.

## Non-goals (0003)

- Deep mechanical character builders for specific systems.
- Multi-guild identity federation.
- Cross-platform onboarding (Discord-only in this milestone).

## UX principles

- **Narrative-first:** onboarding reads like entering a story world, not filling an admin form.
- **Structured but short:** minimal required fields to begin play; advanced details can be added later.
- **Recoverable:** interrupted onboarding can resume without support intervention.
- **Visibility-minimizing by default:** onboarding interactions should avoid exposing one new user's setup to other new users.

## Actors

- **Operator/GM:** issues player invite tied to target campaign/room.
- **New Player:** follows invite, completes guided onboarding.
- **Narrator Agent:** conducts onboarding dialogue and character prompts.
- **Reconciler/Mapping layer:** projects user-role-room mapping into Discord.

## Primary flow (happy path)

### Step 0 - Operator issues reusable scoped invite

Operator initiates invite creation for a specific target onboarding flow. Invites are reusable within policy constraints (expiry, max uses, optional campaign cap), not one-time links.

Expected system effects:

- Create reusable onboarding ticket template with expiry, optional use limits, and target campaign metadata.
- Emit governance/mapping statements for invite issuance.

### Step 1 - User joins via invite URL

User joins Discord guild using generated invite.

Expected UX:

- User is auto-routed to an onboarding-visible channel/thread.
- Welcome message appears quickly with clear next action (button or slash entry point).

Expected system effects:

- Resolve invite token → target campaign/room scope.
- Create or resume onboarding session record.

### Step 2 - Auto-link identity

System links the Discord account (`userAccountId`, `userAccountType=discord`) to the cross-account `userId` as part of onboarding session.

Expected UX:

- Confirmation message: account linked and onboarding in progress.
- No requirement to run `/link` manually in normal case.

Expected system effects:

- Persist `userAccountId` ↔ `userId` mapping.
- Idempotent behavior on retries/rejoins.

### Step 3 — Agentic guided character creation (chat-native)

Onboarding agent (markdown-instructed, tool-equipped) runs a conversational creation sequence:

- The agent receives the profile schema from its instructions (which fields to collect, which are required).
- It decides what to ask next based on what's missing and the conversation so far.
- When a field is needed, it outputs `{ message, components }` — the thin adapter renders Discord buttons/modals/selects from the component specs.
- When the agent believes all required fields are complete, it calls `validate(draft)` — if validation fails, the agent receives the errors and adapts conversationally ("Ah, I forgot to ask your name — what is it?").
- The agent may collect fields in any order, skip optional fields, or re-ask after edits.

Expected UX:

- Conversational framing with explicit progress ("2 of 4 complete").
- Validation errors are friendly and actionable. No hardcoded field-by-field switch statements.
- The agent's persona and tone come from its markdown instructions, enabling in-character onboarding (tavern keeper, academy registrar, etc.) without code changes.

Expected system effects:

- Agent turns produce statements with structured `fields` recording draft updates.
- Each completed field is a statement in the onboarding session scope.
- Maintain resumable progress markers.

### Step 4 - Character summary and confirmation

Narrator posts a final summary card for confirmation.

Expected UX:

- User can confirm or edit specific fields.
- Confirmation message includes what happens next ("You are entering <room>").

Expected system effects:

- Finalize character entity.
- Emit provenance chain from prompts to confirmed character fields.

### Step 5 - Room placement and activation

System applies role grants and room mapping, then places the user account in a destination selected by onboarding routing policy.

Expected UX:

- User gains access to correct channel(s).
- If onboarding occurred in a shared intake surface, post-completion visibility is hidden/locked for this user.

Expected system effects:

- Role grants/mapping statements recorded.
- Routing decision recorded (`destination-room-id`, decision source, confidence/notes).
- `acting-as` initialization written (single-character default in v1; one active `characterId` per `userAccountId` in shared channels).

### Step 6 - First in-room handoff

Narrator posts first-turn handoff in target room acknowledging the new character and inviting first action.

Expected UX:

- Immediate transition from onboarding to play.
- No ambiguous "what do I do now?" state.

Expected system effects:

- First room-scoped narration statement references onboarding completion source.

## Discord API capabilities and onboarding pattern research

### What Discord supports for isolated onboarding

1. **Ephemeral interaction responses**
   - Bot replies to slash commands/buttons can be ephemeral (visible only to the interacting user).
   - Strong fit for guided prompts, confirmations, and validation while using a shared onboarding channel.
   - Limitation: user-authored normal messages in a shared channel are still visible to others.

2. **Per-user private channels (permission overwrites)**
   - Create a dedicated text channel per onboarding user and grant visibility only to that user + bot/operator roles.
   - Highest isolation, but can create channel sprawl if not archived/cleaned aggressively.

3. **Private threads**
   - Useful as a lighter-weight per-user isolation surface under an intake channel, subject to guild/thread permissions.
   - Good compromise between isolation and channel sprawl.

4. **DM/App-home style interaction**
   - Useful fallback when guild permissions are constrained, but less aligned with server-native onboarding flow.

### Recommended v1 pattern

- Use a **reusable invite** into the guild and a shared intake entry point.
- Run onboarding interaction via **ephemeral-first bot UI** (buttons/modals/slash).
- For multi-step freeform turns needing privacy, promote user to a **private thread or private channel** session.
- On completion, **hide/lock onboarding surface** for that user.

This delivers the "user sees their own bot interaction, not others'" behavior in practice while staying within Discord primitives.

### Channel routing policy (post-onboarding destination)

Routing target should be selectable by policy, with optional model assistance:

- **Common destination:** shared starter room (e.g., tavern/pub).
- **Solo destination:** private narrator room/thread for solo intro scenes.
- **Conditional destination:** based on onboarding signals (playstyle, backstory hook, operator rules).

Guardrails:

- Model may propose destination candidates, but final routing must be validated against an allowlist and permission policy.
- Routing write is authoritative only after governance/mapping records are committed.
- Failure to place user falls back to operator-visible retry queue with clear user messaging.

## Recovery and fallback flows

### F1 - Expired or invalid invite token

- UX: clear error + re-request instructions.
- System: no partial link/role grant applied.

### F2 - Already-linked returning user

- UX: skip linking step; resume/continue onboarding or route directly if completed.
- System: deduplicate mapping writes (idempotent).

### F3 - Interrupted onboarding

- UX: resume prompt on next interaction/join.
- System: onboarding session state machine resumes from last completed step.

### F4 - Auto-link failure

- UX: guided fallback to `/link` with explicit "recovery mode" messaging.
- System: fallback path logged distinctly for diagnostics.

## State model (implementation contract)

Onboarding session states:

1. `invited`
2. `joined`
3. `linked`
4. `character-drafting`
5. `character-confirmed`
6. `room-assigned`
7. `completed`
8. `failed` (recoverable with reason code)

Requirements:

- Transitions are append-only records in the statement store.
- Replaying the session-scope event stream for `workflowType=onboarding` reconstructs onboarding status deterministically.
- The agent is stateless; handlers are idempotent per transition key.
- Session state persists across process restarts.

## Data and statement requirements

Minimum auditable records:

- Invite issued (who, when, target room scope, expiry)
- User joined with invite context
- User↔Discord identity mapping established
- Character draft/confirm events
- Role and room grants applied
- Onboarding completion event with source references

Suggested statement kinds/scope usage:

- `governance` / `mapping` for invite, link, grants, projection
- `decision` for user confirmations
- `narration` for guided prompts/handoff
- `command-query` for explicit user command triggers where used

## Security and authorization constraints

- Invite tokens must be scoped and expiring.
- Onboarding channel visibility must be least-privilege.
- No cross-room data access during onboarding beyond target campaign context.
- Character attribution keeps human `authorId`; rendering identity may use character persona.

## UI surface plan (Discord v1)

- **Primary:** buttons + modals for onboarding progression.
- **Secondary:** slash command entry points for retry/resume.
- **Fallback:** `/link` only for recovery when auto-link fails.
- **Handoff rendering:** embed summary + plain-text parity.

## Acceptance criteria for 0003

1. New user can complete onboarding from invite to first in-room action without manual operator action.
2. Auto-link succeeds on happy path.
3. Character creation completes in-chat and produces persistent character + mapping records.
4. Interrupted sessions resume correctly.
5. Fallback `/link` path works but is not required in nominal flow.

## Test coverage linkage

This spec is validated by run-sheet scenarios:

- D-001 Invite-driven onboarding happy path
- D-002 Auto-link during onboarding
- D-003 Manual `/link` fallback
- Plus downstream loop checks in `docs/milestones/0003-discord-validation-run-sheet.md`.
