# Harsh Rubric Scorecard (27 queries)

- Generated: 2026-02-28T19:39:28.810Z
- Input: /Users/pg/Desktop/koda-webapp/frontend/e2e/reports/test1-bilingual-100-results.regrade4.json
- Run ID: run_2026-02-28T19-39-28-810Z
- Verdict: **NO_GO**
- Final Score: **0/100**

## Hard Gates

| Gate | Fail Count |
|---|---:|
| A (Doc-grounded + sources) | 0 |
| B (Wrong-doc) | 0 |
| C (Truncation) | 7 |
| D (Fallback with docs) | 0 |
| E (Language mismatch) | 0 |

Hard fail reasons:
- Gate C failed in 7 queries

## Category Averages

| Category | Avg | Max |
|---|---:|---:|
| Retrieval & Evidence | 29.63 | 40 |
| Correctness & Coverage | 16.37 | 25 |
| Reasoning | 8.74 | 15 |
| Writing | 6.96 | 10 |
| Conversation | 6.26 | 10 |

## Outcome Counts

- PASS: 10
- PARTIAL: 10
- FAIL: 7

## Top Issues

- GATE_C_TRUNCATION_DETECTED: 7

## Per Query

| # | Status | Score | Gates | Issues |
|---:|---|---:|---|---|
| 1 | FAIL | 0 | A:P B:P C:F D:P E:P | GATE_C_TRUNCATION_DETECTED |
| 2 | FAIL | 0 | A:P B:P C:F D:P E:P | GATE_C_TRUNCATION_DETECTED |
| 3 | PARTIAL | 84 | A:P B:P C:P D:P E:P | OK |
| 4 | FAIL | 0 | A:P B:P C:F D:P E:P | GATE_C_TRUNCATION_DETECTED |
| 5 | PASS | 98 | A:P B:P C:P D:P E:P | OK |
| 6 | PARTIAL | 86 | A:P B:P C:P D:P E:P | OK |
| 7 | PARTIAL | 86 | A:P B:P C:P D:P E:P | OK |
| 8 | FAIL | 0 | A:P B:P C:F D:P E:P | GATE_C_TRUNCATION_DETECTED |
| 9 | FAIL | 0 | A:P B:P C:F D:P E:P | GATE_C_TRUNCATION_DETECTED |
| 10 | PARTIAL | 86 | A:P B:P C:P D:P E:P | OK |
| 11 | FAIL | 0 | A:P B:P C:F D:P E:P | GATE_C_TRUNCATION_DETECTED |
| 12 | PASS | 97 | A:P B:P C:P D:P E:P | OK |
| 13 | PARTIAL | 86 | A:P B:P C:P D:P E:P | OK |
| 14 | PARTIAL | 93 | A:P B:P C:P D:P E:P | OK |
| 15 | PASS | 97 | A:P B:P C:P D:P E:P | OK |
| 16 | PASS | 97 | A:P B:P C:P D:P E:P | OK |
| 17 | FAIL | 0 | A:P B:P C:F D:P E:P | GATE_C_TRUNCATION_DETECTED |
| 18 | PASS | 97 | A:P B:P C:P D:P E:P | OK |
| 19 | PASS | 97 | A:P B:P C:P D:P E:P | OK |
| 20 | PASS | 97 | A:P B:P C:P D:P E:P | OK |
| 21 | PARTIAL | 86 | A:P B:P C:P D:P E:P | OK |
| 22 | PARTIAL | 83 | A:P B:P C:P D:P E:P | OK |
| 23 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 24 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 25 | PARTIAL | 86 | A:P B:P C:P D:P E:P | OK |
| 26 | PARTIAL | 84 | A:P B:P C:P D:P E:P | OK |
| 27 | PASS | 97 | A:P B:P C:P D:P E:P | OK |
