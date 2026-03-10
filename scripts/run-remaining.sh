#!/usr/bin/env bash
# run-remaining.sh — Run Q094-Q100 with temp-file approach to avoid arg-list-too-long
set -euo pipefail

API_BASE="http://localhost:5000/api/chat"
OUTDIR="C:/Users/Pedro/Desktop/webapp/reports/query-grading-v2"
TMPDIR_LOCAL="C:/Users/Pedro/Desktop/webapp/reports/tmp"
mkdir -p "$OUTDIR" "$TMPDIR_LOCAL"

# ── Auth ──────────────────────────────────────────────────
echo "=== Authenticating ==="
AUTH_RESPONSE=$(curl -s http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@allybi.com","password":"test123"}')
TOKEN=$(echo "$AUTH_RESPONSE" | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).accessToken)}catch(e){console.error('Auth failed');process.exit(1)}})")
echo "Token acquired: ${TOKEN:0:20}..."

TABELA="ef8f193a-3a70-42ee-a0bf-a925a86f484d"

send_query_safe() {
  local qnum="$1"
  local convid="$2"
  local docid="$3"
  local message="$4"
  local padded
  padded=$(printf '%03d' "$qnum")
  local outfile="$OUTDIR/Q${padded}.json"
  local tmpfile="$TMPDIR_LOCAL/resp_${padded}.json"
  local msgfile="$TMPDIR_LOCAL/msg_${padded}.txt"

  echo "[Q${padded}] Sending..."

  # Write message to file to avoid arg-list issues
  echo "$message" > "$msgfile"

  local body
  body=$(node -e "
    const msg = require('fs').readFileSync(process.argv[1], 'utf8').trim();
    console.log(JSON.stringify({
      message: msg,
      conversationId: process.argv[2],
      documentIds: [process.argv[3]]
    }));
  " "$msgfile" "$convid" "$docid")

  curl -s --max-time 180 \
    "$API_BASE/chat" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$body" > "$tmpfile" 2>/dev/null || echo '{"error":"curl_timeout"}' > "$tmpfile"

  # Build metadata using temp file to avoid arg-list-too-long
  node -e "
    const fs = require('fs');
    const resp = fs.readFileSync(process.argv[1], 'utf8');
    const question = fs.readFileSync(process.argv[2], 'utf8').trim();
    const meta = {
      queryNumber: process.argv[3],
      conversationId: process.argv[4],
      documentId: process.argv[5],
      question: question,
      timestamp: new Date().toISOString(),
      rawResponse: null,
      answer: null,
      error: null
    };
    try {
      const parsed = JSON.parse(resp);
      meta.rawResponse = parsed;
      meta.answer = parsed.assistantText || (parsed.data && parsed.data.assistantText) || parsed.content || null;
      if (parsed.error) meta.error = parsed.error;
    } catch(e) {
      meta.rawResponse = resp;
      meta.error = 'JSON parse failed: ' + e.message;
    }
    fs.writeFileSync(process.argv[6], JSON.stringify(meta, null, 2));
  " "$tmpfile" "$msgfile" "Q${padded}" "$convid" "$docid" "$outfile"

  echo "[Q${padded}] Saved -> $outfile"
}

# Use the same conversation from the original run for Tabela 1.1
# Need to create a new one since the old one may be stale
echo ">>> Creating conversation for Tabela 1.1 (remaining queries)..."
CONV_TABELA=$(curl -s "$API_BASE/conversations" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Grading v2: Tabela 1.1 IBGE (remaining)"}' | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).data.id)}catch(e){console.error('Conv create failed');process.exit(1)}})")
echo "    Conv ID: $CONV_TABELA"

send_query_safe 94  "$CONV_TABELA" "$TABELA" "List the visible geographies in the sheet snippet and their hierarchy."
send_query_safe 95  "$CONV_TABELA" "$TABELA" "Extract the 2024 values for every visible row in the sheet preview."
send_query_safe 96  "$CONV_TABELA" "$TABELA" "Which visible geography has the highest total number of registered live births in the excerpt?"
send_query_safe 97  "$CONV_TABELA" "$TABELA" "Compare Total versus Brasil (1) and explain what that difference might represent."
send_query_safe 98  "$CONV_TABELA" "$TABELA" "Identify all rows in the visible excerpt that contain dashes, blanks, notes, or footnote markers."
send_query_safe 99  "$CONV_TABELA" "$TABELA" "Build a table with the visible rows only: geography | total records | before 2016 | 2024."
send_query_safe 100 "$CONV_TABELA" "$TABELA" "Write a concise statistical summary of the visible excerpt, highlighting the main regional patterns and any data caveats."

echo ""
echo "=== Remaining 7 queries complete ==="
TOTAL=$(ls "$OUTDIR"/Q*.json 2>/dev/null | wc -l)
echo "Total response files: $TOTAL"

# Cleanup tmp
rm -rf "$TMPDIR_LOCAL"
