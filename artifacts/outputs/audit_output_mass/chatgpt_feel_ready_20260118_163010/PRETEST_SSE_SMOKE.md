# Pre-test SSE Smoke Test

**Generated:** 2026-01-18 18:00:00
**Auditor:** Claude Phase 6
**Status:** PENDING - Backend not running

---

## Test Configuration

```bash
# Test token (valid 30 days)
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0LXVzZXItMDAxIiwiZW1haWwiOiJ0ZXN0QGtvZGEuY29tIiwiaWF0IjoxNzY4NzY1Mjg1LCJleHAiOjE3NzEzNTcyODV9.EbVPsBTRKhTM-vfSQXwGRRCk3k9TOLhhg2JvBGC2RjY"

# Backend URL
BASE_URL="http://localhost:5000"

# User ID
USER_ID="test-user-001"
```

---

## 10-Query Smoke Test Suite

| # | Query | Expected Intent | Expected Behavior |
|---|-------|-----------------|-------------------|
| 1 | "list my documents" | file_actions | sourceButtons with file pills |
| 2 | "how many files do I have?" | doc_stats | Count answer |
| 3 | "summarize the Rosewood Fund document" | documents.summarize | RAG summary with sourceButtons |
| 4 | "where is the contract.pdf?" | file_actions.locate | File location with button |
| 5 | "show only PDFs" | file_actions.filter | Filtered sourceButtons |
| 6 | "what is EBITDA?" | documents.qa | RAG answer (finance domain) |
| 7 | "quais são meus documentos?" | file_actions (PT) | Portuguese sourceButtons |
| 8 | "compare the two contracts" | documents.compare | Multi-doc comparison |
| 9 | "tell me about yourself" | help.product | Help response |
| 10 | "calculate 25% of 1000" | reasoning.math | Math result: 250 |

---

## Test Script

```bash
#!/bin/bash
# Save as: /tmp/smoke_test_10.sh

TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0LXVzZXItMDAxIiwiZW1haWwiOiJ0ZXN0QGtvZGEuY29tIiwiaWF0IjoxNzY4NzY1Mjg1LCJleHAiOjE3NzEzNTcyODV9.EbVPsBTRKhTM-vfSQXwGRRCk3k9TOLhhg2JvBGC2RjY"
BASE_URL="http://localhost:5000"

declare -a QUERIES=(
    "list my documents"
    "how many files do I have?"
    "summarize the Rosewood Fund document"
    "where is the contract.pdf?"
    "show only PDFs"
    "what is EBITDA?"
    "quais são meus documentos?"
    "compare the two contracts"
    "tell me about yourself"
    "calculate 25% of 1000"
)

declare -a EXPECTED_INTENTS=(
    "file_actions"
    "doc_stats"
    "documents"
    "file_actions"
    "file_actions"
    "documents"
    "file_actions"
    "documents"
    "help"
    "reasoning"
)

echo "=== SMOKE TEST: 10 Queries ==="
echo ""

PASS=0
FAIL=0

for i in "${!QUERIES[@]}"; do
    Q="${QUERIES[$i]}"
    EXPECTED="${EXPECTED_INTENTS[$i]}"
    CONV_ID="smoke-test-$((i+1))-$(date +%s)"

    echo "[$((i+1))/10] Query: \"$Q\""
    echo "       Expected intent: $EXPECTED"

    # Run query and capture intent from response
    RESPONSE=$(timeout 60 curl -s -N -X POST "$BASE_URL/api/rag/query/stream" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"query\":\"$Q\",\"userId\":\"test-user-001\",\"conversationId\":\"$CONV_ID\"}" 2>/dev/null)

    # Extract intent from SSE response
    ACTUAL_INTENT=$(echo "$RESPONSE" | grep -o '"intent":"[^"]*"' | head -1 | cut -d'"' -f4)

    # Check for sourceButtons in done event
    HAS_BUTTONS=$(echo "$RESPONSE" | grep -o '"sourceButtons"' | head -1)

    # Extract answer preview
    ANSWER=$(echo "$RESPONSE" | grep -o '"fullAnswer":"[^"]*"' | head -1 | cut -d'"' -f4 | head -c 100)

    echo "       Actual intent: $ACTUAL_INTENT"
    echo "       Has buttons: ${HAS_BUTTONS:-NO}"
    echo "       Answer: ${ANSWER:-[empty]}..."

    # Check if intent matches (prefix match)
    if [[ "$ACTUAL_INTENT" == "$EXPECTED"* ]]; then
        echo "       ✅ PASS"
        ((PASS++))
    else
        echo "       ❌ FAIL"
        ((FAIL++))
    fi
    echo ""
done

echo "=== RESULTS ==="
echo "PASS: $PASS / 10"
echo "FAIL: $FAIL / 10"
echo ""

if [ $FAIL -eq 0 ]; then
    echo "✅ ALL TESTS PASSED - Ready for certification"
else
    echo "❌ SOME TESTS FAILED - Review before certification"
fi
```

---

## Expected Outputs

### Query 1: "list my documents"

```json
{
  "type": "intent",
  "intent": "file_actions",
  "subIntent": "inventory"
}

{
  "type": "done",
  "sourceButtons": {
    "buttons": [
      { "documentId": "...", "title": "file1.pdf", "mimeType": "application/pdf" },
      { "documentId": "...", "title": "file2.docx", "mimeType": "application/vnd..." }
    ],
    "seeAll": { "label": "See all", "totalCount": 25, "remainingCount": 15 }
  },
  "fullAnswer": "" // Empty for button-only
}
```

### Query 2: "how many files do I have?"

```json
{
  "type": "intent",
  "intent": "doc_stats",
  "subIntent": "count"
}

{
  "type": "done",
  "fullAnswer": "You have 25 documents uploaded.",
  "sourceButtons": null
}
```

### Query 6: "what is EBITDA?"

```json
{
  "type": "intent",
  "intent": "documents",
  "subIntent": "qa",
  "domain": "finance"
}

{
  "type": "done",
  "fullAnswer": "EBITDA (Earnings Before Interest, Taxes, Depreciation, and Amortization) is...",
  "sourceButtons": { "buttons": [...] }
}
```

### Query 10: "calculate 25% of 1000"

```json
{
  "type": "intent",
  "intent": "reasoning",
  "subIntent": "math"
}

{
  "type": "done",
  "fullAnswer": "25% of 1,000 is **250**.",
  "sourceButtons": null
}
```

---

## Pass Criteria

| Criterion | Threshold | Notes |
|-----------|-----------|-------|
| Intent accuracy | 8/10 (80%) | Intent prefix must match expected |
| Response completeness | 10/10 (100%) | All queries must return done event |
| sourceButtons for file_actions | 4/4 (100%) | Queries 1, 4, 5, 7 must have buttons |
| No crashes | 0 errors | No 500 errors or timeouts |

---

## Running the Test

### Prerequisites

1. Backend running: `npm run dev` in backend folder
2. Test user exists: `test-user-001`
3. Test documents uploaded (from previous tests)

### Execution

```bash
# Start backend (in separate terminal)
cd /Users/pg/Desktop/koda-webapp/backend
npm run dev

# Run smoke test
chmod +x /tmp/smoke_test_10.sh
/tmp/smoke_test_10.sh 2>&1 | tee audit_output_mass/chatgpt_feel_ready_20260118_163010/smoke_test_output.txt
```

---

## Current Status

**PHASE 6 STATUS: PENDING**

Backend not running at time of audit. Test script created for manual execution.

### To Complete:

1. Start backend server
2. Run smoke test script
3. Capture output
4. Update this report with results

---

## Conclusion

Smoke test suite prepared with 10 representative queries covering:

- ✅ File listing (sourceButtons)
- ✅ Document counting
- ✅ RAG summarization
- ✅ File location
- ✅ Filtering
- ✅ Domain (finance) question
- ✅ Portuguese language
- ✅ Document comparison
- ✅ Help/product info
- ✅ Math calculation

Ready for execution when backend is available.
