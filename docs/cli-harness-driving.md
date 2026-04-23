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
- `briefing-only`: emits party activity and checks for admin-room `briefing` statements (incremental milestone 0002 checkpoint).

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

## Operational notes

- Model-provider failures (rate limit, insufficient credits, transient transport) can cause fallback narrator output even when state plumbing is correct.
- Treat these as infrastructure/provider issues for demo reporting, not automatic context-handling failures.
- For reproducible runs, keep `DEFAULT_MODEL_SPEC` stable and log LLM input (`DEMO_LOG_LLM_INPUT=1`).

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
