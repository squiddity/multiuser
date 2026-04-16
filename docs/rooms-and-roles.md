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
- **Emit set** — scopes this room _produces signal for_ beyond its own writes: briefings, constraints, canon updates flowing outward. Emissions are first-class records, not side effects.

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

## Layered privilege & flow interception

The GM/party pairing is a two-level privilege stack, but nothing in the model limits depth. Oversight relationships compose: a room R3 may oversee R2 which oversees R1, and each layer can hold capabilities over everything below it. The wizard cabal may itself be subject to a further authoring room — a "pantheon," an editorial council, an authorial root — and so on.

Two orthogonal privileges a higher layer may hold over a lower one:

### Observation (omniscience-over)

A higher room may read the lower room's statements — in-fiction dialogue, private deliberations, emitted briefings and steering, governance events — without being a member of the lower room and without the lower room's awareness. Properties:

- **Awareness is opt-in, not default.** A lower room may know it is observed, or may not. Hidden observation is a legitimate in-fiction pattern (the pantheon watching mortals) and a legitimate authorial pattern (a senior author auditing a co-author's table).
- **Observation is still auditable** — in a governance scope the observer cannot see into. You cannot observe invisibly at the system level, only at the in-fiction / in-room level.
- Observation is a read capability on the observer's role, keyed to specific lower scopes. It does not imply any write privilege.

### Pre-emption (interception of flows)

Briefings and steering records are not atomic emissions from source to target — they pass through an ordered chain of **interceptors** defined by the privilege stack. A higher-privilege room may register an interception on a flow between two lower rooms and act on the in-flight record. Available actions:

- **Observe** — read the record without altering it (degenerate pre-emption; equivalent to observation).
- **Annotate** — attach notes visible to subsequent interceptors but not to the destination.
- **Amend** — modify, extend, or redact content before delivery (e.g. insert a prophetic detail into a briefing for the wizard cabal).
- **Substitute** — replace the record entirely with an authored alternative.
- **Suppress** — drop the record; the destination never sees it.
- **Delay** — hold the record for a specified condition (next session boundary, until another event fires).

Properties of interception:

- **Interception is authorization-gated.** Each flow type (briefing-to-X, steering-from-Y) declares which capabilities permit interception, and interceptors are ordered by the privilege stack.
- **Every interception is a first-class record** in the interceptor's scope, with references to the pre-image and post-image of the intercepted record. Nothing mutates invisibly at the system layer, even when the destination room is deliberately kept unaware.
- **Interceptions compose top-down** through the stack. A higher interceptor's amendment becomes the input to lower interceptors, which may further amend or suppress. The stack has a fixed order derived from the oversight relationships.
- **A pre-emption on briefing context** is the common case: a privileged room shapes what its dependents learn without participating in their rooms directly. The wizard cabal's next briefing can be nudged by a room the cabal does not know exists.
- **Narrative attributes can trigger interception.** A room with `prophetic` attribute may auto-annotate briefings flowing through it; a room with `silenced` attribute is excluded as an interception source even if it otherwise qualifies.

### Implications for the model

- **Relationships are a DAG, not a tree.** A room may be overseen by multiple higher rooms, each with distinct interception rights; ordering must be declared (priority, or a merge rule).
- **Cycles are forbidden** on oversight/interception edges — a cycle would mean a room pre-empts its own briefings, which is meaningless and a liveness hazard. Cycle detection happens at relationship creation.
- **"Awareness-of-being-observed" is a property of the observed room's role configuration**, not of the observer's. This keeps the hidden-authority pattern expressible without special-casing the protocol.
- The primitives generalize: "GM" and "pantheon" are not distinct concepts, only distinct configurations of the same role/capability machinery applied at different layers.

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

### Higher-stack authoring room — "the pantheon"

A further set of players who sit above the wizard cabal, with omniscience over the cabal's deliberations and pre-emption over briefings flowing into it. They may themselves be in-fiction (a pantheon of gods the wizards worship and occasionally petition) or purely authorial (a senior authors' table) — the mechanism is identical.

- **Members**: N authors/players + the agent.
- **Roles**: `pantheon` (read over all lower rooms including the cabal's meta statements; interception rights on briefings into the cabal and steering emitted from the cabal; canonize at world level).
- **Scope binding**: writes to `meta:pantheon`. Reads world ∪ meta:pantheon ∪ cabal statements ∪ party briefings via the stack.
- **Emit set**: world canon; amended briefings into the cabal; direct steering into world and party scopes.
- **Relationships**: oversees the wizard cabal (which oversees parties A, B, C). Oversight is transitive for observation, explicit per-flow for interception.
- **Cabal awareness**: configurable. The pantheon may be known to the cabal (petitionable deities, acknowledged senior authors) or hidden (fates they cannot detect). The protocol behaves the same either way; only the cabal's prompt assembly differs.
- **Agent behavior**: in this room, the agent performs the pantheon-facing postures (narrator-to-gods, editorial assistant) and in the cabal's room honors any amendments the pantheon has made to the cabal's incoming briefings, without leaking that amendment occurred unless the cabal is configured to be aware.

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
- The canonization pipeline in `memory-model.md` is the pipeline that a `gm` role's workflow capability _invokes_. The "who decides" answer is now: whichever role holds the canonize capability in the relevant room.

## Open questions

- When a user holds conflicting narrative attributes across simultaneous roles (e.g. `omniscient` + `silenced`), what resolution rule applies — explicit precedence declared on the role, last-grant-wins, or refuse-and-prompt?
- Do briefings and steering records live in a dedicated scope type, or reuse existing scopes with a `kind` tag? (Leaning: dedicated, because retention and visibility rules differ.)
- Room relationships are a DAG (no oversight/interception cycles); open question is the **merge rule** when a single lower room has multiple higher interceptors on the same flow — declared priority, role-level precedence, or last-writer-wins?
- How are room lifecycles handled — archival, merging two parties, splitting a party — and what happens to their scope-bound statements?
- Is there a meaningful "all GMs across the world" room, or is oversight always per-world-slice?
- When a lower room is configured _aware_ of an observer or interceptor above it, what exactly does it see — existence only, identity, the content of interventions, or a narrative-layer abstraction (e.g. "you feel watched")?
- Should interception hooks be declarable on arbitrary flow types in the future (e.g. on canonization events, on governance grants), or restricted to briefings and steering?
