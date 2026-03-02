# Harsh Rubric Scorecard (50 queries)

- Generated: 2026-03-02T21:45:26.784Z
- Input: /Users/pg/Desktop/koda-webapp/frontend/e2e/reports/test1-doc-retrieval-chatgpt-parity-50-results-provenancefix-full50.json
- Run ID: run_2026-03-02T21-45-26-784Z
- Verdict: **NO_GO**
- Final Score: **0/100**

## Hard Gates

| Gate | Fail Count |
|---|---:|
| A (Doc-grounded + sources) | 0 |
| B (Wrong-doc) | 0 |
| C (Truncation) | 23 |
| D (Fallback with docs) | 0 |
| E (Language mismatch) | 3 |

Hard fail reasons:
- Gate C failed in 23 queries
- Gate E failed in 3 queries

## Category Averages

| Category | Avg | Max |
|---|---:|---:|
| Retrieval & Evidence | 19.2 | 40 |
| Correctness & Coverage | 11.02 | 25 |
| Reasoning | 5.48 | 15 |
| Writing | 4.36 | 10 |
| Conversation | 3.82 | 10 |

## Outcome Counts

- PASS: 0
- PARTIAL: 24
- FAIL: 26

## Top Issues

- GATE_C_TRUNCATION_DETECTED: 23
- GATE_E_LANGUAGE_MISMATCH: 3

## Per Query

| # | Status | Score | Gates | Issues |
|---:|---|---:|---|---|
| 1 | PARTIAL | 88 | A:P B:P C:P D:P E:P | OK |
| 2 | PARTIAL | 91 | A:P B:P C:P D:P E:P | OK |
| 3 | PARTIAL | 86 | A:P B:P C:P D:P E:P | OK |
| 4 | PARTIAL | 86 | A:P B:P C:P D:P E:P | OK |
| 5 | FAIL | 0 | A:P B:P C:F D:P E:P | GATE_C_TRUNCATION_DETECTED |
| 6 | PARTIAL | 93 | A:P B:P C:P D:P E:P | OK |
| 7 | PARTIAL | 88 | A:P B:P C:P D:P E:P | OK |
| 8 | PARTIAL | 88 | A:P B:P C:P D:P E:P | OK |
| 9 | PARTIAL | 88 | A:P B:P C:P D:P E:P | OK |
| 10 | PARTIAL | 89 | A:P B:P C:P D:P E:P | OK |
| 11 | FAIL | 0 | A:P B:P C:P D:P E:F | GATE_E_LANGUAGE_MISMATCH |
| 12 | FAIL | 0 | A:P B:P C:F D:P E:P | GATE_C_TRUNCATION_DETECTED |
| 13 | PARTIAL | 88 | A:P B:P C:P D:P E:P | OK |
| 14 | FAIL | 0 | A:P B:P C:F D:P E:P | GATE_C_TRUNCATION_DETECTED |
| 15 | FAIL | 0 | A:P B:P C:F D:P E:P | GATE_C_TRUNCATION_DETECTED |
| 16 | FAIL | 0 | A:P B:P C:F D:P E:P | GATE_C_TRUNCATION_DETECTED |
| 17 | PARTIAL | 93 | A:P B:P C:P D:P E:P | OK |
| 18 | FAIL | 0 | A:P B:P C:F D:P E:P | GATE_C_TRUNCATION_DETECTED |
| 19 | FAIL | 0 | A:P B:P C:F D:P E:P | GATE_C_TRUNCATION_DETECTED |
| 20 | FAIL | 0 | A:P B:P C:F D:P E:P | GATE_C_TRUNCATION_DETECTED |
| 21 | FAIL | 0 | A:P B:P C:F D:P E:P | GATE_C_TRUNCATION_DETECTED |
| 22 | PARTIAL | 86 | A:P B:P C:P D:P E:P | OK |
| 23 | FAIL | 0 | A:P B:P C:F D:P E:P | GATE_C_TRUNCATION_DETECTED |
| 24 | FAIL | 0 | A:P B:P C:P D:P E:F | GATE_E_LANGUAGE_MISMATCH |
| 25 | FAIL | 0 | A:P B:P C:F D:P E:P | GATE_C_TRUNCATION_DETECTED |
| 26 | FAIL | 0 | A:P B:P C:F D:P E:P | GATE_C_TRUNCATION_DETECTED |
| 27 | FAIL | 0 | A:P B:P C:F D:P E:P | GATE_C_TRUNCATION_DETECTED |
| 28 | PARTIAL | 86 | A:P B:P C:P D:P E:P | OK |
| 29 | PARTIAL | 94 | A:P B:P C:P D:P E:P | OK |
| 30 | PARTIAL | 93 | A:P B:P C:P D:P E:P | OK |
| 31 | PARTIAL | 93 | A:P B:P C:P D:P E:P | OK |
| 32 | PARTIAL | 93 | A:P B:P C:P D:P E:P | OK |
| 33 | PARTIAL | 93 | A:P B:P C:P D:P E:P | OK |
| 34 | FAIL | 0 | A:P B:P C:F D:P E:P | GATE_C_TRUNCATION_DETECTED |
| 35 | PARTIAL | 91 | A:P B:P C:P D:P E:P | OK |
| 36 | PARTIAL | 93 | A:P B:P C:P D:P E:P | OK |
| 37 | PARTIAL | 86 | A:P B:P C:P D:P E:P | OK |
| 38 | FAIL | 0 | A:P B:P C:F D:P E:P | GATE_C_TRUNCATION_DETECTED |
| 39 | FAIL | 0 | A:P B:P C:P D:P E:F | GATE_E_LANGUAGE_MISMATCH |
| 40 | FAIL | 0 | A:P B:P C:F D:P E:P | GATE_C_TRUNCATION_DETECTED |
| 41 | PARTIAL | 93 | A:P B:P C:P D:P E:P | OK |
| 42 | FAIL | 0 | A:P B:P C:F D:P E:P | GATE_C_TRUNCATION_DETECTED |
| 43 | FAIL | 0 | A:P B:P C:F D:P E:P | GATE_C_TRUNCATION_DETECTED |
| 44 | FAIL | 0 | A:P B:P C:F D:P E:P | GATE_C_TRUNCATION_DETECTED |
| 45 | PARTIAL | 93 | A:P B:P C:P D:P E:P | OK |
| 46 | FAIL | 0 | A:P B:P C:F D:P E:P | GATE_C_TRUNCATION_DETECTED |
| 47 | FAIL | 0 | A:P B:P C:F D:P E:P | GATE_C_TRUNCATION_DETECTED |
| 48 | FAIL | 0 | A:P B:P C:F D:P E:P | GATE_C_TRUNCATION_DETECTED |
| 49 | PARTIAL | 92 | A:P B:P C:P D:P E:P | OK |
| 50 | FAIL | 0 | A:P B:P C:F D:P E:P | GATE_C_TRUNCATION_DETECTED |
