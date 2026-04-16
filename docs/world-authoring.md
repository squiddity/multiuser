# World Authoring & Campaign Bootstrap

## Purpose

Define how world content enters the system: rulebooks, fictional source material, initial setting seeds, style/tone references, and ongoing out-of-band updates. Specifies a single ingestion pipeline that serves several lanes (world lore, rules systems, style), a concrete **bootstrap flow** for standing up a new campaign quickly from natural-language source material, and the conflict-resolution path when authored content meets play-derived canon.

## Canon sources, unified

Canon has three sources. All three produce statements in canon scopes; the difference is provenance, not data shape.

- **Seed authoring** — content imported before or between sessions: rulebook text, fiction corpus, world bible, style guides. Provenance `seed:<source>#<chunk>`.
- **Play-invented canon** — inventions produced in-session, promoted via the canonization pipeline in `memory-model.md`. Provenance points at the originating statement and the canonization event.
- **Steering-generated canon** — decisions authored by privileged rooms (GM, cabal, pantheon) per `rooms-and-roles.md`. Provenance points at the emitting room and the steering record.

Because all three produce the same kind of statements in the same scopes, retrieval doesn't care where a fact came from — but the source is always recoverable.

## Ingestion pipeline

A single pipeline serves every seed lane. One worker — call it the **ingester** — consumes source material and emits statements.

### Input types

- **Local files** in a `world/` (or equivalent) directory: markdown, plain text, structured YAML / JSON for entities.
- **URLs** fetched on demand (5esrd.com, Project Gutenberg, public wikis).
- **Uploaded documents** submitted through an admin surface (file upload slash command, admin room attachment).
- **Interactive authoring** from an admin / governance room conversation — the admin agent drafts statements which the admin confirms.

Regardless of input, the ingester's job is the same: chunk, classify, attribute, embed, emit.

### Lanes

Each input declares or is inferred to be one of:

- `rules:<system>` — rulebook text for a Resolver (see `rules-resolution.md`).
- `world` — lore, geography, factions, history, canonical entities.
- `style` — tone, voice, recurring motifs, visual guide.
- `rules:<system>:house` — campaign-specific rule modifications (produced mainly from promoted rulings, but can be authored directly).

An input may contribute to multiple lanes — a fiction corpus contributes to both `world` (as lore) and `style` (as voice reference).

### Two content tiers

- **Structured entities.** NPCs, locations, factions, items, deities — anything with a stable identity we want to reference by name and autocomplete. Stored in the entity/graph store plus a backing statement with structured fields.
- **Freeform passages.** Lore descriptions, rulebook prose, fiction excerpts, tonal examples. Stored as statements with embeddings for vector retrieval; chunked so each chunk is retrievable independently but back-pointed to the full source.

A single seed document typically produces both: structured entities extracted from the text, plus the passages themselves retained for context.

### Provenance

Every seed statement records:

- `source` — file path, URL, or upload id.
- `chunk` — location within the source (line range, section anchor, page).
- `license` — the declared license of the source (see below).
- `ingested_at` — timestamp, with `ingested_by` for the admin who triggered it.

Supersedes chains handle edits and replacements: re-ingesting an updated rulebook produces new statements that supersede the prior ones rather than overwriting.

## Rights & licensing

Ingestion requires an explicit license declaration per source. The pipeline is strict:

- **Public domain** (Project Gutenberg, works past copyright): accepted.
- **Permissive licenses** (CC-BY, OGL-covered SRDs): accepted; attribution statements are generated and stored alongside.
- **User-supplied license claim** (the admin asserts they have the right to ingest): accepted with the admin's identity on the provenance, usable in that admin's deployment only.
- **Unknown / unclear**: refused; the admin is prompted to resolve.

Attribution statements are visible to consumers of the canon — a player who queries a lore entry derived from an Oz novel can learn that it's seeded from Baum's originals.

## Style extraction from fiction

When a fiction corpus is ingested, a dedicated **style extractor** agent reads across the corpus and proposes style statements summarizing voice, pacing, diction, recurring motifs, content affordances and boundaries. Properties:

- The style extractor's output is itself a set of statements in the `style` scope, each with back-pointers to the passages that informed it.
- Output is reviewed in the admin / planning conversation before it becomes active. Automatic acceptance would let a single corpus hijack the campaign's voice.
- Style statements are read by every agent turn — narrator, briefing generator, media-gen worker (when that ships) — so voice remains consistent.

The corpus itself is _also_ retrievable as `world` lore, so concrete details from the source stay available alongside the extracted style.

## Bootstrap flow (standing up a campaign fast)

The target user journey: an admin arrives with a rules system, a fictional source, and an idea. A compelling campaign is ready to play in under an hour. The flow runs inside a dedicated **planning room** with an authoring-role admin and the world-author agent.

### Stage 1 — Declare inputs

The admin specifies:

- A rules system, by URL (e.g. `https://5esrd.com`) or uploaded document, with a license claim.
- One or more fiction sources, by URL or upload, with license claims.
- A campaign concept in one to three sentences ("Oz, a generation after Dorothy; the Emerald City has industrialized and the old magic is returning").

### Stage 2 — Ingest

Ingester workers run in parallel:

- Rulebook → `rules:<system>` scope; the Resolver for that system is instantiated and ready.
- Fiction corpus → `world` scope (lore + structured entities for named characters, places, artifacts) + style extractor run over the corpus.
- Campaign concept → held as an authored statement in the admin room, used as the frame for subsequent stages.

Progress is reported live in the planning room. Admin can proceed to the next stage as soon as any one lane is ready; others catch up in background.

### Stage 3 — Review & refine

The world-author agent presents:

- The structured entities extracted from the fiction, grouped by kind, with the admin able to edit, drop, merge, or promote to canonical via UI (see `ui-and-interactions.md`).
- The proposed style statements with representative excerpts, editable inline.
- A proposed initial setting anchored on the campaign concept — where the first party starts, what's in view, which source-fiction elements are present vs. altered vs. absent.

This stage is where **divergence from source** is declared: the campaign is seeded by the fiction but not bound to it. The admin marks which source events are "true in this campaign" vs. "did not happen here" vs. "happened differently" — these declarations become canon statements with explicit supersedes over the raw-source lore.

### Stage 4 — Seed the opening

The world-author agent drafts:

- One to three initial party-ready scenes (hooks, scene frames, starting NPCs).
- A short author's-note statement describing the campaign's starting posture, readable by any GM or cabal role.
- Optional house rules suggested from the campaign concept (e.g. "Oz-style magic: color-coded schools" becomes a proposed `rules:dnd5e:house` statement).

Admin approves, amends, or rejects each proposal. Approved items become canon; amended items become canon with the admin's edit as the authoritative version; rejected items are discarded.

### Stage 5 — Instantiate rooms

The admin (or agent, via the platform-adapter capability) creates the initial rooms: one or more party rooms, a GM or cabal room, any meta rooms the structure calls for. Players are invited; membership and roles are assigned.

At this point the deployment is campaign-ready. First play session can begin; open questions, inventions, and steering records start flowing immediately.

### Bootstrap time budget

Tier-0 deployment (in-process, small corpus): end-to-end under an hour, most of it bounded by review time rather than compute. A 5e SRD ingestion plus a single-novel fiction corpus is well within this. Larger corpora (full Oz shelf, multi-novel series) run longer and should be kicked off in stage 1 and allowed to complete in background while stages 3-5 proceed.

## Ongoing out-of-band updates

After bootstrap, world content continues to evolve outside play sessions.

- **File-based edits.** Changes to files under `world/` are detected by the ingester watcher and reconciled — new statements with supersedes chains, not in-place mutations.
- **Admin-room authoring.** An admin conversation with the world-author agent produces draft statements; admin approval promotes them to canon.
- **Rulebook revisions.** Errata updates or house-rule additions follow the same ingestion path; statements supersede the relevant prior chunks.
- **Style adjustments.** The admin can issue style directives ("dial the whimsy down one notch") that the style extractor converts to style-statement updates.

All updates are governance events with full provenance; nothing happens silently.

## Conflict with play-invented canon

Out-of-band updates may contradict canon produced in play. This is not an error; it's a conflict to resolve through the existing machinery.

- **Detection.** The consistency auditor (see `runtime-and-processing.md`) flags contradictions between a new seed statement and existing play-derived statements in the same scope.
- **Resolution via open questions.** Each contradiction becomes an open question routed to the appropriate authoring role (typically the GM or cabal whose party holds the play-derived statement). Options: accept the seed update (supersede the play-derived statement, notify affected parties), reject the seed update (retract or retire the seed statement), or reconcile (author a bridging statement that makes both fit).
- **No silent overwrites.** A seed update never silently replaces a play-invented fact, even though admins might prefer that for convenience — it would break narrative trust across sessions. The admin can choose to force-accept, but the event is logged and (for in-fiction rooms) may be rendered as a meta-narrative disruption ("the timeline shifted").

## Fiction-as-seed divergence

Seed from a fiction source is explicitly not binding. The source's plot, characters, and events are **priors**, not canon, until declared canon for this campaign. The ingester is instructed to produce lore statements flagged `source-declared` — they are retrievable, informative, and citeable as style / lore, but a `source-declared` lore statement carries lower precedent than a `canon` statement produced through bootstrap review or play.

This distinction matters for retrieval: when a player's action would interact with something the source fiction says, the agent checks whether the campaign has declared the source's version as canon. If not, the agent treats it as open — possibly inventing (and emitting an open question), possibly deferring to an authoring role.

## Reuse across campaigns

Rulebooks and fiction corpora are expensive to ingest. Reuse patterns:

- **Shared rulebook scope.** `rules:dnd5e` can be a deployment-wide scope, referenced by every campaign using 5e. House rules (`rules:dnd5e:house`) remain per-campaign.
- **Corpus forks.** A campaign-specific copy of a fiction corpus allows divergence declarations without affecting another campaign using the same source. The default is copy-on-write: the shared corpus is the substrate, divergence statements are per-campaign overlays.
- **Style inheritance.** A campaign can inherit from a base style (derived from the Oz corpus) and layer campaign-specific adjustments without rewriting the base.

## Relationship to other docs

- `memory-model.md` — canon / party / character / session / governance scopes, plus `rules:*` and `style` introduced here.
- `rooms-and-roles.md` — the planning / admin room is a concrete instance of an authoring room; bootstrap actions are workflow capabilities on the admin role.
- `platform-adapter.md` — bootstrap stage 5 uses `platform:create-room`, `platform:configure-membership`, `platform:organize`; the ingester's URL fetching is a platform-agnostic capability sitting alongside the adapter.
- `runtime-and-processing.md` — the ingester and style extractor are workers; out-of-band watchers are event-triggered; long bootstrap jobs are tier-3 candidates when corpora grow.
- `rules-resolution.md` — rulebook seeding populates `rules:<system>` for the Resolver; house rules accrue via rulings promoted to `rules:<system>:house`.
- `ui-and-interactions.md` — bootstrap stage 3 review UI (entity editor, style editor, scene approval buttons).

## Open questions

- How are large corpora ingested efficiently — streaming chunk-by-chunk with progressive availability, or fully ingested before any retrieval? (Leaning: streaming with a `partial` flag until complete.)
- Style extraction is an agent with its own failure modes; do we version style statements per extraction run and allow rollback, or treat later extractions as supersedes?
- What's the minimum metadata the admin must supply per source (license, era, genre, preferred tone) for the pipeline to behave well? And what can we infer?
- Can a campaign pull seed updates from an upstream source without re-doing the review stage, or does every update require admin approval? (Safer: always require approval, but allow batching.)
- For cross-campaign reuse, who authorizes forking a shared corpus or sharing a house-rule set — the source campaign's authoring role, a deployment-level operator, or both?
