# Benchmark Score Recalibration Specification

**Date**: 2026-03-12
**Purpose**: Address benchmark governance gaps identified in the plan review.

---

## 1. Run Metadata Requirements

Every benchmark run MUST record in its JSON output:

```json
{
  "runMetadata": {
    "runId": "<uuid>",
    "timestamp": "<ISO-8601>",
    "modelId": "<e.g., claude-sonnet-4-6>",
    "promptVersion": "<git SHA or semver of prompt templates>",
    "documentSetVersion": "<hash of document IDs + indexingState>",
    "backendCommit": "<git SHA>",
    "runnerVersion": "<version of hardening-query-runner.mjs>",
    "accountId": "<test account used>",
    "queryCount": 80,
    "docGroupsResolved": 8,
    "docGroupsSkipped": ["TMEP"]
  }
}
```

### Implementation
- Add `runMetadata` generation to `hardening-query-runner.mjs`
- Compute `documentSetVersion` as SHA-256 of sorted `docId:indexingState` pairs
- Read `backendCommit` from `git rev-parse HEAD`
- Read `modelId` from backend config or environment

### Integrity Score Impact
Adding run metadata moves Run Integrity from 75 → 90+ (fixes 3 of 4 integrity failures).

---

## 2. Grading Methodology Fixes

### 2a. Score Formula (Current)

```
Final Score = 0.70 × Mean_Answer_Score
            + 0.10 × Run_Integrity
            + 0.10 × Cross_Answer_Consistency
            + 0.10 × Calibration
```

**Issue**: Mean Answer Score is unweighted — a 10-query section with all F's has the same impact as a 10-query section with all B's. This is correct (equal weight per query).

**Recommendation**: Keep current formula. It correctly penalizes failing sections proportionally.

### 2b. Per-Query Scoring Dimensions

Current dimensions (from grading rubric):
- Retrieval (Retr) — 0-25
- Precision (Prec) — 0-25
- Numeric Accuracy (Num) — 0-20
- Grounding (Grnd) — 0-20
- Reasoning (Reas) — 0-15
- Completeness (Comp) — 0-10

**Issue**: Dimensions don't sum to 100. Max possible = 115. Scores appear normalized to 0-100 but the normalization isn't documented.

**Recommendation**: Document the normalization formula:
```
NormalizedScore = (Retr + Prec + Num + Grnd + Reas + Comp) / 1.15
```

### 2c. Hard-Fail Definition

Current: `score = 0` (only Q1 qualifies)

**Issue**: Too strict. Q30 at 12 and Q56 at 12 are functionally failures but don't count as hard-fails.

**Recommendation**: Redefine hard-fail as `score ≤ 15`. This captures:
- Q1 (0) — broken placeholder
- Q30 (12) — broken fragment
- Q56 (12) — truncated mid-word

New hard-fail rate: 3/80 = 3.75% (vs. current 1.25%).

---

## 3. Score Impact Estimation Methodology

### Problem
V1 plan estimated impacts like "+28 points (Non-Profit 27→55+)" without methodology.

### Required Methodology

For each fix, estimate per-query score changes:

1. **Identify affected queries** — which queries does this fix target?
2. **Estimate per-dimension improvement** — which scoring dimensions improve and by how much?
3. **Compute predicted query score** — sum improved dimensions
4. **Compute section average change** — average of query score deltas
5. **Apply confidence discount** — multiply by classification confidence (PROVEN=0.9, PLAUSIBLE=0.6, PARTIAL-PROVEN=0.75)

### Example: Fix 1 (XLS Cell Facts) on Q51

Current score breakdown: Retr=0, Prec=0, Num=0, Grnd=15, Reas=10, Comp=10 → Score=35

With fix: Cell facts extracted → correct data retrieved
- Predicted: Retr=15, Prec=12, Num=10, Grnd=12, Reas=8, Comp=8 → Score=65/1.15=56.5
- Delta: +21.5 per query
- Confidence-adjusted: +21.5 × 0.9 (PROVEN) = +19.4 per query
- Section impact: ~+19 points

### Conservative vs. Optimistic

Always state both:
- **Conservative**: Assumes fix partially works, some queries don't improve
- **Optimistic**: Assumes fix works as designed for all targeted queries

---

## 4. Benchmark Reproducibility Protocol

### Before Each Run

```bash
# 1. Record environment
git rev-parse HEAD > /tmp/benchmark-env.txt
echo "NODE_ENV=$NODE_ENV" >> /tmp/benchmark-env.txt
echo "PORT=$PORT" >> /tmp/benchmark-env.txt

# 2. Verify document set
node -e "
  // Fetch document list, compute hash of docId:indexingState
  // Compare to expected hash
"

# 3. Verify server is clean
curl -s http://localhost:5000/api/health | jq .status
```

### After Each Run

```bash
# 1. Verify artifacts
ls -la frontend/e2e/reports/hardening-benchmark-run.json
ls -la frontend/e2e/reports/hardening-benchmark-answers.md

# 2. Compare to previous run
node -e "
  const prev = require('./frontend/e2e/reports/hardening-benchmark-run.json');
  // Compare query count, doc groups, timing ranges
"
```

---

## 5. Score Progression Tracking

### Tracking Table (update after each run)

| Run | Date | Commit | Score | Tier | Fixes Applied | Delta |
|-----|------|--------|-------|------|---------------|-------|
| Baseline | 2026-03-12 | 8af1a29 | 51.4 | FAIL | None | — |
| V2-Phase1 | TBD | TBD | TBD | TBD | Fix 1, Fix 2 | TBD |
| V2-Phase2 | TBD | TBD | TBD | TBD | + Fix 3, Fix 4 | TBD |
| V2-Phase3 | TBD | TBD | TBD | TBD | + Fix 5, Fix 6 | TBD |

### Tier Definitions

| Tier | Score Range | Hard-Fail Rate | Integrity |
|------|------------|---------------|-----------|
| FAIL | < 70 | Any | Any |
| BRONZE | 70-79 | < 5% | ≥ 85 |
| SILVER | 80-87 | < 2% | ≥ 90 |
| GOLD | 88-94 | 0% | ≥ 95 |
| PLATINUM | 95-100 | 0% | 100 |
