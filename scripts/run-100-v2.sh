#!/usr/bin/env bash
# run-100-v2.sh — Runs 100 queries against local chat API
# 10 documents x 10 queries each, each document block shares a conversation.
set -euo pipefail

API_BASE="http://localhost:5000/api/chat"
OUTDIR="C:/Users/Pedro/Desktop/webapp/reports/query-grading-v2"
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
MAYFAIR="5068942c-8f1a-44c3-9e64-6dc9be211026"
ATT="fa905cd0-6927-48c2-9816-9173cdc37c80"
BREGUET="3ff4d2a2-e5ec-4dbe-ad29-95074e0688a1"
TRADE_ACT="c1908b22-a131-412d-b0c2-69cae091c821"
IBGE="f3b276b5-598b-4dad-ac9c-1f806e334cd4"
ARM="7938c5e6-2a29-4acd-bf86-a28abc3e87bb"
GUARDA="d86c1f5b-7b9d-48a8-bfb2-c3aa0b469107"
RESERVE="6d4ba0b7-ed89-4c98-af4a-27da5a1658d1"
TABELA="ef8f193a-3a70-42ee-a0bf-a925a86f484d"

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

  local start_time
  start_time=$(date +%s%3N 2>/dev/null || node -e "console.log(Date.now())")

  local response
  response=$(curl -s --max-time 180 \
    "$API_BASE/chat" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$body" 2>/dev/null) || response='{"error":"curl_timeout"}'

  local end_time
  end_time=$(date +%s%3N 2>/dev/null || node -e "console.log(Date.now())")

  # Wrap with metadata
  node -e "
    const r = process.argv[1];
    const startMs = parseInt(process.argv[2]) || 0;
    const endMs = parseInt(process.argv[3]) || 0;
    const meta = {
      queryNumber: 'Q${padded}',
      conversationId: '${convid}',
      documentId: '${docid}',
      question: $(node -e "console.log(JSON.stringify(process.argv[1]))" "$message"),
      timestamp: new Date().toISOString(),
      durationMs: endMs - startMs,
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
  " "$response" "$start_time" "$end_time" > "$outfile"

  echo "[Q${padded}] Saved -> $outfile"
}

# ── Run all 100 queries ──────────────────────────────────
echo ""
echo "=== Starting 100 queries (10 conversations x 10 queries each) ==="
echo "Output: $OUTDIR"
echo ""

# ── Block 1: BESS Brazil Market Assessment (Q001-Q010) ───
echo ">>> Creating conversation for BESS..."
CONV_BESS=$(create_conversation "Grading v2: BESS Market Assessment")
echo "    Conv ID: $CONV_BESS"
send_query 1  "$CONV_BESS" "$BESS" "What is the main investment thesis of the BESS Brazil market assessment?"
send_query 2  "$CONV_BESS" "$BESS" "How does the document explain BESS as a regulated capacity asset rather than just an energy asset?"
send_query 3  "$CONV_BESS" "$BESS" "Extract every explicit market-size, growth, or deployment figure mentioned for Brazil and the global storage market."
send_query 4  "$CONV_BESS" "$BESS" "What role does LRCAP 2026 play in the document's view of the Brazilian storage opportunity?"
send_query 5  "$CONV_BESS" "$BESS" "Compare the storage technologies discussed, especially lithium-ion versus vanadium flow batteries."
send_query 6  "$CONV_BESS" "$BESS" "What grid services or operational capabilities does the document say storage buyers are actually purchasing?"
send_query 7  "$CONV_BESS" "$BESS" "Which near-term Brazilian market segments are presented as the best opportunities for deployment or investment?"
send_query 8  "$CONV_BESS" "$BESS" "What are the main arguments for a strategic partnership between Lyon Capital and RKP?"
send_query 9  "$CONV_BESS" "$BESS" "Reconstruct the regulatory and commercial timeline the document presents for Brazil's storage market."
send_query 10 "$CONV_BESS" "$BESS" "Separate the document's claims into three buckets: clearly supported, suggested, and not fully evidenced."

# ── Block 2: Mayfair Group Investor Deck (Q011-Q020) ─────
echo ""
echo ">>> Creating conversation for Mayfair..."
CONV_MAYFAIR=$(create_conversation "Grading v2: Mayfair Investor Deck 2025")
echo "    Conv ID: $CONV_MAYFAIR"
send_query 11 "$CONV_MAYFAIR" "$MAYFAIR" "What is the core investment story Mayfair is telling in this deck?"
send_query 12 "$CONV_MAYFAIR" "$MAYFAIR" "How does Mayfair describe its AI-native, vertically integrated fashion model?"
send_query 13 "$CONV_MAYFAIR" "$MAYFAIR" "Extract all explicit financial and operating metrics in the deck and explain each one in context."
send_query 14 "$CONV_MAYFAIR" "$MAYFAIR" "Who are the founders, advisors, and notable investors mentioned in the presentation?"
send_query 15 "$CONV_MAYFAIR" "$MAYFAIR" "Which markets and customer segments does Mayfair say it is targeting first, and why?"
send_query 16 "$CONV_MAYFAIR" "$MAYFAIR" "How does the deck compare Mayfair's operating model with legacy fashion peers?"
send_query 17 "$CONV_MAYFAIR" "$MAYFAIR" "What does the deck say about launch speed, inventory, CAC payback, and revenue per employee?"
send_query 18 "$CONV_MAYFAIR" "$MAYFAIR" "How is the planned use of funds split, and what strategic priorities does that imply?"
send_query 19 "$CONV_MAYFAIR" "$MAYFAIR" "What ESG or sustainability claims are made, and which of them look strongest versus weakest?"
send_query 20 "$CONV_MAYFAIR" "$MAYFAIR" "Write a skeptical diligence memo listing the main red flags, ambiguities, and unsupported claims in the deck."

# ── Block 3: ATT Bill Dec 2023 (Q021-Q030) ───────────────
echo ""
echo ">>> Creating conversation for ATT Bill..."
CONV_ATT=$(create_conversation "Grading v2: ATT Bill Dec 2023")
echo "    Conv ID: $CONV_ATT"
send_query 21 "$CONV_ATT" "$ATT" "Give a full billing summary with issue date, billing period, total due, and AutoPay date."
send_query 22 "$CONV_ATT" "$ATT" "Break down the monthly charges, add-ons, company fees, and taxes for this line."
send_query 23 "$CONV_ATT" "$ATT" "Why is the total due \$98.49, and which line items contribute to it?"
send_query 24 "$CONV_ATT" "$ATT" "Compare the last bill amount with the current amount and explain the difference."
send_query 25 "$CONV_ATT" "$ATT" "Put every visible charge into a table: item | amount | category | evidence."
send_query 26 "$CONV_ATT" "$ATT" "Extract all account identifiers, phone numbers, dates, and dollar amounts visible in the bill."
send_query 27 "$CONV_ATT" "$ATT" "Which charges look recurring versus potentially variable or one-time?"
send_query 28 "$CONV_ATT" "$ATT" "Explain this bill in plain English to the account holder."
send_query 29 "$CONV_ATT" "$ATT" "What should the customer verify before the scheduled AutoPay date?"
send_query 30 "$CONV_ATT" "$ATT" "What important billing details are not fully visible or cannot be confirmed from this document alone?"

# ── Block 4: Breguet (Q031-Q040) ─────────────────────────
echo ""
echo ">>> Creating conversation for Breguet..."
CONV_BREGUET=$(create_conversation "Grading v2: Breguet Document")
echo "    Conv ID: $CONV_BREGUET"
send_query 31 "$CONV_BREGUET" "$BREGUET" "Identify the most likely document type for Breguet.pdf based only on visible evidence."
send_query 32 "$CONV_BREGUET" "$BREGUET" "Extract every readable date, proper noun, place name, and commercial identifier from the file."
send_query 33 "$CONV_BREGUET" "$BREGUET" "What evidence suggests this document is related to a Breguet boutique, purchase, or service interaction?"
send_query 34 "$CONV_BREGUET" "$BREGUET" "Describe the document layout and the kinds of fields or sections that appear to exist."
send_query 35 "$CONV_BREGUET" "$BREGUET" "Separate what is clearly legible from what is too faint, missing, or unreadable."
send_query 36 "$CONV_BREGUET" "$BREGUET" "Produce a high-confidence fact sheet using only facts that are directly visible."
send_query 37 "$CONV_BREGUET" "$BREGUET" "What is the likely issuer, and what clues support that conclusion?"
send_query 38 "$CONV_BREGUET" "$BREGUET" "If this were being used for audit or verification, which fields would need manual confirmation?"
send_query 39 "$CONV_BREGUET" "$BREGUET" "List possible red flags, such as missing totals, unclear recipient data, or incomplete provenance."
send_query 40 "$CONV_BREGUET" "$BREGUET" "Give a strict recap in three sections: supported, weakly suggested, and unreadable."

# ── Block 5: Trade Act of 1974 (Q041-Q050) ───────────────
echo ""
echo ">>> Creating conversation for Trade Act..."
CONV_TRADE=$(create_conversation "Grading v2: Trade Act of 1974")
echo "    Conv ID: $CONV_TRADE"
send_query 41 "$CONV_TRADE" "$TRADE_ACT" "What are the major subchapters and thematic sections covered in this copy of the Trade Act of 1974?"
send_query 42 "$CONV_TRADE" "$TRADE_ACT" "Summarize the parts dealing with relief from injury caused by import competition."
send_query 43 "$CONV_TRADE" "$TRADE_ACT" "What congressional procedures related to presidential trade actions are described in the statute?"
send_query 44 "$CONV_TRADE" "$TRADE_ACT" "Which sections concern market barriers and unfair trade actions?"
send_query 45 "$CONV_TRADE" "$TRADE_ACT" "What does the document include about the Generalized System of Preferences?"
send_query 46 "$CONV_TRADE" "$TRADE_ACT" "Identify the main institutions and actors referenced in the statute, such as the President, Congress, and Trade Representative."
send_query 47 "$CONV_TRADE" "$TRADE_ACT" "Explain the difference between statutory text, codification notes, and editorial references in this document."
send_query 48 "$CONV_TRADE" "$TRADE_ACT" "Which provisions appear most relevant to trade enforcement or retaliatory action?"
send_query 49 "$CONV_TRADE" "$TRADE_ACT" "Summarize the document for a policy analyst who needs the structure and purpose, not every detail."
send_query 50 "$CONV_TRADE" "$TRADE_ACT" "Build a table of key statutory areas: topic | section range | plain-English purpose."

# ── Block 6: IBGE Open Data Plan (Q051-Q060) ─────────────
echo ""
echo ">>> Creating conversation for IBGE..."
CONV_IBGE=$(create_conversation "Grading v2: IBGE Open Data Plan 2024-2025")
echo "    Conv ID: $CONV_IBGE"
send_query 51 "$CONV_IBGE" "$IBGE" "What is the overall purpose of the IBGE Open Data Plan for 2024-2025?"
send_query 52 "$CONV_IBGE" "$IBGE" "Which legal and institutional frameworks are cited as the basis for this plan?"
send_query 53 "$CONV_IBGE" "$IBGE" "What are the plan's general and specific objectives?"
send_query 54 "$CONV_IBGE" "$IBGE" "How does the document say IBGE should prioritize which datasets to open first?"
send_query 55 "$CONV_IBGE" "$IBGE" "Which portals, APIs, and open formats are referenced for publishing data?"
send_query 56 "$CONV_IBGE" "$IBGE" "What governance or monitoring structure does the plan propose to track execution?"
send_query 57 "$CONV_IBGE" "$IBGE" "What does the document say about transparency, confidentiality, and protection of informant data?"
send_query 58 "$CONV_IBGE" "$IBGE" "Summarize the annex on the most accessed SIDRA tables and why it matters for prioritization."
send_query 59 "$CONV_IBGE" "$IBGE" "Explain the 5-star open data model referenced in the plan."
send_query 60 "$CONV_IBGE" "$IBGE" "Extract the action-plan fields used in the schedule, such as dataset name, activity, deadline, periodicity, and responsible unit."

# ── Block 7: ARM Montana & Arizona (Q061-Q070) ──────────
echo ""
echo ">>> Creating conversation for ARM..."
CONV_ARM=$(create_conversation "Grading v2: ARM Montana Arizona Summary")
echo "    Conv ID: $CONV_ARM"
send_query 61 "$CONV_ARM" "$ARM" "Summarize the three assets or project groups included in the ARM Montana and Arizona summary."
send_query 62 "$CONV_ARM" "$ARM" "Break down the uses of capital for each project and for the total portfolio."
send_query 63 "$CONV_ARM" "$ARM" "Break down the sources of capital for each project and identify the equity requirement."
send_query 64 "$CONV_ARM" "$ARM" "Compare Lone Mountain Ranch, Baxter Hotel, and Rex Ranch in terms of purchase price, capex, and capital structure."
send_query 65 "$CONV_ARM" "$ARM" "Which financing components are already in place, and which appear to depend on future execution?"
send_query 66 "$CONV_ARM" "$ARM" "What does the document suggest about ARM's hospitality and real-estate strategy?"
send_query 67 "$CONV_ARM" "$ARM" "Identify every explicit figure tied to debt, deposits, renovation, and acquisition."
send_query 68 "$CONV_ARM" "$ARM" "What underwriting questions remain unanswered if an investor only had this one-page summary?"
send_query 69 "$CONV_ARM" "$ARM" "Write a concise investment-committee note with strengths, risks, and missing information."
send_query 70 "$CONV_ARM" "$ARM" "Put the full one-page summary into a structured table: asset | location | purchase | capex | debt | deposits | equity."

# ── Block 8: Guarda Bens Self Storage (Q071-Q080) ───────
echo ""
echo ">>> Creating conversation for Guarda Bens..."
CONV_GUARDA=$(create_conversation "Grading v2: Guarda Bens Self Storage")
echo "    Conv ID: $CONV_GUARDA"
send_query 71 "$CONV_GUARDA" "$GUARDA" "What business does Guarda Bens describe, and how does it position its service offering?"
send_query 72 "$CONV_GUARDA" "$GUARDA" "Map the current box-rental process from first customer contact to ongoing monthly follow-up."
send_query 73 "$CONV_GUARDA" "$GUARDA" "Summarize the primary and support activities in the value chain slide."
send_query 74 "$CONV_GUARDA" "$GUARDA" "Extract the full SIPOC model from the presentation and explain what each part means."
send_query 75 "$CONV_GUARDA" "$GUARDA" "What exact problem is defined in the deck, and what operational impacts are listed?"
send_query 76 "$CONV_GUARDA" "$GUARDA" "What categories of root cause are referenced in the Ishikawa analysis?"
send_query 77 "$CONV_GUARDA" "$GUARDA" "Which causes receive the highest GUT priority scores, and why?"
send_query 78 "$CONV_GUARDA" "$GUARDA" "What SMART goal is defined, and what operational improvement target does it set?"
send_query 79 "$CONV_GUARDA" "$GUARDA" "What KPIs or performance indicators are implied by the deck, even if not fully quantified?"
send_query 80 "$CONV_GUARDA" "$GUARDA" "What process gaps, ambiguities, or implementation risks remain after reading the presentation?"

# ── Block 9: Reserve Requirements (Q081-Q090) ───────────
echo ""
echo ">>> Creating conversation for Reserve Requirements..."
CONV_RESERVE=$(create_conversation "Grading v2: Reserve Requirements PrimaryRules")
echo "    Conv ID: $CONV_RESERVE"
send_query 81 "$CONV_RESERVE" "$RESERVE" "Summarize all reserve-requirement categories covered in this document."
send_query 82 "$CONV_RESERVE" "$RESERVE" "Which institutions are subject to reserve requirements for demand deposits and savings deposits?"
send_query 83 "$CONV_RESERVE" "$RESERVE" "How is the reserve base calculated for demand deposits?"
send_query 84 "$CONV_RESERVE" "$RESERVE" "How is the reserve base calculated for savings deposits?"
send_query 85 "$CONV_RESERVE" "$RESERVE" "List all regulatory bases cited, including BCB resolutions, CMN resolutions, and normative instructions."
send_query 86 "$CONV_RESERVE" "$RESERVE" "Compare the rules for demand deposits versus savings deposits in a side-by-side table."
send_query 87 "$CONV_RESERVE" "$RESERVE" "What 2024 and 2025 regulatory updates are explicitly referenced in the document?"
send_query 88 "$CONV_RESERVE" "$RESERVE" "Explain the computation period, maintenance period, and deficiency-charge concepts in simple terms."
send_query 89 "$CONV_RESERVE" "$RESERVE" "Build an operational checklist for a compliance team using only the information shown here."
send_query 90 "$CONV_RESERVE" "$RESERVE" "Identify any fields that appear incomplete, truncated, or in need of the original Portuguese source for confirmation."

# ── Block 10: Tabela 1.1 (Q091-Q100) ────────────────────
echo ""
echo ">>> Creating conversation for Tabela 1.1..."
CONV_TABELA=$(create_conversation "Grading v2: Tabela 1.1 IBGE")
echo "    Conv ID: $CONV_TABELA"
send_query 91  "$CONV_TABELA" "$TABELA" "What does Tabela 1.1 measure, and how is the geography organized in the visible rows?"
send_query 92  "$CONV_TABELA" "$TABELA" "Extract the year columns and explain the difference between antes de 2016, yearly counts from 2016 onward, and ano de nascimento ignorado."
send_query 93  "$CONV_TABELA" "$TABELA" "What are the total registered live births shown for Total, Brasil (1), and Norte?"
send_query 94  "$CONV_TABELA" "$TABELA" "List the visible geographies in the sheet snippet and their hierarchy."
send_query 95  "$CONV_TABELA" "$TABELA" "Extract the 2024 values for every visible row in the sheet preview."
send_query 96  "$CONV_TABELA" "$TABELA" "Which visible geography has the highest total number of registered live births in the excerpt?"
send_query 97  "$CONV_TABELA" "$TABELA" "Compare Total versus Brasil (1) and explain what that difference might represent."
send_query 98  "$CONV_TABELA" "$TABELA" "Identify all rows in the visible excerpt that contain dashes, blanks, notes, or footnote markers."
send_query 99  "$CONV_TABELA" "$TABELA" "Build a table with the visible rows only: geography | total records | before 2016 | 2024."
send_query 100 "$CONV_TABELA" "$TABELA" "Write a concise statistical summary of the visible excerpt, highlighting the main regional patterns and any data caveats."

echo ""
echo "=== All 100 queries complete ==="
echo "Results saved in: $OUTDIR"
echo ""

TOTAL=$(ls "$OUTDIR"/Q*.json 2>/dev/null | wc -l)
echo "Total response files: $TOTAL"
