# Implementation

## Purpose

Fix the concrete stack, component topology, and code layout for v1. Everything above (memory model, rooms and roles, runtime, platform adapter, UI, rules resolution, world authoring, MUD adoptions, consent and safety) is domain vocabulary and behavior; this doc says what we type and where.

## Stack

- **Language: TypeScript** (Node 20+). Single language end-to-end; Discord ecosystem fit.
- **Agent runtime: pi SDK components (`@mariozechner/pi-ai`, `@mariozechner/pi-agent-core`) behind local interfaces.** Use pi for model/provider resolution, tool-call loop execution, streaming events, and per-turn usage/cost accounting.
- **Domain types and canonical state remain local.** The statement store is authoritative; pi runtime state is reconstructable/ephemeral. Runtime swap remains possible in principle.
- **Storage: PostgreSQL 16+** with the **pgvector** extension. JSONB for flexible statement fields.
- **DB access: Drizzle** (typed query builder, migrations, pairs well with Zod).
- **Discord: discord.js v14+**. Gateway, interactions, webhooks, REST.
- **Validation: Zod now, TypeBox target.** Existing boundaries use Zod; migration planning targets TypeBox for schema portability and closer alignment with pi ecosystem tooling.
- **Scheduler (tier 0): `croner`** + in-process worker registry behind a `Scheduler` interface. Keeps Temporal / Inngest swap open.
- **Observability: `pino`** structured logs; OpenTelemetry added at tier 2.
- **Testing: Vitest** (unit + integration). Fixtures live as seed statements in a dedicated `eval` scope.
- **Dev: Docker Compose** (Postgres, pgadmin optional, service container). Single-process Node for v1 prod.

## Model providers

- **Per-agent model selection** via `resolveModel(spec)` in `src/models/registry.ts`. Spec is a provider-prefixed string: `"<provider>:<slug>"`, e.g. `openrouter:qwen/qwen-2.5-72b-instruct`, `anthropic:claude-opus-4-6`, `openai:gpt-4o-mini`.
- **Agent definitions own their model choice.** No logical aliases ("cheap"/"premium"); each agent/role declares the spec appropriate for its job. A scheduled consistency reviewer that needs a large context window for daily digests and a chat-path narrator are separate declarations — they may sit on different providers and different slugs independently.
- **Supported providers**: OpenRouter (`@openrouter/ai-sdk-provider`), Anthropic (`@ai-sdk/anthropic`), OpenAI (`@ai-sdk/openai`). Keys are optional — only providers referenced by registered agent specs must be configured; `resolveModel` throws at resolution time if the required key is missing.
- **Embeddings**: OpenAI `text-embedding-3-small` (1536 dim) initially; swap when cost/privacy pressure warrants.

## How pi SDK components fit

- **`pi-ai`** provides provider/model abstraction, streaming primitives, cross-provider context continuity, and usage/cost metadata.
- **`pi-agent-core`** provides the turn loop, tool execution lifecycle events, steering/follow-up controls, and session-aware request metadata.
- **Local interfaces (`LlmRuntime`, `StatementStore`)** isolate worker and agent code from concrete implementations.
- **Statement store stays authoritative.** Canonical memory, scopes, provenance, and governance decisions remain in Postgres through our own store contracts.
- **Markdown instructions are first-class configuration artifacts.** Agent behavior and resolver policy live in markdown data where possible; security and scope invariants stay in code.
- **Future option:** selective adoption of `pi-coding-agent` remains open (especially session compaction hooks/extensions) without changing canonical-store authority.

## Component topology

```
┌──────────────────────────────────────────────────────────────┐
│  Discord gateway + REST (discord.js)                         │
├───────────────────────┬──────────────────────────────────────┤
│  DiscordAdapter       │  impl of PlatformAdapter interface   │
├───────────────────────┤                                      │
│  ┌─────────────────┐  │  • commands, components, webhooks   │
│  │ Interaction     │  │  • desired-state reconciler         │
│  │ handlers        │  │  • drift auditor                    │
│  └────────┬────────┘  │                                      │
└───────────┼───────────┴──────────────────────────────────────┘
            │
            ▼  Statement emissions + scope-filtered reads
┌──────────────────────────────────────────────────────────────┐
│                    Statement Store (Postgres)                │
│  statements • scopes • entities • mappings • governance      │
│  pgvector indexes per scope-namespace                        │
└──────────────────────────────────────────────────────────────┘
            ▲                               ▲
            │                               │
┌───────────┴───────────┐       ┌──────────┴──────────────┐
│  Worker registry      │       │  Resolver registry       │
│  (Zod-typed fns)      │       │  (per rules system)      │
│  • live-responder     │       │  • dnd5e (agent-backed) │
│  • briefing-generator │       │  • future: pf2e, ...     │
│  • ingester           │       └──────────────────────────┘
│  • style-extractor    │
│  • consistency-audit  │
│  • open-q-resolver    │
│  • reconciler         │
│  • interceptors       │
└──────┬────────────────┘
       │
┌──────┴──────────────────┐   ┌──────────────────────┐
│  Scheduler interface    │   │  pi-ai + pi-agent-   │
│  Tier 0: croner impl    │   │  core runtime layer  │
│  Tier 3 (later): Temporal│  │  (via LlmRuntime)    │
└──────────────────────────┘   └──────────────────────┘
```

Every arrow is schema-typed (Zod now, TypeBox migration planned).

## Directory layout

```
src/
  core/                 # domain types; no framework imports
    statement.ts        # Statement schema, kinds, scope types
    room.ts             # Room, Role, ScopeBinding
    embedder.ts         # Embedder interface
    search.ts           # SearchBackend interface, SearchResult
    resolver.ts         # ResolveRequest/Result contracts
    worker.ts           # Worker interface + registry type
    scheduler.ts        # Scheduler interface
    llm-runtime.ts      # LLM runtime abstraction boundary
    statement-store.ts  # Canonical statement-store abstraction boundary
  store/                # Postgres + pgvector
    schema.ts           # Drizzle schema
    statements.ts       # append, read, scope-filtered query
    retrieval.ts        # scope-filtered read; patternToSql; query-based ANN
    vectors.ts           # appendAndIndex, embedder/backend singletons
    embedders/
      hash.ts           # HashEmbedder (FNV-1a bag-of-tokens, dev/CI)
    search/
      pgvector.ts       # PgvectorSearchBackend (scope + ANN via <=>)
    characters.ts       # stub v1 (getActingCharacter → null)
    rooms.ts             # rooms/roles/grants queries
    seed.ts              # dev fixture data (party-1, admin-1, roles)
    client.ts            # postgres connection
    migrate.ts           # CREATE TABLE IF NOT EXISTS + indexes
    smoke.ts             # boot-time substrate check
    entities.ts           # structured entity ops
    mappings.ts           # room↔channel, role↔discord role, user↔discord user
    statement-store.ts    # Postgres StatementStore adapter
    migrations/
  adapters/
    platform.ts         # PlatformAdapter interface
    discord/
      client.ts
      commands/         # slash command definitions
      components/       # buttons, modals, select menus
      webhooks.ts       # NPC impersonation pool
      reconciler.ts
      drift-auditor.ts
  workers/
    registry.ts
    live-responder.ts
    briefing-generator.ts
    steering-formalizer.ts
    ingester.ts
    style-extractor.ts
    consistency-auditor.ts
    open-question-resolver.ts
    reconciler.ts       # re-exports adapters/discord/reconciler
    interceptor.ts
  resolvers/
    registry.ts
    agent.ts              # AgentBackedResolver — context-driven, markdown-instructed
    tools/
      roll.ts             # AI SDK tool: roll(count, sides, modifier?, seed?)
      retrieve.ts         # AI SDK tool: retrieve(scope, query)
    types.ts              # shared resolver agent types (instructions config, tool defs)
    dnd5e/
      instructions.md     # skill-check agent instructions (data artifact)
      actions.ts          # describeActions — reads instruction metadata
  agents/               # role-focused agent implementations
    narrator.ts
    world-author.ts
    style-extractor.ts
    consistency-auditor.ts
    resolvers/dnd5e.ts
    workflows/
      bootstrap.ts
      briefing.ts
      canonization.ts
      reconciliation-batch.ts
  scheduler/
    interface.ts
    croner-impl.ts
  eval/
    harness.ts
    fixtures/
  config/
    env.ts              # Zod-validated env
    campaign.ts         # per-campaign config schemas
  index.ts              # bootstrap; wire everything
world/                  # seed authoring content (markdown + yaml)
  rules/
  fiction/
  style/
test/
docker/
  Dockerfile
  compose.yml
```

## Key types (sketch)

```ts
// core/statement.ts
export const StatementKind = z.enum([
  'narration',
  'dialogue',
  'pose',
  'inner-monologue',
  'private-message',
  'mechanical',
  'ruling',
  'invention',
  'canon-reference',
  'briefing',
  'steering',
  'open-question',
  'authoring-decision',
  'safety-invocation',
  'governance',
  'mapping',
  'interception',
  'eval',
  'reaction',
  'decision',
  'command-query',
]);

export const Scope = z.discriminatedUnion('type', [
  z.object({ type: z.literal('world') }),
  z.object({ type: z.literal('party'), partyId: z.string().uuid() }),
  z.object({ type: z.literal('character'), characterId: z.string().uuid() }),
  z.object({ type: z.literal('session'), sessionId: z.string().uuid() }),
  z.object({ type: z.literal('meta'), roomId: z.string().uuid() }),
  z.object({
    type: z.literal('rules'),
    system: z.string(),
    variant: z.enum(['base', 'house']).default('base'),
  }),
  z.object({ type: z.literal('style'), worldId: z.string().uuid() }),
  z.object({ type: z.literal('governance'), roomId: z.string().uuid() }),
  z.object({ type: z.literal('mapping') }),
  z.object({ type: z.literal('eval') }),
]);

export const Statement = z.object({
  id: z.string().uuid(),
  scope: Scope,
  kind: StatementKind,
  authorType: z.enum(['user', 'agent', 'system']),
  authorId: z.string(),
  icOoc: z.enum(['ic', 'ooc']).optional(),
  createdAt: z.string().datetime(),
  supersedes: z.string().uuid().optional(),
  sources: z.array(z.string().uuid()).default([]),
  content: z.string(),
  fields: z.record(z.unknown()).default({}), // kind-specific structured payload
  embedding: z.array(z.number()).optional(), // populated async
});

// core/resolver.ts
export const ResolveRequest = z.object({
  /* … per rules-resolution.md … */
});
export const ResolveResult = z.object({
  /* … */
});
export interface Resolver {
  system: string;
  resolve(req: z.infer<typeof ResolveRequest>): Promise<z.infer<typeof ResolveResult>>;
  describeActions(actor: string, contextIds: string[]): Promise<ActionSpec[]>;
}

// core/worker.ts
export interface Worker<TPayload> {
  name: string;
  schema: z.ZodType<TPayload>;
  handler(payload: TPayload, ctx: WorkerContext): Promise<void>;
}

// core/scheduler.ts
export interface Scheduler {
  schedule(trigger: TriggerSpec, workerName: string, payload: unknown): Promise<string>;
  cancel(scheduleId: string): Promise<void>;
  fireNow(workerName: string, payload: unknown): Promise<void>;
}
```

## Storage schema (sketch)

```sql
-- statements: append-only
CREATE TABLE statements (
  id UUID PRIMARY KEY,
  scope_type TEXT NOT NULL,
  scope_key TEXT,                 -- composite key per scope type
  kind TEXT NOT NULL,
  author_type TEXT NOT NULL,
  author_id TEXT NOT NULL,
  ic_ooc TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  supersedes UUID,
  sources UUID[] NOT NULL DEFAULT '{}',
  content TEXT NOT NULL,
  fields JSONB NOT NULL DEFAULT '{}',
  embedding VECTOR(1536)          -- model-dependent
);
CREATE INDEX ON statements (scope_type, scope_key, created_at);
CREATE INDEX ON statements USING ivfflat (embedding vector_cosine_ops);
-- no UPDATE allowed at app layer; corrections via supersedes chain
```

Additional tables: `entities` (structured canon entities), `rooms`, `roles`, `role_grants`, `mappings`, `schedules`, `webhooks` (identity pool per channel).

## Scheduler tier migration path

Per `runtime-and-processing.md`:

- **Tier 0 (v1):** `CronerScheduler` in-process. Workers run in same process; crash == restart + re-read store (workers are idempotent).
- **Tier 1:** Workers split behind a Redis/BullMQ queue or Node cluster; Scheduler impl still local cron. Statement store unchanged.
- **Tier 3:** Replace `Scheduler` impl with `TemporalScheduler` or `InngestScheduler`. Mastra workflows that need durability get promoted to that backend — Mastra supports Inngest natively, Temporal via adapter. Workers that don't need durability stay in-process.

## Configuration

- `.env` for secrets (Discord token, DB URL, Anthropic API key). Zod-validated at boot.
- `config/` for per-deployment toggles (feature flags, default capabilities, scheduler tier choice).
- Per-campaign configuration is statements in the store, not files — editable at runtime through the authoring UI.

## Dev workflow

- `docker compose up` → Postgres + service container.
- `pnpm dev` → watch mode, single Node process.
- `pnpm db:generate` (Drizzle migrations), `pnpm db:push`.
- `pnpm test` → Vitest.
- `pnpm eval` → run eval harness, writes to `eval` scope for diffing across runs.

## Observability

- Every statement write is a log entry at info level (id, scope, kind, actor).
- Worker invocations log trigger, duration, outcome.
- Consistency auditor flags are warn; safety invocations are always info.
- Tier 2: wrap workers and tool calls in OTEL spans; traces tie an agent turn to its retrievals, resolutions, and emissions.

## Open implementation questions

- Embedding model choice — local (ONNX) or hosted (Anthropic, OpenAI, Voyage)? Trades cost/privacy/latency; default: hosted Voyage or OpenAI `text-embedding-3-small` for v1.
- Postgres managed or self-hosted in v1 dev? Compose-hosted for dev; production leans managed (Neon, Supabase) for ops simplicity.
- Single Mastra instance running all agents/workflows, or separate processes per role? Single process for v1; split later if load demands.
- Discord bot deployment — always-on long poll vs. sharded clusters? Single shard v1; shard when guild count > ~2000.
- Secrets management — `.env` with dotenv-vault or a secrets manager from day one? Start with dotenv; migrate when multi-environment.
