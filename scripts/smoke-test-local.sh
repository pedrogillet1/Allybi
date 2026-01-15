#!/bin/bash
#
# Local Smoke Test for Upload Flow
#
# Verifies:
#   1. Backend /health endpoint responds
#   2. Backend /api/batch/initial-data endpoint responds (requires auth for real data)
#   3. Frontend build exists and is valid
#
# Usage:
#   ./scripts/smoke-test-local.sh
#
# Prerequisites:
#   - Backend running on localhost:5001
#   - Frontend running on localhost:3000 (optional for UI test)
#

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[TEST]${NC} $1"; }
success() { echo -e "${GREEN}[PASS]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; }

BACKEND_URL="${BACKEND_URL:-http://localhost:5001}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
PASSED=0
FAILED=0

echo ""
echo "========================================"
echo "  KODA Local Smoke Test"
echo "========================================"
echo ""

# Test 1: Backend Health
log "Testing backend /health endpoint..."
HEALTH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "${BACKEND_URL}/health" 2>/dev/null || echo "000")
if [ "$HEALTH_RESPONSE" = "200" ]; then
  success "Backend health check passed (HTTP $HEALTH_RESPONSE)"
  ((PASSED++))
else
  fail "Backend health check failed (HTTP $HEALTH_RESPONSE)"
  warn "Ensure backend is running: cd backend && npm run dev"
  ((FAILED++))
fi

# Test 2: Batch Initial Data endpoint exists (401 expected without auth)
log "Testing backend /api/batch/initial-data endpoint..."
BATCH_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "${BACKEND_URL}/api/batch/initial-data" 2>/dev/null || echo "000")
if [ "$BATCH_RESPONSE" = "401" ] || [ "$BATCH_RESPONSE" = "200" ]; then
  success "Batch initial-data endpoint accessible (HTTP $BATCH_RESPONSE)"
  ((PASSED++))
elif [ "$BATCH_RESPONSE" = "500" ]; then
  fail "Batch endpoint returned 500 - likely schema mismatch"
  warn "Run: cd backend && npm run dev:sync"
  ((FAILED++))
else
  fail "Batch endpoint unreachable (HTTP $BATCH_RESPONSE)"
  ((FAILED++))
fi

# Test 3: Frontend is running (optional)
log "Testing frontend availability..."
FRONTEND_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "${FRONTEND_URL}" 2>/dev/null || echo "000")
if [ "$FRONTEND_RESPONSE" = "200" ]; then
  success "Frontend is running (HTTP $FRONTEND_RESPONSE)"
  ((PASSED++))
else
  warn "Frontend not reachable (HTTP $FRONTEND_RESPONSE) - start with: cd frontend && npm start"
  # Don't count as failure since it's optional for API tests
fi

# Test 4: Check critical files exist locally
log "Checking critical files..."
CRITICAL_FILES=(
  "frontend/src/components/UniversalUploadModal.jsx"
  "frontend/src/context/DocumentsContext.jsx"
  "backend/src/controllers/batch.controller.ts"
)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

for file in "${CRITICAL_FILES[@]}"; do
  if [ -f "$ROOT_DIR/$file" ]; then
    success "Found $file"
    ((PASSED++))
  else
    fail "Missing $file"
    ((FAILED++))
  fi
done

# Test 5: Verify UniversalUploadModal has the refresh fix
log "Verifying UniversalUploadModal has invalidateCache + fetchAllData..."
if grep -q "invalidateCache" "$ROOT_DIR/frontend/src/components/UniversalUploadModal.jsx" && \
   grep -q "fetchAllData(true)" "$ROOT_DIR/frontend/src/components/UniversalUploadModal.jsx"; then
  success "UniversalUploadModal has correct refresh pattern"
  ((PASSED++))
else
  fail "UniversalUploadModal missing refresh pattern"
  ((FAILED++))
fi

# Test 6: Verify UploadHub has the refresh fix
log "Verifying UploadHub has invalidateCache + fetchAllData..."
if grep -q "invalidateCache" "$ROOT_DIR/frontend/src/components/UploadHub.jsx" && \
   grep -q "fetchAllData(true)" "$ROOT_DIR/frontend/src/components/UploadHub.jsx"; then
  success "UploadHub has correct refresh pattern"
  ((PASSED++))
else
  fail "UploadHub missing refresh pattern"
  ((FAILED++))
fi

# Test 7: Verify UploadModal (legacy) has the refresh fix
log "Verifying UploadModal has invalidateCache + fetchAllData..."
if grep -q "invalidateCache" "$ROOT_DIR/frontend/src/components/UploadModal.jsx" && \
   grep -q "fetchAllData(true)" "$ROOT_DIR/frontend/src/components/UploadModal.jsx"; then
  success "UploadModal has correct refresh pattern"
  ((PASSED++))
else
  fail "UploadModal missing refresh pattern"
  ((FAILED++))
fi

echo ""
echo "========================================"
echo "  SMOKE TEST RESULTS"
echo "========================================"
echo ""
echo -e "  ${GREEN}Passed:${NC} $PASSED"
echo -e "  ${RED}Failed:${NC} $FAILED"
echo ""

if [ "$FAILED" -gt 0 ]; then
  echo -e "${RED}Some tests failed. Fix issues before proceeding.${NC}"
  exit 1
else
  echo -e "${GREEN}All tests passed! Upload flow is ready.${NC}"
  exit 0
fi
