# Rules Resolution

## Purpose

Define how mechanical, rules-based questions are resolved in play: combat, skill checks, saves, social encounters, crafting, travel, anything we'd hand to a "rules system" at the table. Specifies a single capability (`Resolver`) with a stable I/O contract, two interchangeable implementation strategies (agent-backed default, deterministic later), and a rulings-as-canon protocol so precedent compounds within a campaign.

## Principle

**Interface first, implementation swappable.** Upstream code — the narrator agent, the combat tracker, skill-check workers — calls the Resolver interface and never inlines mechanical reasoning. The first implementation is an LLM agent seeded with a rulebook; later implementations may be deterministic code for hot paths or consistency-critical rules. Because callers only see the interface, migration is mechanical and per-path: a single rule can flip from agent to engine without touching anything else.

## Resolver interface

A Resolver exposes a typed I/O contract. Exact serialization is framework-specific; the shape is fixed.

**Input (`ResolveRequest`):**
- `system` — rules system id (`dnd5e`, `pf2e`, …). Selects the concrete Resolver.
- `kind` — category of resolution (`attack`, `saving-throw`, `skill-check`, `damage`, `effect-application`, `condition-check`, `freeform`).
- `actor` — entity reference for the subject of the action.
- `target` — optional entity reference.
- `action` — structured description of the intended action (skill name, spell id, weapon id, freeform text for edge cases).
- `modifiers` — advantage / disadvantage, bonuses / penalties, declared circumstantial modifiers.
- `context_statements` — ids of statements in scope that the resolver should consider (active effects, environment, recent rulings).
- `roll_policy` — whether to roll now, accept a pre-rolled value, or defer to the caller to roll.

**Output (`ResolveResult`):**
- `outcome` — structured resolution (hit/miss, DC met/failed, crit tier, degrees of success where the system supports them).
- `rolls` — every die rolled with value and purpose.
- `effects` — structured effects to apply to the world (damage, condition, duration, resource consumption). Effects are proposals, not side effects; the caller applies them by emitting statements.
- `ruling` — optional: when the resolver made a call beyond rules-as-written, a structured ruling record with reference to the rule section and the reasoning.
- `narration_hook` — neutral English description of what happened mechanically, for the narrator to rephrase in tone. Not the final narration.
- `confidence` — for agent-backed implementations, a self-reported confidence; deterministic impls set this to max.

Effects are proposals because the store is the authority on state — the caller emits `mechanical` and `effect` statements and the world updates via those records, not via the resolver mutating anything.

## Skill-style declaration (agent-backed resolvers)

An agent-backed Resolver is declared as a specification, not a freeform prompt. The declaration pins the agent's behavior so its I/O is stable enough for the contract to hold:

- **Seed corpus.** The rulebook text (e.g. D&D 5e SRD) ingested into a `rules:<system>` scope, per the world-authoring pipeline. The resolver's retrieval is restricted to this scope plus the request's `context_statements`.
- **Tool set.** Dice tool (typed: `roll(count, sides, modifier) -> [values]`), entity-lookup tool (scope-respecting), and no others by default. Tight tool surface prevents drift.
- **Output schema.** Strict `ResolveResult` shape; the agent is instructed to refuse rather than improvise schema.
- **Refusal rules.** Out-of-scope requests (`kind` the rulebook doesn't cover, actions the system doesn't recognize) return an explicit refusal, not a guessed resolution. Callers handle the refusal (narrative fudge, escalation, or rephrase).
- **Ruling policy.** When the agent must rule beyond the rulebook, it is required to produce a `ruling` object with cited rulebook sections (or none) and reasoning. Silent improvisation is forbidden.
- **Determinism helpers.** Temperature low; rolls come from the dice tool, not from the model's generation; the same `ResolveRequest` with the same random seed should return the same result.

This declaration format is the same shape whether it lives as a framework skill, an agent card, or a yaml spec — it's the contract between the agent's configuration and the caller's expectations.

## One resolver per system

A deployment may run any number of Resolvers, one per rules system. Each is seeded independently and addressed by `system` id on every call. A world declares its primary system, with per-room overrides if a specific room runs under a different system (a one-shot in PF2e inside a 5e campaign is fine).

## Rulings as canon (precedent accrual)

When the resolver issues a `ruling`, the caller emits a `ruling` statement into the party's scope. Properties:

- `ruling` statements are retrieved by the resolver on future calls in the same party. Precedent compounds within that party only — another party running the same system sees the rulebook but not this party's precedents.
- Rulings that prove stable can be promoted (via the canonization pipeline) to the world's `rules:<system>:house` scope — a per-campaign house-rule layer read by all parties in that campaign.
- Rulings that prove wrong can be retracted via supersedes chains like any other statement.

This is why rulebook seed and play-derived rulings coexist cleanly: they live in different scopes, and the precedent mechanism is explicit rather than emergent.

## Migration to deterministic implementations

The agent-backed default is not a long-term position for hot paths. Migration strategy:

1. **Measure call frequency and variance** by kind. High-frequency, low-variance calls (attack resolution, damage math, saving throws) are migration candidates. Rare, context-heavy calls (ad-hoc rulings on improvised actions) stay agent-backed.
2. **Implement the deterministic version behind the same interface.** Same `ResolveRequest` in, same `ResolveResult` out. Tests are the existing statement stream — replay past agent-authored calls against the new engine and compare outputs.
3. **Swap per-kind, not per-system.** A D&D 5e Resolver may be half code, half agent. The dispatcher routes by `kind`.
4. **Fall back to the agent for out-of-schema inputs.** If the deterministic engine can't parse the request (freeform action, unknown combination), it returns a "not handled" sentinel and the dispatcher escalates to the agent-backed path.

No caller changes in any of the above. This is the payoff of designing the interface first.

## Caller pattern

Narrator agent's turn, simplified:

1. Read scope-filtered slice for the current room.
2. Determine whether the current turn contains a mechanical question (attack declared, skill invoked, save triggered).
3. If yes, assemble a `ResolveRequest` from the narrative context and call the Resolver.
4. Receive the `ResolveResult`. Emit the `rolls`, `effects`, and optional `ruling` as statements.
5. Narrate in tone, using `narration_hook` as scaffolding, never reporting raw mechanical language unless appropriate.

The narrator never rolls or computes DCs directly. If it tries to (a failure mode to watch for), the consistency auditor flags the resulting statements as unsourced mechanical claims.

## Worked example: D&D 5e combat

Initiative, turn structure, and Discord presentation are platform concerns (see `ui-and-interactions.md` for the initiative embed and turn-buttons pattern). The mechanical core:

- Combat start → narrator emits a `combat-start` statement; initiative resolver call produces ordered actors.
- On each actor's turn → narrator surfaces available actions (from the resolver's action catalog for that actor) as buttons; player click produces an `action-declared` statement.
- Narrator calls Resolver for the declared action; result comes back with rolls, effects, optional ruling.
- Effects are emitted as `effect` statements; HP / condition state is reconstructed from the effect stream, not mutated directly.
- Narrator describes the hit/miss/crit in tone; the initiative embed updates from the effect statements.

Every mechanical fact in the combat is a statement. The consistency auditor can reconstruct the combat deterministically from the statement log.

## Worked example: skill check

Player types `I try to sneak past the guards.` Narrator detects a skill invocation.

- `ResolveRequest` with `kind=skill-check`, `action=stealth`, actor = active character, context including the guards' passive perception statement id.
- Resolver rolls, compares, returns outcome (success by 3), rolls detail, narration hook ("stealth check beats passive perception").
- Narrator emits `mechanical` and optional `ruling` statements, then narrates in tone.
- If the character rolls a 1, a `ruling` may cover whether a nat-1 on a skill check has consequences in this campaign — that ruling becomes precedent.

## Relationship to other docs

- `memory-model.md` — `ruling`, `mechanical`, `effect` are statement kinds; `rules:<system>` and `rules:<system>:house` are scope types.
- `rooms-and-roles.md` — resolver calls inherit the caller's scope; rulings promoted to house canon require the same canonization capability as any other canon promotion.
- `runtime-and-processing.md` — the Resolver is a worker (invoked synchronously from the narrator's turn); the consistency auditor validates mechanical claims against the Resolver's outputs.
- `ui-and-interactions.md` — combat UI (initiative embed, action buttons), skill-check roll buttons, the mechanical side of which drives Resolver calls.
- `world-authoring.md` — rulebook ingestion is a case of seed authoring; it populates the `rules:<system>` scope.

## Open questions

- How do we express cross-system portability of characters (a character brought from a 5e campaign into a PF2e one-shot)? Translate stats, or snapshot as NPC?
- When a `ruling` is made ad hoc by the agent, should it be automatically surfaced as a canonization candidate to the authoring role, or only promoted when it's referenced again? (Leaning: surface immediately if `confidence` is low.)
- How is random seed management handled for reproducibility across restarts — stored per-roll, per-session, not at all?
- Should degrees of success (PF2e, FitD) be a first-class `ResolveResult` field even when the system doesn't use them, or discriminated by `system`?
- What's the minimum viable action catalog interface so a character sheet's buttons can enumerate valid Resolver actions without the Resolver needing to fully enumerate its own capabilities?
