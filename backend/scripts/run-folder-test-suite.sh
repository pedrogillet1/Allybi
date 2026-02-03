#!/bin/bash
# Koda Folder-Awareness Test Suite (25 queries)
# Runs ALL queries in a SINGLE conversation to test context continuity.
# Uses the non-streaming /api/chat/chat endpoint.

TOKEN=$(cat /tmp/koda_test_token.txt 2>/dev/null)
BASE="http://localhost:5000/api/chat/chat"
CONV_ID=""

if [ -z "$TOKEN" ]; then
  echo "Error: No token found at /tmp/koda_test_token.txt"
  echo "Generate one first."
  exit 1
fi

PASS=0
FAIL=0
TOTAL=0

run_query() {
  local num="$1"
  local section="$2"
  local query="$3"
  local expect_class="$4"   # DOCUMENT, NAVIGATION, GENERAL, or "any"
  local description="$5"

  TOTAL=$((TOTAL + 1))

  # Build JSON body — include conversationId if we have one
  local body
  if [ -n "$CONV_ID" ]; then
    body=$(python3 -c "import json; print(json.dumps({'message': '''$query''', 'conversationId': '$CONV_ID'}))")
  else
    body=$(python3 -c "import json; print(json.dumps({'message': '''$query'''}))")
  fi

  local response
  response=$(curl -s -X POST "$BASE" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$body" \
    --max-time 120 2>&1)

  # Parse response
  local parsed
  parsed=$(echo "$response" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    data = d.get('data', d)
    print(json.dumps({
        'conversationId': data.get('conversationId', ''),
        'answerMode': data.get('answerMode', '?'),
        'answerClass': data.get('answerClass', 'null'),
        'navType': str(data.get('navType', 'null')),
        'sourceCount': len(data.get('sources', [])),
        'listingCount': len(data.get('listing', [])),
        'breadcrumbPath': ' > '.join([b.get('name','') for b in data.get('breadcrumb', [])]),
        'text': (data.get('assistantText', '') or '')[:150],
        'error': d.get('error', ''),
    }))
except Exception as e:
    print(json.dumps({'error': str(e), 'conversationId': '', 'answerMode': '?', 'answerClass': 'null', 'navType': 'null', 'sourceCount': 0, 'listingCount': 0, 'breadcrumbPath': '', 'text': ''}))
" 2>/dev/null)

  local convId=$(echo "$parsed" | python3 -c "import sys,json; print(json.load(sys.stdin)['conversationId'])" 2>/dev/null)
  local answerMode=$(echo "$parsed" | python3 -c "import sys,json; print(json.load(sys.stdin)['answerMode'])" 2>/dev/null)
  local answerClass=$(echo "$parsed" | python3 -c "import sys,json; print(json.load(sys.stdin)['answerClass'])" 2>/dev/null)
  local navType=$(echo "$parsed" | python3 -c "import sys,json; print(json.load(sys.stdin)['navType'])" 2>/dev/null)
  local sourceCount=$(echo "$parsed" | python3 -c "import sys,json; print(json.load(sys.stdin)['sourceCount'])" 2>/dev/null)
  local listingCount=$(echo "$parsed" | python3 -c "import sys,json; print(json.load(sys.stdin)['listingCount'])" 2>/dev/null)
  local breadcrumbPath=$(echo "$parsed" | python3 -c "import sys,json; print(json.load(sys.stdin)['breadcrumbPath'])" 2>/dev/null)
  local text=$(echo "$parsed" | python3 -c "import sys,json; print(json.load(sys.stdin)['text'])" 2>/dev/null)
  local error=$(echo "$parsed" | python3 -c "import sys,json; print(json.load(sys.stdin)['error'])" 2>/dev/null)

  # Update conversation ID for subsequent queries
  if [ -n "$convId" ] && [ "$convId" != "" ] && [ "$convId" != "null" ]; then
    CONV_ID="$convId"
  fi

  # Check for errors
  if [ -n "$error" ] && [ "$error" != "" ] && [ "$error" != "None" ]; then
    echo "  ❌ #$num [$section] $description"
    echo "     ERROR: $error"
    FAIL=$((FAIL + 1))
    echo ""
    return
  fi

  # Validate answerClass
  local result="PASS"
  local reason=""

  if [ "$expect_class" != "any" ]; then
    if [ "$answerClass" != "$expect_class" ]; then
      result="FAIL"
      reason="Expected answerClass=$expect_class, got $answerClass"
    fi
  fi

  if [ "$result" = "PASS" ]; then
    PASS=$((PASS + 1))
    echo "  ✅ #$num [$section] $description"
  else
    FAIL=$((FAIL + 1))
    echo "  ❌ #$num [$section] $description"
    echo "     REASON: $reason"
  fi
  echo "     answerMode=$answerMode  answerClass=$answerClass  sources=$sourceCount  listing=$listingCount  navType=$navType"
  if [ -n "$breadcrumbPath" ] && [ "$breadcrumbPath" != "" ] && [ "$breadcrumbPath" != "None" ]; then
    echo "     breadcrumb: $breadcrumbPath"
  fi
  echo "     ${text}..."
  echo ""
}

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  🗂️  Koda Folder-Awareness Test Suite (25 queries)"
echo "  All queries run in ONE conversation for context continuity"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ─── A. Folder Tree Awareness (pure navigation) ──────────────────
echo "🧭 A — Folder Tree Awareness (pure navigation)"
echo "────────────────────────────────────────────────────────────"

run_query 1  "NAV" "Show me the full folder tree starting from the root." "any" "Full folder tree enumeration"
run_query 2  "NAV" "Which folders exist at the top level?" "any" "Root-level folder awareness"
run_query 3  "NAV" "What files are inside the folder trabalhos?" "any" "Exact folder lookup"
run_query 4  "NAV" "List all subfolders inside trabalhos and how many files each contains." "any" "Nested traversal + counting"
run_query 5  "NAV" "Which folder contains the most files?" "any" "Aggregation over folders"

# ─── B. File Location Queries ─────────────────────────────────────
echo "📍 B — File Location Queries"
echo "────────────────────────────────────────────────────────────"

run_query 6  "LOC" "Where is the file Lone_Mountain_Ranch_P_L_2024.xlsx located in the folder tree?" "any" "File → folder resolution"
run_query 7  "LOC" "Which folder does Lone_Mountain_Ranch_P_L_2025__Budget_.xlsx belong to?" "any" "File → folder resolution (2)"
run_query 8  "LOC" "List the full path of every spreadsheet file." "any" "Multi-file path reporting"
run_query 9  "LOC" "Are there files with the same name in different folders?" "any" "Duplicate name handling"
run_query 10 "LOC" "Which folder contains financial spreadsheets?" "any" "Semantic grouping + location"

# ─── C. Scoped Search by Folder ──────────────────────────────────
echo "🔍 C — Scoped Search by Folder"
echo "────────────────────────────────────────────────────────────"

run_query 11 "SCOPE" "Search only inside the folder trabalhos for files mentioning revenue." "any" "Strict folder scoping"
run_query 12 "SCOPE" "Inside the trabalhos subfolders, which files mention lucro?" "any" "Scoped semantic search"
run_query 13 "SCOPE" "Ignore the root — only search subfolders for budget documents." "any" "Exclusion logic"
run_query 14 "SCOPE" "Which folder should I look in if I want budget or forecast files?" "any" "Folder inference"

# ─── D. Cross-Folder Comparison ──────────────────────────────────
echo "📊 D — Cross-Folder Comparison"
echo "────────────────────────────────────────────────────────────"

run_query 15 "XFOLD" "Compare the spreadsheets in each folder and tell me which folder contains the most recent data." "any" "Folder-level comparison"
run_query 16 "XFOLD" "Do different folders contain different versions of the same report?" "any" "Version reasoning + location"
run_query 17 "XFOLD" "Which folders contain raw data versus summarized reports?" "any" "Document archetype + location"

# ─── E. Source Pill + Preview Validation ──────────────────────────
echo "🖱️  E — Source Pill + Preview Validation"
echo "────────────────────────────────────────────────────────────"

run_query 18 "SRC" "Open the spreadsheet located in trabalhos that contains operating revenue." "any" "Open operator + correct file selection"
run_query 19 "SRC" "Show me the source file from the deepest subfolder." "any" "Depth awareness"
run_query 20 "SRC" "Click the source you just used and tell me which folder it is in." "any" "Round-trip source metadata"

# ─── F. Folder-Driven Reasoning ──────────────────────────────────
echo "🧠 F — Folder-Driven Reasoning"
echo "────────────────────────────────────────────────────────────"

run_query 21 "REASON" "If I am analyzing finances, which folder should I focus on first and why?" "any" "Judgment + folder understanding"
run_query 22 "REASON" "Which folder seems incomplete or missing expected documents?" "any" "Gap detection at folder level"
run_query 23 "REASON" "Are there folders that look redundant or overlapping in purpose?" "any" "Structural reasoning"
run_query 24 "REASON" "What is the purpose of each folder based on its contents?" "any" "Semantic summarization by folder"
run_query 25 "REASON" "If I upload a new budget file, which folder should it go in?" "any" "Advisory behavior + structure"

# ─── Summary ──────────────────────────────────────────────────────
echo "═══════════════════════════════════════════════════════════════"
echo "  📊 RESULTS: $PASS passed / $FAIL failed / $TOTAL total"
echo "  🔗 Conversation ID: $CONV_ID"
echo "═══════════════════════════════════════════════════════════════"
