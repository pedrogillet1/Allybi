# A+ Gap Deep Dive (Queries)

Generated: 2026-03-05T21:57:43.045Z
Source: frontend/e2e/reports/latest/scorecard.json

Run ID: run_2026-03-05T21-57-43-045Z
Dataset ID: per_query.json:100
Pack: 40

## Scope

- Total queries analyzed: **100**
- Queries currently A+: **0**
- Queries below A+ (needs work): **100**
- Target bar for A+: **>=95 with no hard gate failures**

## What Is Missing For All Queries To Reach A+

| Gate | Missing In | Fail Rate | Requirement |
|---|---:|---:|---|
| A | 0/100 | 0% | Doc-grounded answers must include sources when docs are attached. |
| B | 0/100 | 0% | Sources must stay within attached docset (no wrong-doc/out-of-scope). |
| C | 0/100 | 0% | No semantic truncation in final answer. |
| D | 0/100 | 0% | No fallback response without sources when docs are attached. |
| E | 100/100 | 100% | Answer language must match expected language. |
| F | 0/100 | 0% | All cited sources must be relevant to the query intent. |
| G | 0/100 | 0% | At least one cited source must include rich location metadata. |
| H | 0/100 | 0% | Analytical queries must include required structure headers/blocks. |

Universal blocker(s):
- Gate E: Answer language must match expected language.

## Top Missing Pieces (Issue Frequency)

| Issue | Count |
|---|---:|
| GATE_E_LANGUAGE_MISMATCH | 100 |

## Lowest-Scoring Queries

| # | Score | Failed Gates | Missing For A+ |
|---:|---:|---|---|
| 1 | 0 | E | E: Answer language must match expected language. |
| 2 | 0 | E | E: Answer language must match expected language. |
| 3 | 0 | E | E: Answer language must match expected language. |
| 4 | 0 | E | E: Answer language must match expected language. |
| 5 | 0 | E | E: Answer language must match expected language. |
| 6 | 0 | E | E: Answer language must match expected language. |
| 7 | 0 | E | E: Answer language must match expected language. |
| 8 | 0 | E | E: Answer language must match expected language. |
| 9 | 0 | E | E: Answer language must match expected language. |
| 10 | 0 | E | E: Answer language must match expected language. |
| 11 | 0 | E | E: Answer language must match expected language. |
| 12 | 0 | E | E: Answer language must match expected language. |
| 13 | 0 | E | E: Answer language must match expected language. |
| 14 | 0 | E | E: Answer language must match expected language. |
| 15 | 0 | E | E: Answer language must match expected language. |
| 16 | 0 | E | E: Answer language must match expected language. |
| 17 | 0 | E | E: Answer language must match expected language. |
| 18 | 0 | E | E: Answer language must match expected language. |
| 19 | 0 | E | E: Answer language must match expected language. |
| 20 | 0 | E | E: Answer language must match expected language. |

## Scope Diagnostics

- Scope Known: no
- Scope Source: none
- Scope Policy Applied: none


