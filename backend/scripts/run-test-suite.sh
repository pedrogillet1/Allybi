#!/bin/bash
# Koda Navigation & Source Accuracy Test Suite
# Runs all 20 test queries against the non-streaming /api/chat/chat endpoint
# and checks answerMode + source correctness.

TOKEN="$1"
BASE="http://localhost:5000/api/chat/chat"

if [ -z "$TOKEN" ]; then
  echo "Usage: ./scripts/run-test-suite.sh <JWT_TOKEN>"
  exit 1
fi

PASS=0
FAIL=0
TOTAL=0

run_test() {
  local test_num="$1"
  local section="$2"
  local query="$3"
  local expect_sources="$4"  # "yes" or "no"
  local description="$5"

  TOTAL=$((TOTAL + 1))

  # Send request (new conversation each time for isolation)
  local response
  response=$(curl -s -X POST "$BASE" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"message\": \"$query\"}" \
    --max-time 120 2>&1)

  local answerMode=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('answerMode','?'))" 2>/dev/null)
  local sourceCount=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('data',{}).get('sources',[])))" 2>/dev/null)
  local navType=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('navType','null'))" 2>/dev/null)
  local text=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); t=d.get('data',{}).get('assistantText',''); print(t[:120])" 2>/dev/null)
  local error_check=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error',''))" 2>/dev/null)

  if [ -n "$error_check" ] && [ "$error_check" != "" ] && [ "$error_check" != "None" ]; then
    echo "  ❌ Test $test_num [$section] — ERROR: $error_check"
    echo "     Query: $query"
    FAIL=$((FAIL + 1))
    return
  fi

  # Determine pass/fail
  local result="PASS"
  local reason=""

  if [ "$expect_sources" = "no" ]; then
    if [ "$sourceCount" != "0" ] && [ "$sourceCount" != "" ]; then
      result="FAIL"
      reason="Expected NO sources, got $sourceCount"
    fi
  elif [ "$expect_sources" = "yes" ]; then
    if [ "$sourceCount" = "0" ] || [ "$sourceCount" = "" ]; then
      result="FAIL"
      reason="Expected sources, got none"
    fi
  fi

  if [ "$result" = "PASS" ]; then
    PASS=$((PASS + 1))
    echo "  ✅ Test $test_num [$section] — $description"
    echo "     answerMode=$answerMode  sources=$sourceCount  navType=$navType"
    echo "     Response: ${text}..."
  else
    FAIL=$((FAIL + 1))
    echo "  ❌ Test $test_num [$section] — $description"
    echo "     REASON: $reason"
    echo "     answerMode=$answerMode  sources=$sourceCount  navType=$navType"
    echo "     Response: ${text}..."
  fi
  echo ""
}

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  🔎 Koda Navigation & Source Accuracy Test Suite"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ─── SECTION 1: Pure Navigation (NO SOURCES) ────────────────────
echo "🧭 SECTION 1 — Pure Navigation (NO SOURCES SHOULD APPEAR)"
echo "────────────────────────────────────────────────────────────"

run_test 1 "NAV" 'Where is the document \"Mezzanine Analysis\"?' "no" "File existence"
run_test 2 "NAV" 'Which folder contains the mezzanine analysis document?' "no" "Folder lookup (semantic)"
run_test 3 "NAV" 'Where did I save the mezzanine investment study?' "no" "Semantic file name"
run_test 4 "NAV" 'List everything inside the Mezzanine folder.' "no" "Folder contents"
run_test 5 "NAV" 'Is there any document related to mezzanine outside the main mezzanine folder?' "no" "Cross-folder navigation"

# ─── SECTION 2: File Actions (NO SOURCES) ───────────────────────
echo "📂 SECTION 2 — File Actions (NO SOURCES)"
echo "────────────────────────────────────────────────────────────"

run_test 6 "ACTION" 'Open the mezzanine analysis document.' "no" "Open file"
run_test 9 "ACTION" 'Create a folder called Archived Financial Studies.' "no" "Create folder"

# ─── SECTION 3: Informational Queries (SOURCES REQUIRED) ────────
echo "📘 SECTION 3 — Informational Queries (SOURCES REQUIRED)"
echo "────────────────────────────────────────────────────────────"

run_test 10 "RAG" 'What is the mezzanine analysis document about?' "yes" "High-level summary"
run_test 11 "RAG" "What's the total investment mentioned in the mezzanine analysis?" "yes" "Financial detail"
run_test 12 "RAG" 'How many square meters is the mezzanine and what cost per m² did they use?' "yes" "Metric extraction"
run_test 13 "RAG" 'List the main assumptions used in the mezzanine analysis.' "yes" "Assumptions"
run_test 14 "RAG" 'What risks or constraints are mentioned in the mezzanine study?' "yes" "Risk analysis"
run_test 15 "RAG" 'Where does the document talk about ROI or payback? Point me to the section.' "yes" "ROI location"
run_test 16 "RAG" 'Is there a timeline or schedule in the mezzanine document?' "conditional" "Timeline extraction"
run_test 17 "RAG" 'Quote the exact sentence where total investment is stated.' "yes" "Exact quote"

# ─── SECTION 4: Semantic Stress Tests ───────────────────────────
echo "🧠 SECTION 4 — Semantic Stress Tests"
echo "────────────────────────────────────────────────────────────"

run_test 18 "STRESS" 'In the mezzanine project study, how much money are we talking about overall?' "yes" "Paraphrased reference"
run_test 19 "STRESS" 'Compare mezzanine investment with warehouse expansion.' "conditional" "Multi-doc guard"
run_test 20 "STRESS" 'What does the mezzanine analysis say about solar panels?' "no" "Negative case"

# ─── Summary ────────────────────────────────────────────────────
echo "═══════════════════════════════════════════════════════════════"
echo "  📊 RESULTS: $PASS passed / $FAIL failed / $TOTAL total"
echo "═══════════════════════════════════════════════════════════════"
