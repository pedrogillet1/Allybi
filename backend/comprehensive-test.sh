#!/bin/bash

# Comprehensive File Action Tests
# Tests all file/folder operations via API

BASE_URL="http://localhost:5000"

# Get auth token
echo "=== Getting auth token ==="
TOKEN=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@koda.com","password":"test123"}' | jq -r '.accessToken')

if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
  echo "Failed to get auth token"
  exit 1
fi
echo "Token obtained: ${TOKEN:0:20}..."

# Helper function to make chat requests
chat() {
  local msg="$1"
  echo ""
  echo ">>> Testing: $msg"
  curl -s -X POST "$BASE_URL/api/chat/stream" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"message\":\"$msg\"}" 2>&1 | grep -E '(type|success|message|answerMode|confirmLabel|title|filename)' | head -10
}

echo ""
echo "============================================"
echo "COMPREHENSIVE FILE ACTION TESTS"
echo "============================================"

# Test 1: Create root folder
echo ""
echo "=== TEST 1: Create root folder ==="
chat "create folder MainFolder"

# Test 2: Create subfolder inside MainFolder
echo ""
echo "=== TEST 2: Create subfolder inside MainFolder ==="
chat "create folder SubFolder inside MainFolder"

# Test 3: Create another subfolder with different syntax
echo ""
echo "=== TEST 3: Create folder with 'called' syntax ==="
chat "create a folder called NestedFolder in SubFolder"

# Test 4: Rename a folder
echo ""
echo "=== TEST 4: Rename folder ==="
chat "rename folder NestedFolder to RenamedNested"

# Test 5: Move folder to another folder
echo ""
echo "=== TEST 5: Move folder to another folder ==="
chat "move folder RenamedNested to MainFolder"

# Test 6: Delete folder (should show confirmation)
echo ""
echo "=== TEST 6: Delete folder (confirmation) ==="
chat "delete folder SubFolder"

# Test 7: Move file to folder (will fail if no files exist, but tests detection)
echo ""
echo "=== TEST 7: Move file to folder ==="
chat "move document.pdf to MainFolder"

# Test 8: Move file to subfolder
echo ""
echo "=== TEST 8: Move file to subfolder ==="
chat "move report.pdf to RenamedNested"

# Test 9: Copy file
echo ""
echo "=== TEST 9: Copy file ==="
chat "copy budget.xlsx to MainFolder"

# Test 10: Rename file
echo ""
echo "=== TEST 10: Rename file ==="
chat "rename invoice.pdf to invoice_2024.pdf"

# Test 11: Delete file (should show confirmation)
echo ""
echo "=== TEST 11: Delete file (confirmation) ==="
chat "delete old_report.pdf"

# Test 12: Undo last action
echo ""
echo "=== TEST 12: Undo ==="
chat "undo"

# Test 13: Open folder (should return pill button)
echo ""
echo "=== TEST 13: Open folder ==="
chat "open folder MainFolder"

# Test 14: Open file
echo ""
echo "=== TEST 14: Open file ==="
chat "open document.pdf"

# Test 15: Portuguese - Create folder
echo ""
echo "=== TEST 15: Portuguese - Create folder ==="
chat "criar pasta TestePT"

# Test 16: Portuguese - Delete folder
echo ""
echo "=== TEST 16: Portuguese - Delete folder ==="
chat "excluir pasta TestePT"

# Test 17: Move folder to root
echo ""
echo "=== TEST 17: Move folder to root ==="
chat "move folder RenamedNested to root"

# Test 18: Create folder with special characters
echo ""
echo "=== TEST 18: Create folder with quotes ==="
chat 'create folder "My Documents 2024"'

echo ""
echo "============================================"
echo "TESTS COMPLETE"
echo "============================================"
