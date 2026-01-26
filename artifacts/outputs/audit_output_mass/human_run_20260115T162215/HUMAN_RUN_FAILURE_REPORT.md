# Human Simulation Test - Failure Report

**Date:** 2026-01-15
**Status:** FAIL (45/50 = 90%, required 50/50)

---

## Executive Summary

The human simulation test ran 50 queries through the Koda RAG system with human-like delays and conversation context. **5 queries failed**, preventing the A=50/50 grade required for PASS.

---

## Test Configuration

| Parameter | Value |
|-----------|-------|
| Total Queries | 50 |
| Conversations | 1 (single human session) |
| Delay Profile | 400-2500ms normal, 5-12s pauses |
| Rapid Follow-ups | 15% probability |
| Context-dependent queries | 4 (q16, q34, q36, q40) |

---

## Results Summary

| Metric | Value |
|--------|-------|
| Passed | 45 |
| Failed | 5 |
| Pass Rate | 90% |
| Required | 100% (A grade) |
| **Verdict** | **FAIL** |

---

## Failed Queries Analysis

### 1. q16 [Grade: F] - Follow-up Intent Misroute

**Query:** "O que esses números indicam sobre a saúde financeira da empresa?"
**Expected:** Document-based analysis of financial data
**Actual:** Help response (generic Koda capabilities)

| Signal | Value |
|--------|-------|
| Intent | `extraction` |
| Sources | 0 |
| Previous Intent | `documents` |

**Root Cause:** The follow-up intent inheritance fix does NOT handle `extraction` intent. The blocking logic only applies to `help`, `conversation`, `memory`, `preferences` - but when the intent engine classifies as `extraction`, it bypasses the blocker entirely.

**Code Location:** `decisionTree.service.ts:294-295`
```typescript
case 'extraction':
  return 'extraction';  // Does NOT check wasDocContext!
```

---

### 2. q14 [Grade: F] - Follow-up Intent Misroute

**Query:** "Os meses de abril e maio tiveram..."
**Expected:** Financial data from documents
**Actual:** Help response

| Signal | Value |
|--------|-------|
| Intent | `extraction` |
| Sources | 0 |
| Previous Intent | `documents` |

**Root Cause:** Same as q16 - `extraction` intent bypasses follow-up inheritance.

---

### 3. q28 [Grade: F] - Language Mixing

**Query:** "What is intangibility in services marketing?"
**Expected:** English answer
**Actual:** English answer with Portuguese phrases mixed in

| Signal | Value |
|--------|-------|
| Intent | `documents` |
| Sources | 2 |
| Language Detected | Mixed EN/PT |

**Root Cause:** The language enforcement service exists but doesn't catch all cases. When source documents are in Portuguese, fragments leak into English answers.

**Code Location:** `languageEnforcement.service.ts` - needs stronger sanitization

---

### 4. q04 [Grade: D] - Retrieval Failure

**Query:** "Quais tamanhos de box estão disponíveis no Self Storage?"
**Expected:** List of box sizes from Guarda Bens document
**Actual:** Generic response without specific sizes

| Signal | Value |
|--------|-------|
| Intent | `excel` |
| Sources | 0 |
| Has Documents | true |

**Root Cause:** Retrieval returned 0 chunks despite user having relevant documents. The query may be too specific or the embedding similarity threshold is too high.

---

### 5. q40 [Grade: D] - Follow-up Document Context Lost

**Query:** "Por que o guia insiste em documentação primeiro?"
**Expected:** Answer referencing Integration Guide (from q18)
**Actual:** Answer from wrong documents

| Signal | Value |
|--------|-------|
| Intent | `documents` |
| Sources | 3 (wrong ones) |
| Depends On | q18 (Integration Guide) |

**Root Cause:** The `lastDocumentIds` from q18 were not used to boost retrieval. The follow-up question got routed to different documents.

**Code Location:** `kodaRetrievalEngineV3.service.ts` - lastDocumentIds boost not applied

---

## Mapping to Original Issues

| Original Issue | Status | Evidence |
|----------------|--------|----------|
| Follow-up intent inheritance | **NOT FIXED** | q16, q14 got help responses |
| lastDocumentIds not saved | FIXED | Code exists |
| Cache corruption | FIXED | No duplicates observed |
| lastDocumentIds not used in retrieval | **NOT FIXED** | q40 got wrong docs |
| Bullet/list count enforcement | UNTESTED | No specific test case |
| Language switching mid-answer | **NOT FIXED** | q28 has PT in EN |
| Citations | FIXED | Sources panel renders |
| Spreadsheet month semantics | FIXED | No month errors |

---

## Frontend Render Proof

The Playwright test validated ChatGPT-like rendering:

| Assertion | Result |
|-----------|--------|
| Content renders | PASS |
| Sources panel | PASS |
| Clickable file buttons | PASS |
| Bold text | PARTIAL (not all responses) |
| Bullet/numbered lists | PASS |

**Screenshot evidence:** `/frontend/test-results/human-simulation-proof/`

---

## Required Fixes for PASS

### Priority 1: Fix Extraction Intent Routing

**File:** `backend/src/services/core/decisionTree.service.ts`

```typescript
// Line 294 - Add wasDocContext check for extraction
case 'extraction':
  // CRITICAL FIX: Block extraction when previous turn was doc-related
  if (wasDocContext && hasDocs && !hasExplicitHelpKeyword) {
    return 'documents';
  }
  return 'extraction';
```

### Priority 2: Fix lastDocumentIds in Retrieval

**File:** `backend/src/services/core/kodaRetrievalEngineV3.service.ts`

Ensure `lastDocumentIds` from conversation context is used to boost chunk scoring.

### Priority 3: Strengthen Language Enforcement

**File:** `backend/src/services/core/languageEnforcement.service.ts`

Add post-generation sanitization to remove source language fragments.

---

## Artifacts

| File | Description |
|------|-------------|
| `conversation_plan_50.json` | Human simulation plan |
| `results.jsonl` | Full query results |
| `sse_raw_events.jsonl` | All SSE events captured |
| `summary.json` | Test summary |
| `frontend_proof_payload.json` | Playwright input data |
| `render_assertions.json` | Frontend test results |

---

## Conclusion

The human simulation test achieved **90% pass rate** (45/50), falling short of the required **100%** for A grade. The 5 failures map directly to issues in the original status table that were incorrectly marked as FIXED.

**Key insight:** The code for fixes EXISTS but doesn't fully work in edge cases:
1. `extraction` intent bypasses follow-up blocking
2. `lastDocumentIds` not used in retrieval boosting
3. Language enforcement doesn't catch all fragments

**Recommendation:** Focus on the 3 priority fixes above and re-run the human simulation to achieve PASS.
