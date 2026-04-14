# Milestone 0001 — Vertical Slice (Party + Admin)

## Goal

First interactive milestone: a headless CLI harness exercising two rooms (`party-1`, `admin-1`), two scopes (`party`, `governance`/`meta`), the narrator agent, a stub dnd5e resolver, and the open-question + canonization flow end-to-end. Proves the domain pipeline before committing to Discord plumbing.

## Scope

- **Rooms**: `party-1`, `admin-1`.
- **Scopes used**: `party:party-1` (read: world ∪ party ∪ character), `governance:admin-1` + `meta:admin-1` (read: governance ∪ meta ∪ briefings from party-1).
- **Roles**: `player` in party-1 (`act:say`, `act:roll`, `act:pause`), `gm` in admin-1 (adds `canonize`, `safety:review`).
- **Verbs**: `/say`, `/roll`, `/pause`, and admin-only `/canonize <open-q-id> <decision>`.
- **Agents**: `narrator` (party), `steering-formalizer` (admin, parses freeform GM text into structured decisions).
- **Workers**: `live-responder`, `open-question-resolver`.
- **Resolver**: dnd5e agent-backed stub, skill-check only.
- **Harness**: CLI REPL with room switching; two simulated users.

Out of scope for this milestone: Discord adapter, briefings, consistency auditor, style extractor, interceptors, combat, anything beyond skill-check.

## File layout (incremental to existing tree)

```
src/
  core/
    room.ts              # Room, Role, Capability, ScopeBinding, Grant
    open-question.ts     # OpenQuestion fields on Statement
    worker.ts            # extend existing stub
    scheduler.ts         # interface
  store/
    rooms.ts             # rooms/roles/grants tables + queries
    retrieval.ts         # scope-filtered read; assembles slice for role-in-room
    vectors.ts           # embed + ANN search, scope-namespaced
  agents/
    narrator.ts
    steering-formalizer.ts
  resolvers/
    registry.ts
    dnd5e/
      agent.ts           # skill-check only
      actions.ts         # describeActions stub
  workers/
    registry.ts
    live-responder.ts
    open-question-resolver.ts
  scheduler/
    croner-impl.ts       # event-triggered workers only for now
  cli/
    harness.ts           # room-switching REPL; dev bootstrap
  models/
    registry.ts          # resolveModel per D49
test/
  integration/
    scope-isolation.test.ts
    narrator-roundtrip.test.ts
    open-question-flow.test.ts
    canonize-flow.test.ts
    safety-pause.test.ts
drizzle/                 # new migration for rooms/roles/grants
```

## Key type sketches

```ts
// core/room.ts
export const Capability = z.enum([
  "platform:notify", "act:say", "act:roll", "act:pause",
  "canonize", "safety:review",
]);
export const Role = z.object({
  id: z.string(), name: z.string(),
  capabilities: z.array(Capability),
  readScopes: z.array(Scope),
  writeScope: Scope,
});
export const Room = z.object({
  id: z.string().uuid(), name: z.string(),
  scopeBinding: z.object({
    writeTarget: Scope, readSet: z.array(Scope), emitSet: z.array(Scope),
  }),
});
export const Grant = z.object({ roomId, userId, roleId });

// core/open-question.ts — rides in Statement.fields when kind="open-question"
export const OpenQuestion = z.object({
  subject: z.string(), candidate: z.string(),
  routedTo: z.string(),
  blocks: z.array(z.string().uuid()),
  stage: z.enum(["deferred","surfaced","live","blocking"]).default("deferred"),
});
```

## Ordered tasks

Each lands as its own commit with the listed test(s).

1. **Room/role types + store.** ✅ Done. Drizzle migration for `rooms`, `roles`, `role_grants`. Seed `party-1` and `admin-1` with `player` and `gm` roles at boot.
2. **Scope-filtered retrieval.** ✅ Done. `retrieveForUserRoom` / `retrieveByScopes` enforce read-set at the store. *Test: scope-isolation (9 cases, all green).*
3. **Embeddings + vector search.** ✅ Done. `Embedder` interface, `SearchBackend` interface (with `kind` filter on `SearchOptions`), `HashEmbedder` (FNV-1a bag-of-tokens, L2-normalized, no API key), `PgvectorSearchBackend` (reuses `patternToSql`, IVFFlat cosine index), `vectors.ts` singletons + `appendAndIndex`, `LONG_CONTENT_WARN_CHARS` env, `patternToSql` exported, `StatementRow.score` field, query-based retrieval in both `retrieveForUserRoom` and `retrieveByScopes`. Smoke test refactored to `appendAndIndex`. *Test: vector-search (12 cases, all green).*
4. **Worker + Scheduler interfaces.** `CronerScheduler` with event triggers (new-statement-matching-predicate); in-process registry.
5. **Model registry.** `resolveModel("<provider>:<slug>")` per D49 — Anthropic + OpenAI wired; OpenRouter when first needed.
6. **Resolver skeleton + dnd5e skill-check.** Agent-backed, tools `roll` + `retrieve`. Returns structured `ResolveResult`. *Test: deterministic with seeded roll.*
7. **Narrator agent.** Reads slice → composes → emits `narration`/`pose`/`invention`. Invention auto-emits `open-question` routed to `gm`. *Test: narrator round-trip; invention produces open-question in admin scope.*
8. **Live-responder worker.** Event-triggered on new user statement in a party room; invokes narrator; invokes resolver if mechanical action detected.
9. **Steering-formalizer agent + open-question-resolver worker.** GM freeform decision → `authoring-decision` → resolver applies (promote / reject / supersede). *Test: full open-q flow.*
10. **`/canonize` verb.** Admin-room explicit decision (bypasses NL formalizer). *Test: party invention becomes world canon; subsequent narrator turns cite it.*
11. **`/pause` primitive.** Safety-invocation halts live-responder for that room. *Test: pause blocks subsequent narrator dispatch.*
12. **CLI harness.** REPL with `room <id>` switch; prints statements as they land, tagged by scope and kind; simulates two users.

## Exit criteria

- All five integration tests green.
- `pnpm dev` launches the CLI harness; scripted session: player `/say` → narrator invents → open-question appears in admin pane → admin `/canonize` → next narrator turn cites it as canon.
- No cross-scope leakage in any prompt assembly — asserted by scope-isolation test plus a prompt-capture fixture.

## Relationship to other docs

- `implementation.md` — this milestone populates the first concrete pieces of the layout defined there.
- `rooms-and-roles.md` — the `player`/`gm` pair is the simplest instance of the general room/role model.
- `runtime-and-processing.md` — live-responder and open-question-resolver are the first two workers; tier-0 scheduler.
- `rules-resolution.md` — the dnd5e Resolver here is the contract's first implementation, skill-check only.
- `consent-and-safety.md` — `/pause` is the v1 primitive for this milestone.
