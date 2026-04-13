# Rooms, Roles & Scope Bindings

## Purpose

Define the general structure that makes "GM vs. party" just one instance of a broader pattern: **rooms** (conversational containers), **roles** (named capability sets held by members), and **scope bindings** (which memory scopes a room reads from and writes to). This replaces the implicit assumption in `memory-model.md` that a channel maps one-to-one to a party — a party room is merely the most common configuration.

The generalization matters because realistic play has at least three room shapes already: player tables, meta GM rooms, and in-fiction rooms whose members are themselves part of world canon. All three fall out of the same primitives.

## Primitives

### Room

A room is a conversational container with:
- A stable identity.
- A set of **members** (users), each holding one or more roles within this room.
- A **scope binding** declaring which memory scopes this room reads and writes.
- Optional **relationships** to other rooms (oversees, briefs, is-briefed-by, canonizes-for).
- A platform mapping (v1: one Discord channel per room).

A room is not synonymous with a party. A party is the common case where the room's members are players, the writable scope is a single `party experience`, and reads union world + party + character.

### Role

A role is a named capability bundle. Capabilities are explicit and independently granted:
- **Read capabilities** — which memory scopes may enter this role's prompt assembly.
- **Write capabilities** — which scopes this role may author statements into.
- **Tool capabilities** — which tools the role may invoke, and what scope those invocations inherit.
- **Workflow capabilities** — privileged operations: canonize a party-local fact to world canon, issue a retraction, promote a room, invite users into roles.
- **Narrative attributes** — in-fiction traits the agent must honor when this role is "on" (e.g. `omniscient`, `undercover`, `silenced`).

A user may hold multiple roles in one room (a GM who is also playing a character), and different roles in different rooms. Roles compose additively on capabilities and explicitly on narrative attributes (last-write-wins or a declared precedence — open question below).

### Scope binding

A room's scope binding has three parts:
- **Write target** — exactly one scope a member's statements are recorded into by default. A role may override to write elsewhere (e.g. a canonization action writes to world).
- **Read set** — the scopes that may contribute to prompts for agent turns in this room. Read set is further narrowed per-role (a player's read set excludes other players' private character scope even though the room nominally reads from `character`).
- **Emit set** — scopes this room *produces signal for* beyond its own writes: briefings, constraints, canon updates flowing outward. Emissions are first-class records, not side effects.

## Cross-room information flow

Rooms are not isolated islands — they feed each other through explicit, auditable channels. The two recurring patterns:

### Briefings (inward to a privileged room)

The agent periodically (or on demand) produces a **briefing**: a scope-respecting digest of activity in a set of source rooms, delivered into a target room whose role holders are authorized to receive it. Properties:
- The briefing is itself a statement in the target room, with sources pointing back to the underlying statements.
- The digest respects scope: if the target room should see outcomes but not dialogue, the digest is shaped accordingly.
- Briefings can be pull (on request) or push (scheduled / triggered by thresholds).

### Steering (outward from a privileged room)

A privileged room (typically a GM room) emits **steering records**: decisions, new canon, plot constraints, NPC directives. These are not narration — they are structured inputs that shape future agent turns in downstream rooms. Properties:
- Steering records are statements in the emitting room, but their emit-set routes them to the relevant scope (usually world canon or a specific party's constraints-scope).
- Downstream rooms consume steering via their read set; the agent weighs them during prompt assembly.
- A steering record can be probabilistic ("in the next session introduce a rumor about the cult") or hard ("the baron is revealed to be the traitor when the party reaches chapter 4").

## Worked examples

### Standard party room

- **Members**: 4 players + the agent.
- **Roles**: `player` (each user).
- **Scope binding**: writes to `party:P`. Reads world ∪ party:P ∪ own-character.
- **Emit set**: none beyond own scope (unless canonization fires).

### Pure-meta GM room (single or multi-user)

- **Members**: 1..N GMs.
- **Roles**: `gm` (read-all-overseen, write-canon, canonize, retract).
- **Scope binding**: writes to `meta:gm-room-X`. Reads world ∪ meta ∪ briefings from overseen parties. Emit set targets world canon and per-party constraint scopes.
- **Relationships**: oversees party rooms A, B, C.
- **Agent behavior**: produces periodic briefings into this room; solicits steering input; converts GM decisions into canon writes or constraint emissions.

### In-fiction GM room — "the omniscient wizard cabal"

A group of wizard PCs who are in-world but metaphysically privileged. Their discussions are both role-play and world-shaping.

- **Members**: 3 wizard players + the agent.
- **Roles**: `player` (as characters) **and** `gm` (privileged) held simultaneously. Narrative attribute `omniscient` is active.
- **Scope binding**: writes to `party:wizards` (their own in-fiction scope) **and** can canonize to world. Reads world ∪ party:wizards ∪ own-character ∪ briefings of other parties (because `omniscient` + `gm`).
- **Emit set**: world canon, plus constraint emissions into other parties' scopes ("next full moon the ley line shifts — surface this as environmental narration wherever relevant").
- **Agent behavior**: speaks to them in-character as an NPC/peer, while also producing meta-briefings when they request them. The room simultaneously records in-fiction statements (subject to narrative consistency) and authoring decisions (subject to canonization rules). The distinction is a `kind` on the statement, not a property of the room.

This example is the reason rooms, roles, and scope bindings are orthogonal: the wizard cabal needs all three dialed independently, and no party/GM binary can represent it.

## Agent responsibilities across rooms

The agent is a single actor that assumes different postures per room, determined by the room's binding and the active roles:

- **Narrator/NPC** in party rooms — bound by scope, honoring canon, inventing within policy.
- **Analyst/assistant** in meta GM rooms — summarizing, surfacing inconsistencies, proposing canonization candidates, soliciting steering.
- **Hybrid** in in-fiction GM rooms — both of the above, with explicit tagging of which mode each statement is in.

Across all postures the agent must:
- Refuse to surface information outside the current room's read set, even when asked.
- Record which retrieved statements grounded each output (provenance for citation/retraction).
- Distinguish `invention`, `canon-reference`, `briefing`, `steering`, and `mechanical` statement kinds.

## Authorization notes

- **Role grants are auditable events.** Adding `gm` to a user in a room is itself a statement, in a dedicated governance scope.
- **Capability checks happen at the store, not in prompt assembly.** A room attempting to read outside its read set is refused at the retrieval layer.
- **Emission is an authorized action.** Writing canon or emitting a constraint into another party's scope requires a workflow capability; without it, the attempted write is logged and dropped.
- **Narrative attributes are not security.** `omniscient` shapes prompts but does not grant read capability on its own — the `gm` role does. Keeping these orthogonal prevents a purely in-fiction claim ("my character is omniscient") from escalating privilege.

## Relationship to `memory-model.md`

- The scope types (world / party / character / session) in `memory-model.md` still hold. This document adds that **which scope a room reads and writes is a configuration, not a fixed pairing with the party scope.**
- "Party" is the concrete v1 label for a room-bound experience scope. Additional named scopes (`meta:*`, `constraints:party:P`, `governance`) emerge from this generalization and should be added to the scope inventory as they appear.
- The canonization pipeline in `memory-model.md` is the pipeline that a `gm` role's workflow capability *invokes*. The "who decides" answer is now: whichever role holds the canonize capability in the relevant room.

## Open questions

- When a user holds conflicting narrative attributes across simultaneous roles (e.g. `omniscient` + `silenced`), what resolution rule applies — explicit precedence declared on the role, last-grant-wins, or refuse-and-prompt?
- Do briefings and steering records live in a dedicated scope type, or reuse existing scopes with a `kind` tag? (Leaning: dedicated, because retention and visibility rules differ.)
- Should room relationships form a strict DAG (prevents cyclic briefings) or allow cycles with explicit cycle-breakers?
- How are room lifecycles handled — archival, merging two parties, splitting a party — and what happens to their scope-bound statements?
- Is there a meaningful "all GMs across the world" room, or is oversight always per-world-slice?
