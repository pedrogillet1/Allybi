#!/usr/bin/env bash
set -euo pipefail

echo "[test:chat] Running behavior + generation + conversation quick suites..."
npm run -s test:behavior
npm run -s test:generation
npm run -s test:conversation:quick
echo "[test:chat] All checks passed."
