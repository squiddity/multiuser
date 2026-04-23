# Plan: Minimal API Surface + Hermetic Black-Box Tests

## Problem

Two issues need solving together:

1. **No HTTP API.** The app is a background worker (Discord bot + scheduler) with no web server. Hermetic tests have nothing to call.
2. **Hermetic testing approach was wrong.** The previous attempt ran vitest + tsc + esbuild inside Docker, which failed because esbuild's native binary download is incompatible with Docker's `ignore-scripts` workflow. More fundamentally, black-box API tests should share zero code with the app under test.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  Docker Compose (compose.api-test.yml)               │
│                                                      │
│  ┌──────────────┐  ┌──────────────────────────────┐ │
│  │   Postgres    │  │  App (multiuser service)     │ │
│  │   pgvector    │  │  Hono HTTP API :3000         │ │
│  │              │  │  + health, statement CRUD     │ │
│  └──────────────┘  └──────────────────────────────┘ │
│           │                      │ :3000 exposed      │
└───────────┼──────────────────────┼─────────────────────┘
            │                      │
            │   HTTP only          │
            ▼                      ▼
┌──────────────────────────────────────────────────────┐
│  pytest + httpx (runs on host or CI runner)           │
│  test-api/                                            │
│    conftest.py          # fixtures: client, wait      │
│    test_health.py       # /health                     │
│    test_statements.py   # statement CRUD round-trip   │
│    test_scopes.py       # scope isolation via API     │
│    pyproject.toml       # deps: pytest, httpx          │
└──────────────────────────────────────────────────────┘
```

**Principle:** Services in Docker, tests on host. Tests are pure HTTP clients that prove the API contract. They import nothing from `src/`.

## Ordered tasks

### Task 1. Add Hono dependency

Add `hono` to `package.json` dependencies. Hono is lightweight, type-safe, and works on Node.js without any native binary dependencies.

No new dev dependencies needed.

### Task 2. Create `src/api/` — minimal HTTP surface

New files:

```
src/api/
  app.ts              # Hono app factory (creates app, registers routes)
  routes/
    health.ts          # GET /health — DB ping + version
    statements.ts      # POST /api/statements, GET /api/statements/:id, GET /api/statements?scope=...
  middleware/
    request-logger.ts  # pino request logging (optional, nice-to-have)
```

Endpoints:

| Method | Path                  | Purpose                                                                                  |
| ------ | --------------------- | ---------------------------------------------------------------------------------------- |
| GET    | `/health`             | Liveness + DB connectivity. Returns `{ ok, db, version }`                                |
| POST   | `/api/statements`     | Create a statement. Body matches `Statement` schema minus `id`, `createdAt`, `embedding` |
| GET    | `/api/statements/:id` | Read single statement by UUID                                                            |
| GET    | `/api/statements`     | Query statements. Query params: `scope_type`, `scope_key`, `kind`, `limit`, `offset`     |

All routes use existing store functions (`appendStatement`, `appendAndEmit`, `readStatement`, `queryStatements`). No new business logic — the API is a thin HTTP adapter over the existing domain layer.

Request/response types come from the existing schema contracts in `core/statement.ts`. The API validates input with those schemas and returns validated output.

### Task 3. Wire HTTP server into `src/index.ts`

- Import Hono `app` from `src/api/app.ts`
- Serve it with `node:http` `createServer` using Hono's `serve` helper
- Port from `API_PORT` env (default 3000), added to `config/env.ts`
- Start HTTP server alongside the scheduler (both run in the same process)
- Add `/health` to Docker Compose healthcheck

### Task 4. Update production Dockerfile and compose.yml

**`docker/Dockerfile`**: No changes needed — the production image already builds TypeScript and runs `dist/index.js`. Hono has no native dependencies.

**`docker/compose.yml`**: Add healthcheck to the `app` service:

```yaml
healthcheck:
  test: ['CMD', 'curl', '-sf', 'http://localhost:3000/health']
  interval: 5s
  timeout: 3s
  retries: 10
```

Port 3000 is already exposed but currently unused.

### Task 5. Create `test-api/` — Python + pytest + httpx

New directory at project root (sibling to `src/`, `test/`, `docker/`):

```
test-api/
  pyproject.toml         # pytest >=8, httpx >=0.27
  conftest.py            # session-scoped httpx.Client fixture with health-wait
  test_health.py         # GET /health returns 200 with ok:true
  test_statements.py     # create → read round-trip, scope filtering
  test_scopes.py          # statements in one scope aren't visible in another
```

**`conftest.py`** key details:

- Reads `API_URL` from env (default `http://localhost:3000`)
- Session-scoped fixture that waits for `/health` to return 200 (up to 30s) before yielding the client
- Optional cleanup fixture that deletes test-created data via `DELETE /api/statements/:id` (or a future admin endpoint)

No Python code imports from `src/`. Tests prove the API contract from first principles.

### Task 6. Create `docker/compose.api-test.yml`

Brings up Postgres + app with port 3000 exposed. No test-runner container — tests run on the host.

```yaml
services:
  postgres:
    # same as compose.yml
  app:
    build:
      context: ..
      dockerfile: docker/Dockerfile
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgres://multiuser:multiuser@postgres:5432/multiuser
      API_PORT: '3000'
      NODE_ENV: test
    ports:
      - '3000:3000'
    healthcheck:
      test: ['CMD', 'curl', '-sf', 'http://localhost:3000/health']
      interval: 3s
      timeout: 2s
      retries: 20
```

### Task 7. Create `scripts/api-test.sh`

Orchestrates the full cycle:

1. `docker compose -f docker/compose.api-test.yml up -d --build`
2. Wait for app healthcheck to pass
3. Run `pytest test-api/ --junitxml=test-results/api-results.xml`
4. Capture exit code
5. `docker compose -f docker/compose.api-test.yml down`
6. Exit with test exit code

Add `test:api` npm script: `"test:api": "bash scripts/api-test.sh"`

### Task 8. Remove old hermetic test infrastructure

Delete:

- `docker/test.Dockerfile` — the failed esbuild-in-Docker approach
- `docker/compose.test.yml` — replaced by `compose.api-test.yml`

Update `package.json` scripts:

- Remove `test:ci` if it referenced the old approach
- Add `test:api` pointing to the new script

### Task 9. Update documentation

**`docs/building.md`**: Replace the "Hermetic integration tests (Docker)" section with:

- How to run API tests (`pnpm test:api` or manual docker compose + pytest)
- How to run tests locally with an already-running dev server (`pytest test-api/`)
- That Python + pytest + httpx is required on the host
- The philosophy: black-box, zero code shared with app

**This plan doc** (`docs/plan-api-surface-and-hermetic-tests.md`): Once implemented, rename or archive it; the living docs are `building.md` and `decisions.md`.

### Task 10. Update milestone doc

Mark Task 4 as done (✅) in `docs/milestones/0001-vertical-slice.md`. Add the new API surface as a task or note it as enabling infrastructure for future tasks.

## Key constraints

- **No new business logic in the API layer.** The API is a thin HTTP adapter over existing store functions and schema contracts. If logic doesn't exist yet, the API returns 501 or doesn't expose it.
- **The API is internal-facing for now.** No authentication, no rate limiting. These become relevant when the Discord bot or external callers use it, at which point we add middleware.
- **Test independence.** `test-api/` shares zero imports with `src/`. If API contracts change, the tests break (that's the point — they're contract tests).
- **Python deps are minimal.** Only `pytest` and `httpx`. No Django, no FastAPI, no test client frameworks.

## How this relates to the existing test suite

The existing vitest tests (unit + integration) remain unchanged. They test internal modules directly with database access. The new API tests are a separate, complementary layer:

| Layer          | What                   | Runs where                    | Tool   |
| -------------- | ---------------------- | ----------------------------- | ------ |
| Unit           | Pure logic, no DB      | Host, `pnpm test`             | Vitest |
| Integration    | DB-roundtrip internals | Host, `pnpm test:integration` | Vitest |
| API / hermetic | HTTP contract          | Host → Docker                 | pytest |

All three layers should pass in CI.
