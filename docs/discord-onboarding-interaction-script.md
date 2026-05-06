# Discord Onboarding Interaction Script (Milestone 0003)

## Purpose

Define the concrete interaction script for invite-driven onboarding using:

- ephemeral interactions by default, and
- escalation to a private thread when freeform/private multi-turn input is needed.

This script operationalizes `docs/discord-onboarding-and-character-creation.md`.
Type-level contract draft lives in `docs/discord-onboarding-schema-draft.md`.

## Surfaces

- **Shared intake channel** (guild-visible, minimal chatter)
- **Ephemeral interaction responses** (user-only)
- **Private onboarding thread** (user + bot + operator roles only), created on demand
- **Target destination room** (starter pub or solo narrator room)

## Entry points

1. User joins via reusable scoped invite.
2. Bot posts/updates intake message with button: **Start onboarding**.
3. User clicks button or runs fallback slash command: `/start-onboarding`.

---

## Script: happy path

### S0 — Intake prompt (shared channel message)

**Visible message:**

- Title: `Welcome, traveler.`
- Body: `Click below to begin character setup.`
- Components:
  - `Start onboarding` (primary)
  - `Resume onboarding` (secondary)

**Behavior:**

- No character details shown in shared channel.
- All follow-up is ephemeral unless escalation is triggered.

### S1 — Ephemeral greeting + link confirmation

**Ephemeral response after Start:**

- `I’ll guide you through a short setup. First, confirming your account link...`
- Then either:
  - success: `Linked. Let’s build your character.`
  - recoverable fail: `I couldn't complete auto-link. Use /link to recover, then press Resume onboarding.`

**Components (on success):**

- `Continue` (primary)
- `Cancel` (danger)

### S2 — Character field 1: Name (modal)

**Ephemeral prompt:**

- `Choose your character name.`
- Button: `Set name`

**Modal:**

- Field: `Character name` (short text, required, 2–40 chars)

**Success response (ephemeral):**

- `Name saved: **<name>**`
- `Progress: 1/4`
- Buttons: `Next` / `Edit name`

### S3 — Character field 2: Pronouns/display preference (modal)

**Ephemeral prompt:**

- `Optional: share pronouns or display preference.`
- Buttons: `Set preference` / `Skip`

**Modal (optional):**

- Field: `Pronouns / display preference` (short text, optional)

**Success response:**

- `Saved.` or `Skipped.`
- `Progress: 2/4`

### S4 — Character field 3: Profile field (agent/rules-defined)

**Ephemeral prompt:**

- `Pick your next profile field value (from rules/onboarding config).`

**Select options (v1 baseline):**

- `Frontline` (direct, bold)
- `Scout` (stealth, mobility)
- `Scholar` (knowledge, analysis)
- `Face` (social influence)
- `Wildcard` (unpredictable)

**Success response:**

- `Profile value saved: **<choice>**`
- `Progress: 3/4`

### S5 — Character field 4: Backstory hook (modal)

**Ephemeral prompt:**

- `Give one short hook: a goal, debt, promise, or mystery.`
- Button: `Add hook`

**Modal:**

- Field: `Backstory hook` (paragraph, required, 10–280 chars)

**Escalation rule:**

- If user requests iterative help (`Help me write this`) or exceeds simple validation retries, create private thread and continue there.

**Success response:**

- `Hook saved.`
- `Progress: 4/4`
- Button: `Review character`

### S6 — Summary + confirmation

**Ephemeral summary card:**

- Name
- Pronouns/display (or `not specified`)
- Archetype
- Hook

**Components:**

- `Confirm character` (success)
- `Edit field` (secondary select: name/pronouns/profile/hook)
- `Cancel onboarding` (danger)

### S7 — Routing decision + placement

**System action:**

- Compute destination candidates (policy + optional model proposal).
- Validate against allowlist and permission constraints.
- Apply role grants + room mapping.

**Ephemeral response:**

- `You’re ready. Sending you to **<destination>**...`

**On success:**

- Optionally remove user access to onboarding thread/channel view.
- Write onboarding completion + routing decision records.

### S8 — First in-room handoff

**Destination room message (visible in destination):**

- `The door opens. <Character Name> steps in...`
- `When you're ready, tell me your first action.`

---

## Private thread escalation script

## Trigger conditions

Escalate from ephemeral-only flow when any is true:

1. User requests private drafting help.
2. User needs multi-turn collaborative writing for hook.
3. Validation fails repeatedly (more than 2 retries on the same field).
4. Operator policy forces private onboarding for this invite/campaign.

## Escalation message (ephemeral)

`I’ll open a private onboarding thread so we can work this out together.`

Button: `Open private thread`

## Thread creation behavior

- Name: `onboarding-<username>-<shortid>`
- Permissions: user + bot + operator role only
- First bot post: `Private onboarding started. Your details here are only visible to you and moderators.`

## In-thread continuation

Continue at the current step (typically S5 or summary edits), then return to S7/S8.

## Thread close behavior

On completion:

- Post `Onboarding complete. This thread is now archived.`
- Archive + lock thread (or hide by role policy).

---

## Failure/recovery script

### R1 — Auto-link failure

Ephemeral:

- `I couldn't auto-link your account.`
- `Run /link, then press Resume onboarding.`
- Button: `Resume onboarding`

### R2 — Expired invite

Shared/intake visible:

- `This invite is no longer valid.`

Ephemeral follow-up:

- `Ask a GM/operator for a fresh invite.`

### R3 — Interrupted session

On `Resume onboarding`:

- `Welcome back. Resuming at: <step-name>.`
- Continue from last completed state.

### R4 — Routing failure

Ephemeral:

- `Your character is ready, but I couldn't place you yet.`
- `I've notified an operator and will retry shortly.`

Operator-visible log/alert:

- include `userId`, `userAccountId`, invite id, candidate destinations, failure reason.

---

## Component + interaction contract (strict v1)

Use opaque custom IDs mapped server-side. The backend resolves each ID to an interaction spec and validates user/session ownership before executing.

### Action key enum

- `onboard.start`
- `onboard.resume`
- `onboard.continue`
- `onboard.cancel`
- `onboard.name.open`
- `onboard.name.submit`
- `onboard.profile.select`
- `onboard.review.open`
- `onboard.confirm`
- `onboard.edit.name`
- `onboard.edit.profile`
- `onboard.private-thread.open`

### Profile field modals (agent-defined)

Profile fields (pronouns, hook, and any others the agent decides to collect) use the field name as the modal's customId. For example, a pronouns modal uses `customId: "pronouns"` and field `customId: "pronouns"`. See `content/agents/onboarding-narrator.md` for the modal spec pattern.

### Field key enum

- `name` (hardcoded)
- `profile` (agent-defined keys; pronouns, hook, archetype all live here)

### Example profile field values (demo only)

- `frontline`
- `scout`
- `scholar`
- `face`
- `wildcard`

### Validation constraints

- `name`: string, trimmed, length `2..40` (hardcoded)
- `profile`: non-empty Record of string-to-string entries; agent-defined keys carry their own constraints from the markdown instructions

### Escalation threshold constant

- `ONBOARDING_VALIDATION_RETRY_LIMIT = 2`
- On third failure for same field, offer/trigger private-thread escalation.

### Component spec by step

- **S0 intake**
  - Buttons:
    - `Start onboarding` → `onboard.start` (Primary)
    - `Resume onboarding` → `onboard.resume` (Secondary)

- **S1 link confirmation**
  - Buttons:
    - `Continue` → `onboard.continue` (Primary)
    - `Cancel` → `onboard.cancel` (Danger)

- **S2 name**
  - Button: `Set name` → `onboard.name.open` (Primary)
  - Modal submit action: `onboard.name.submit`

- **S3 pronouns/display preference** (agent-defined)
  - Agent may present a "Set pronouns" modal button (customId e.g. `"pronouns.open"`) and a "Skip" button
  - Modal submit uses the field name as customId (e.g. `customId: "pronouns"`)

- **S4 profile field** (agent/rules-defined)
  - Select custom id: `onboard.profile.select`
  - Allowed values: profile field options from onboarding config only

- **S5 backstory hook** (agent-defined)
  - Agent may present an "Add hook" modal button (customId e.g. `"hook.open"`)
  - Modal submit uses the field name as customId (e.g. `customId: "hook"`)
  - Optional button when needed: `Open private thread` → `onboard.private-thread.open` (Secondary)

- **S6 review/confirm**
  - Button: `Confirm character` → `onboard.confirm` (Success)
  - Select/menu or buttons for edit:
    - `onboard.edit.name`
    - `onboard.edit.profile`
  - Button: `Cancel onboarding` → `onboard.cancel` (Danger)

### Server-side interaction record (minimum)

- `interactionId`
- `actionKey` (from enum)
- `userId` (cross-account identity)
- `userAccountId` (platform account id)
- `userAccountType` (`discord` in v1)
- `sessionId`
- `step`
- `expiresAt`
- `authorizationPolicy`
- `createdAt`

### Routing decision payload (persisted)

- `sessionId`
- `userId` (cross-account identity)
- `userAccountId`
- `userAccountType` (`discord` in v1)
- `characterId`
- `candidateDestinations: string[]`
- `selectedDestination: string`
- `decisionSource: "rule" | "model-assisted" | "operator"`
- `appliedRuleIds: string[]`
- `modelSuggestion?: { destination: string; confidence: number; rationale: string }`
- `allowlistValidationPassed: boolean`
- `permissionValidationPassed: boolean`
- `createdAt`

---

## Routing policy table (rule-first, model-assisted second)

| Priority | Rule ID                  | Condition                                                                          | Action                                                           | Decision source  |
| -------- | ------------------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------- |
| 1        | `route-operator-lock`    | Invite/session has explicit destination override                                   | Route to override destination                                    | `rule`           |
| 2        | `route-private-required` | Campaign/invite policy requires private intro                                      | Route to solo narrator room                                      | `rule`           |
| 3        | `route-private-signal`   | Onboarding signals indicate solo intro needed (e.g. unresolved private setup flag) | Route to solo narrator room                                      | `rule`           |
| 4        | `route-model-suggest`    | No higher-priority rule matched                                                    | Ask model for destination suggestion from allowlisted candidates | `model-assisted` |
| 5        | `route-default-starter`  | Model unavailable/rejected/invalid suggestion                                      | Route to shared starter room                                     | `rule`           |

### Routing guardrails (required)

1. Candidate destinations must come from campaign allowlist.
2. Model suggestions outside allowlist are rejected.
3. Final destination must pass permission projection checks before user-facing success message.
4. If placement fails after selection, emit routing-failure event and surface operator alert.

---

## Copy style guide (v1)

- Keep prompts short (1–2 lines).
- Always show current progress (`x/4`).
- Never expose one user’s character data in shared channels.
- Prefer action verbs on buttons (`Set name`, `Review character`, `Confirm`).
- Failures should always include a next action.

## Acceptance checks (script-level)

1. A user can finish without typing in shared channels.
2. Ephemeral-only path works end-to-end for straightforward users.
3. Thread escalation works and preserves step context.
4. Completion hides/locks onboarding visibility per policy.
5. Routing to shared or solo destination is logged and auditable.
