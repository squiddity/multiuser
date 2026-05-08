#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Install uv if not present
if ! command -v uv >/dev/null 2>&1; then
  echo "Installing uv..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi

# Create or update the project-local venv
uv venv .venv --python "$(cat .python-version)" --quiet
uv sync --frozen 2>/dev/null || uv sync --quiet

echo "Python environment ready: .venv/bin/memsearch"
