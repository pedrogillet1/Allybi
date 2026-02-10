#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

export HOST="${HOST:-localhost}"
export PORT="${PORT:-3000}"
export E2E_BASE_URL="${E2E_BASE_URL:-http://localhost:${PORT}}"

echo "[e2e] Running slides deck rendering test (dev harness)…"
LOG_FILE="${LOG_FILE:-/tmp/koda-frontend-e2e.log}"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [[ "${E2E_NO_START_SERVER:-0}" == "1" ]]; then
  echo "[e2e] Using existing server at ${E2E_BASE_URL} (E2E_NO_START_SERVER=1)"
else
  echo "[e2e] Starting frontend dev server (${HOST}:${PORT})… logs: ${LOG_FILE}"
  (HOST="${HOST}" PORT="${PORT}" npm run start) >"${LOG_FILE}" 2>&1 &
  SERVER_PID="$!"

  echo "[e2e] Waiting for ${E2E_BASE_URL}…"
  for i in $(seq 1 90); do
    if curl -fsS "${E2E_BASE_URL}" >/dev/null 2>&1; then
      break
    fi
    sleep 1
    if [[ "$i" == "90" ]]; then
      echo "[e2e] Server did not become ready. Tail of logs:"
      tail -n 80 "${LOG_FILE}" || true
      exit 1
    fi
  done
fi

npx playwright test --config playwright.harness.config.ts e2e/slides-deck-rendering.spec.ts
