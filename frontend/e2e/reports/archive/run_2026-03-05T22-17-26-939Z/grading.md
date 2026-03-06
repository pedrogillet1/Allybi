# Harsh Rubric Scorecard (25 queries)

- Generated: 2026-03-05T22:17:26.939Z
- Input: C:\Users\Pedro\desktop\webapp\frontend\e2e\reports\archive\2026-03-05T16-30-27-110Z\retrieval-signoff-fallback-input.json
- Run ID: run_2026-03-05T22-17-26-939Z
- Dataset ID: retrieval-signoff-fallback-input.json:50
- Verdict: **NO_GO**
- Final Score: **0/100**

- Scope Known: **no**
- Scope Source: none

## Hard Gates

| Gate | Fail Count | Skip Count |
|---|---:|---:|
| A (Doc-grounded + sources) | 0 | 0 |
| B (Wrong-doc) | 0 | 50 |
| C (Truncation) | 0 | 0 |
| D (Fallback with docs) | 0 | 0 |
| E (Language mismatch) | 50 | 0 |
| F (Source relevance) | 0 | 0 |
| G (Provenance richness) | 0 | 0 |
| H (Analytical format) | 0 | 0 |

Hard fail reasons:
- Gate E failed in 50 queries

## Category Averages

| Category | Avg | Max |
|---|---:|---:|
| Retrieval & Evidence | 0 | 40 |
| Correctness & Coverage | 0 | 25 |
| Reasoning | 0 | 15 |
| Writing | 0 | 10 |
| Conversation | 0 | 10 |

## Outcome Counts

- PASS: 0
- PARTIAL: 0
- FAIL: 50

## Model Usage

- Unique Known Models: 0
- Single Model Monopoly: no

| Provider::Model | Count |
|---|---:|
| unknown::unknown | 50 |

## Top Issues

- GATE_E_LANGUAGE_MISMATCH: 50

## Per Query

| # | Status | Score | Gates | Skips | Issues |
|---:|---|---:|---|---|---|
| 1 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 2 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 3 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 4 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 5 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 6 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 7 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 8 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 9 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 10 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 11 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 12 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 13 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 14 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 15 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 16 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 17 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 18 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 19 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 20 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 21 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 22 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 23 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 24 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 25 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 26 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 27 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 28 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 29 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 30 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 31 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 32 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 33 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 34 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 35 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 36 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 37 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 38 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 39 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 40 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 41 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 42 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 43 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 44 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 45 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 46 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 47 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 48 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 49 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |
| 50 | FAIL | 0 | A:P B:P C:P D:P E:F F:P G:P H:P | B:scope_unknown | GATE_E_LANGUAGE_MISMATCH |

