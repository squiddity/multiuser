# Consent & Safety

## Purpose

Define the minimum viable consent and safety primitives for v1 and name the roadmap enhancements that follow. Shared fiction platforms — especially ones with LLM-generated narrative that can drift unexpectedly — require explicit safety affordances. The v1 goal is narrow: be no less safe than a decent tabletop group, with primitives built in from day one rather than retrofitted.

## Principle

- **Safety is infrastructure, not polish.** It ships in v1 even if minimally. Retrofitting safety after users experience harm is a failure mode we want to avoid.
- **Narrow for v1, extensible later.** Two primitives cover most of the ground; more sophisticated models (per-scene consent, automated moderation, trauma-informed content scoring) are roadmap.
- **Every safety action is a statement.** Invocations, declarations, pivots, and overrides all produce records with the same provenance machinery as narration. Nothing happens invisibly; nothing is untraceable.

## V1 primitives

### 1. Campaign content declaration (bootstrap-time)

A structured declaration made during the campaign bootstrap flow (see `world-authoring.md`), extending stage 3 or 4 of that flow.

Fields:
- **Lines** — content that will not appear in play. Hard exclusions.
- **Veils** — content that may be referenced but not depicted on camera (fade to summary).
- **Themes present** — content explicitly welcomed in the campaign (tonal signal, not a quota).
- **Tone notes** — prose description of the desired emotional register.

Properties:
- Stored as statements in the `style` scope (alongside style / tone), read by every agent turn.
- Editable at any time by the authoring role that owns the campaign; edits supersede with history preserved.
- Visible to all participants in the campaign — no hidden safety rules.
- The narrator and all agent workers treat lines as **refusal conditions** (if generating would cross a line, the agent refuses and emits a meta statement) and veils as **abstraction conditions** (generate a summary, not a scene).

Campaigns can inherit content declarations from shared templates (a platform-level baseline) and override per-campaign — analogous to style inheritance in `world-authoring.md`.

### 2. In-session pause / fade primitive

Any participant may invoke at any time. Minimum command set:

- `/pause` — narration halts immediately. A statement records the invocation (attributed, timestamped, no reason required). The agent will not narrate further in this room until an unpause is issued.
- `/fade` — the current scene cuts to summary. The agent produces a brief non-graphic summary of resolution and moves to the next beat. The invocation is recorded; the underlying unprocessed content is tombstoned rather than canonized.
- `/unpause` — resumes narration. Available to any participant who can `/pause`.

Properties:
- Invocation is authorization-free within a room's participant set — the lowest-privilege player can pause or fade. This is intentional; safety tools must not require permission.
- A reason is optional but may be supplied privately (ephemeral modal text visible only to participants with an appropriate role). Absence of a reason is always respected.
- The agent does not debate, interrogate, or override these invocations. It acknowledges and complies.
- Pause and fade produce `safety-invocation` statements carrying the invoker's identity, the command, and optional reason. These are visible to the authoring role(s) for retrospective review; they are not routed to the room's main narration stream beyond a brief acknowledgment message.

### 3. Preference records (lightweight)

Per-user preferences expressed once and honored across sessions. Not a full consent matrix — a minimum:

- **Content sensitivities** — user declares specific content they wish veiled or excluded from their experience, narrower than the campaign's declaration.
- **Notification preferences** — whether @-mentions are acceptable during off-hours; whether @everyone pushes are honored.

Preferences layer on top of campaign declarations — a user's veil adds to the campaign's veil list; a user's line adds to the campaign's line list for that user's presence.

When a user's line would be crossed but the campaign's would not, the narrator still refuses the on-camera depiction while that user is present in the room. If the user is absent, the narrator may proceed but emits a statement noting the user-specific accommodation for resumption.

## Role & capability integration

Safety primitives interact with the capability model from `rooms-and-roles.md` cleanly:

- **Any participant** holds `safety:invoke` in their room by default — pause, fade, unpause. Not removable as a capability in v1; a future role could conceivably moderate this, but the default is that safety invocation is unconditional.
- **Authoring roles** (GM, cabal, pantheon) hold `safety:review` — read access to `safety-invocation` statements and the ability to author follow-up statements addressing them (e.g. a revised content declaration, a scene retraction, an apology narration).
- **Platform admin** holds `safety:override` — an emergency capability to halt all narration across a deployment. Intended for unusual cases; its invocation is logged at the deployment level.

## Policy

- The agent **always** complies with safety invocations. No adjudication, no "are you sure?", no request for justification.
- The agent **never** punishes characters for a player invoking safety tools (no retaliatory mechanical consequences, no narrative embarrassment).
- The agent **does not** surface safety invocations as narrative content. A fade is a fade; the system acknowledges it cleanly and moves on.
- Content declarations are **absolute for lines** and **suggestive for veils**. A veiled subject may be referenced abstractly; a lined subject is not referenced at all.
- Authoring roles reviewing safety invocations do so in their own room, not in the room where play happens.

## Roadmap (post-v1)

- **Per-scene consent prompts** — agent asks before proceeding into sensitive content even if not explicitly lined. Revisit when campaign content declarations prove insufficient for emergent material.
- **Automated content classifier** — pre-generation and post-generation classifiers flag likely-problematic output for refusal or review. Revisit when scale makes human review thin.
- **Session-zero structured workflow** — guided content declaration flow including trauma-informed prompts. Revisit when new campaign creators report difficulty authoring meaningful content declarations.
- **Cumulative content warning** — briefings and digests annotated with content summaries so absent players can decide whether to engage. Revisit when async play formalization lands.
- **Third-party escalation** — off-platform contact channels for serious safety incidents. Revisit when deployments operate at a scale where internal review is insufficient.
- **X-card / lines-and-veils-during-play** — structured mid-session adjustment tools beyond pause/fade. Revisit when v1 primitives prove too coarse.

## Relationship to other docs

- `world-authoring.md` — content declaration extends the bootstrap flow as an additional stage output.
- `rooms-and-roles.md` — safety capabilities are a small additional band in the capability taxonomy.
- `runtime-and-processing.md` — safety invocations are first-class statements handled by a dedicated worker (pause halts the narrator's queue for that room; fade instructs the next narration turn to summarize).
- `ui-and-interactions.md` — `/pause`, `/fade`, `/unpause` are slash commands; optional-reason submission uses a modal with ephemeral visibility.
- `memory-model.md` — `safety-invocation` is a statement kind; content declarations live in `style` scope.

## Open questions

- Should `/pause` by any player halt just their room, or propagate to related rooms (paired combat thread, active sub-scene)? Leaning: just the room, with an optional escalation.
- How is a user's private-line list stored without leaking the specifics to the rest of the group? Keep it character-attached in a user-private scope; only the aggregate "a line is active" is visible to others.
- If an authoring role overrides a safety invocation (should they even have that capability?), how is that event surfaced to the invoker? Leaning: authoring roles **cannot** override safety invocations in v1; they can only discuss in their own room and revise content declarations for future play.
- How do content declarations interact with source fiction — if the Oz corpus contains content outside the declared lines, does that content become inaccessible, or is it retained but gated? Leaning: retained in the store with provenance, but declared off-limits for narration.
- Do we surface a per-user "content you may encounter in this campaign" pre-join disclosure, and how is consent to join recorded?
