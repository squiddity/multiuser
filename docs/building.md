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

### Integration tests (require Postgres)

Integration tests hit a real database. They self-migrate on setup and clean up after themselves.

1. Start Postgres:

   ```bash
   docker compose -f docker/compose.yml up -d postgres
   ```

2. Ensure `.env` has `DATABASE_URL` pointing at the local Postgres (default: `postgres://multiuser:multiuser@localhost:5432/multiuser`).

3. Run integration tests:

   ```bash
   pnpm test:integration
   ```

   Or run a single file:

   ```bash
   npx vitest run test/integration/scope-isolation.test.ts
   ```

4. (Optional) Stop Postgres when done:

   ```bash
   docker compose -f docker/compose.yml stop postgres
   ```

Integration tests use `beforeAll` to run the migration and seed data, and `afterAll` to clean up inserted rows. They can safely re-run against the same DB.

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

## Hermetic API tests (Docker + pytest)

Black-box API tests that run against the full stack in Docker. The tests are Python + pytest + httpx — they share zero code with the app under test and prove the HTTP contract from first principles.

### Prerequisites (host)

- Python 3.12+ with `pytest` and `httpx`:
  ```bash
  pip install pytest httpx
  ```
- Docker + Docker Compose

### Running the full suite

```bash
pnpm test:api
```

This script (`scripts/api-test.sh`) does the following:

1. Builds and starts Postgres + app containers via `docker/compose.api-test.yml`
2. Waits for the app's `/health` endpoint to return 200
3. Runs `pytest test-api/ --junitxml=test-results/api-results.xml`
4. Tears down containers
5. Exits with the test exit code

### Running against an already-running dev server

If you already have the app running locally (via `pnpm dev` or Docker Compose):

```bash
pytest test-api/
```

Default URL is `http://localhost:3000`. Override with `API_URL`:

```bash
API_URL=http://my-staging:3000 pytest test-api/
```

### Test structure

```
test-api/
  conftest.py           # session-scoped httpx.Client, health-wait fixture
  test_health.py         # GET /health
  test_statements.py     # statement CRUD round-trip
  test_scopes.py          # scope isolation via API
```

Tests are pure HTTP calls — they import nothing from `src/`. If the API contract changes, the tests break (that's the point).

### Test layers

| Layer          | What                   | Runs where                    | Tool   |
| -------------- | ---------------------- | ----------------------------- | ------ |
| Unit           | Pure logic, no DB      | Host, `pnpm test`             | Vitest |
| Integration    | DB-roundtrip internals | Host, `pnpm test:integration` | Vitest |
| API / hermetic | HTTP contract          | Host → Docker                 | pytest |

## CI checklist

A passing CI run should include:

1. `pnpm typecheck` — no type errors
2. `pnpm test` — all unit + integration tests pass
3. `pnpm format:check` — code is formatted
4. `pnpm test:api` — hermetic API tests pass against Docker stack
5. `docker compose -f docker/compose.yml build app` — Docker build succeeds
