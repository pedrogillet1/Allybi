# Benchmark Recovery Plan V2

**Date**: 2026-03-12
**Baseline Score**: 51.4/100 (FAIL)
**Target Score**: 72-78/100 (approaching BRONZE)
**Companion Docs**: `ROOT_CAUSE_CLASSIFICATION.md`, `BENCHMARK_VALIDATION_MATRIX.md`, `BENCHMARK_SCORE_RECALIBRATION_SPEC.md`

---

## Phase 0: Benchmark Governance & Reproducibility

**Goal**: Make benchmark runs reproducible and self-documenting before changing any runtime code.

### Task P0-T1: Add Run Metadata to Benchmark Runner

| Field | Value |
|-------|-------|
| **ID** | P0-T1 |
| **Files** | `frontend/e2e/hardening-query-runner.mjs` |
| **Dependencies** | None |
| **Effort** | 1-2 hours |
| **Risk/Blast Radius** | NONE — test tooling only, no production code |
| **Root Cause** | N/A (governance gap) |

**Description**: Add `runMetadata` object to benchmark JSON output containing: `runId` (uuid), `timestamp`, `backendCommit` (from `git rev-parse HEAD`), `runnerVersion`, `accountId`, `queryCount`, `docGroupsResolved`, `docGroupsSkipped`.

**Implementation**:
```javascript
// At top of run:
const runMetadata = {
  runId: crypto.randomUUID(),
  timestamp: new Date().toISOString(),
  backendCommit: execSync('git rev-parse HEAD').toString().trim(),
  runnerVersion: '2.0.0',
  accountId: EMAIL,
  queryCount: totalQueries,
  docGroupsResolved: testedGroups.length,
  docGroupsSkipped: skippedGroups.map(g => g.docLabel),
};
// Include in JSON output
```

**Validation Commands**:
```bash
node frontend/e2e/hardening-query-runner.mjs
cat frontend/e2e/reports/hardening-benchmark-run.json | jq '.runMetadata'
# Verify all fields present and non-null
```

**Acceptance Criteria**: Run Integrity score rises from 75 to ≥ 90.
**Rollback**: Revert hardening-query-runner.mjs changes.
**Expected Score Impact**: +1.5 points overall (integrity component: 0.10 × (90-75) = +1.5)

---

## Phase 1: Proven Critical Fixes (Highest Certainty)

**Goal**: Fix the two PROVEN CRITICAL root causes that account for 25% of all queries.

### Task P1-T1: Remove Financial/Temporal Gate from XLS Cell Fact Extraction

| Field | Value |
|-------|-------|
| **ID** | P1-T1 |
| **Files** | `backend/src/services/extraction/xlsxExtractor.service.ts` |
| **Dependencies** | None |
| **Effort** | 30 minutes |
| **Risk/Blast Radius** | LOW — ingestion pipeline only. More chunks created for non-financial spreadsheets. No runtime impact until re-ingestion. |
| **Root Cause** | RC2 (PROVEN, 99%) |

**Description**: Change the cell fact extraction gate at line 321 from `if (financial || temporal)` to `if (hasStructuredData)` where `hasStructuredData = headers.length >= 2 && data.length > headerRowIndex + 1`.

**Implementation**:
```typescript
// Line 321: Change from:
if (financial || temporal) {
// To:
const hasStructuredData = headers.length >= 2 && data.length > headerRowIndex + 1;
if (hasStructuredData) {
```

The `isFinancialMetric` check still runs and sets `isFinancial` on the sheet metadata. We're only removing it as a gate for cell fact extraction.

**Validation Commands**:
```bash
cd backend && npx tsc --noEmit
npx jest xlsxExtractor --no-coverage
npx jest chunkAssembly --no-coverage
```

**Acceptance Criteria**: TypeCheck clean, all tests pass, non-financial XLS files now produce cell_fact chunks.
**Rollback**: Revert line 321 to `if (financial || temporal)`.
**Expected Score Impact**: +12 to +20 points on Non-Profit section (27→39-47). Conservative: +12 (cell facts extracted but retrieval may still prefer wrong chunks). Optimistic: +20 (correct chunks rank highest).

### Task P1-T2: Re-ingest Tab02.xls

| Field | Value |
|-------|-------|
| **ID** | P1-T2 |
| **Files** | None (API operation) |
| **Dependencies** | P1-T1 |
| **Effort** | 15 minutes |
| **Risk/Blast Radius** | LOW — single document re-ingestion |
| **Root Cause** | RC2 (activation) |

**Description**: Trigger re-ingestion of Tab02.xls (Non-Profit Entities) so new cell facts are extracted with the updated code.

**Validation Commands**:
```bash
# Via API
curl -X POST http://localhost:5000/api/documents/<TAB02_DOC_ID>/reindex \
  -H "Authorization: Bearer $TOKEN"

# Verify indexing complete
curl http://localhost:5000/api/documents/<TAB02_DOC_ID> \
  -H "Authorization: Bearer $TOKEN" | jq '.indexingState'
# Should be "ready"
```

**Acceptance Criteria**: Tab02.xls indexingState="ready" AND chunk count increases (cell_fact chunks now exist).
**Rollback**: Re-ingest with original code.
**Expected Score Impact**: Activates P1-T1's score impact.

### Task P1-T3: Make Structural Completeness Gate Blocking

| Field | Value |
|-------|-------|
| **ID** | P1-T3 |
| **Files** | `backend/src/data_banks/quality/quality_gates.any.json`, `backend/src/modules/chat/runtime/CentralizedChatRuntimeDelegate.ts` |
| **Dependencies** | None (can run parallel with P1-T1) |
| **Effort** | 30 minutes |
| **Risk/Blast Radius** | MEDIUM — affects ALL chat responses. If gate has false positives, valid answers get blocked. Must verify false-positive rate first. |
| **Root Cause** | RC5 (PROVEN, 99%) |

**Description**: Three changes:
1. Add `"structural_completeness": "block"` to `gateSeverityByName` in `quality_gates.any.json`
2. Add `"structural_completeness"` to `DEFAULT_BLOCKING_QUALITY_GATES` in `CentralizedChatRuntimeDelegate.ts`
3. Add `"bad_fallback_detected": "bad_fallback_detected"` to `reasonCodes` in `quality_gates.any.json`

**Pre-implementation check**: Run all 80 benchmark queries with logging to verify the gate does NOT fire on currently-passing queries (score ≥ 60). If false positives exist, tighten detection patterns first.

**Validation Commands**:
```bash
cd backend && npx tsc --noEmit
npx jest qualityGateRunner --no-coverage
npx jest runtime-wiring --no-coverage
```

**Acceptance Criteria**: Zero false positives on currently-passing queries. All broken fragments now blocked and replaced with adaptive failure message.
**Rollback**: Remove from `gateSeverityByName`, `DEFAULT_BLOCKING_QUALITY_GATES`, and `reasonCodes`.
**Expected Score Impact**: +2 to +5 points overall. Broken fragments (11 queries, avg score ~22) replaced with clean failure messages (expected score ~30-35 each). Net: +8-13 per affected query × 11/80 weight = +1.1 to +1.8 on overall. Plus integrity improvement from eliminating broken output.

---

## Phase 2: Proven High-Impact Fixes

**Goal**: Fix retrieval quality for large legal documents and output truncation.

### Task P2-T1: Strengthen TOC Score Penalty

| Field | Value |
|-------|-------|
| **ID** | P2-T1 |
| **Files** | `backend/src/services/core/retrieval/retrievalEngine.service.ts` |
| **Dependencies** | None |
| **Effort** | 1 hour |
| **Risk/Blast Radius** | MEDIUM — affects ALL retrieval. Over-penalizing TOC could hurt queries that legitimately need TOC context. |
| **Root Cause** | RC3 (PROVEN, 95%) |

**Description**: Two changes:
1. Strengthen TOC penalty from 0.35× to 0.20× at line ~2660
2. Cap TOC candidates to max 1 per document in evidence selection (in `buildEvidenceResult` or equivalent)

**Implementation for cap**:
```typescript
// In evidence selection loop, after existing code:
const tocPerDoc = new Map<string, number>();
// Before pushing evidence:
if (candidate.signals?.tocCandidate) {
  const key = candidate.docId;
  const count = tocPerDoc.get(key) || 0;
  if (count >= 1) continue; // skip additional TOC chunks
  tocPerDoc.set(key, count + 1);
}
```

**Pre-implementation check**: Run Q25 (Trade Act injury, 82/B) and Q66 (FDCA tobacco, 82/B) to get baseline. These currently work well and must not regress.

**Validation Commands**:
```bash
cd backend && npx tsc --noEmit
npx jest retrievalEngine --no-coverage
# Regression check on known-good queries
node frontend/e2e/test-single-query.mjs "How does the Act define and address injury caused to domestic industries?" # Q25
node frontend/e2e/test-single-query.mjs "What authority does the FDA have to regulate tobacco products?" # Q66
```

**Acceptance Criteria**:
- Q25 and Q66 scores ≥ 75 (no regression)
- FDCA section avg rises from 51.4 to ≥ 56
- Trade Act section avg rises from 56.3 to ≥ 60
- CARES Act section avg rises from 52.2 to ≥ 56

**Rollback**: Revert penalty to 0.35×. Remove TOC cap code.
**Expected Score Impact**: Conservative: +3-5 per section (3 sections × 3-5 = +9-15 total query points, ÷80 × 0.70 = +0.8 to +1.3 overall). Optimistic: +8-12 per section.

### Task P2-T2: Fix Sentence Boundary Recovery Threshold

| Field | Value |
|-------|-------|
| **ID** | P2-T2 |
| **Files** | `backend/src/modules/chat/runtime/CentralizedChatRuntimeDelegate.ts` |
| **Dependencies** | None (can run parallel with P2-T1) |
| **Effort** | 30 minutes |
| **Risk/Blast Radius** | LOW — post-processing only, local change |
| **Root Cause** | RC4 (PROVEN, 99%) |

**Description**: Change threshold at line 3906 from `text.length * 0.3` to `Math.min(text.length * 0.15, 50)`.

**Implementation**:
```typescript
// Line 3906: Change from:
if (lastPeriod > text.length * 0.3) {
// To:
if (lastPeriod > Math.min(text.length * 0.15, 50)) {
```

This ensures:
- For 46-char output: threshold = min(6.9, 50) = 6.9 → period at pos 6 triggers recovery
- For 1000-char output: threshold = min(150, 50) = 50 → period at pos 51+ triggers recovery (more aggressive)
- For 5000-char output: threshold = min(750, 50) = 50 → same floor

**Validation Commands**:
```bash
cd backend && npx tsc --noEmit
# Manual verification: apply recovery to known broken outputs
```

**Acceptance Criteria**: `applySentenceBoundaryRecovery("the specific number is .")` returns `"the specific number is."` (or truncates before the broken part).
**Rollback**: Revert threshold to `text.length * 0.3`.
**Expected Score Impact**: +1 to +3 overall (works in conjunction with P1-T3 blocking gate — this fix prevents some fragments from reaching the gate at all).

### Task P2-T3: Increase Token Budget for Legal Answers

| Field | Value |
|-------|-------|
| **ID** | P2-T3 |
| **Files** | `backend/src/services/core/enforcement/tokenBudget.service.ts` |
| **Dependencies** | None |
| **Effort** | 30 minutes |
| **Risk/Blast Radius** | LOW — only increases budget, doesn't reduce. May slightly increase LLM cost per query. |
| **Root Cause** | RC8 (PARTIAL-PROVEN, 70%) |

**Description**: Increase `doc_grounded_single` from 4800 to 6000 tokens and `doc_grounded_multi` from 5400 to 7000 tokens in `resolveModeMax()`.

**Validation Commands**:
```bash
cd backend && npx tsc --noEmit
npx jest tokenBudget --no-coverage
npx jest llmRequestBuilder --no-coverage
npx jest builder-payload-budget --no-coverage
```

**Acceptance Criteria**: Zero `TRUNCATED_OUTPUT` tags in re-grading. All cert tests pass.
**Rollback**: Revert budget values.
**Expected Score Impact**: +0.5 to +1.5 overall (3 truncated queries × ~20-point improvement each = +60 query points, ÷80 × 0.70 = +0.5 to +1.3).

---

## Phase 3: Plausible Critical Fix (Validate Then Fix)

**Goal**: Address the Cadastro PDF extraction failure — highest single-section impact but requires validation.

### Task P3-T1: Validate Cadastro PDF Text Layer Quality

| Field | Value |
|-------|-------|
| **ID** | P3-T1 |
| **Files** | None (investigation) |
| **Dependencies** | None |
| **Effort** | 1-2 hours |
| **Risk/Blast Radius** | NONE — read-only investigation |
| **Root Cause** | RC1 (PLAUSIBLE, 75%) — validation step |

**Description**: Extract and inspect the Cadastro PDF's text layer to determine:
1. Does the text layer contain actual table data values, or only TOC descriptions?
2. If OCR were triggered, would it produce usable numeric data?
3. Are the tables image-based or text-based?

**Method**:
```bash
# Extract text layer with pdf-parse
node -e "
  const pdf = require('pdf-parse');
  const fs = require('fs');
  const buf = fs.readFileSync('<CADASTRO_PDF_PATH>');
  pdf(buf).then(d => {
    fs.writeFileSync('/tmp/cadastro-text-layer.txt', d.text);
    console.log('Pages:', d.numpages, 'Text chars:', d.text.length);
  });
"

# Inspect specific pages for table data
head -200 /tmp/cadastro-text-layer.txt
grep -c '[0-9]\{4,\}' /tmp/cadastro-text-layer.txt  # count 4+ digit numbers
```

**Acceptance Criteria**: Determine PROVEN or DISPROVEN for RC1. If text layer lacks table data AND OCR is available, proceed to P3-T2. If text layer has data but it's not being chunked correctly, write alternative fix.
**Rollback**: N/A — investigation only.
**Expected Score Impact**: N/A — informs next task.

### Task P3-T2: Add Table-Content-Aware OCR Trigger (Conditional)

| Field | Value |
|-------|-------|
| **ID** | P3-T2 |
| **Files** | `backend/src/services/extraction/pdfExtractor.service.ts` |
| **Dependencies** | P3-T1 (only proceed if RC1 validated) |
| **Effort** | 1-2 hours |
| **Risk/Blast Radius** | MEDIUM — affects ALL PDF ingestion. Could trigger unnecessary OCR on some PDFs, increasing cost. |
| **Root Cause** | RC1 (if validated) |

**Description**: Add heuristic to `extractPagesSelectiveOCR()`: pages with table structure markers (Tabela/Table) but <3 numeric values trigger OCR regardless of char count.

**Implementation**:
```typescript
// After existing textLength < MIN_CHARS_PER_PAGE_THRESHOLD check:
if (textLength >= MIN_CHARS_PER_PAGE_THRESHOLD) {
  const pageText = page?.text || "";
  const hasTableMarkers = /Tabela\s+\d|Table\s+\d|\|\s+\d|---\s*\|/i.test(pageText);
  const numericValues = pageText.match(/\b\d[\d.,]{2,}\b/g) || [];
  if (hasTableMarkers && numericValues.length < 3) {
    pagesToOcr.push(i + 1);
  }
}
```

**Validation Commands**:
```bash
cd backend && npx tsc --noEmit
npx jest pdfExtractor --no-coverage
```

**Acceptance Criteria**: Cadastro PDF pages with "Tabela" markers trigger OCR. No regression on other PDF extraction.
**Rollback**: Revert pdfExtractor changes.
**Expected Score Impact**: Conservative: +8 on Cadastro section (20.8→28.8). Optimistic: +20 (20.8→40.8). Depends entirely on OCR quality for IBGE-format tables.

### Task P3-T3: Re-ingest Cadastro PDF (Conditional)

| Field | Value |
|-------|-------|
| **ID** | P3-T3 |
| **Files** | None (API operation) |
| **Dependencies** | P3-T2 |
| **Effort** | 15 minutes |
| **Risk/Blast Radius** | LOW — single document |
| **Root Cause** | RC1 (activation) |

**Description**: Re-ingest Acesso_ao_Cadastro_Unico_PNAD_2014.pdf after OCR trigger fix.

**Acceptance Criteria**: indexingState="ready", chunks contain numeric census data.
**Rollback**: Re-ingest with original code.
**Expected Score Impact**: Activates P3-T2's score impact.

---

## Phase 4: Benchmark Rerun & Assessment

**Goal**: Measure cumulative impact of all fixes.

### Task P4-T1: Full Benchmark Rerun

| Field | Value |
|-------|-------|
| **ID** | P4-T1 |
| **Files** | `frontend/e2e/hardening-query-runner.mjs` (runner only) |
| **Dependencies** | P0-T1, P1-T1 through P1-T3, P2-T1 through P2-T3, P3-T1 through P3-T3 |
| **Effort** | 30-60 minutes (runtime) |
| **Risk/Blast Radius** | NONE — read-only benchmark |
| **Root Cause** | N/A (measurement) |

**Description**: Run full 80-query benchmark with updated code and re-ingested documents.

**Commands**:
```bash
cd /Users/pg/Desktop/koda-webapp
node frontend/e2e/hardening-query-runner.mjs
```

**Acceptance Criteria**: Run completes with 80 queries, 0 errors, runMetadata present.

### Task P4-T2: Harsh Re-grade

| Field | Value |
|-------|-------|
| **ID** | P4-T2 |
| **Files** | `frontend/e2e/reports/` (output) |
| **Dependencies** | P4-T1 |
| **Effort** | 1-2 hours |
| **Risk/Blast Radius** | NONE |
| **Root Cause** | N/A (measurement) |

**Description**: Apply same harsh grading rubric. Compare to 51.4 baseline.

**Acceptance Criteria**:
- Overall score ≥ 65 (minimum) or ≥ 72 (target)
- No section regresses by > 5 points
- Zero new hard-fails (score ≤ 15)
- Zero broken sentence fragments
- Run Integrity ≥ 90

### Task P4-T3: Regression Analysis

| Field | Value |
|-------|-------|
| **ID** | P4-T3 |
| **Files** | None (analysis) |
| **Dependencies** | P4-T2 |
| **Effort** | 1 hour |
| **Risk/Blast Radius** | NONE |

**Description**: For each fix, verify it delivered within its predicted score range. Identify any regressions. Document which PLAUSIBLE root causes were confirmed or disproven by results.

**Acceptance Criteria**: All fixes documented with actual vs. predicted impact.

---

## Phase 5: Stretch Fixes (If Score < 72 After Phase 4)

**Goal**: Address remaining PLAUSIBLE root causes if Phase 1-3 fixes are insufficient.

### Task P5-T1: Evidence Diversity Enforcement

| Field | Value |
|-------|-------|
| **ID** | P5-T1 |
| **Files** | `backend/src/services/core/retrieval/retrievalEngine.service.ts` |
| **Dependencies** | P4-T3 (only if FDCA/Trade Act/CARES still below target) |
| **Effort** | 2-3 hours |
| **Risk/Blast Radius** | MEDIUM — retrieval changes |
| **Root Cause** | RC6 (PLAUSIBLE, 60%) |

**Description**: When evidence candidates from a single document are dominated by one page range (e.g., 5 of 10 candidates from pages 1-5 of a 400-page doc), force diversity by requiring at least 3 candidates from different page ranges.

**Acceptance Criteria**: Evidence for large-doc queries spans ≥ 3 distinct page ranges.
**Rollback**: Remove diversity enforcement.
**Expected Score Impact**: +2 to +5 overall (if effective).

### Task P5-T2: Increase Snippet Length

| Field | Value |
|-------|-------|
| **ID** | P5-T2 |
| **Files** | `backend/src/services/core/retrieval/retrievalEngine.service.ts` or `retrievalConfig` |
| **Dependencies** | P4-T3 (only if evidence quality still poor) |
| **Effort** | 30 minutes |
| **Risk/Blast Radius** | LOW — may increase context window usage |
| **Root Cause** | RC7 (PLAUSIBLE, 55%) |

**Description**: Increase `maxSnippetChars` from 2200 to 3000 and `toSnippet()` cap from 3200 to 4000.

**Acceptance Criteria**: No snippet truncation at critical points.
**Rollback**: Revert to original values.
**Expected Score Impact**: +0 to +2 overall (uncertain payoff).

---

## Score Impact Summary

| Phase | Fixes | Conservative Δ | Optimistic Δ | Cumulative (Conservative) |
|-------|-------|----------------|-------------|--------------------------|
| Phase 0 | P0-T1 (metadata) | +1.5 | +1.5 | 52.9 |
| Phase 1 | P1-T1/T2 (XLS), P1-T3 (gate) | +10 | +18 | 62.9 |
| Phase 2 | P2-T1 (TOC), P2-T2 (recovery), P2-T3 (budget) | +3 | +8 | 65.9 |
| Phase 3 | P3-T1/T2/T3 (PDF OCR) | +3 | +15 | 68.9 |
| Phase 4 | Rerun + measurement | 0 | 0 | 68.9 |
| Phase 5 | Stretch (if needed) | +1 | +5 | 69.9 |
| **Total** | | **+17.5** | **+47.5** | **68.9 - 98.9** |

**Realistic expectation**: 68-78/100 — likely FAIL-to-BRONZE range.

The wide gap between conservative and optimistic reflects the high uncertainty of RC1 (PDF OCR) and the compounding nature of retrieval improvements.

---

## Execution Order

```
P0-T1 (metadata)
    ↓
P1-T1 (XLS gate) ──→ P1-T2 (re-ingest Tab02)
P1-T3 (blocking gate) ←── parallel
    ↓
P2-T1 (TOC penalty) ←── parallel
P2-T2 (recovery threshold) ←── parallel
P2-T3 (token budget) ←── parallel
    ↓
P3-T1 (validate PDF) ──→ P3-T2 (OCR trigger) ──→ P3-T3 (re-ingest PDF)
    ↓
P4-T1 (rerun) ──→ P4-T2 (regrade) ──→ P4-T3 (regression analysis)
    ↓
P5-T1, P5-T2 (only if needed)
```

Total tasks: 15 (10 implementation + 2 re-ingestion + 3 measurement)
Estimated total effort: 10-15 hours
