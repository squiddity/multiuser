# multiuser

Multi-user, multi-room agent-driven shared fiction platform. Discord-first.

Design docs live under `docs/` and are imported into `CLAUDE.md`. Start there for architecture. This README covers the skeleton build & run.

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker + Docker Compose

## Run

```bash
cp .env.example .env
# edit .env — at minimum set OPENROUTER_API_KEY or ANTHROPIC_API_KEY for later
docker compose -f docker/compose.yml up --build
```

The Postgres container enables the `pgvector` extension on first boot. The app container builds, connects, and logs `ready`.

## Develop

```bash
pnpm install
docker compose -f docker/compose.yml up -d postgres
pnpm db:push
pnpm dev
```

## Test

```bash
pnpm test
```

## Layout

```
src/core/        domain types (TypeBox schemas + TS interfaces)
src/store/       Postgres + pgvector, Drizzle schema, append-only statements
src/scheduler/   Scheduler interface + tier-0 croner impl
src/workers/     worker registry
src/resolvers/   rules-resolver registry
src/models/      model provider registry (AI SDK providers, swappable per agent)
src/adapters/    platform adapters (discord v1)
src/agents/      agent role implementations + workflows
src/config/      env + logger
src/eval/        eval harness (to be added)
world/           seed authoring content (ingested)
docs/            design docs
```
