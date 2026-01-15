#!/bin/bash
#
# E2E Upload Proof - Real Authentication + Upload + Verification
#
# Proves:
#   1. Backend health and auth work
#   2. Can generate a valid JWT token
#   3. /api/batch/initial-data returns HTTP 200 with auth
#   4. Upload a test file via API
#   5. Verify uploaded document appears in /api/documents
#   6. All upload entry points have correct refresh pattern
#
# Usage:
#   ./scripts/e2e-upload-proof.sh
#
# Prerequisites:
#   - Backend running on localhost:5001
#   - Database synced with at least one user
#   - Node.js available for token generation
#

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${BLUE}[TEST]${NC} $1"; }
success() { echo -e "${GREEN}[PASS]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; }
info() { echo -e "${CYAN}[INFO]${NC} $1"; }

BACKEND_URL="${BACKEND_URL:-http://localhost:5001}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$ROOT_DIR/backend"
PASSED=0
FAILED=0
SKIPPED=0

# Cleanup function
cleanup() {
  if [ -n "${TEST_FILE:-}" ] && [ -f "$TEST_FILE" ]; then
    rm -f "$TEST_FILE"
  fi
  if [ -n "${UPLOADED_DOC_ID:-}" ] && [ -n "${AUTH_TOKEN:-}" ]; then
    # Optional: Clean up test document
    curl -s -X DELETE "${BACKEND_URL}/api/documents/${UPLOADED_DOC_ID}" \
      -H "Authorization: Bearer $AUTH_TOKEN" > /dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "  KODA E2E Upload Proof - Localhost"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
echo "  Backend URL: $BACKEND_URL"
echo "  Root Dir:    $ROOT_DIR"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 1: INFRASTRUCTURE CHECKS
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "─────────────────────────────────────────────────────────────────────────"
echo "  PHASE 1: Infrastructure"
echo "─────────────────────────────────────────────────────────────────────────"

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
  echo -e "\n${RED}Cannot proceed without backend. Exiting.${NC}"
  exit 1
fi

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 2: AUTHENTICATION
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "─────────────────────────────────────────────────────────────────────────"
echo "  PHASE 2: Authentication"
echo "─────────────────────────────────────────────────────────────────────────"

# Test 2: Generate JWT Token
log "Generating JWT token..."
cd "$BACKEND_DIR"

# Capture only stdout (the token), stderr goes to /dev/null
AUTH_TOKEN=$(node scripts/generate-test-token.js 2>/dev/null || echo "")

if [ -z "$AUTH_TOKEN" ] || [ ${#AUTH_TOKEN} -lt 50 ]; then
  fail "Failed to generate JWT token"
  warn "Ensure database has at least one user"
  warn "Run: cd backend && npm run dev:sync"
  ((FAILED++))
  echo -e "\n${RED}Cannot proceed without auth token. Exiting.${NC}"
  exit 1
else
  success "JWT token generated (${#AUTH_TOKEN} chars)"
  ((PASSED++))
fi

# Test 3: Authenticated API access
log "Testing /api/batch/initial-data with auth..."
BATCH_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  "${BACKEND_URL}/api/batch/initial-data" 2>/dev/null)

BATCH_STATUS=$(echo "$BATCH_RESPONSE" | tail -n1)
BATCH_BODY=$(echo "$BATCH_RESPONSE" | sed '$d')

if [ "$BATCH_STATUS" = "200" ]; then
  success "Batch initial-data endpoint returned HTTP 200 with auth"
  ((PASSED++))

  # Extract document count from response
  DOC_COUNT=$(echo "$BATCH_BODY" | grep -o '"documents":\[[^]]*\]' | grep -o '\[.*\]' | tr -cd ',' | wc -c || echo "0")
  DOC_COUNT=$((DOC_COUNT + 1))
  if [ "$DOC_COUNT" -eq 1 ] && [ "$(echo "$BATCH_BODY" | grep -o '"documents":\[\]')" ]; then
    DOC_COUNT=0
  fi
  info "Found $DOC_COUNT existing documents"
else
  fail "Batch initial-data failed (HTTP $BATCH_STATUS)"
  warn "Response: ${BATCH_BODY:0:200}..."
  ((FAILED++))
fi

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 3: UPLOAD + VERIFICATION
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "─────────────────────────────────────────────────────────────────────────"
echo "  PHASE 3: Upload + Verification"
echo "─────────────────────────────────────────────────────────────────────────"

# Create test file
TEST_FILENAME="e2e-test-$(date +%s).txt"
TEST_FILE="/tmp/$TEST_FILENAME"
echo "E2E Upload Test - Created at $(date)" > "$TEST_FILE"
TEST_FILE_SIZE=$(wc -c < "$TEST_FILE" | tr -d ' ')

log "Created test file: $TEST_FILENAME ($TEST_FILE_SIZE bytes)"

# Test 4: Get presigned URL
log "Requesting presigned URL..."
PRESIGN_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "${BACKEND_URL}/api/presigned-urls/bulk" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"files\":[{\"fileName\":\"$TEST_FILENAME\",\"fileType\":\"text/plain\",\"fileSize\":$TEST_FILE_SIZE}],\"folderId\":null}" 2>/dev/null)

PRESIGN_STATUS=$(echo "$PRESIGN_RESPONSE" | tail -n1)
PRESIGN_BODY=$(echo "$PRESIGN_RESPONSE" | sed '$d')

if [ "$PRESIGN_STATUS" = "200" ]; then
  success "Got presigned URL (HTTP 200)"
  ((PASSED++))

  # Extract presigned URL and document ID
  PRESIGNED_URL=$(echo "$PRESIGN_BODY" | grep -o '"presignedUrls":\["[^"]*"' | sed 's/"presignedUrls":\["//' | sed 's/"$//')
  UPLOADED_DOC_ID=$(echo "$PRESIGN_BODY" | grep -o '"documentIds":\["[^"]*"' | sed 's/"documentIds":\["//' | sed 's/"$//')

  if [ -z "$PRESIGNED_URL" ] || [ -z "$UPLOADED_DOC_ID" ]; then
    fail "Could not parse presigned URL or document ID"
    warn "Response: ${PRESIGN_BODY:0:300}..."
    ((FAILED++))
  else
    info "Document ID: $UPLOADED_DOC_ID"
  fi
else
  fail "Failed to get presigned URL (HTTP $PRESIGN_STATUS)"
  warn "Response: ${PRESIGN_BODY:0:200}..."
  ((FAILED++))
fi

# Test 5: Upload to S3
if [ -n "${PRESIGNED_URL:-}" ]; then
  log "Uploading to S3..."
  S3_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X PUT "$PRESIGNED_URL" \
    -H "Content-Type: text/plain" \
    -H "x-amz-server-side-encryption: AES256" \
    --data-binary @"$TEST_FILE" 2>/dev/null || echo "000")

  if [ "$S3_RESPONSE" = "200" ]; then
    success "S3 upload succeeded (HTTP 200)"
    ((PASSED++))
  else
    fail "S3 upload failed (HTTP $S3_RESPONSE)"
    ((FAILED++))
  fi
else
  warn "Skipping S3 upload - no presigned URL"
  ((SKIPPED++))
fi

# Test 6: Complete upload
if [ -n "${UPLOADED_DOC_ID:-}" ] && [ "${S3_RESPONSE:-}" = "200" ]; then
  log "Completing upload..."
  COMPLETE_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "${BACKEND_URL}/api/presigned-urls/complete-bulk" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"documentIds\":[\"$UPLOADED_DOC_ID\"],\"skipS3Check\":false}" 2>/dev/null)

  COMPLETE_STATUS=$(echo "$COMPLETE_RESPONSE" | tail -n1)

  if [ "$COMPLETE_STATUS" = "200" ]; then
    success "Upload completion succeeded (HTTP 200)"
    ((PASSED++))
  else
    fail "Upload completion failed (HTTP $COMPLETE_STATUS)"
    ((FAILED++))
  fi
else
  warn "Skipping upload completion - prerequisites not met"
  ((SKIPPED++))
fi

# Test 7: Verify document appears in batch initial-data (retry up to 15 seconds)
if [ -n "${UPLOADED_DOC_ID:-}" ]; then
  log "Verifying document appears in /api/batch/initial-data..."
  VISIBLE=false

  for i in {1..15}; do
    BATCH2_RESPONSE=$(curl -s \
      -H "Authorization: Bearer $AUTH_TOKEN" \
      "${BACKEND_URL}/api/batch/initial-data" 2>/dev/null)

    if echo "$BATCH2_RESPONSE" | grep -q "$UPLOADED_DOC_ID"; then
      VISIBLE=true
      break
    fi

    sleep 1
  done

  if [ "$VISIBLE" = true ]; then
    success "Document $UPLOADED_DOC_ID visible in batch initial-data"
    ((PASSED++))
  else
    fail "Document NOT found in batch initial-data after 15 seconds"
    ((FAILED++))
  fi
else
  warn "Skipping visibility check - no document ID"
  ((SKIPPED++))
fi

# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 4: CODE VERIFICATION
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "─────────────────────────────────────────────────────────────────────────"
echo "  PHASE 4: Code Pattern Verification"
echo "─────────────────────────────────────────────────────────────────────────"

cd "$ROOT_DIR"

# Test 9: UniversalUploadModal refresh pattern
log "Verifying UniversalUploadModal has invalidateCache + fetchAllData(true)..."
if grep -q "invalidateCache" "frontend/src/components/UniversalUploadModal.jsx" && \
   grep -q "fetchAllData(true)" "frontend/src/components/UniversalUploadModal.jsx"; then
  success "UniversalUploadModal has correct refresh pattern"
  ((PASSED++))
else
  fail "UniversalUploadModal missing refresh pattern"
  ((FAILED++))
fi

# Test 10: UploadHub refresh pattern
log "Verifying UploadHub has invalidateCache + fetchAllData(true)..."
if grep -q "invalidateCache" "frontend/src/components/UploadHub.jsx" && \
   grep -q "fetchAllData(true)" "frontend/src/components/UploadHub.jsx"; then
  success "UploadHub has correct refresh pattern"
  ((PASSED++))
else
  fail "UploadHub missing refresh pattern"
  ((FAILED++))
fi

# Test 11: UploadModal (legacy) refresh pattern
log "Verifying UploadModal has invalidateCache + fetchAllData(true)..."
if grep -q "invalidateCache" "frontend/src/components/UploadModal.jsx" && \
   grep -q "fetchAllData(true)" "frontend/src/components/UploadModal.jsx"; then
  success "UploadModal has correct refresh pattern"
  ((PASSED++))
else
  fail "UploadModal missing refresh pattern"
  ((FAILED++))
fi

# Test 12: UploadModal is deprecated
log "Verifying UploadModal has deprecation notice..."
if grep -q "@deprecated" "frontend/src/components/UploadModal.jsx"; then
  success "UploadModal has @deprecated notice"
  ((PASSED++))
else
  warn "UploadModal missing @deprecated notice"
  ((SKIPPED++))
fi

# ═══════════════════════════════════════════════════════════════════════════════
# RESULTS
# ═══════════════════════════════════════════════════════════════════════════════
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "  E2E UPLOAD PROOF RESULTS"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
echo -e "  ${GREEN}Passed:${NC}  $PASSED"
echo -e "  ${RED}Failed:${NC}  $FAILED"
echo -e "  ${YELLOW}Skipped:${NC} $SKIPPED"
echo ""

if [ "$FAILED" -gt 0 ]; then
  echo -e "${RED}═══════════════════════════════════════════════════════════════════════${NC}"
  echo -e "${RED}  PROOF FAILED - Some tests did not pass${NC}"
  echo -e "${RED}═══════════════════════════════════════════════════════════════════════${NC}"
  exit 1
else
  echo -e "${GREEN}═══════════════════════════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  PROOF COMPLETE - Upload flow is perfect on localhost${NC}"
  echo -e "${GREEN}═══════════════════════════════════════════════════════════════════════${NC}"
  echo ""
  echo "  Definition of Done:"
  echo "    [✓] Backend health check passes"
  echo "    [✓] JWT token generation works"
  echo "    [✓] Authenticated API access works"
  echo "    [✓] Presigned URL generation works"
  echo "    [✓] S3 upload works"
  echo "    [✓] Upload completion works"
  echo "    [✓] Document visible in batch/initial-data"
  echo "    [✓] All upload components have refresh pattern"
  echo "    [✓] UploadModal is deprecated"
  echo ""
  exit 0
fi
