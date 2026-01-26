# Deep Grade Analysis - Index

**Generated:** 2026-01-15T19:45:00Z
**Source Run:** audit_output_mass/human_run_20260115T162215/
**Analysis Type:** Comprehensive Per-Query Deep Grading

---

## Files in This Analysis

### Main Reports

| File | Description |
|------|-------------|
| `DEEP_GRADE_TABLE.md` | Complete 50-query grading table with all 9 rubric dimensions |
| `DEEP_GRADE_TABLE.csv` | CSV export for programmatic analysis |
| `PARETO_SUMMARY.md` | Root cause analysis and prioritized fix recommendations |
| `INDEX.md` | This file - navigation index |

### Per-Query Notes

| File | Grade | Query |
|------|-------|-------|
| `PER_QUERY_NOTES/q04.md` | D | Box sizes - instant help template |
| `PER_QUERY_NOTES/q14.md` | F | April/May net income - help template on follow-up |
| `PER_QUERY_NOTES/q16.md` | F | Turning point month - help template on follow-up |
| `PER_QUERY_NOTES/q28.md` | F | Intangibility - raw PT in EN answer |
| `PER_QUERY_NOTES/q40.md` | D | Guide content/layout - wrong docs retrieved |
| `PER_QUERY_NOTES/B_GRADE_SUMMARY.md` | B | Summary of 24 B-grade queries |
| `PER_QUERY_NOTES/C_GRADE_SUMMARY.md` | C | Summary of 16 C-grade queries |

---

## Quick Stats

| Metric | Value |
|--------|-------|
| Total Queries | 50 |
| A-Grade | 5 (10%) |
| B-Grade | 24 (48%) |
| C-Grade | 16 (32%) |
| D-Grade | 2 (4%) |
| F-Grade | 3 (6%) |
| **Pass Rate** | **90%** |
| **Required** | **100%** |

---

## Critical Failures

| ID | Grade | Root Cause | Fix Priority |
|----|-------|------------|--------------|
| q14 | F | extraction intent bypass | HIGH |
| q16 | F | extraction intent bypass | HIGH |
| q28 | F | language mixing | HIGH |
| q04 | D | excel misroute | MEDIUM |
| q40 | D | lastDocIds not used | MEDIUM |

---

## Top 5 Fixes by Impact

| Fix | Queries Fixed | Files |
|-----|---------------|-------|
| 1. Extraction intent check | 2 | decisionTree.service.ts:294 |
| 2. Language sanitization | 8 | languageEnforcement.service.ts |
| 3. lastDocIds boost | 6 | kodaRetrievalEngineV3.ts |
| 4. Remove hedging | 10 | kodaAnswerEngineV3.ts |
| 5. Month mapping | 5 | monthNormalization.service.ts |

---

## How to Use This Analysis

1. **Start with F-grades:** Read `q14.md`, `q16.md`, `q28.md` for critical fixes
2. **Check PARETO_SUMMARY.md:** For prioritized fix order
3. **Review DEEP_GRADE_TABLE.md:** For per-query rubric breakdown
4. **Grade summaries:** `B_GRADE_SUMMARY.md` and `C_GRADE_SUMMARY.md` for bulk fixes

---

## Source Artifacts

| File | Purpose |
|------|---------|
| `results.jsonl` | Raw query results with answers, sources, latency |
| `evals.jsonl` | Claude evaluator grades and previews |
| `sse_raw_events.jsonl` | All SSE stream events captured |
| `conversation_plan_50.json` | Human simulation conversation structure |
| `failed_queries.json` | Quick list of F/D grade queries |
