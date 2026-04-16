# MUD Precedents & Adoptions

## Purpose

Traditional and modern text multi-user dungeons are the direct ancestor of what we're building. Forty-plus years of conventions encode lessons about persistent shared fiction, user interaction, and safety that we should pull selectively. This document captures the relevant lineages, specifies which conventions enter v1, names the ones that go to a deferred roadmap (with reevaluation cues), and states explicit non-goals. Complements our existing policy/role model rather than replacing any of it.

## Framing

We draw on two traditions simultaneously, not one:

- **MUDs** for persistent text worlds, verb-based interaction, spatial grammar, and RP discipline.
- **Roll20 / live-party tabletop** for ergonomics, shared main channel, admin participation alongside players, and ephemeral private steering by GMs.

Where they conflict — MUDs push hard channel separation of IC and OOC; tabletop tolerates mixed conversation at a single table — we side with the tabletop model. See the **IC/OOC** section below.

## Brief taxonomy of MUD lineages

- **Diku / LP family** (DikuMUD, LPMud, Merc/ROM, Circle, Aardwolf, Discworld MUD) — gameplay-forward, hard-coded worlds, real-time tick combat, progression. Origin of the verb-noun command grammar most text games still use.
- **MUSH / MOO / MUCK family** (LambdaMOO, TinyMUSH, PennMUSH) — social / building-focused, user-programmable objects via in-world code (LPC, MUSHcode). Origin of player-authored softcoded content with capability-gated building.
- **RPI family** (Armageddon, Harshlands, Sindome, Atonement) — enforced roleplay, permadeath, staff-run arc plots. Origin of strict recognition systems, language barriers, echoes, and structured plot arcs.
- **Modern Iron Realms and descendants** (Achaea, Aetolia, Lusternia) — GMCP out-of-band data channels, HTML5 clients with health orbs and maps, novice onboarding flows. Most direct precedent for a client-rich Discord experience.

## V1 adoptions

### Verb-based command layer

A parallel interface to natural language. Deterministic commands dispatched without an LLM round-trip.

- `look [target]`, `say <text>`, `emote <action>` / `pose <action>`, `tell <user> <text>`, `think <text>`, `who`, `inventory`, `move <direction>`, and a small initial set.
- Each command maps to a typed statement in the room's scope with its `kind` set appropriately (`narration-observation`, `dialogue`, `pose`, `private-message`, `inner-monologue`, `meta-query`, …).
- Implemented as slash commands on Discord (per `ui-and-interactions.md`); autocomplete where relevant. Text-parity with natural language is maintained — typing "I say hi" is equivalent to `/say hi`.
- Payoff: massive reduction in LLM token cost for common actions, lower latency, and predictable behavior for repeated uses.

### Poses / emotes as a first-class kind

Distinct from dialogue. `kind=pose` statements describe action; `kind=dialogue` describes speech. The narrator agent and the consistency auditor treat them differently — dialogue is weighed as character statement, poses as observable fact. Emotes / poses render in channel with the actor's identity prepended (`Alice waves.`).

### Recognition system

NPCs and characters render with identifiers that depend on the **viewer's** recognition state, not the subject's name.

- A per-character `recognition` record tracks who has been introduced to whom.
- Retrieval and prompt assembly for a given character apply a **display filter**: for each entity mentioned, the character's recognition state determines whether the entity renders as its name, a descriptor ("a tall figure in green"), or a mixed form.
- Recognition is updated by explicit introduction in play (names offered, identities revealed) and may be revoked by narrative events (disguises, polymorph).
- This generalizes: recognition is one instance of a **per-viewer rendering filter**; language/knowledge filters are the next natural extension (see roadmap).
- Scope-level reads are unchanged — the character still has access to the same statements — only the rendering of entity references is filtered.

### IC/OOC treatment — policy, not walls

**We do not enforce IC/OOC channel separation.** A statement carries a `kind` hint (`ic` / `ooc` in addition to its structural kind like `pose`, `dialogue`, etc.); the hint informs rendering and retrieval weighting but does not constrain which rooms or users may produce which. Justifications:

- The wizard cabal deliberates "in wizard tongue" — IC-kind statements whose _mechanical steering payload_ rides as structured fields on the same record. The agent renders surface prose in-tongue while the canonical record is structured. This is the in-tone rendering from `runtime-and-processing.md`, applied bidirectionally (cabal-authored → agent extracts structure; agent-authored inquiry → cabal sees portents).
- Admin / GM participation in the main party channel with ephemeral private steering is a Roll20-style pattern the platform adapter already supports (see `ui-and-interactions.md` on ephemerals).
- LLM-generated fiction makes IC/OOC a creative frontier worth experimenting in; channel walls foreclose experimentation.
- Role/capability policy (per `rooms-and-roles.md`) already handles everything channel walls would: who can say what where is governed by capabilities, not by kind.

### Minimum consent/safety primitives

Covered in full in `consent-and-safety.md`. Two primitives make v1: campaign content declaration at bootstrap, and an in-session pause/fade primitive any player can invoke.

## Roadmap (deferred, reevaluate after v1)

Each item named with a brief pointer for when to revisit.

- **Presence model** — who's active/idle/away per room. Revisit when async vs. live play pacing matters for scheduled workers (e.g. when briefings should fire).
- **Spatial sub-structure within rooms** — sub-locations connected by exits inside a party room; narrator handles transitions. Revisit when a single scene becomes too large to hold in one frame, or when exploration-heavy campaigns arrive.
- **Autonomous NPC scheduled routines** — NPCs live their lives when the party isn't watching. Revisit when worlds feel static or when players request returning-to-a-changed-place experiences.
- **Asynchronous play-by-post formalization** — first-class support for multi-day cadence with explicit turn windows. Revisit when groups run longer campaigns across time zones.
- **Language and knowledge filters** — per-listener content filtering (Elvish speakers hear; others see gibberish). Natural extension of recognition. Revisit when campaigns feature meaningful language barriers.
- **Novice onboarding flow** — guided tutorial for new players entering an existing campaign. Revisit when inviting new players mid-campaign becomes a common pattern.
- **Player building / softcoded content** — capability-gated authoring tools for players to contribute to the world. Revisit when communities want persistent player contributions beyond play narration.
- **Echo / soul / voice disguise systems** — advanced identity management in RP. Revisit when recognition alone proves insufficient.
- **Staff-run arc plots as a structured system** — formalized long-running plot arcs with per-phase steering templates. Revisit when GMs report difficulty managing multi-session plot continuity.

## Non-goals (explicit)

- **Thousands of hard-coded rooms.** Our agent + scope-filtered retrieval replaces the static world file. We do not maintain a persistent spatial hex map by default.
- **Real-time tick combat.** We are turn-based per `rules-resolution.md`. No action-per-second model.
- **Strict IC/OOC channel separation.** See the IC/OOC section above.
- **One persistent connection per player.** Discord is message-based; session state lives in the statement store, not in a connected client.
- **Telnet-era UX assumptions.** We have embeds, buttons, modals, webhooks; the verb command layer is an alternate surface, not a lowest common denominator.
- **Softcoded world objects.** User-contributed content flows through authored statements reviewed by capability-holding roles, not an in-world programming language. (Revisit only if roadmap player-building item moves forward.)

## Relationship to other docs

- `memory-model.md` — new statement kinds (`pose`, `private-message`, `inner-monologue`, `meta-query`, plus IC/OOC tags) and the recognition state record.
- `rooms-and-roles.md` — recognition filters sit at the retrieval/rendering layer, consistent with the doc's scope-enforcement model; no new capability bands for v1.
- `runtime-and-processing.md` — verb commands produce statements through the same worker/trigger pipeline; rendering filters apply at prompt assembly.
- `ui-and-interactions.md` — slash command surface for v1 commands; autocomplete and text-parity are already in scope.
- `world-authoring.md` — campaign content declaration lands in bootstrap stage 3 or 4 (see `consent-and-safety.md`).
- `consent-and-safety.md` — the v1 primitives and their role integration.

## Open questions

- Default set of verbs for v1 — minimum viable vs. maximum useful without bloat? Leaning minimum: `look`, `say`, `emote`, `tell`, `think`, `who`, plus `/roll` from `rules-resolution.md`.
- Does the recognition system need a "suspected identity" state (the party suspects the blacksmith is the traitor but doesn't know)? Or is that better handled narratively?
- Recognition state is per character, but a player may control multiple characters across campaigns — do we share recognition across a player's characters, or keep it strictly per-character? (Leaning: strictly per-character; character is the locus of knowledge.)
- IC/OOC hint on statements — is it ever meaningful for the agent to override a user's declared kind (e.g. someone types in-character text and tags it OOC by accident)? Likely not; trust the user.
