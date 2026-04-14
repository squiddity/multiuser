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

echo "=== Running pytest ==="
cd "$PROJECT_DIR/test-api"
python -m pytest . --junitxml="$JUNIT_XML"

echo "=== API tests passed ==="
echo "Results written to $JUNIT_XML"