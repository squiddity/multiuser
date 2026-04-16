# Memory & Narrative Consistency Model

## Purpose

Define how the system stores, retrieves, and enforces consistency of narrative content across many independent user groups sharing a single agent-authored fictional world. The driving use case is agent-run tabletop RPGs (e.g. D&D 5e): one agent, one world, many parties — each party experiences its own slice, but the world they inhabit must remain internally consistent forever.

The central tension: **the agent must be globally consistent about the world, while no party may learn what another party has experienced.**

## Domain model

- **World** — the shared fiction. One per deployment (initially). Holds canonical lore, NPCs, geography, rules, and the agent's authorial voice.
- **Party** — a group of users sharing an ongoing narrative thread (one Discord channel ≈ one party in the v1 mapping). Experiences are scoped to the party.
- **Character** — an in-world persona, owned by exactly one user and belonging to exactly one party. Private character knowledge (a secret whispered to one player) is scoped to the character.
- **Session** — a bounded play interval within a party (one sitting). Sessions compose into a party's history.
- **Statement** — the smallest addressable narrative unit: a single agent narration, a single player declaration, a single ruling. Every statement has a stable identity, authorship, timestamp, and scope.

## Memory scopes

Memory is partitioned into concentric scopes. Reads are **scope-union**: a read within a party can see world + party + (optionally) character. Writes target exactly one scope.

| Scope                   | Visibility                            | Example                                                                |
| ----------------------- | ------------------------------------- | ---------------------------------------------------------------------- |
| **World canon**         | All parties (via the agent)           | "The city of Vhaeran sits on the Ember Coast."                         |
| **Party experience**    | One party only                        | "Party A met the blacksmith Joren and learned he fences stolen goods." |
| **Character private**   | One character only                    | "Only Lyra knows the password is 'moonfall'."                          |
| **Session working set** | One session (ephemeral / compactable) | In-flight turn state, dice outcomes, initiative order.                 |

An agent prompt for a given turn is assembled from a **scope filter** (world ∪ party ∪ active-character) plus retrieved items from each, never a global slurp.

## Canon vs. experience

The sharpest rule in the model. A fact can exist in two different states:

- **Canon** — true in the world regardless of observation. The agent may reference it freely anywhere.
- **Experience** — a party's knowledge of a canon fact (or of an invented detail). The agent may only narrate what a party has experienced _to that party_.

When the agent invents a new detail mid-narration ("the blacksmith's left hand is scarred"), it is written as **party experience** by default. Promotion to **world canon** is an explicit step (see pipeline below). This keeps each party's discoveries theirs, while letting the world grow coherently.

## Statement-level addressability

Every statement is stored as its own record, not merely as a line in a transcript blob. Minimum fields:

- `id` — stable, globally unique
- `scope` — world / party / character / session (and the scope key)
- `author` — agent turn-id, or user-id
- `kind` — narration, dialogue, ruling, mechanical (roll/result), system
- `created_at`, `supersedes` (for retractions/edits), `sources` (retrieved memory ids used to produce it)
- `content` — text + attachments
- `embeddings` — one or more vector representations (see below)

This enables:

- **Citation** — the agent can point at the exact prior statement that grounds a claim.
- **Retraction** — a DM override can supersede a statement without rewriting history.
- **Replay / audit** — reconstruct any past prompt deterministically from statement ids.
- **Provenance on invention** — every invented detail is traceable to the turn that introduced it.

## Vector search layering

Vector search is necessary but insufficient alone — raw similarity across a shared store would leak party experience across parties. The pattern:

1. **Scope-filtered retrieval.** Every query carries a scope predicate (`world` OR `party=P` OR `character=C`). The vector index must support metadata filtering as a first-class operation, not a post-filter.
2. **Per-scope indexes (or per-scope namespaces within one store).** World canon, each party's experience, and each character's private memory live in separate logical indexes. A single query fans out to the permitted scopes and merges.
3. **Tiered retrieval.** Combine:
   - **Symbolic lookup** for entities the current turn explicitly names (NPC id, location id) — authoritative, cheap.
   - **Vector similarity** over statements and distilled summaries for contextually relevant but unnamed material.
   - **Graph traversal** over entity relationships (NPC → faction → location) when reasoning requires connective tissue.
4. **Summarization as compression, not replacement.** Long histories are compacted into running summaries per scope, but raw statements remain addressable. Summaries carry back-pointers to the statements they compress so citation never breaks.

## Invention → canonization pipeline

Agents invent detail on the fly. Without structure, inventions either (a) contradict later narration or (b) leak between parties. Pipeline:

1. **Invention** — agent writes a new fact as a statement in **party experience** scope, tagged `kind=invention`.
2. **Reinforcement** — repeated, consistent use within the party solidifies it as party headcanon.
3. **Canonization (explicit)** — a review step (automated heuristic, author-user, or DM role) promotes the fact to **world canon**. Promotion rewrites the scope of a _canonical_ record; the original party statement remains as the provenance.
4. **Conflict detection** — before invention is accepted, the agent queries world canon for contradictions. A conflict triggers either (a) reuse of the existing canon, or (b) a branch requiring resolution.

## Consistency across parties

Agent behavior when narrating to Party A about something Party B has also touched:

- The agent may reference **world canon** — including NPCs, locations, and events that exist in canon regardless of who discovered them.
- The agent may **not** reveal Party B's specific experiences, choices, or private knowledge to Party A.
- If Party A independently encounters an NPC Party B knows, the agent narrates from **canon facts + Party A's own fresh observations**, not Party B's relationship history.
- Invented details created during Party B's play do not enter Party A's world unless canonized.

## Authorization & leakage prevention

- **Scope is enforced at the retrieval layer**, not only at the prompt-assembly layer. A bug in prompt assembly must not be able to request cross-party data — the store refuses.
- Every read is logged with (requester scope, returned ids, returned scopes) for audit.
- Tool invocations inherit the caller's scope; a tool cannot read or write outside it without an explicit privileged capability.
- Embeddings themselves can leak content via similarity. Cross-scope similarity queries are disallowed; no global "nearest neighbor across all parties" operation exists.

## User–character relationship

Character scope is not simply "the user's own data" — user and character are distinct identities with an N-to-M relationship, and the retrieval layer must narrow the character scope per-user at read time.

### Resolvers

Two queries express the binding:

- `getActingCharacter(userId, roomId) → characterId | null` — the character the user is currently speaking _as_ in this room. Drives retrieval narrowing and write attribution. Null means the user plays no character here.
- `getCharactersForUser(userId, roomId) → characterId[]` — every character this user may read private scope of (primary-owned + delegated). Used by UI surfaces (`/act-as` autocomplete, character-sheet picker) and by admin tools.

Wildcard character patterns (`{type:'character'}` with no id) in a room's readSet are legitimate declarations — they say "this room may see character scope." The retrieval layer narrows them to the current user's _active_ character at query time. A wildcard without an active character resolves to no rows; it never expands to all characters.

### Acting-as

The currently-acting character is itself a statement (`kind=acting-as`, supersedes chain). Consequences:

- Replay is deterministic; past prompts can be reconstructed with the correct active character at that moment.
- `/act-as <character>` emits an `acting-as` statement superseding the prior one.
- No separate "session state" layer — the statement store remains the single source of truth.

### Attribution and provenance

When user U acts as character C, the statement records `authorId = U` with `fields.asCharacter = C`. The real author is never lost. Rendering in-channel may use the character's name and webhook identity, but the audit record always points back to the human.

### v1 vs. future

- **v1** — implicit single character per user per party (the primary ownership grant). `getActingCharacter` returns that character; `getCharactersForUser` returns `[characterId]` or `[]`. No `/act-as` surface yet.
- **Multi-character per user (deferred)** — a user may own or be delegated onto multiple characters in the same party or across parties. `/act-as <character>` switches the active character within a room. Reads are active-only by default; a user juggling characters sees exactly one character's private scope at a time (matches the per-character recognition model).
- **Admin impersonation (deferred, two flavors)**:
  - _Admin-as-character_ — an admin or co-GM is delegated onto a PC or NPC and acts as that character. Cheap extension of the same mechanism; `authorId` is the admin, `asCharacter` is the PC. Audit trail intact.
  - _Admin-as-user_ — ghostwriting another human's messages. Rarer, ethically thornier. A separate capability (`impersonate:user`) with explicit disclosure rules; not in v1.

### Leakage rule

Active-only retrieval is the safety stance: a user with two characters does not accidentally cross-read them. A future `/remember-also <character>` could union in additional character scopes by explicit action, but the default is strict.

## Retention

Memory is designed to be **retained indefinitely by default** — narrative consistency requires it. User-initiated deletion and platform-mandated removal are supported via:

- **Tombstoning** a statement (content removed, id + scope + supersedes-chain preserved) so downstream references don't dangle.
- **Cascade rules** per scope: deleting a character may leave party-visible statements intact but strip private-character records.
- Canonized facts may survive the deletion of the statement that originated them (the fact is now the world's, not the player's) — this should be surfaced to users at character creation.

## Storage sketch (implementation-agnostic)

- A **statement store** (append-only, addressable by id) — relational or document DB.
- A **vector index** with metadata filtering and per-scope namespaces.
- An **entity/graph store** for canonical entities and their relationships.
- A **summary store** keyed by (scope, time-window) with back-pointers to statements.

Any framework we adopt must either provide these as composable primitives or not obstruct us building them underneath.

## Feedback into framework evaluation

This model sharpens the criteria in `framework-evaluation.md`:

- **Memory partitioning** becomes a hard requirement: scoped namespaces with metadata-filtered retrieval, not a single shared store.
- **Statement-level addressability** requires that the framework not hide turn history behind an opaque "conversation" object — we need the records.
- **Tool-scoping** must be enforceable, since tools will read/write memory.
- **Authorial promotion** (canonization) is an application-layer workflow; the framework should not fight it.

## Open questions

- Single world per deployment, or multi-world (each world a tenant) from the start?
- Who holds the canonization authority — an automated rule, a human DM role, the owning user, or the agent itself with review?
- How do we represent rules systems (D&D 5e mechanics) — as tools, as retrieved reference text, or as a structured knowledge base the agent queries?
- Do characters persist across parties (a player could bring Lyra into a new campaign), or is identity party-bound?
- How much of the session working set is worth persisting vs. discarded on session close?
