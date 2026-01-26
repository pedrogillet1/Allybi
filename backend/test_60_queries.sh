#!/bin/bash
# 60-Query Comprehensive Test Suite
# Captures: intent, operator, citations, answer, trace data

API_URL="http://localhost:5000/api/chat"
RESULTS_FILE="/tmp/60_query_results.jsonl"
FAILURES_FILE="/tmp/60_query_failures.md"

# Clear previous results
> "$RESULTS_FILE"
> "$FAILURES_FILE"

echo "# 60-Query Test Results - $(date)" >> "$FAILURES_FILE"
echo "" >> "$FAILURES_FILE"

# Create conversation
create_conv() {
  curl -s -X POST "$API_URL/conversations" \
    -H "Content-Type: application/json" \
    -H "X-Dev-Auth: 1" \
    -d "{\"title\":\"$1\"}" | jq -r '.conversationId // .id'
}

# Send message and capture full response
send_msg() {
  local conv_id="$1"
  local query="$2"
  local turn="$3"

  local response=$(curl -s -X POST "$API_URL/conversations/$conv_id/messages/stream" \
    -H "Content-Type: application/json" \
    -H "X-Dev-Auth: 1" \
    -H "Accept: text/event-stream" \
    -d "{\"query\":\"$query\"}" 2>&1 | \
    grep -E "^data:" | sed 's/^data: //' | \
    jq -s 'map(select(.type == "done")) | .[0]' 2>/dev/null)

  # Extract key fields
  local intent=$(echo "$response" | jq -r '.intent // "null"')
  local operator=$(echo "$response" | jq -r '.operator // "null"')
  local citations=$(echo "$response" | jq -r '[.citations[]?.documentName] | join(", ") // "none"')
  local answer=$(echo "$response" | jq -r '.fullAnswer // "NO_ANSWER"')
  local docs_used=$(echo "$response" | jq -r '.documentsUsed // 0')

  # Determine pass/fail
  local status="PASS"
  local failure_reason=""

  # Check for empty answer
  if [ "$answer" = "NO_ANSWER" ] || [ -z "$answer" ]; then
    status="FAIL"
    failure_reason="Empty answer"
  fi

  # Check for "no relevant information" when we expected content
  if echo "$answer" | grep -qi "no relevant information"; then
    status="WARN"
    failure_reason="No relevant info found"
  fi

  # Log result
  echo "{\"turn\":$turn,\"query\":\"$query\",\"intent\":\"$intent\",\"operator\":\"$operator\",\"citations\":\"$citations\",\"docs_used\":$docs_used,\"status\":\"$status\",\"answer_preview\":\"${answer:0:200}\"}" >> "$RESULTS_FILE"

  # Log failures
  if [ "$status" != "PASS" ]; then
    echo "## Turn $turn: $status" >> "$FAILURES_FILE"
    echo "**Query:** $query" >> "$FAILURES_FILE"
    echo "**Intent:** $intent | **Operator:** $operator" >> "$FAILURES_FILE"
    echo "**Citations:** $citations" >> "$FAILURES_FILE"
    echo "**Reason:** $failure_reason" >> "$FAILURES_FILE"
    echo "**Answer Preview:** ${answer:0:300}" >> "$FAILURES_FILE"
    echo "" >> "$FAILURES_FILE"
  fi

  # Output for terminal
  printf "T%02d [%s] %s → %s/%s (%s)\n" "$turn" "$status" "${query:0:40}..." "$intent" "$operator" "$citations"

  # Small delay between requests
  sleep 1
}

echo "=========================================="
echo "PHASE 1: Mezanino PDF (Turns 1-15)"
echo "=========================================="

CONV1=$(create_conv "Phase1_Mezanino")
echo "Conversation: $CONV1"

send_msg "$CONV1" "Use analise_mezanino_guarda_moveis.pdf. Summarize the deal in 5 bullets." 1
send_msg "$CONV1" "Confirm you are using that PDF (yes/no)." 2
send_msg "$CONV1" "What is the total investment amount? (one line)" 3
send_msg "$CONV1" "Make a table: investment, incremental revenue/month, incremental net profit/month, payback period." 4
send_msg "$CONV1" "Quote the sentence that states the main conclusion (short quote)." 5
send_msg "$CONV1" "List the top 5 assumptions (bullets)." 6
send_msg "$CONV1" "List the top 5 risks (bullets)." 7
send_msg "$CONV1" "Extract any timeline/date references (table)." 8
send_msg "$CONV1" "Does it mention covenants or constraints? If yes, list them (bullets). If not, say not found." 9
send_msg "$CONV1" "Answer in JSON with keys: investment, revenue_monthly, profit_monthly, payback." 10
send_msg "$CONV1" "Now, without switching docs, explain the payback logic in 3 bullets." 11
send_msg "$CONV1" "What section/title does the conclusion appear under? (if available)" 12
send_msg "$CONV1" "If the PDF includes any charts/tables, list their titles (or say not found)." 13
send_msg "$CONV1" "Show me the 3 most important numbers in the deal (bullets)." 14
send_msg "$CONV1" "Now: only use this PDF, not any spreadsheet." 15

echo ""
echo "=========================================="
echo "PHASE 2: XLSX P&L Budget (Turns 16-35)"
echo "=========================================="

CONV2=$(create_conv "Phase2_LMR_Budget")
echo "Conversation: $CONV2"

send_msg "$CONV2" "Switch to Lone Mountain Ranch P&L 2025 (Budget).xlsx. List sheet names." 16
send_msg "$CONV2" "What is total revenue for the year? (value + label)" 17
send_msg "$CONV2" "Give a table: Revenue, Total Expenses, GOP, NOI (or not found)." 18
send_msg "$CONV2" "Give top 5 revenue lines (table)." 19
send_msg "$CONV2" "Give top 5 expense lines (table)." 20
send_msg "$CONV2" "If Rooms Revenue exists, give its value (and where). If not found, say not found." 21
send_msg "$CONV2" "If Food and Beverage exists, give its value (and where). If not found, say not found." 22
send_msg "$CONV2" "Now do the same but for Payroll expense." 23
send_msg "$CONV2" "Compute GOP margin percent if possible. If not possible from the file, say why." 24
send_msg "$CONV2" "Now: not budget - use actuals." 25
send_msg "$CONV2" "Undo that: use the budget workbook again." 26
send_msg "$CONV2" "Return the Revenue/Expenses/GOP/NOI table again." 27
send_msg "$CONV2" "Answer briefly: what is the biggest expense category?" 28
send_msg "$CONV2" "Answer briefly: what is the biggest revenue category?" 29
send_msg "$CONV2" "Show the same answer but as bullets." 30
send_msg "$CONV2" "Show the same answer but as JSON." 31
send_msg "$CONV2" "Confirm which file you used (filename)." 32
send_msg "$CONV2" "Now ask: show me Q2 only" 33
send_msg "$CONV2" "If quarters not found, ask me one question that would let you answer (max 1)." 34
send_msg "$CONV2" "Now: stop asking questions, just answer" 35

echo ""
echo "=========================================="
echo "PHASE 3: Scanned Scrum OCR PDF (Turns 36-50)"
echo "=========================================="

CONV3=$(create_conv "Phase3_Scrum_OCR")
echo "Conversation: $CONV3"

send_msg "$CONV3" "Switch to Capítulo 8 (Framework Scrum).pdf. List Scrum roles." 36
send_msg "$CONV3" "List Scrum events." 37
send_msg "$CONV3" "List Scrum artifacts." 38
send_msg "$CONV3" "Quote one sentence defining Sprint (short)." 39
send_msg "$CONV3" "Quote one sentence defining Daily Scrum (short)." 40
send_msg "$CONV3" "If the doc mentions timeboxes, list them (table)." 41
send_msg "$CONV3" "Summarize the chapter in 6 bullets." 42
send_msg "$CONV3" "Answer in Portuguese now." 43
send_msg "$CONV3" "If OCR confidence is low, tell me which part was unclear (one line)." 44
send_msg "$CONV3" "If you cannot find a definition, say not found (do not guess)." 45
send_msg "$CONV3" "Now: only use the Scrum PDF, not the other docs." 46
send_msg "$CONV3" "Now ask: What is the total investment?" 47
send_msg "$CONV3" "Now: switch back to the mezanino PDF" 48
send_msg "$CONV3" "Confirm you switched (yes/no)." 49
send_msg "$CONV3" "Give the investment table again." 50

echo ""
echo "=========================================="
echo "PHASE 4: Image OCR + PPTX (Turns 51-60)"
echo "=========================================="

CONV4=$(create_conv "Phase4_Image_PPTX")
echo "Conversation: $CONV4"

send_msg "$CONV4" "Switch to IMG_0330.JPG. Extract main headings only." 51
send_msg "$CONV4" "Turn it into a 2-level help menu (bullets)." 52
send_msg "$CONV4" "Under Features, list all actions mentioned (bullets)." 53
send_msg "$CONV4" "Under Problem, list failures mentioned (bullets)." 54
send_msg "$CONV4" "Find the phrase that mentions embeddings (exact phrase if present)." 55
send_msg "$CONV4" "Switch to guarda bens self storage.pptx. Summarize in 5 bullets." 56
send_msg "$CONV4" "List slide headings (bullets)." 57
send_msg "$CONV4" "If response is truncated, type show more and continue." 58
send_msg "$CONV4" "Identify the single best slide for investors (1 sentence). If not clear, say not found." 59
send_msg "$CONV4" "Confirm which file you used last (filename)." 60

echo ""
echo "=========================================="
echo "TEST COMPLETE"
echo "=========================================="
echo "Results: $RESULTS_FILE"
echo "Failures: $FAILURES_FILE"
