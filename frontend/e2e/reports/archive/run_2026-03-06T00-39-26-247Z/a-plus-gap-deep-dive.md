# A+ Gap Deep Dive (Queries)

Generated: 2026-03-06T00:39:26.247Z
Source: frontend/e2e/reports/latest/scorecard.json

Run ID: run_2026-03-06T00-39-26-247Z
Dataset ID: query-test-100-results.json:100
Pack: 100

## Scope

- Total queries analyzed: **100**
- Queries currently A+: **100**
- Queries below A+ (needs work): **0**
- Target bar for A+: **>=95 with no hard gate failures**

## What Is Missing For All Queries To Reach A+

| Gate | Missing In | Fail Rate | Requirement |
|---|---:|---:|---|
| A | 0/100 | 0% | Doc-grounded answers must include sources when docs are attached. |
| B | 0/100 | 0% | Sources must stay within attached docset (no wrong-doc/out-of-scope). |
| C | 0/100 | 0% | No semantic truncation in final answer. |
| D | 0/100 | 0% | No fallback response without sources when docs are attached. |
| E | 0/100 | 0% | Answer language must match expected language. |
| F | 0/100 | 0% | All cited sources must be relevant to the query intent. |
| G | 0/100 | 0% | At least one cited source must include rich location metadata. |
| H | 0/100 | 0% | Analytical queries must include required structure headers/blocks. |

## Top Missing Pieces (Issue Frequency)

| Issue | Count |
|---|---:|

## Lowest-Scoring Queries

| # | Score | Failed Gates | Missing For A+ |
|---:|---:|---|---|
| 1 | 96 | - | None |
| 2 | 96 | - | None |
| 3 | 96 | - | None |
| 4 | 96 | - | None |
| 5 | 96 | - | None |
| 6 | 96 | - | None |
| 7 | 96 | - | None |
| 8 | 96 | - | None |
| 9 | 96 | - | None |
| 10 | 96 | - | None |
| 11 | 96 | - | None |
| 12 | 96 | - | None |
| 13 | 96 | - | None |
| 14 | 96 | - | None |
| 15 | 96 | - | None |
| 16 | 96 | - | None |
| 17 | 96 | - | None |
| 18 | 96 | - | None |
| 19 | 96 | - | None |
| 20 | 96 | - | None |

## Scope Diagnostics

- Scope Known: yes
- Scope Source: documents_attached
- Scope Policy Applied: docset_lock


