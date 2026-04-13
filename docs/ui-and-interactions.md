# Interactive UI & User Input Surfaces

## Purpose

Define how users drive decisions, submit actions, view state, and answer governance inquiries through rich platform UI (buttons, select menus, modals, embeds, polls, webhooks), and how those interactions map onto the statement store. Covers **Discord v1** as the concrete target while keeping the underlying concepts portable to other platforms. Also notes, and explicitly defers, image and video generation capabilities.

## UI goals

1. **Narrative-first.** UI elements attach to narrative moments; they never stand alone as an app-like interface. A button appears on a narration message because it represents a choice *in that moment*.
2. **Structured-decision clarity.** When the agent presents a branch, options, or a required decision, the UI makes the structure legible at a glance — player doesn't need to parse prose to find their options.
3. **Low-friction for repeated actions.** Rolls, skill checks, attacks, inventory use happen often; one-click beats retyping. Repeated actions surface as always-available buttons on relevant state embeds.
4. **Personal vs. shared presentation.** Private state (a character's own stats, private knowledge, secret rolls) uses ephemeral surfaces; shared state (scene, party roster, canon lore) uses channel-visible surfaces.
5. **NPC embodiment.** NPCs speak with distinct identities (webhook impersonation) rather than as "bot says: 'the blacksmith speaks'". Strengthens immersion and makes dialogue attribution trivial.
6. **Authoring workflows are fast.** GM / cabal / pantheon decisions on open questions should be one-click where the decision is binary, with optional modal entry when it's authored text.
7. **Text parity fallback.** Every UI affordance has a text-command equivalent. Chat-only players, screen readers, and constrained clients are first-class — UI is an optional amplifier, not a requirement.
8. **Every interaction becomes a statement.** No UI-only side effects. Clicks, selections, submissions, reactions — all produce statements in the appropriate scope with the same provenance machinery as typed messages.

## Discord UI capabilities (v1 inventory)

Verify current API limits before implementation; these are the capabilities to plan around.

- **Slash commands.** Structured entry points with typed parameters and autocomplete. Good for `/roll`, `/character`, `/propose`, `/link`. Subcommands and groups reduce namespace pressure.
- **Buttons.** Up to 5 per row, up to 5 rows per message. Styles (primary/secondary/success/danger/link) carry semantic weight — use `danger` for retract/overwrite, `success` for canonize/approve, `primary` for narrative choice. Link buttons open external URLs (map viewer, character sheet page).
- **Select menus.** String, user, role, channel, mentionable. Multi-select with min/max. Use for picking targets (which NPC to address, which companion to aid), long option lists.
- **Modals.** Short text input and paragraph input, up to a small number of components. The right surface for freeform player narration, GM steering notes, canonization override text — anything that would overflow a chat message's structured framing.
- **Embeds.** Rich structured display (title, description, fields, thumbnail, footer). Character sheets, quest descriptions, lore entries, scene frames. Fields are compact key-value; thumbnails are the hook for later portrait generation.
- **Ephemeral responses.** Visible only to the interacting user. Critical for private state (own stats), secret knowledge revelations (character-scoped reads), and GM-only previews of intercepted flows.
- **Follow-up and deferred responses.** Acknowledge within the interaction window, deliver the full response later. Essential when generation takes more than a couple of seconds.
- **Webhooks.** Send a message that appears to come from a different named identity with a different avatar. The mechanism for NPC embodiment and for distinct "voices" (the omniscient narrator vs. a specific NPC vs. mechanical-rules output).
- **Threads.** Sub-conversations within a room. Natural for combat rounds, side-scenes, parallel conversations within a party (player A negotiates while player B investigates).
- **Forum channels.** Thread-per-topic structure. Useful for campaign archives, per-NPC discussion threads, lore wikis.
- **Reactions.** Lightweight signals. Record as statements with `kind=reaction`. Useful for quick polls ("does the party agree?"), GM upvotes on canonization proposals.
- **Polls.** Native Discord poll feature (verify current availability and limits). Appropriate for time-boxed group decisions where a result timestamp matters.

## Input surfaces (the concept)

Extends the notify capability band in `platform-adapter.md`. An **input surface** is a platform UI element that, when interacted with, produces a statement in the originating room's scope attributed to the interacting user.

Four properties define an input surface:

- **Trigger.** What action on the platform spawns the input (e.g. "button click on message M", "modal submit for slash command X").
- **Schema.** The structure of the produced statement — fields the interaction captures, plus any agent-side context baked into the custom id.
- **Authorization.** Who can interact. May mirror the originating room's role configuration (any player in this room) or narrow further (only the active character, only a role holder).
- **Lifetime.** When the surface stops being interactive — after first use, after N uses, after a time window, when a narrative moment passes. Expired surfaces render as disabled controls with their outcome stated.

### Custom-id schema

Discord's custom ids are small strings the backend receives on interaction. We treat them as **opaque handles** that map to server-side interaction records, not as serialized state. The server maintains `(custom_id → interaction_spec)` entries; on click, the handler looks up the spec and produces the right statement. This keeps the handler pure and avoids leaking domain state into a string field with size limits.

### Authorization at click time

When an interaction arrives, the platform backend:
1. Resolves the interacting user to a system user id via the mapping layer.
2. Looks up the interaction spec by custom id.
3. Checks whether the user holds the roles the spec requires in the originating room.
4. If yes, produces the statement; if no, responds with an ephemeral refusal.

Authorization happens in our store, not at the platform layer — a user may be able to see a button in a channel they're mapped into but not be authorized to click it (imagine a spectator role with read but not act capabilities).

## Patterns for RPG flows

### Narrative decision buttons

Agent narration that presents branching choices renders with buttons labeled per option. Clicking produces a `decision` statement whose `chose` field is the option id; the next narration turn reads that statement as part of its scope slice. Text-parity: the narration also lists options prefixed with numbers; typing the number works.

### Private state (ephemeral character sheet)

`/character` slash → ephemeral embed with stat fields and action buttons (roll skill, cast spell, use item). The sheet reads from the character scope; only the requesting user sees it. Buttons on the sheet spawn rolls whose result becomes a channel statement if the action is public, or a further ephemeral statement if it's covert.

### Rolls as first-class statements

Any roll (explicit `/roll`, button-driven, mechanical-rules prompted) produces a `mechanical` statement recording the die, modifiers, result, and what it resolved. These are retrievable by the consistency auditor and by narrative-reference ("remember when you rolled a 20 on persuasion?").

### NPC dialogue via webhooks

When the agent speaks *as an NPC*, it uses a webhook with the NPC's name and portrait. The underlying statement is still authored by the agent and scope-tagged, but the platform rendering carries identity. For canon NPCs, the webhook identity is pulled from the entity store; for one-off inventions, a lightweight default identity is used until the NPC is canonized.

### Authoring-role decision UI

Open-question records routed to an authoring role render as a structured message in that room:
- Embed with the question subject, the candidate detail, and the blocking context.
- Buttons: `Accept candidate`, `Reject`, `Edit in modal`, `Defer`.
- For in-fiction authoring rooms (wizard cabal), the embed is styled per the in-tone rendering rules from `runtime-and-processing.md` — portent phrasing on the embed title and description, mechanical fields in a collapsed section.

A one-click decision by a cabal member produces a structured decision statement, which the open-question resolver worker applies as canon / party-scope rewrite / retraction.

### In-combat initiative and turn-tracking

Combat surfaces a persistent embed showing initiative order, current turn, HP bars. The embed updates in place as statements arrive (attack results, HP changes). Buttons on the embed offer the current actor their valid actions (move, attack, cast, dodge). Threads within the room can scope a single combat without fragmenting the party room.

### Polls for group decisions

Time-boxed group decisions (which path to take, whom to trust) use Discord's poll feature when available. The poll result is captured as a statement; the agent reads the result and narrates the consequence.

### Autocomplete as world-access

Slash-command parameters with autocomplete read from the entity store scoped to the invoking user's reach (world + party + character). This lets players reference known NPCs, locations, and items by name without memorizing ids — and ensures they only see names they would know.

## Accessibility & text parity

- **Every button has a text command.** If the UI breaks or a user prefers typing, `/act <option>` or a numbered reply works.
- **Embeds degrade gracefully.** Character sheets render as plain messages on request.
- **Colors are semantic, not carrying meaning alone.** Button styles always include labels; embed colors supplement structure rather than replacing it.
- **Ephemerals should not be required for blind play.** Personal state available via text command, not only via UI.
- **No hostile timeouts.** UI lifetimes are long enough to accommodate slow players; expired surfaces clearly say so rather than silently dropping.

## Relationship to other docs

- `platform-adapter.md` — input surfaces extend the notification capability band. The reconciler and bot-permission model cover the platform plumbing for creating and updating these surfaces.
- `rooms-and-roles.md` — interaction authorization uses the same role capability machinery; a role may carry fine-grained action capabilities (`act:narrative-choice`, `act:mechanical-roll`) distinct from general `platform:notify`.
- `runtime-and-processing.md` — every interaction produces a statement; interaction-triggered workers (rolls, decisions, open-question resolution) use the same worker/trigger pipeline.
- `memory-model.md` — interaction records are statements with `kind` tags (`decision`, `mechanical`, `reaction`, `authoring-decision`), fully subject to scope, provenance, and consistency auditing.

## Open questions

- Where does combat rule resolution live — agent-authored per-turn, or a deterministic rules engine with the agent as narrator over its results? (Second approach is safer for consistency but couples us to a specific system; first is flexible but eval-heavier.)
- How to handle webhook identity proliferation — one webhook per NPC is clean but Discord caps webhooks per channel. May need identity pooling.
- Should player-authored free narration (modal submit) be scope-writable like agent narration, or always flagged for agent review before canonization?
- How do we represent complex state (character sheet pages, spellbook, inventory) without blowing through message / embed size limits — pagination, linked external view, or a dedicated app/web surface?
- Reaction-as-vote vs. Poll feature — when does one beat the other? (Leaning: reaction for lightweight/continuous signal, poll for time-boxed decisions.)

## Deferred: media generation (post-v1)

Out of v1 scope. Captured here to keep architectural affordances available when we do pick it up.

### Capabilities to plan toward

- **Cartography.** Region and local maps generated from canonical geography; updated as party discoveries unfold; per-party fog-of-war rendering.
- **Character portraits.** Player characters (with consent flow), canonical NPCs (once promoted to canon), transient NPCs on demand.
- **Setting illustration.** Scenes, landmarks, important rooms; rendered when a location-introduction statement crosses a threshold of narrative significance.
- **Token art.** Combat tokens for VTT-like experiences.
- **Item / artifact illustration.** For signature items and rewards.
- **Video (further deferred).** Brief scene animations, boss reveals, environmental atmosphere loops.

### Architectural affordances to preserve

- **Media-gen worker.** Fits cleanly into the worker taxonomy in `runtime-and-processing.md`. Triggers on `kind=location-introduction` or `kind=canon-promotion` for eligible entities; emits a `media` statement with a reference to the generated asset.
- **Assets referenced, not embedded.** Statements hold asset ids + metadata; the asset store (blob storage) is a separate layer. This keeps the statement store lean.
- **Canon dedup.** A canonized entity (NPC, location, item) has at most one canonical asset per modality; party views may override with their own observations but the world-canon asset is the default.
- **Provider-agnostic.** The media-gen capability is an interface; backends (diffusion-based image model of the day, hosted service APIs, local GPU inference) are swappable. Decision deferred.
- **Prompt construction from canon.** Generation prompts are composed from canonical descriptors + style guide, not free-typed by the agent at generation time — this is how visual consistency is maintained the way narrative consistency is maintained via the statement store.
- **Safety.** Content moderation layer on generated media; opt-in consent for player likenesses; takedown path for any asset (tombstoning in the asset store, mirroring statement tombstones).
- **Cost and latency.** Media generation is expensive; generation happens asynchronously on trigger, not live during narration. Results attach to their source statement when ready, updating the rendering in place.
- **Style guide as canon.** The world's visual style is itself a canonical statement (or set of statements) in a `style` scope, queried by the media-gen worker the same way narrative canon is queried for text.

### Explicit non-goals for v1

- No live image or video during play.
- No player-on-demand image generation surfaced in UI.
- No video at all.
- No style transfer on player-uploaded media.

These land in a later release with their own design doc when we're ready.
