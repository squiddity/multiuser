# CLI Harness Driving

## Purpose

Define a reliable way to automate and demonstrate the interactive CLI harness (`src/cli/harness.ts`) without breaking readline behavior.

## Core constraint

The harness uses Node readline in terminal mode and expects an open stdin stream while it is running.

If stdin is closed early (for example by piping a finite command stream), readline can close before the next prompt cycle and the process can throw:

- `Error [ERR_USE_AFTER_CLOSE]: readline was closed`

## Reliable interaction pattern

Drive the harness from a parent process that:

1. Spawns the harness as a child process.
2. Keeps stdin open for the full session.
3. Sends commands over time through the child stdin.
4. Closes cleanly by issuing `exit` as the final command.

This preserves interactive semantics while still allowing scripted demos.

## Project script

Use:

```bash
pnpm demo:cli
```

By default the demo driver sets:

- `LOG_DB_NOTICES=0` for the spawned CLI process (suppresses noisy Postgres NOTICE output)
- `LOG_LLM_INPUT=1` for the spawned CLI process (prints narrator system + user prompt payload before each model call)

This runs `scripts/drive-cli-demo.mjs`, which first clears prior statements in the demo scopes (`party-1` and `admin-1`), then executes a scenario selected by `DEMO_SCENARIO`.

Current scenarios:

- `vertical-slice` (default): seeds one governance open question for canonization and runs the original milestone 0001 flow.
- `briefing-only`: emits party activity and checks for admin-room `briefing` statements.
- `steering-application`: issues admin steering, triggers a follow-up player turn, and checks that steering reaches narrator prompt context and reflected behavior.

`vertical-slice` flow:

1. `help`
2. `/ls`
3. `/narrate ...`
4. `/ls`
5. `room admin-1`
6. `/ls`
7. `/canonize <seeded-oq-id> promote`
8. `/ls`
9. `room party-1`
10. `/say "Who does the sigil on the north gate belong to?"`
11. `/ls` (after response delay)
12. `exit`

The script mirrors child stdout/stderr to the parent terminal so the full interaction remains visible.

At the end, it performs a lightweight assessment by reading recent statements and emits a JSON line prefixed with `[demo-scorecard]` for machine-readable checkpoints.

For `vertical-slice`, it:

- confirms a promoted `canon-reference` exists in world scope
- prints the latest narrator answer after the recall question
- marks the run `PASS` when the answer mentions "Ashen Cartographers" (otherwise `REVIEW`)

This is intentionally heuristic and is meant for rapid demo feedback, not strict evaluation.

## Model-provider setup for demos

Before running a demo that exercises live narration or briefing generation, configure a model provider through environment variables. `DEFAULT_MODEL_SPEC` is the model used by the CLI live responder and briefing generator. It uses the `"<provider>:<model-id>"` format and is resolved by the pi runtime adapter.

Hosted providers require their normal API key, for example:

```bash
OPENROUTER_API_KEY=...
DEFAULT_MODEL_SPEC=openrouter:qwen/qwen-2.5-72b-instruct
```

Local or self-hosted OpenAI-compatible providers are supported through the local provider envs:

```bash
LOCAL_MODEL_PROVIDER=local
LOCAL_MODEL_BASE_URL=http://localhost:11434/v1
LOCAL_MODEL_API_KEY=dummy
LOCAL_MODEL_CONTEXT_WINDOW=131072
LOCAL_MODEL_MAX_TOKENS=8192
LOCAL_MODEL_REASONING=0
DEFAULT_MODEL_SPEC=local:llama3.1:8b
```

Change `LOCAL_MODEL_BASE_URL` and the model id to match the server under test. The API key can be `dummy` for servers that do not require authentication. Keep `LOCAL_MODEL_REASONING=0` unless the endpoint is known to accept pi/OpenAI-compatible reasoning parameters.

Demo methodology expectation: when an agent runs the demo, it should first verify that `DEFAULT_MODEL_SPEC` points at an available provider appropriate for the repo/session. If the configured hosted provider is flaky or returns empty text, prefer switching to a known local provider rather than interpreting the run as a behavior failure.

## Operational notes

- Model-provider failures (rate limit, insufficient credits, transient transport, empty provider responses) can cause missing or fallback narrator output even when state plumbing is correct.
- Treat these as infrastructure/provider issues for demo reporting, not automatic context-handling failures.
- For reproducible runs, keep `DEFAULT_MODEL_SPEC` stable and log LLM input (`DEMO_LOG_LLM_INPUT=1`).
- The current demo driver uses a bounded live-response wait (`DEMO_LIVE_WAIT_MS`); local model runs may require a larger value until the driver is promoted to polling-based response detection.

Run the incremental 0002 briefing checkpoint scenario:

```bash
DEMO_SCENARIO=briefing-only pnpm demo:cli
```

To preserve prior demo statements, run with reset disabled:

```bash
DEMO_CLI_RESET=0 pnpm demo:cli
```

To show DB NOTICE logs during demo setup and runtime:

```bash
DEMO_SHOW_DB_NOTICES=1 pnpm demo:cli
```

To disable LLM input logging during demo:

```bash
DEMO_LOG_LLM_INPUT=0 pnpm demo:cli
```

## Anti-pattern to avoid

Do not automate the harness with a closed-input pipeline such as:

```bash
printf "help\n/ls\n..." | pnpm dev
```

That pattern is prone to closing stdin before readline finishes its prompt lifecycle.
