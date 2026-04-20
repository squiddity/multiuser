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

This runs `scripts/drive-cli-demo.mjs`, which first clears prior statements in the demo scopes (`party-1` and `admin-1`) so `/ls` starts clean, then launches the harness and executes a short end-to-end flow:

1. `help`
2. `/ls`
3. `/say ...`
4. `/ls`
5. `room admin-1`
6. `/ls`
7. `exit`

The script mirrors child stdout/stderr to the parent terminal so the full interaction remains visible.

To preserve prior demo statements, run with reset disabled:

```bash
DEMO_CLI_RESET=0 pnpm demo:cli
```

## Anti-pattern to avoid

Do not automate the harness with a closed-input pipeline such as:

```bash
printf "help\n/ls\n..." | pnpm dev
```

That pattern is prone to closing stdin before readline finishes its prompt lifecycle.
