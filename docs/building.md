# Building, Testing & Running

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker + Docker Compose

## Install

```bash
pnpm install
```

## Environment

```bash
cp .env.example .env
# Edit .env — at minimum set a model provider key (OPENROUTER_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY)
```

## Docker (recommended)

```bash
docker compose -f docker/compose.yml up --build
```

This starts Postgres (pgvector) and the app container. First boot runs schema migration and seed data. The app logs `ready` when healthy.

### Rebuilding after code changes

```bash
docker compose -f docker/compose.yml build app
docker compose -f docker/compose.yml up -d app
```

### Wiping the database

```bash
docker compose -f docker/compose.yml down -v
docker compose -f docker/compose.yml up -d
```

This destroys the Postgres volume and re-creates it on next start.

### Known Docker issues

- The pgvector image needs `seccomp:unconfined` and `apparmor:unconfined` on some hosts due to Unix socket creation restrictions. These are set in `docker/compose.yml`.
- The Dockerfile skips npm postinstall scripts (`pnpm config set ignore-scripts true`) because `protobufjs` crashes on Alpine. This is safe for our dependency tree.

## Local development (without Docker)

```bash
# Start Postgres separately (e.g. via Docker)
docker compose -f docker/compose.yml up -d postgres

# Push schema and run dev server
pnpm db:push
pnpm dev
```

The dev server (`tsx watch src/index.ts`) auto-runs the runtime smoke test on boot in development mode.

## Tests

### Unit tests (no DB required)

```bash
pnpm test
```

Runs Vitest. Covers Zod schema parsing, worker registry, and other pure-logic tests.

### Type checking

```bash
pnpm typecheck
```

### Format checking

```bash
pnpm format:check
```

### Database migrations

```bash
pnpm db:generate   # Generate a Drizzle migration from schema changes
pnpm db:push        # Push schema directly (dev only, no migration files)
pnpm db:migrate     # Apply pending Drizzle migrations
```

### Runtime smoke test

Runs automatically on boot when `NODE_ENV !== 'production'`. Verifies:

1. Statement round-trip (insert + read, JSONB + scope fields)
2. pgvector similarity search (insert embedding, query nearest neighbor)

Both test rows are deleted after verification.

## CI checklist

A passing CI run should include:

1. `pnpm typecheck` — no type errors
2. `pnpm test` — all unit tests pass
3. `pnpm format:check` — code is formatted
4. `docker compose -f docker/compose.yml build app` — Docker build succeeds
5. `docker compose -f docker/compose.yml up -d` — full stack starts, app logs `ready`