# Harsh Rubric Scorecard (100 queries)

- Generated: 2026-02-28T03:00:11.485Z
- Input: /Users/pg/Desktop/koda-webapp/frontend/e2e/reports/test1-bilingual-100-results.continue2.json
- Run ID: run_2026-02-28T03-00-11-485Z
- Verdict: **NO_GO**
- Final Score: **0/100**

## Hard Gates

| Gate | Fail Count |
|---|---:|
| A (Doc-grounded + sources) | 2 |
| B (Wrong-doc) | 0 |
| C (Truncation) | 0 |
| D (Fallback with docs) | 2 |
| E (Language mismatch) | 26 |

Hard fail reasons:
- Gate A failed in 2 queries
- Gate D failed in 2 queries
- Gate E failed in 26 queries

## Category Averages

| Category | Avg | Max |
|---|---:|---:|
| Retrieval & Evidence | 28.8 | 40 |
| Correctness & Coverage | 16.12 | 25 |
| Reasoning | 9.42 | 15 |
| Writing | 6.74 | 10 |
| Conversation | 6.2 | 10 |

## Outcome Counts

- PASS: 42
- PARTIAL: 30
- FAIL: 28

## Top Issues

- GATE_E_LANGUAGE_MISMATCH: 26
- GATE_A_DOC_GROUNDED_WITHOUT_SOURCES: 2
- GATE_D_FALLBACK_WITHOUT_SOURCES: 2

## Per Query

| # | Status | Score | Gates | Issues |
|---:|---|---:|---|---|
| 1 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 2 | PARTIAL | 94 | A:P B:P C:P D:P E:P | OK |
| 3 | PARTIAL | 85 | A:P B:P C:P D:P E:P | OK |
| 4 | PASS | 98 | A:P B:P C:P D:P E:P | OK |
| 5 | PASS | 98 | A:P B:P C:P D:P E:P | OK |
| 6 | FAIL | 0 | A:P B:P C:P D:P E:F | GATE_E_LANGUAGE_MISMATCH |
| 7 | PARTIAL | 86 | A:P B:P C:P D:P E:P | OK |
| 8 | PARTIAL | 89 | A:P B:P C:P D:P E:P | OK |
| 9 | FAIL | 0 | A:P B:P C:P D:P E:F | GATE_E_LANGUAGE_MISMATCH |
| 10 | FAIL | 0 | A:P B:P C:P D:P E:F | GATE_E_LANGUAGE_MISMATCH |
| 11 | PARTIAL | 86 | A:P B:P C:P D:P E:P | OK |
| 12 | PARTIAL | 88 | A:P B:P C:P D:P E:P | OK |
| 13 | FAIL | 0 | A:P B:P C:P D:P E:F | GATE_E_LANGUAGE_MISMATCH |
| 14 | PARTIAL | 84 | A:P B:P C:P D:P E:P | OK |
| 15 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 16 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 17 | FAIL | 0 | A:P B:P C:P D:P E:F | GATE_E_LANGUAGE_MISMATCH |
| 18 | FAIL | 0 | A:P B:P C:P D:P E:F | GATE_E_LANGUAGE_MISMATCH |
| 19 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 20 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 21 | FAIL | 0 | A:P B:P C:P D:P E:F | GATE_E_LANGUAGE_MISMATCH |
| 22 | FAIL | 0 | A:P B:P C:P D:P E:F | GATE_E_LANGUAGE_MISMATCH |
| 23 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 24 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 25 | FAIL | 0 | A:P B:P C:P D:P E:F | GATE_E_LANGUAGE_MISMATCH |
| 26 | FAIL | 0 | A:P B:P C:P D:P E:F | GATE_E_LANGUAGE_MISMATCH |
| 27 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 28 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 29 | FAIL | 0 | A:P B:P C:P D:P E:F | GATE_E_LANGUAGE_MISMATCH |
| 30 | FAIL | 0 | A:P B:P C:P D:P E:F | GATE_E_LANGUAGE_MISMATCH |
| 31 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 32 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 33 | PARTIAL | 81 | A:P B:P C:P D:P E:P | OK |
| 34 | PARTIAL | 84 | A:P B:P C:P D:P E:P | OK |
| 35 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 36 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 37 | PASS | 95 | A:P B:P C:P D:P E:P | OK |
| 38 | FAIL | 0 | A:P B:P C:P D:P E:F | GATE_E_LANGUAGE_MISMATCH |
| 39 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 40 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 41 | FAIL | 0 | A:P B:P C:P D:P E:F | GATE_E_LANGUAGE_MISMATCH |
| 42 | PARTIAL | 84 | A:P B:P C:P D:P E:P | OK |
| 43 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 44 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 45 | PARTIAL | 81 | A:P B:P C:P D:P E:P | OK |
| 46 | PARTIAL | 84 | A:P B:P C:P D:P E:P | OK |
| 47 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 48 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 49 | PARTIAL | 86 | A:P B:P C:P D:P E:P | OK |
| 50 | FAIL | 0 | A:P B:P C:P D:P E:F | GATE_E_LANGUAGE_MISMATCH |
| 51 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 52 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 53 | PARTIAL | 86 | A:P B:P C:P D:P E:P | OK |
| 54 | PARTIAL | 84 | A:P B:P C:P D:P E:P | OK |
| 55 | FAIL | 0 | A:F B:P C:P D:F E:P | GATE_A_DOC_GROUNDED_WITHOUT_SOURCES; GATE_D_FALLBACK_WITHOUT_SOURCES |
| 56 | FAIL | 0 | A:F B:P C:P D:F E:P | GATE_A_DOC_GROUNDED_WITHOUT_SOURCES; GATE_D_FALLBACK_WITHOUT_SOURCES |
| 57 | PARTIAL | 81 | A:P B:P C:P D:P E:P | OK |
| 58 | PARTIAL | 84 | A:P B:P C:P D:P E:P | OK |
| 59 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 60 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 61 | FAIL | 0 | A:P B:P C:P D:P E:F | GATE_E_LANGUAGE_MISMATCH |
| 62 | FAIL | 0 | A:P B:P C:P D:P E:F | GATE_E_LANGUAGE_MISMATCH |
| 63 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 64 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 65 | FAIL | 0 | A:P B:P C:P D:P E:F | GATE_E_LANGUAGE_MISMATCH |
| 66 | FAIL | 0 | A:P B:P C:P D:P E:F | GATE_E_LANGUAGE_MISMATCH |
| 67 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 68 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 69 | FAIL | 0 | A:P B:P C:P D:P E:F | GATE_E_LANGUAGE_MISMATCH |
| 70 | FAIL | 0 | A:P B:P C:P D:P E:F | GATE_E_LANGUAGE_MISMATCH |
| 71 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 72 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 73 | PARTIAL | 86 | A:P B:P C:P D:P E:P | OK |
| 74 | PARTIAL | 85 | A:P B:P C:P D:P E:P | OK |
| 75 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 76 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 77 | FAIL | 0 | A:P B:P C:P D:P E:F | GATE_E_LANGUAGE_MISMATCH |
| 78 | FAIL | 0 | A:P B:P C:P D:P E:F | GATE_E_LANGUAGE_MISMATCH |
| 79 | PARTIAL | 86 | A:P B:P C:P D:P E:P | OK |
| 80 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 81 | PARTIAL | 86 | A:P B:P C:P D:P E:P | OK |
| 82 | FAIL | 0 | A:P B:P C:P D:P E:F | GATE_E_LANGUAGE_MISMATCH |
| 83 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 84 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 85 | PARTIAL | 81 | A:P B:P C:P D:P E:P | OK |
| 86 | FAIL | 0 | A:P B:P C:P D:P E:F | GATE_E_LANGUAGE_MISMATCH |
| 87 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 88 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 89 | PARTIAL | 86 | A:P B:P C:P D:P E:P | OK |
| 90 | PARTIAL | 84 | A:P B:P C:P D:P E:P | OK |
| 91 | PARTIAL | 87 | A:P B:P C:P D:P E:P | OK |
| 92 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 93 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 94 | PARTIAL | 87 | A:P B:P C:P D:P E:P | OK |
| 95 | PASS | 99 | A:P B:P C:P D:P E:P | OK |
| 96 | PARTIAL | 84 | A:P B:P C:P D:P E:P | OK |
| 97 | PARTIAL | 84 | A:P B:P C:P D:P E:P | OK |
| 98 | FAIL | 0 | A:P B:P C:P D:P E:F | GATE_E_LANGUAGE_MISMATCH |
| 99 | PARTIAL | 84 | A:P B:P C:P D:P E:P | OK |
| 100 | PARTIAL | 84 | A:P B:P C:P D:P E:P | OK |
