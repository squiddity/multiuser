# Memory Architecture

## Purpose

Define the storage substrate for cross-session narrative memory and operational/relational state. Replaces the prior single-Postgres-with-pgvector design.

## Stack

| Concern                            | Substrate                                                                                       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| Narrative memory (source of truth) | Markdown files under `$MEMORY_ROOT/`                                                            |
| Memory index (rebuildable)         | [memsearch](https://github.com/zilliztech/memsearch) — Milvus Lite + ONNX `bge-m3` embeddings   |
| Relational/operational state       | SQLite via `@libsql/client` + Drizzle (`drizzle-orm/libsql`)                                    |
| Agent retrieval                    | `pi-coding-agent` sessions invoking memsearch through a constrained Bash tool + markdown skills |
| Python toolchain                   | Project-local `.venv/` managed by `uv` (see `docs/python-environment.md`)                       |

No managed services. Everything is a file on disk. The only daemon outside the Node process is `memsearch watch`, which the app supervises.

## Invariants

1. **Markdown is canonical for narrative memory.** Transcripts, briefings, and derived documents are human-editable markdown. Milvus Lite is a derived cache; deleting it is non-destructive.
2. **SQLite is canonical for operational state.** Rooms, role grants, mappings, schedules, workflow sessions, and audit-grade statements (governance, mappings, rulings, open-questions, eval, decision) live here. Single file at `$SQLITE_URL`.
3. **One channel = one transcript stream.** Each `(roomId, channel)` pair owns one daily file with `<!-- session:UUID -->` anchors. Channels are `narration`, `party-chat`, `steering`.
4. **Agents retrieve via skills, not framework injection.** Narrators and processors invoke `memsearch search` through Bash; they are not pre-loaded with a context window of statements. This is what makes cross-session recall scale.
5. **Vector data does not leak into SQL.** SQLite has no `vector` extension and no `embedding` column. The memory layer owns embeddings.

## Filesystem layout

```
$MEMORY_ROOT/
  transcripts/<roomId>/narration/YYYY-MM-DD.md
  transcripts/<roomId>/party-chat/YYYY-MM-DD.md
  transcripts/<roomId>/steering/YYYY-MM-DD.md
  briefings/<adminRoomId>/YYYY-MM-DD-<sessionId>.md
  derived/<agentName>/...                # any agent-authored output
  index/                                 # memsearch's data dir (milvus.db + config.toml)
```

Each transcript file has the shape:

```markdown
# narration — room <roomId> — 2026-05-08

<!-- session:<uuid> start=<iso> -->

## Session HH:MM

[<iso>] @alice: I draw my dagger.
[<iso>] _narrator_: The blade catches the lantern light.

<!-- session:<uuid> end=<iso> -->
```

## Components landed in Phase 0–1

- **`src/store/client.ts`** — libsql client + Drizzle. Exports `db`, `client`, `ping`, `close`, `pragmas`.
- **`src/store/schema.ts`** — sqlite-core schema. Text UUIDs, integer timestamps, JSON-mode text columns for arrays/blobs. No `vector` type, no `embedding` column.
- **`src/store/migrate.ts`** — raw SQLite DDL with `IF NOT EXISTS` guards. Idempotent; safe to call on every boot and from test `beforeAll`.
- **`src/store/markdown/paths.ts`** — path helpers anchored at `$MEMORY_ROOT`.
- **`src/store/markdown/transcript-writer.ts`** — per-`(roomId, channel)` writer; `start()` / `append()` / `end()`.
- **`src/store/markdown/transcript-registry.ts`** — process-local map of writers.
- **Dual-write taps**: `src/agents/narrator.ts` (narration channel) and `src/adapters/discord/party-turns.ts` (party-chat channel) write to both SQLite statements **and** transcript markdown. Steering tap is pending Phase 1 closure.
- **`.pi/skills/memsearch.md`**, **`.pi/skills/transcripts.md`** — skill markdown for future agent use.
- **`docker/compose.yml`** and **`docker/compose.api-test.yml`** — app-only stacks; named volume on `/data`; `SQLITE_URL=file:/data/multiuser.sqlite`, `MEMORY_ROOT=/data/memory`.

## What stays in SQLite

Operational and audit-grade rows. Statement kinds with persistent semantics:

`mechanical`, `ruling`, `open-question`, `authoring-decision`, `governance`, `mapping`, `safety-invocation`, `steering`, `steering-request`, `interception`, `eval`, `reaction`, `decision`, `command-query`.

Plus tables: `rooms`, `roles`, `role_grants`, `mappings`, `schedules`, `workflow_sessions` and friends.

## What is migrating to markdown-only (in progress)

Statement kinds that are pure narrative content:

`narration`, `dialogue`, `pose`, `inner-monologue`, `private-message`, `invention`, `canon-reference`, `briefing`.

Phases 1–4 dual-write these to markdown. Phase 5 stops writing them to SQLite.

## Configuration

```bash
# Filesystem roots
SQLITE_URL=file:./data/multiuser.sqlite
MEMORY_ROOT=./data/memory

# Memsearch (Phase 2+)
MEMSEARCH_BIN=                       # default: ./.venv/bin/memsearch
MEMSEARCH_CONFIG_DIR=./data/memory/index
MEMSEARCH_EMBEDDING_PROVIDER=onnx
MEMSEARCH_MILVUS_URI=                # blank → Milvus Lite
```

`DATABASE_URL`, `EMBED_MODEL`, `EMBED_DIM`, `LOG_DB_NOTICES` are removed.

## Phasing

### Phase 0 — Postgres → SQLite (✅ shipped, PR #9)

- Drizzle dialect swap (`drizzle-orm/libsql`).
- `migrate.ts` rewritten as raw SQLite DDL; `seed.ts` rewritten in Drizzle ORM.
- All vector/embedding paths deleted (`HashEmbedder`, `PgvectorSearchBackend`, `vectors.ts` reduced to a shim).
- env vars renamed; CI compose files ported; postgres-init.sql deleted.

### Phase 1 — Python venv + transcripts on disk (✅ shipped, PR #9)

- `pyproject.toml`, `.python-version`, `scripts/setup-python.sh`; `pnpm postinstall` hook bootstraps `.venv/`.
- Transcript writer/registry; dual-write taps in narrator and party-turns.
- Initial skill markdown files committed under `.pi/skills/`.
- **Pending closure**: steering channel tap (admin-room messages → `transcripts/<roomId>/steering/<date>.md`); session-bracket hooks at `src/models/session-runtime.ts` `getOrCreateSession` and `destroySession` to call `TranscriptWriter.start/end`.

### Phase 2 — Memsearch indexing + watcher (next up)

- Add `MemsearchWatcher` daemon in `src/workers/memsearch-watcher.ts`. Spawn `memsearch watch $MEMORY_ROOT` at boot; supervise with exponential backoff.
- One-time `memsearch config init` + `memsearch config set` on first boot (idempotent).
- Optional daily `memsearch index --force` via `CronerScheduler` as a safety net for missed file events.
- World canon (`world/`) included in watch paths.
- **Verify**: emit a known phrase in a session; `.venv/bin/memsearch search "..." --json-output` returns a hit within seconds.

### Phase 3 — pi-coding-agent + skills + constrained Bash

- Add `@earendil-works/pi-coding-agent` dependency.
- Build `src/agents/tools/constrained-bash.ts`: replaces the built-in `bash` tool. Allow-lists leading tokens (`memsearch`, `cat`, `head`, `tail`, `ls`, `rg`, `jq`); validates write paths against `$MEMORY_ROOT/derived` and `$MEMORY_ROOT/briefings`; prepends `<repo>/.venv/bin` to `PATH`. Path arguments outside allowed roots are rejected before exec.
- Build `src/agents/pi-coding-agent-session.ts`: factory that creates a `pi-coding-agent` session with the constrained bash tool and `.pi/skills/` loaded.
- Rewire `src/agents/narrator.ts`: replace the direct `LlmRuntime.generate` call paths with a `pi-coding-agent` session whose tools are `['bash']` (constrained). Drop `retrieveForUserRoom` from `buildContext` — the agent fetches its own context via memsearch.
- `listActiveSteeringFor` stays — formalized steering directives are operational, not memory.
- **Verify**: session A narrates a distinctive event; session B asks about it; transcript shows the narrator running `memsearch search` via bash and citing the result. Forbidden commands (`rm -rf …`) are rejected and the agent recovers.

### Phase 4 — Transcript processor + briefing migration

- Build `src/agents/workflows/transcript-processor.ts`: a `pi-coding-agent` session with `['bash', 'write']` (write constrained to `$MEMORY_ROOT/derived` and `$MEMORY_ROOT/briefings`). Skills: `memsearch.md`, `transcripts.md`, plus a new `derived-documents.md` describing where to write what.
- Trigger on session-end and on a `CronerScheduler` cadence.
- Output briefings to `briefings/<adminRoomId>/YYYY-MM-DD-<sessionId>.md` instead of `kind:'briefing'` rows.
- Delete `src/workers/briefing-generator.ts` and its tests.
- **Verify**: run two sessions; briefing markdown appears; memsearch indexes it; subsequent narrator session recalls.

### Phase 5 — Cleanup

- Stop dual-writing memory kinds (`narration`, `dialogue`, `pose`, `invention`, `canon-reference`, `inner-monologue`, `private-message`) to SQLite. Markdown-only.
- Remove dead vector-search code paths in `src/store/`.
- Update `docs/statement-store-abstraction.md` to reflect SQLite's narrowed role (operational only).

## Open questions (defer per phase)

- Constrained-bash allow-list final scope: starting set is `memsearch,cat,head,tail,ls,rg,jq`. May need `mkdir`, `tee` once `TranscriptProcessor` write needs settle.
- Whether `pi-coding-agent`'s `SessionManager` JSONL tree should replace `pi-agent-core`'s session model, or stay layered. Default: keep `pi-agent-core` and use `SessionManager.inMemory()` per turn for now.
- Whether to mirror world canon (`world/`) into the memsearch index. Likely yes; add to Phase 2 watch paths.
- A `dice.md` skill is a candidate for milestone 0004 (RPG Mechanics) rather than this refactor.

## References

- memsearch CLI: <https://zilliztech.github.io/memsearch/cli/>
- pi-coding-agent: <https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent>
- uv: <https://docs.astral.sh/uv/>
