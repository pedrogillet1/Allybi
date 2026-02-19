#!/usr/bin/env bash
set -euo pipefail

echo "[test:functionality] Running integration + routing + validation suites..."
npm run -s test:integration
npm run -s test:routing
npm run -s test:validation
echo "[test:functionality] All checks passed."
