# Benchmark Validation Matrix

**Date**: 2026-03-12
**Purpose**: Define validation criteria, commands, and acceptance thresholds for each fix in the recovery plan.

---

## Per-Fix Validation

### Fix 1: XLS Cell Fact Extraction (RC2)

| Step | Command | Expected Result | Pass/Fail Criteria |
|------|---------|-----------------|-------------------|
| 1. TypeCheck | `cd backend && npx tsc --noEmit` | Clean exit | Zero errors |
| 2. Unit Tests | `npx jest xlsxExtractor --no-coverage` | All pass | Zero failures |
| 3. Chunk Tests | `npx jest chunkAssembly --no-coverage` | All pass | Zero failures |
| 4. Re-ingest Tab02.xls | Via API: `POST /api/documents/{id}/reindex` | 200 OK | indexingState="ready" |
| 5. Verify cell facts | Query Prisma: count chunks where `metadata.chunkType = "cell_fact"` for Tab02.xls | >0 cell_fact chunks | cellFacts.length > 50 |
| 6. Spot-check Q51 | Run single query: `node frontend/e2e/test-single-query.mjs "How many private non-profit social assistance entities were operating in Brazil in 2013?"` | Answer contains numeric count | Answer.length > 200 AND contains a number matching /\d{2,}/ |
| 7. Section regrade | Run Q51-Q60, harsh grade | Section avg ≥ 50 | Non-Profit section exits F tier |

**Acceptance Criteria**: Non-Profit section average rises from 27.1 to ≥ 45 (D+ or better).
**Rollback**: Revert xlsxExtractor.service.ts change. Re-ingest Tab02.xls with original code.

---

### Fix 2: Structural Completeness Gate → Blocking (RC5)

| Step | Command | Expected Result | Pass/Fail Criteria |
|------|---------|-----------------|-------------------|
| 1. TypeCheck | `cd backend && npx tsc --noEmit` | Clean exit | Zero errors |
| 2. Gate Tests | `npx jest qualityGateRunner --no-coverage` | All pass (9/9) | Zero failures |
| 3. Runtime Tests | `npx jest runtime-wiring --no-coverage` | All pass (3/3) | Zero failures |
| 4. False-positive check | Run all 80 benchmark queries | Zero currently-passing queries blocked | No query that scored ≥60 in v1 now returns adaptive_failure |
| 5. Broken-fragment check | Grep all 80 answers for broken patterns: `/\bis\s*\.\s*$/`, `/\bare\s*\.\s*$/`, trailing articles | Zero matches | Zero broken fragments in output |

**Acceptance Criteria**: Zero broken sentence fragments in output AND zero false positives on currently-passing queries.
**Rollback**: Remove `"structural_completeness"` from `DEFAULT_BLOCKING_QUALITY_GATES` and `gateSeverityByName`. Remove `"bad_fallback_detected"` from `reasonCodes`.

---

### Fix 3: Sentence Boundary Recovery Threshold (RC4)

| Step | Command | Expected Result | Pass/Fail Criteria |
|------|---------|-----------------|-------------------|
| 1. TypeCheck | `cd backend && npx tsc --noEmit` | Clean exit | Zero errors |
| 2. Unit test | Write and run test for `applySentenceBoundaryRecovery()` with short inputs (30-100 chars) | Recovery triggers for short truncated text | Period at position > 15% recovers |
| 3. Regression test | Run test with long inputs (1000+ chars) | Recovery still works for normal text | No regression in existing behavior |
| 4. Integration | Run 5 queries that previously produced broken fragments (Q1, Q30, Q44, Q63, Q79) | Cleaner output | No trailing broken predicates |

**Acceptance Criteria**: Short truncated outputs (< 100 chars) with a sentence boundary in the first 15% get properly recovered.
**Rollback**: Change threshold back to 0.3.

---

### Fix 4: TOC Penalty Strengthening (RC3)

| Step | Command | Expected Result | Pass/Fail Criteria |
|------|---------|-----------------|-------------------|
| 1. TypeCheck | `cd backend && npx tsc --noEmit` | Clean exit | Zero errors |
| 2. Retrieval Tests | `npx jest retrievalEngine --no-coverage` | All pass | Zero failures |
| 3. TOC regression check | Run Q25 (Trade Act injury — currently 82/B) and Q66 (FDCA tobacco — currently 82/B) | Score does not drop | Score ≥ 75 for both |
| 4. TOC improvement check | Run Q63 (FDCA 510k — currently 18/F) and Q65 (FDCA accelerated — currently 32/F) | Score improves | Score ≥ 35 for both |
| 5. Evidence diversity | Log evidence for Q72 (CARES stimulus) — check TOC vs. content ratio | ≤1 TOC chunk in evidence | TOC chunks ≤ 1 |
| 6. Section regrade | Run Trade Act, FDCA, CARES sections | Section avg ≥ 60 per section | All 3 sections exit D- tier |

**Acceptance Criteria**:
- No currently-passing query (score ≥70) drops below 65
- FDCA section avg rises from 51.4 to ≥ 58
- Trade Act section avg rises from 56.3 to ≥ 60
- CARES Act section avg rises from 52.2 to ≥ 58

**Rollback**: Revert TOC penalty multiplier to 0.35. Remove TOC candidate cap.

---

### Fix 5: PDF OCR Trigger Enhancement (RC1)

| Step | Command | Expected Result | Pass/Fail Criteria |
|------|---------|-----------------|-------------------|
| 1. TypeCheck | `cd backend && npx tsc --noEmit` | Clean exit | Zero errors |
| 2. PDF Tests | `npx jest pdfExtractor --no-coverage` | All pass | Zero failures |
| 3. Dry-run OCR decision | Add logging to `extractPagesSelectiveOCR()`, run on Cadastro PDF | Log shows which pages would trigger OCR | ≥3 table pages flagged for OCR |
| 4. Re-ingest Cadastro PDF | Via API | 200 OK | indexingState="ready" |
| 5. Verify OCR content | Query chunks for Cadastro doc, check for numeric data | Chunks contain numeric census values | ≥5 chunks with /\d{3,}/ pattern |
| 6. Spot-check Q1 | Run: "How many households in the Northeast region..." | Answer contains a specific number | Answer has ≥1 number > 1000 |
| 7. Section regrade | Run Q1-Q10 | Section avg ≥ 40 | Cadastro section exits F tier |

**Acceptance Criteria**: Cadastro section average rises from 20.8 to ≥ 40 (D or better).
**Rollback**: Revert pdfExtractor OCR heuristic. Re-ingest Cadastro PDF with original code.

**IMPORTANT**: This fix requires Google Vision OCR availability on the account. If OCR is not available, this fix has zero effect and should be skipped.

---

### Fix 6: Token Budget Adjustment (RC8)

| Step | Command | Expected Result | Pass/Fail Criteria |
|------|---------|-----------------|-------------------|
| 1. TypeCheck | `cd backend && npx tsc --noEmit` | Clean exit | Zero errors |
| 2. Budget Tests | `npx jest tokenBudget --no-coverage` | All pass | Zero failures |
| 3. Builder Tests | `npx jest llmRequestBuilder --no-coverage` | All pass | Zero failures |
| 4. Truncation check | Run Q14, Q29, Q56 (previously truncated) | No mid-sentence truncation | All answers end with complete sentence |

**Acceptance Criteria**: Zero `TRUNCATED_OUTPUT` tags in re-grading.
**Rollback**: Revert budget values to original.

---

## Benchmark-Level Validation

### Full Regrade Protocol

After ALL fixes are deployed and affected documents re-ingested:

```bash
# 1. Run full benchmark
cd /Users/pg/Desktop/koda-webapp
node frontend/e2e/hardening-query-runner.mjs

# 2. Harsh grade
# (manual or automated grading process)

# 3. Compare to baseline
# Baseline: 51.4/100 FAIL
# Target: ≥72/100 (approaching BRONZE)
```

### Score Regression Rules

| Rule | Threshold | Action |
|------|-----------|--------|
| No section drops by >5 points | Δ ≤ -5 per section | Rollback offending fix |
| No currently-passing query drops below 50 | Floor = 50 | Investigate cause |
| Overall score must improve | Δ > 0 | If negative, rollback all |
| Zero new hard-fails | HF count ≤ 1 (baseline) | Rollback offending fix |

### Per-Section Targets

| Section | Baseline | Minimum Target | Stretch Target |
|---------|----------|---------------|---------------|
| Cadastro Único | 20.8 | 35 | 50+ |
| Non-Profit Entities | 27.1 | 45 | 55+ |
| FDCA | 51.4 | 58 | 65+ |
| CARES Act | 52.2 | 58 | 65+ |
| Trade Act | 56.3 | 60 | 68+ |
| BCB Reserve | 64.1 | 64 (hold) | 70+ |
| INPI Fee Schedule | 67.0 | 67 (hold) | 72+ |
| INPI Patent Appeal | 70.6 | 70 (hold) | 75+ |

### Overall Score Target

```
Conservative estimate: 65-70/100 (D+ to C-)
Optimistic estimate:   72-78/100 (C- to C+, approaching BRONZE)
BRONZE threshold:      80/100
```

The conservative estimate assumes RC1 (PDF OCR) doesn't fully work and RC3 (TOC penalty) has diminishing returns on the hardest queries.
