# Building, Testing & Running

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker + Docker Compose

If `pnpm` is missing on a fresh machine/session:

```bash
npm install -g pnpm@9.15.0
pnpm -v
```

## Install

```bash
pnpm install
```

## Environment

```bash
cp .env.example .env
# Edit .env — set either a hosted provider key (OPENROUTER_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY)
# or configure LOCAL_MODEL_BASE_URL for an OpenAI-compatible local model server.
```

### Local/OpenAI-compatible model provider

The app routes live narrator and briefing model calls through `DEFAULT_MODEL_SPEC` using the `"<provider>:<model-id>"` format. Built-in providers are resolved by pi-ai. For local inference servers, set `LOCAL_MODEL_BASE_URL` and use the configured local provider name, which defaults to `local`:

```bash
LOCAL_MODEL_PROVIDER=local
LOCAL_MODEL_BASE_URL=http://localhost:11434/v1
LOCAL_MODEL_API_KEY=dummy
DEFAULT_MODEL_SPEC=local:llama3.1:8b
```

Any OpenAI-compatible local server can be used by changing the base URL and model id. If you prefer a different provider prefix, set `LOCAL_MODEL_PROVIDER=ollama` and use `DEFAULT_MODEL_SPEC=ollama:<model-id>`.

For demo/test methodology, confirm the configured provider is available before judging narrative behavior. If a hosted provider returns empty text, times out, or is quota-limited, switch `DEFAULT_MODEL_SPEC` to a known local provider and rerun the demo; classify provider/runtime failures separately from application behavior.

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

## CLI harness demo driving

For automated demos of the interactive harness (`src/cli/harness.ts`), use:

```bash
pnpm demo:cli
```

This uses a child-process driver that keeps stdin open and sends commands incrementally, resets prior statements in the demo scopes before running so the first `/ls` is clean, seeds an open question so `/canonize` is exercised, then asks a follow-up `/say` recall question in the player room to demonstrate model interaction with persisted canon.

To skip reset and keep prior demo data:

```bash
DEMO_CLI_RESET=0 pnpm demo:cli
```

Useful demo toggles:

```bash
DEMO_SHOW_DB_NOTICES=1 pnpm demo:cli   # show Postgres NOTICE logs
DEMO_LOG_LLM_INPUT=0 pnpm demo:cli     # hide narrator prompt payload logs
```

Do not drive the harness by piping a finite input stream into `pnpm dev`; that can close readline early and raise `ERR_USE_AFTER_CLOSE`.

See `docs/cli-harness-driving.md` for the interaction contract and rationale.

### Output mode for interactive sessions

When running commands in an interactive/shared terminal session:

- Run **demo scripts** and **long-running test commands** in streaming/live-output mode so observers can watch progress in real time (for example: `pnpm demo:cli`, `pnpm test:integration`, `pnpm test:api`).
- Run **unit tests** in standard captured-output mode (`pnpm test`), since they are typically fast.
- Run **build, typecheck, and formatting** commands in standard captured-output mode.

## Tests

### Pre-commit checklist (REQUIRED)

**Before every commit/push, ensure these pass:**

```bash
pnpm typecheck   # type checking
pnpm format:check  # code formatting
pnpm test        # unit tests
```

**Why:** CI gates require `typecheck` and `format:check` to pass. Failing these blocks merge and wastes reviewer time. Fix locally in seconds rather than in CI.

### Unit tests (no DB required)

```bash
pnpm test
```

Runs Vitest. Covers schema parsing, worker registry, and other pure-logic tests.

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

- Python 3.12+
- Docker + Docker Compose

`pnpm test:api` now auto-bootstrap installs Python test dependencies in a local virtualenv when needed.

- Default venv path: `.venv-api-tests`
- Override interpreter: `PYTHON_BIN=/path/to/python3 pnpm test:api`
- Override venv path: `API_TEST_VENV=/custom/path pnpm test:api`

Manual setup is still supported (and useful if you want to re-use an existing environment):

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install pytest httpx
```

> This avoids PEP-668 / externally-managed Python issues on distros such as Arch.

### Running the full suite

```bash
pnpm test:api
```

If `pytest`/`httpx` are missing, the script creates `.venv-api-tests` automatically and installs them there.

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

| Layer          | What                                    | Runs where                    | Tool   |
| -------------- | --------------------------------------- | ----------------------------- | ------ |
| Unit           | Pure logic, no DB                       | Host, `pnpm test`             | Vitest |
| Integration    | DB-roundtrip internals, worker triggers | Host, `pnpm test:integration` | Vitest |
| API / hermetic | HTTP contract (CRUD, scope isolation)   | Host → Docker                 | pytest |

**Test scope notes:**

- **Hermetic API tests** (`test-api/`) focus on the HTTP contract: statement CRUD, scope isolation, open-question flow via API. They don't test worker-triggered features (briefing-generator, live-responder) because those require `DEFAULT_MODEL_SPEC` configuration.
- **Worker-triggered features** (briefing-generator, live-responder) are tested in `test/integration/` where the full runtime is available.
- **Integration tests** use pre-seeded room IDs (`party-1`, `admin-1`) and cover end-to-end flows including model interactions.

## CI checklist

A passing CI run should include:

1. `pnpm typecheck` — no type errors
2. `pnpm test` — unit + smoke tests pass
3. `pnpm test:integration` — integration tests pass (Postgres required)
4. `pnpm format:check` — code is formatted
5. `pnpm test:api` — hermetic API tests pass against Docker stack
6. `docker compose -f docker/compose.yml build app` — Docker build succeeds
