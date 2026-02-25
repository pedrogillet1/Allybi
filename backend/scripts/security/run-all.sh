#!/bin/bash
# Security CI Gate - Runs all security scanners
#
# Usage: ./scripts/security/run-all.sh
# Exit codes: 0 = all pass, 1 = any failure

set -e

echo "🔒 Running Koda Security CI Gates"
echo "=================================="
echo ""

FAILED=0

# 1. Scan for hardcoded secrets
echo "📌 [1/4] Scanning for hardcoded secrets..."
if npx ts-node scripts/security/scan-secrets.ts; then
  echo "✅ Secrets scan passed"
else
  echo "❌ Secrets scan failed"
  FAILED=1
fi
echo ""

# 2. Scan for unprotected admin routes
echo "📌 [2/4] Scanning for unprotected admin routes..."
if npx ts-node scripts/security/scan-unprotected-routes.ts; then
  echo "✅ Route protection scan passed"
else
  echo "❌ Route protection scan failed"
  FAILED=1
fi
echo ""

# 3. Scan for RBAC wiring on protected module routes
echo "📌 [3/4] Scanning for RBAC route protection..."
if npx ts-node scripts/security/scan-rbac-protection.ts; then
  echo "✅ RBAC scan passed"
else
  echo "❌ RBAC scan failed"
  FAILED=1
fi
echo ""

# 4. Scan for plaintext writes
echo "📌 [4/4] Scanning for plaintext writes to sensitive fields..."
if npx ts-node scripts/security/scan-plaintext.ts; then
  echo "✅ Plaintext scan passed"
else
  echo "❌ Plaintext scan failed"
  FAILED=1
fi
echo ""

echo "=================================="
if [ $FAILED -eq 0 ]; then
  echo "✅ All security checks passed!"
  exit 0
else
  echo "❌ Some security checks failed!"
  exit 1
fi
