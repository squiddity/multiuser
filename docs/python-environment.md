# Python Environment

## Purpose

Manage a project-local Python environment for tools the Node process shells out to (today: `memsearch`; future: dice rollers, rules lookups). Analogous in scope to `node_modules/` — local to the repo, reproducible, and cleaned up by deleting one directory.

## Tool

[`uv`](https://docs.astral.sh/uv/) is the package manager. Single static binary, fast resolver, native `pyproject.toml` support, and a drop-in for `pip`/`venv`.

## Layout

```
<repo>/
  .python-version       # pins interpreter (3.12)
  pyproject.toml        # project metadata + dependencies
  uv.lock               # reproducible resolution (committed)
  .venv/                # virtualenv (gitignored)
  scripts/setup-python.sh
```

| File              | Committed | Notes                                            |
| ----------------- | --------- | ------------------------------------------------ |
| `pyproject.toml`  | yes       | Source of truth for Python deps.                 |
| `uv.lock`         | yes       | Lockfile; updated by `uv lock` or `uv sync`.     |
| `.python-version` | yes       | Pins the interpreter version `uv venv` resolves. |
| `.venv/`          | no        | Recreated by `pnpm setup:python`.                |

## Bootstrap

`scripts/setup-python.sh`:

1. Installs `uv` via the official installer if it's not on `PATH`.
2. Creates `.venv/` with the interpreter pinned in `.python-version`.
3. Runs `uv sync --frozen` to install exact lockfile contents.

`pnpm install` triggers it automatically via the `postinstall` hook (`bash scripts/setup-python.sh || true`). The `|| true` keeps `pnpm install` non-fatal in environments without a Python toolchain (e.g. the production Docker build, where Python is irrelevant). The `Dockerfile`'s `pnpm config set ignore-scripts true` skips the hook entirely during image builds.

Manual bootstrap:

```bash
pnpm setup:python
```

## Resolution at runtime

- `MEMSEARCH_BIN` defaults to `<repoRoot>/.venv/bin/memsearch` if unset.
- The constrained-bash tool (Phase 3) prepends `<repoRoot>/.venv/bin` to `PATH` for child processes so skill-driven commands resolve without absolute paths.

## Adding a Python dependency

```bash
uv add <package>          # adds to pyproject.toml + uv.lock
git add pyproject.toml uv.lock
```

`pnpm install` (or `pnpm setup:python`) on another machine then materializes it into `.venv/`.

## CI

GitHub Actions installs `uv` (via `astral-sh/setup-uv` or the install script) and runs `pnpm install`, which triggers `pnpm setup:python` and produces a fresh `.venv/`. Cache the venv on `uv.lock` to skip the ONNX model download on repeat runs.

## Cleanup

```bash
rm -rf .venv
```

Then `pnpm setup:python` (or any `pnpm install`) recreates it.

## Why not pip / poetry / pipx?

- `pip` + raw `venv` is fine but lacks lockfiles by default and is slow.
- `poetry` works but is heavier, has its own resolver quirks, and adds a second toolchain to install on contributor machines.
- `uv` is a single binary, has an order-of-magnitude faster resolver than `pip`, supports `pyproject.toml` as canonical config, and does not require a global install. Net: less moving parts and faster cold starts in CI.
