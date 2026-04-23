# Decisions Log

## Purpose

Close the open questions accumulated across design docs so implementation can proceed without ambiguity. Each entry: the question, the decision, a brief rationale, and the scope it applies to (v1 vs. reevaluate). New questions that arise during build should be added here rather than reopening upstream docs.

Format:

- **Q** — the question.
- **D** — the decision.
- **R** — rationale.
- **S** — v1 / reevaluate-later / resolved.

---

## Core domain

### D1. World cardinality

- **Q** — single world per deployment, or multi-world?
- **D** — Single world per deployment for v1.
- **R** — Simpler authorization, scope model, reconciler. Multi-world is additive later (world id becomes an outer scope key).
- **S** — v1.

### D2. Canonization authority

- **Q** — who holds the canonize capability?
- **D** — A workflow capability `canonize` granted to authoring roles (GM, cabal, operator); default holders configurable per campaign at bootstrap.
- **R** — Matches the capability model in `rooms-and-roles.md`; no special-casing.
- **S** — v1.

### D3. Character portability across parties

- **Q** — can a character move between parties in the same world?
- **D** — Party-bound in v1. Cross-party moves route through the NPC-snapshot path (D19) if needed.
- **R** — Keeps scope boundaries clean; portability is a named feature to design deliberately later.
- **S** — v1; reevaluate when players request it.

### D4. Session working-set persistence

- **Q** — persist in-session working state or discard at session end?
- **D** — Persist. Compaction via summarizer preserves provenance.
- **R** — Aligns with retention-by-default and statement-level addressability.
- **S** — v1.

---

## Rooms, roles, flows

### D5. Narrative attribute conflicts

- **Q** — what happens when conflicting narrative attributes are granted (e.g. `omniscient` + `silenced`)?
- **D** — Precedence declared on the role grant. Fallback: last-grant-wins at apply time.
- **R** — Explicit precedence avoids silent surprises; last-grant-wins is a sane default when precedence is unspecified.
- **S** — v1.

### D6. Multi-parent interception merge

- **Q** — multiple higher rooms intercept the same flow — ordering?
- **D** — Declared priority integer on each interception relationship; ties broken by role ordering, then by relationship creation time.
- **R** — Deterministic, auditable, operator-controllable.
- **S** — v1.

### D7. Lower-room awareness of observers

- **Q** — when a lower room is configured "aware" of a higher observer, what does it see?
- **D** — Configurable per role attribute: `existence-only`, `existence-plus-interventions-presence`, `narrative-layer-only` (e.g. "you feel watched" without structure). Default `existence-plus-interventions-presence`.
- **R** — Supports hidden-authority and transparent-authority patterns with one mechanism.
- **S** — v1.

### D8. Interception domain

- **Q** — do interceptors apply to canonization and governance flows, or only briefings/steering?
- **D** — v1 restricts interception to briefings and steering. Canonization and governance flows are not interceptable.
- **R** — Narrower surface is safer; extending is additive.
- **S** — reevaluate after v1.

---

## Runtime and scheduling

### D9. Language

- **Q** — Python or TypeScript?
- **D** — TypeScript.
- **R** — Discord ecosystem fit; single language end-to-end.
- **S** — resolved.

### D10. Agent runtime

- **Q** — Claude Agent SDK, LangGraph, Mastra, or Letta?
- **D** — Use pi SDK components (`@mariozechner/pi-ai` + `@mariozechner/pi-agent-core`) behind local interfaces, with our domain types owning the vocabulary.
- **R** — pi provides lean model/provider abstraction, tool-loop/session primitives, and usage/cost telemetry without forcing us to adopt an opinionated application memory model. This keeps runtime plumbing replaceable while preserving our statement-store-first architecture.
- **S** — resolved.

### D11. Storage

- **Q** — SQLite first then migrate, or Postgres from day one?
- **D** — PostgreSQL 16 + pgvector from day one.
- **R** — Migration later is expensive; Docker Compose makes dev trivial.
- **S** — resolved.

### D12. Consistency auditor timing

- **Q** — run on every narration turn (sync) or async?
- **D** — Async worker. Open-question protocol handles the critical inline path.
- **R** — Keeps narration latency low; contradictions surface within seconds, acceptable for the domain.
- **S** — v1.

### D13. Eval harness location

- **Q** — same store or separate?
- **D** — Same store, `eval` scope. Eval runs are first-class statements tied to model and prompt versions.
- **R** — Uniform tooling; regression visibility over time.
- **S** — v1.

### D14. Interception backend tier 0

- **Q** — in-process chain-of-responsibility or durable workflow from day one?
- **D** — In-process chain-of-responsibility. Durability arrives with tier-3 promotion when warranted.
- **R** — Simpler; matches the broader tier-0 posture.
- **S** — v1.

### D15. Per-user model / key

- **Q** — per-user LLM model selection and keys, or service-level?
- **D** — Service-level for v1.
- **R** — Cost and complexity tradeoff favors a single provider relationship at this stage.
- **S** — reevaluate when users request bring-your-own-model.

---

## Platform adapter

### D16. Multi-platform room projection

- **Q** — can one room project to multiple platforms simultaneously?
- **D** — No in v1. One room, one platform.
- **R** — Platform semantics diverge enough that mirroring is its own feature.
- **S** — reevaluate after second platform lands.

### D17. Split and merge data model

- **Q** — deep-copy statements into child scopes or back-pointers?
- **D** — Back-pointers.
- **R** — Preserves provenance; avoids write amplification; supports retraction of shared history.
- **S** — v1.

### D18. Bot credential rotation

- **Q** — automated or manual?
- **D** — Manual with planned downtime for v1. Operator runbook required.
- **R** — Rotation is rare; automation is a later engineering investment.
- **S** — reevaluate when multi-guild deployments scale.

### D19. Platform API downtime policy

- **Q** — queue-and-retry or pause affected workers?
- **D** — Queue-and-retry with exponential backoff and a max-wait threshold that escalates to operator alert.
- **R** — Matches durable-workflow patterns; tier-3 upgrade gives us this natively later.
- **S** — v1.

### D20. In-fiction admin narrative rendering

- **Q** — agent auto-renders admin actions in-fiction (e.g. "a new table has been convened"), or explicitly authored?
- **D** — Explicitly authored for v1.
- **R** — Tonal judgment is the kind of thing we want to earn trust in, not assume.
- **S** — reevaluate when tonal eval scores justify automation.

---

## UI and interactions

### D21. Webhook identity proliferation

- **Q** — Discord caps webhooks per channel; one-per-NPC doesn't scale.
- **D** — Webhook identity pool per channel. Rename and re-avatar per-send when possible; persistent webhooks only for major recurring NPCs.
- **R** — Fits within Discord's limits; abstracts the NPC-identity pattern behind our webhook service.
- **S** — v1.

### D22. Player freeform narration scope

- **Q** — modal-submitted player narration: directly writable or flagged for agent review?
- **D** — Written to the party scope as `kind=dialogue` or `kind=pose` immediately; canonization remains gated like any other statement.
- **R** — Players already produce statements via chat; modals are just another entry surface.
- **S** — v1.

### D23. Complex state presentation

- **Q** — character sheets, spellbooks, inventory — embed size limits force a choice.
- **D** — Pagination with navigation buttons on a reusable embed component for v1.
- **R** — Stays in Discord-native UI; no external web view needed yet.
- **S** — reevaluate when pagination becomes unwieldy for common cases.

### D24. Reactions vs. polls

- **Q** — when to use which?
- **D** — Reactions for lightweight continuous signal (ambient mood, agreement flag); native polls for time-boxed group decisions with a result timestamp. Both produce statements.
- **R** — Matches their respective UX affordances.
- **S** — v1.

---

## Rules resolution

### D25. Cross-system character portability

- **Q** — stat translation across systems, or snapshot-as-NPC only?
- **D** — Snapshot-as-NPC only for v1. Translation deferred.
- **R** — Stat translation is a design space unto itself; snapshot is sufficient for one-shots and guests.
- **S** — reevaluate when multi-system campaigns appear.

### D26. Ad-hoc ruling surfacing

- **Q** — push to authoring role immediately, or accumulate to digest?
- **D** — Surface immediately when resolver `confidence` is below a per-system threshold; accumulate to digest otherwise.
- **R** — Low-confidence rulings are the ones most worth early validation.
- **S** — v1.

### D27. Random seed management

- **Q** — how is randomness handled for reproducibility?
- **D** — Per-roll seed stored in the emitted `mechanical` statement's fields. Deterministic replay is possible against the recorded seed.
- **R** — Keeps statement store as the complete audit log; no separate seed log needed.
- **S** — v1.

### D28. Degrees of success

- **Q** — first-class field or per-system extension?
- **D** — First-class optional field on `ResolveResult`; systems that don't use them omit; systems that do populate.
- **R** — Type-stable schema; no per-system forking of the result type.
- **S** — v1.

### D29. Action catalog interface

- **Q** — how do UI surfaces enumerate a character's valid actions?
- **D** — Resolvers expose `describeActions(actor, contextIds) -> ActionSpec[]` returning typed descriptors. UI calls this to populate buttons and selects.
- **R** — Keeps action validity in the resolver (authoritative); UI stays dumb.
- **S** — v1.

---

## World authoring

### D30. Large corpus ingestion

- **Q** — stream or fully ingest before availability?
- **D** — Streaming with a `partial` flag on the corpus; retrieval can proceed against partial content, marked accordingly.
- **R** — Keeps bootstrap responsive for large public-domain corpora.
- **S** — v1.

### D31. Style extraction versioning

- **Q** — rollback mechanism or supersedes-only?
- **D** — Supersedes chain; rollback is a new supersedes superseding the unwanted extraction.
- **R** — Same mechanism as any other statement correction; no special rollback primitive.
- **S** — v1.

### D32. Minimum source metadata

- **Q** — required fields per ingested source?
- **D** — Required: `source`, `license`, `ingested_at`, `ingested_by`. Optional: `era`, `genre`, `tone_hints`, `author`.
- **R** — Required fields cover attribution and provenance; optional fields shape better retrieval without blocking ingestion.
- **S** — v1.

### D33. Seed update approval

- **Q** — per-statement review or batched?
- **D** — Always-review with batch-approval UI. Admin can approve hundreds of extracted entities in one gesture after sampling; individual edits remain single-approval.
- **R** — Fast bulk ingestion without giving up review discipline.
- **S** — v1.

### D34. Shared-corpus fork authorization

- **Q** — who authorizes a fork?
- **D** — Platform operator grants `corpus:fork` to an authoring role; the fork action requires both the capability and an explicit fork statement.
- **R** — Two-party check prevents accidental forks; platform-level control matches ops concerns.
- **S** — v1.

---

## MUD precedents

### D35. Default v1 verb set

- **Q** — which verbs ship?
- **D** — `look`, `say`, `emote` (alias `pose`), `tell`, `think`, `who`, `inventory`, `move <direction>`. Plus `/roll` (rules-resolution), `/pause` `/fade` `/unpause` (safety). `inventory` and `move` are minimal-stub for v1, wired but shallow.
- **R** — Minimum viable without sprawl; extensions are additive.
- **S** — v1.

### D36. Suspected-identity recognition state

- **Q** — model suspicion explicitly or handle narratively?
- **D** — Narratively for v1.
- **R** — Explicit suspicion is a design sub-project; narrative handling is free.
- **S** — reevaluate if play experience shows a need.

### D37. Recognition scope

- **Q** — per-character or per-player across characters?
- **D** — Per-character. A player's two characters maintain independent recognition.
- **R** — Character is the locus of in-fiction knowledge; cleaner narrative continuity.
- **S** — v1.

### D38. Agent override of user IC/OOC declaration

- **Q** — can the agent reclassify a user-tagged statement?
- **D** — No. Trust the user's declared kind.
- **R** — Respects authorship; lower risk of surprise.
- **S** — v1.

---

## Consent and safety

### D39. Pause propagation

- **Q** — does `/pause` propagate to related rooms?
- **D** — Just the invoking room by default. `/pause all` is a separate authoring-role capability that halts a configured cluster (e.g. party + combat thread).
- **R** — Single-room default is predictable; cluster-pause is available when needed.
- **S** — v1.

### D40. Private line storage

- **Q** — how are user-specific lines stored without leaking content?
- **D** — User-private scope keyed to user id. Only an aggregate "a user's line is active here" flag is visible to others when behavior changes.
- **R** — Privacy by construction; aggregate signal suffices for other participants to understand narrative pivots.
- **S** — v1.

### D41. Authoring override of safety

- **Q** — can authoring roles override a safety invocation?
- **D** — No in v1. Authoring roles can discuss in their own room and author revised content declarations for future play, but cannot override a pause or fade.
- **R** — Safety is unconditional; trust bank is built by never overriding.
- **S** — reevaluate only if strong operational evidence suggests otherwise.

### D42. Source content outside lines

- **Q** — if source fiction contains lined content, what happens?
- **D** — Retained in the store with provenance; marked off-limits for narration retrieval. Lookup for reference is allowed; generation paths refuse.
- **R** — Preserves the corpus for attribution and later reconsideration without surfacing it in play.
- **S** — v1.

### D43. Pre-join consent disclosure

- **Q** — do new participants see the campaign's content declaration before joining, with a consent record?
- **D** — Yes. One-time `consent-acknowledged` statement per user per campaign, recorded at join. Declining blocks role assignment.
- **R** — Standard safety hygiene; cheap to implement.
- **S** — v1.

---

## Implementation-level

### D44. Embedding model

- **Q** — which embedding model?
- **D** — Hosted `text-embedding-3-small` (OpenAI) or Voyage for v1.
- **R** — Cost/quality tradeoff acceptable at early scale; local models are an option later if privacy demands.
- **S** — v1; reevaluate on cost or privacy pressure.

### D45. Postgres hosting

- **Q** — managed or self-hosted?
- **D** — Compose-hosted for dev; managed (Neon or Supabase) for production when we deploy.
- **R** — Ops simplicity in prod; dev stays offline-capable.
- **S** — v1.

### D46. Process topology

- **Q** — single runtime process or split per agent role?
- **D** — Single process for v1. Split when load or isolation demands.
- **R** — Matches tier-0 deployment posture.
- **S** — v1.

### D47. Discord sharding

- **Q** — when does sharding matter?
- **D** — Single shard in v1; shard when guild count approaches Discord's per-shard limit (currently ~2500).
- **R** — Simplicity wins until scale forces it.
- **S** — v1.

### D49. Model providers and selection

- **Q** — which LLM(s) do agents use, and how is the choice expressed?
- **D** — Each agent definition declares its model directly as a provider-prefixed spec (`"<provider>:<slug>"`) passed to the local `LlmRuntime` and resolved by the pi runtime adapter (`src/models/pi-runtime.ts`). No logical aliases ("cheap"/"premium"). Provider keys are optional and only required when an agent references that provider. Embeddings via OpenAI `text-embedding-3-small` (1536 dim) per D44.
- **R** — Agent roles have genuinely different model needs (e.g. a scheduled consistency reviewer wants a long-context premium model for daily digests; a chat narrator wants a fast, cheap one). Encoding that at the agent definition keeps the choice next to the behavior it affects rather than buried behind a shared env alias. pi-ai model resolution composes cleanly with this declaration style.
- **S** — v1.

### D48. Secrets management

- **Q** — `.env` / dotenv or a secrets manager?
- **D** — `.env` for v1. Migrate to a secrets manager when deploying multi-environment.
- **R** — Matches deployment complexity to actual footprint.
- **S** — v1.

---

### D50. HTTP API framework

- **Q** — which HTTP framework for the internal API surface (health, statement CRUD, admin)?
- **D** — Hono.
- **R** — Lightweight (~14KB), type-safe, works on any runtime, Fastify-like DX. The app already runs as a single Node process; Hono adds minimal overhead. No Express baggage.
- **S** — v1.

### D51. Hermetic test approach

- **Q** — how to run hermetic black-box tests against the live system without coupling to the Node toolchain inside Docker?
- **D** — Python + pytest + httpx. Services (app + Postgres) run in Docker; tests run on the host/CI runner making HTTP calls. Zero code shared between tests and app under test. The old approach (vitest inside a Docker container) failed because esbuild's native binary download is incompatible with Docker's `ignore-scripts` workflow for pnpm. More fundamentally, black-box API tests should not share implementation details with the system under test — they prove the contract from first principles.
- **R** — Complete independence from the app's build toolchain. pytest fixtures handle health-wait, client sessions, and setup/teardown. JUnit XML output integrates with any CI dashboard. Python is pre-installed on GitHub Actions runners. Shell scripts and Bats were rejected for poor ergonomics (JSON in bash, no structured assertions) and maintainability beyond a handful of tests. k6 was rejected because its functional testing model is rudimentary (no per-test setup/teardown). node:test was rejected because while it doesn't import app code, it keeps the test layer in the Node ecosystem — defeating the decoupling goal.
- **S** — v1.

---

### D52. Resolver agent architecture

- **Q** — should resolver behavior be hardcoded per rules system, or driven by agent instructions? And how many implementation strategies should the Resolver interface support?
- **D** — The default `Resolver` implementation is `AgentBackedResolver`, parameterized by `(systemId, modelSpec, instructions)`. Instructions are markdown (data, not code); any rules system swaps in its own instructions file without code changes. Shared tool primitives (`roll`, `retrieve`) are available to any resolver. The `Resolver` interface supports three swappable implementations: `AgentBackedResolver` (LLM + instructions + tools, default), `DeterministicResolver` (pure code for hot paths, future), `HybridResolver` (structured system-specific tools inside the agent, future). The dnd5e skill-check instructions are an example data artifact, not a hardcoded module.
- **R** — An admin should be able to provide a new rulebook (e.g. PF2e, FitD) and get resolver behavior by creating instructions markdown, not by writing code. Hardcoded per-system logic couples agent behavior to engine code and makes adding systems expensive. The instructions-as-data pattern keeps the resolver generic. Multiple implementation strategies share the same interface, so per-kind dispatch is internal to the implementation and callers never change.
- **S** — v1.

### D53. Next milestone focus after vertical slice

- **Q** — what is the immediate roadmap target after the vertical slice is stable?
- **D** — Milestone 0002 focuses on admin/player context handling: fully implementing briefing generation and steering workflows so guidance flows reliably between party and governance rooms.
- **R** — The vertical slice proved basic pipeline mechanics. The next product risk is whether human admins can steer ongoing play effectively through structured context loops.
- **S** — next milestone.

### D54. Post-0002 milestone ordering

- **Q** — what follows once briefing + steering loops are stable?
- **D** — Milestone 0003 focuses on Discord adapter integration and validating that prior milestone behaviors hold in real chat UX.
- **R** — Channel/role mappings, interaction UX, and message rendering can alter behavior in practice; this needs dedicated validation before expanding feature breadth.
- **S** — roadmap.

### D55. Deferred mechanics and safety command surface

- **Q** — where do deferred mechanics dispatch and safety command items from 0001 go?
- **D** — They move to Milestone 0004 (RPG mechanics and command surface), including mechanical resolver dispatch (`command-query`), `/roll`, and deferred `/pause`/`/unpause`/`/fade` command enforcement.
- **R** — Keeping 0001 focused on core narrative-governance flow reduced scope risk. Grouping these deferred items into a dedicated mechanics milestone keeps implementation and testing coherent.
- **S** — roadmap.

### D56. Active steering precedence

- **Q** — if multiple steering statements are present, which one is treated as active first during narrator context assembly?
- **D** — Only `status=active` steering statements are considered. Active steering is ordered newest-first by statement creation time; superseded/revoked statements are excluded.
- **R** — This keeps precedence deterministic and easy to audit while preserving a straightforward override model for admins.
- **S** — v1.

### D57. Canonical store abstraction boundary

- **Q** — should canonical statement/session truth be bound directly to Postgres modules, or hidden behind a contract that allows alternate backends?
- **D** — Canonical truth must sit behind an explicit `StatementStore` interface. Postgres remains default, but workers/agents consume the interface only.
- **R** — Scope safety, provenance, and governance semantics are domain-level contracts. Treating storage as an adapter keeps room for alternate backends (including graph/vector hybrids) without rewriting worker logic.
- **S** — v1.

### D58. `pi-coding-agent` adoption posture

- **Q** — should we adopt `pi-coding-agent` session runtime now, or defer?
- **D** — Defer full adoption for now. Keep `pi-ai` + `pi-agent-core` as the runtime base and revisit `pi-coding-agent` selectively (especially compaction hooks/extensions) once our own session/store contracts stabilize.
- **R** — Full `pi-coding-agent` integration is compelling for extension and compaction ergonomics, but we do not want to blur authoritative canonical memory with convenience transcript/session facilities.
- **S** — reevaluate after milestone 0002 stabilization.

### D59. Validation schema direction (Zod → TypeBox)

- **Q** — stay on Zod indefinitely, or migrate toward TypeBox?
- **D** — Plan a full migration to TypeBox in phases, while preserving behavior and contracts during transition.
- **R** — TypeBox gives serializable schemas that compose well with pi tooling and distributed/runtime-boundary contracts. Migration is non-trivial, so we phase it behind adapters and parity tests.
- **S** — roadmap.

---

## Remaining open items

Items that survived this pass and should be worked as implementation proceeds:

- **Validation corpus for eval.** We've committed to an eval harness in the `eval` scope, but the actual seed fixtures (canonical facts, contradiction cases, appropriate-invention exemplars) are TBD and will be built during the dnd5e Resolver implementation.
- **Concrete threshold values.** Priority thresholds for open-question escalation, confidence thresholds for immediate ruling surfacing, max-wait for platform downtime. Numbers get chosen empirically once we see behavior; starting values go in config with an `adjust-after-N-sessions` marker.
- **dnd5e action catalog coverage.** Which 5e actions ship in v1 (basic attack, skill check, saving throw, spell-slot-consumption, condition apply/remove, death save) versus are stubbed pending feedback. Drafted against the SRD during ingester work.
- **Recognition update triggers.** Exactly which narrative events update recognition state (explicit introduction, party-wide name reveal, prolonged interaction without name, disguise/polymorph) — gets walked through during first playtest.
