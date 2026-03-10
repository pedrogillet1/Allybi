#!/usr/bin/env bash
# run-100-queries.sh — Runs 90 queries against local chat API
# Each document block (10 queries) shares a single conversation.
# Usage: bash scripts/run-100-queries.sh

set -euo pipefail

API_BASE="http://localhost:5000/api/chat"
OUTDIR="C:/Users/Pedro/Desktop/webapp/reports/query-grading"
mkdir -p "$OUTDIR"

# ── Auth ──────────────────────────────────────────────────
echo "=== Authenticating ==="
AUTH_RESPONSE=$(curl -s http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@allybi.com","password":"test123"}')
TOKEN=$(echo "$AUTH_RESPONSE" | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).accessToken)}catch(e){console.error('Auth failed');process.exit(1)}})")
echo "Token acquired: ${TOKEN:0:20}..."

# ── Document IDs ──────────────────────────────────────────
BESS="839dc857-68f7-4c15-98cc-195ebd46fad1"
GUARDA="d86c1f5b-7b9d-48a8-bfb2-c3aa0b469107"
TRABALHO_PROJ="a2d513cf-b57c-44f7-9453-362566c4edd4"
TRABALHO_FINAL="902a5302-c496-400e-9ae4-c1647ea3e152"
ATT="fa905cd0-6927-48c2-9816-9173cdc37c80"
CERTIDAO="1c4d515b-5d13-4a64-9c69-06d70b4e7528"
SEVIS="bf3d7e46-7ec0-4cc6-9d8d-6220a6c0fd57"
MOVEOUT="333f7db0-78dc-48cd-b2cb-e92cc7b6a3fa"
MAYFAIR="5068942c-8f1a-44c3-9e64-6dc9be211026"

# ── Helpers ───────────────────────────────────────────────
create_conversation() {
  local title="$1"
  local resp
  resp=$(curl -s "$API_BASE/conversations" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"title\":\"$title\"}")
  echo "$resp" | node -e "process.stdin.on('data',d=>{try{console.log(JSON.parse(d).data.id)}catch(e){console.error('Conv create failed: '+d);process.exit(1)}})"
}

send_query() {
  local qnum="$1"
  local convid="$2"
  local docid="$3"
  local message="$4"
  local padded
  padded=$(printf '%03d' "$qnum")
  local outfile="$OUTDIR/Q${padded}.json"

  echo "[Q${padded}] Sending..."

  local body
  body=$(node -e "console.log(JSON.stringify({
    message: process.argv[1],
    conversationId: process.argv[2],
    documentIds: [process.argv[3]]
  }))" "$message" "$convid" "$docid")

  local response
  response=$(curl -s --max-time 180 \
    "$API_BASE/chat" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$body" 2>/dev/null) || response='{"error":"curl_timeout"}'

  # Wrap with metadata
  node -e "
    const r = process.argv[1];
    const meta = {
      queryNumber: 'Q${padded}',
      conversationId: '${convid}',
      documentId: '${docid}',
      question: $(node -e "console.log(JSON.stringify(process.argv[1]))" "$message"),
      timestamp: new Date().toISOString(),
      rawResponse: null,
      answer: null,
      error: null
    };
    try {
      const parsed = JSON.parse(r);
      meta.rawResponse = parsed;
      meta.answer = parsed.assistantText || parsed.data?.assistantText || parsed.content || null;
      if (parsed.error) meta.error = parsed.error;
    } catch(e) {
      meta.rawResponse = r;
      meta.error = 'JSON parse failed: ' + e.message;
    }
    console.log(JSON.stringify(meta, null, 2));
  " "$response" > "$outfile"

  echo "[Q${padded}] Saved -> $outfile"
}

# ── Run per-document blocks ──────────────────────────────

echo ""
echo "=== Starting 90 queries (9 conversations x 10 queries each) ==="
echo "Output: $OUTDIR"
echo ""

# ── Block 1: BESS (Q001-Q010) ────────────────────────────
echo ">>> Creating conversation for BESS document..."
CONV_BESS=$(create_conversation "Grading: BESS Market Assessment")
echo "    Conv ID: $CONV_BESS"
send_query 1  "$CONV_BESS" "$BESS" "Let's start with the BESS market assessment. Give me a concise overview of what this document is trying to prove."
send_query 2  "$CONV_BESS" "$BESS" "What is the main thesis about the Brazilian market potential in this document?"
send_query 3  "$CONV_BESS" "$BESS" "Which market drivers or demand signals are explicitly cited?"
send_query 4  "$CONV_BESS" "$BESS" "Pull out the most important numbers, forecasts, and assumptions."
send_query 5  "$CONV_BESS" "$BESS" "What risks, barriers, or market constraints does the document mention?"
send_query 6  "$CONV_BESS" "$BESS" "Put the core findings into a table: topic | claim | evidence."
send_query 7  "$CONV_BESS" "$BESS" "If I were skeptical, which assumptions in this assessment would I challenge first?"
send_query 8  "$CONV_BESS" "$BESS" "Give me a 60-second executive brief based only on this document."
send_query 9  "$CONV_BESS" "$BESS" "What would still need external validation before I rely on this assessment?"
send_query 10 "$CONV_BESS" "$BESS" "Close this document with a strict recap: clearly supported, suggested, and not evidenced."

# ── Block 2: Guarda Bens Self Storage (Q011-Q020) ────────
echo ""
echo ">>> Creating conversation for Guarda Bens self storage deck..."
CONV_GUARDA=$(create_conversation "Grading: Guarda Bens Self Storage")
echo "    Conv ID: $CONV_GUARDA"
send_query 11 "$CONV_GUARDA" "$GUARDA" "Let's open the self storage deck. What is the overall story the slides are telling?"
send_query 12 "$CONV_GUARDA" "$GUARDA" "Which slides seem to define the problem, the solution, and the offer?"
send_query 13 "$CONV_GUARDA" "$GUARDA" "What market opportunity is described in the presentation?"
send_query 14 "$CONV_GUARDA" "$GUARDA" "What operating model or business concept is presented?"
send_query 15 "$CONV_GUARDA" "$GUARDA" "Which numbers, KPIs, or market data points matter most in the deck?"
send_query 16 "$CONV_GUARDA" "$GUARDA" "Where does the presentation feel strongest from a persuasion standpoint?"
send_query 17 "$CONV_GUARDA" "$GUARDA" "Which claims in the deck need more evidence or support?"
send_query 18 "$CONV_GUARDA" "$GUARDA" "Turn the deck into a 90-second spoken pitch."
send_query 19 "$CONV_GUARDA" "$GUARDA" "If I were an investor or partner, what follow-up questions would I ask after this deck?"
send_query 20 "$CONV_GUARDA" "$GUARDA" "End with the top 5 evidence-based takeaways from the presentation."

# ── Block 3: Trabalho Projeto (Q021-Q030) ────────────────
echo ""
echo ">>> Creating conversation for Trabalho Projeto..."
CONV_TPROJ=$(create_conversation "Grading: Trabalho Projeto")
echo "    Conv ID: $CONV_TPROJ"
send_query 21 "$CONV_TPROJ" "$TRABALHO_PROJ" "Stay on the document called Trabalho projeto. What is the main objective?"
send_query 22 "$CONV_TPROJ" "$TRABALHO_PROJ" "What scope, deliverables, or outputs are defined in this project document?"
send_query 23 "$CONV_TPROJ" "$TRABALHO_PROJ" "Which deadlines, milestones, or phases are explicitly mentioned?"
send_query 24 "$CONV_TPROJ" "$TRABALHO_PROJ" "Who are the stakeholders, owners, or participants named in the document?"
send_query 25 "$CONV_TPROJ" "$TRABALHO_PROJ" "What requirements, constraints, or success criteria are stated?"
send_query 26 "$CONV_TPROJ" "$TRABALHO_PROJ" "What risks, blockers, or unresolved issues appear in the project text?"
send_query 27 "$CONV_TPROJ" "$TRABALHO_PROJ" "Put the scope, deliverables, and risks into a table with evidence."
send_query 28 "$CONV_TPROJ" "$TRABALHO_PROJ" "Does this project look execution-ready or still conceptual? Explain using only the document."
send_query 29 "$CONV_TPROJ" "$TRABALHO_PROJ" "What would need clarification before a team could actually start execution?"
send_query 30 "$CONV_TPROJ" "$TRABALHO_PROJ" "Finish with a short project brief based strictly on this document."

# ── Block 4: TRABALHO FINAL image (Q031-Q040) ────────────
echo ""
echo ">>> Creating conversation for TRABALHO FINAL image..."
CONV_TFINAL=$(create_conversation "Grading: TRABALHO FINAL Image")
echo "    Conv ID: $CONV_TFINAL"
send_query 31 "$CONV_TFINAL" "$TRABALHO_FINAL" "Now switch to the TRABALHO FINAL image and do a careful OCR-style read."
send_query 32 "$CONV_TFINAL" "$TRABALHO_FINAL" "What are the main headings, labels, or visible sections in the image?"
send_query 33 "$CONV_TFINAL" "$TRABALHO_FINAL" "Extract all names, dates, and numbers you can clearly read."
send_query 34 "$CONV_TFINAL" "$TRABALHO_FINAL" "Mark anything uncertain or illegible instead of guessing."
send_query 35 "$CONV_TFINAL" "$TRABALHO_FINAL" "What looks like the central message or conclusion of the image?"
send_query 36 "$CONV_TFINAL" "$TRABALHO_FINAL" "Convert the readable content into clean bullet points for a report."
send_query 37 "$CONV_TFINAL" "$TRABALHO_FINAL" "Which visual areas or regions matter most for understanding the image?"
send_query 38 "$CONV_TFINAL" "$TRABALHO_FINAL" "Compare the image with Trabalho projeto and say where they align."
send_query 39 "$CONV_TFINAL" "$TRABALHO_FINAL" "Compare them again and flag any inconsistency that is actually supported by the files."
send_query 40 "$CONV_TFINAL" "$TRABALHO_FINAL" "Close this document with a clean summary plus confidence notes."

# ── Block 5: AT&T Bill (Q041-Q050) ───────────────────────
echo ""
echo ">>> Creating conversation for AT&T Bill..."
CONV_ATT=$(create_conversation "Grading: ATT Bill Dec 2023")
echo "    Conv ID: $CONV_ATT"
send_query 41 "$CONV_ATT" "$ATT" "Let's review the AT&T bill from Dec 2023. What is this bill about at a high level?"
send_query 42 "$CONV_ATT" "$ATT" "Pull out the billing period, due date, and total amount due."
send_query 43 "$CONV_ATT" "$ATT" "Break down the major charges, fees, taxes, and adjustments."
send_query 44 "$CONV_ATT" "$ATT" "Are there any credits, unusual line items, or one-time charges?"
send_query 45 "$CONV_ATT" "$ATT" "Put the financial details into a table: line item | amount | evidence."
send_query 46 "$CONV_ATT" "$ATT" "What account, service, or subscriber details are visible in the bill?"
send_query 47 "$CONV_ATT" "$ATT" "What would I want to verify before paying this statement?"
send_query 48 "$CONV_ATT" "$ATT" "Explain this bill in plain language for someone who hates telecom bills."
send_query 49 "$CONV_ATT" "$ATT" "If the cost increased, which lines seem to explain the increase?"
send_query 50 "$CONV_ATT" "$ATT" "End with a concise payment-oriented recap based only on the bill."

# ── Block 6: Birth Certificate (Q051-Q060) ───────────────
echo ""
echo ">>> Creating conversation for Birth Certificate..."
CONV_CERT=$(create_conversation "Grading: Certidao de Nascimento")
echo "    Conv ID: $CONV_CERT"
send_query 51 "$CONV_CERT" "$CERTIDAO" "Move to the birth certificate. What kind of official document is this and what is it certifying?"
send_query 52 "$CONV_CERT" "$CERTIDAO" "Extract the person's full name, birth date, and place of birth if shown."
send_query 53 "$CONV_CERT" "$CERTIDAO" "Pull out the parent names and any registry or certificate identifiers that appear."
send_query 54 "$CONV_CERT" "$CERTIDAO" "What issuance, registry office, or notarization details are visible?"
send_query 55 "$CONV_CERT" "$CERTIDAO" "Put the official fields into a table: field | value | evidence."
send_query 56 "$CONV_CERT" "$CERTIDAO" "Are there any handwritten, stamped, or hard-to-read areas worth noting?"
send_query 57 "$CONV_CERT" "$CERTIDAO" "Which fields in this certificate would matter most in an identity verification flow?"
send_query 58 "$CONV_CERT" "$CERTIDAO" "What would still require manual validation from the original record or issuing office?"
send_query 59 "$CONV_CERT" "$CERTIDAO" "Summarize the document carefully without going beyond what is explicitly shown."
send_query 60 "$CONV_CERT" "$CERTIDAO" "Finish with a strict evidence-only recap of the certificate."

# ── Block 7: SEVIS RTI (Q061-Q070) ───────────────────────
echo ""
echo ">>> Creating conversation for SEVIS RTI..."
CONV_SEVIS=$(create_conversation "Grading: SEVIS RTI")
echo "    Conv ID: $CONV_SEVIS"
send_query 61 "$CONV_SEVIS" "$SEVIS" "Now look at SEVIS_RTI. What seems to be the purpose of this document?"
send_query 62 "$CONV_SEVIS" "$SEVIS" "Which identifiers, case numbers, or reference numbers are present?"
send_query 63 "$CONV_SEVIS" "$SEVIS" "What institution, person, or status details are named in the file?"
send_query 64 "$CONV_SEVIS" "$SEVIS" "Are there deadlines, actions, or compliance-related steps mentioned?"
send_query 65 "$CONV_SEVIS" "$SEVIS" "Put the key administrative details into a table with evidence."
send_query 66 "$CONV_SEVIS" "$SEVIS" "What appears to be the most important status signal in this document?"
send_query 67 "$CONV_SEVIS" "$SEVIS" "What would an immigration or compliance reviewer focus on first here?"
send_query 68 "$CONV_SEVIS" "$SEVIS" "What important questions remain unanswered if someone needed to act on this?"
send_query 69 "$CONV_SEVIS" "$SEVIS" "Give me a short briefing note for a person handling this case."
send_query 70 "$CONV_SEVIS" "$SEVIS" "End with an evidence-based summary plus uncertainty notes."

# ── Block 8: Move Out Statement (Q071-Q080) ──────────────
echo ""
echo ">>> Creating conversation for Move Out Statement..."
CONV_MOVE=$(create_conversation "Grading: 214 Move Out Statement")
echo "    Conv ID: $CONV_MOVE"
send_query 71 "$CONV_MOVE" "$MOVEOUT" "Open the 214 Move Out Statement. What is this document settling or explaining?"
send_query 72 "$CONV_MOVE" "$MOVEOUT" "Extract the move-out date, tenant or property details, and final balance if available."
send_query 73 "$CONV_MOVE" "$MOVEOUT" "What deductions, charges, deposits, or refunds are listed?"
send_query 74 "$CONV_MOVE" "$MOVEOUT" "Put the financial lines into a table: charge | amount | evidence."
send_query 75 "$CONV_MOVE" "$MOVEOUT" "Which charges seem routine and which seem potentially unusual?"
send_query 76 "$CONV_MOVE" "$MOVEOUT" "Does the statement clearly explain how the final balance was calculated?"
send_query 77 "$CONV_MOVE" "$MOVEOUT" "What would a tenant most likely dispute or ask about after reading this?"
send_query 78 "$CONV_MOVE" "$MOVEOUT" "Summarize this for someone deciding whether the charges look justified."
send_query 79 "$CONV_MOVE" "$MOVEOUT" "What supporting documents would you want to review alongside this statement?"
send_query 80 "$CONV_MOVE" "$MOVEOUT" "Close with a short evidence-only recap of the move-out statement."

# ── Block 9: Mayfair Group Investor Deck (Q081-Q090) ─────
echo ""
echo ">>> Creating conversation for Mayfair Group Investor Deck..."
CONV_MAYFAIR=$(create_conversation "Grading: Mayfair Group Investor Deck 2025")
echo "    Conv ID: $CONV_MAYFAIR"
send_query 81 "$CONV_MAYFAIR" "$MAYFAIR" "Finally, review the Mayfair Group Investor Deck 2025. What is the core investment story?"
send_query 82 "$CONV_MAYFAIR" "$MAYFAIR" "What business model, market thesis, or product thesis is presented?"
send_query 83 "$CONV_MAYFAIR" "$MAYFAIR" "What traction, projections, growth, or performance numbers are shown?"
send_query 84 "$CONV_MAYFAIR" "$MAYFAIR" "What team, strategy, or expansion plans are highlighted?"
send_query 85 "$CONV_MAYFAIR" "$MAYFAIR" "What risks, weak points, or unsupported claims are still visible in the deck?"
send_query 86 "$CONV_MAYFAIR" "$MAYFAIR" "Put the core investment claims into a table: claim | evidence | risk."
send_query 87 "$CONV_MAYFAIR" "$MAYFAIR" "If I had 60 seconds with an investor, how should I summarize this deck?"
send_query 88 "$CONV_MAYFAIR" "$MAYFAIR" "What diligence questions should an investor ask next after reading it?"
send_query 89 "$CONV_MAYFAIR" "$MAYFAIR" "Does the deck make a strong case on its own, or does it depend on unstated assumptions?"
send_query 90 "$CONV_MAYFAIR" "$MAYFAIR" "End with a strict final recap: clearly supported, suggested, and not evidenced."

echo ""
echo "=== All 90 queries complete ==="
echo "Results saved in: $OUTDIR"
echo ""

TOTAL=$(ls "$OUTDIR"/Q*.json 2>/dev/null | wc -l)
echo "Total response files: $TOTAL"
