#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="$PROJECT_DIR/docker/compose.api-test.yml"
RESULTS_DIR="$PROJECT_DIR/test-results"
JUNIT_XML="$RESULTS_DIR/api-results.xml"

mkdir -p "$RESULTS_DIR"

echo "=== Starting Docker stack for API tests ==="
docker compose -f "$COMPOSE_FILE" up -d --build

cleanup() {
    echo "=== Tearing down Docker stack ==="
    docker compose -f "$COMPOSE_FILE" down -v || true
}
trap cleanup EXIT

echo "=== Waiting for API to become healthy ==="
MAX_WAIT=60
for i in $(seq 1 $MAX_WAIT); do
    if curl -sf http://localhost:3000/health >/dev/null 2>&1; then
        echo "API is healthy"
        break
    fi
    if [ $i -eq $MAX_WAIT ]; then
        echo "ERROR: API never became healthy after ${MAX_WAIT}s"
        exit 1
    fi
    echo "Waiting for API... ($i/$MAX_WAIT)"
    sleep 1
done

echo "=== Ensuring Python test dependencies are installed ==="
if [ -n "${PYTHON_BIN:-}" ]; then
    PYTHON="$PYTHON_BIN"
elif command -v python3 >/dev/null 2>&1; then
    PYTHON="python3"
else
    PYTHON="python"
fi

if ! "$PYTHON" -c "import pytest, httpx" >/dev/null 2>&1; then
    API_TEST_VENV="${API_TEST_VENV:-$PROJECT_DIR/.venv-api-tests}"
    echo "Creating/using API test virtualenv: $API_TEST_VENV"
    "$PYTHON" -m venv "$API_TEST_VENV"
    PYTHON="$API_TEST_VENV/bin/python"
    "$PYTHON" -m pip install --quiet --upgrade pip
    "$PYTHON" -m pip install --quiet "pytest>=8.0.0" "httpx>=0.27.0"
fi

echo "=== Running pytest ==="
cd "$PROJECT_DIR/test-api"
"$PYTHON" -m pytest . --junitxml="$JUNIT_XML"

echo "=== API tests passed ==="
echo "Results written to $JUNIT_XML"