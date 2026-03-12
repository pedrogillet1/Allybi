# 99-Query Benchmark Grading Report v3.2

**Date**: 2026-03-11
**Run ID**: run-2026-03-11T18-52-00
**Answer Artifact Hash**: `3ea6c33501d8f32c...`
**Judge Version**: grade-99-query.mjs v3.2

## Final Benchmark Score

| Metric | Value |
|--------|-------|
| Mean Answer Score | **89.0/100** |
| Run Integrity | 100/100 |
| Consistency | 60/100 |
| Calibration | 100/100 |
| **Final Score** | **88.3/100** |
| **Grade** | **B+ (strong)** |
| Highest Release Gate | **Bronze** |
| Hard Fail Count | 0 (0.0%) |
| Avg Latency | 9329ms |
| Queries Graded | 89 |

**Formula**: `Final = 0.70 × MeanAnswerScore + 0.10 × RunIntegrity + 0.10 × Consistency + 0.10 × Calibration`

### Grade Distribution

| Grade | Count | % |
|-------|-------|---|
| A+ | 50 | 56% |
| A | 6 | 7% |
| B+ | 0 | 0% |
| B | 3 | 3% |
| C | 18 | 20% |
| D | 11 | 12% |
| F | 1 | 1% |

## Release Gate Evaluation

| Gate | Mean ≥ | HF Rate < | Integrity ≥ | Consistency ≥ | Calibration ≥ | Status |
|------|--------|-----------|-------------|---------------|---------------|--------|
| Bronze | 80 | 2% | 90 | — | — | **PASS** |
| Silver | 88 | 1% | 95 | 92 | — | **FAIL** |
| Gold | 92 | 0.5% | 98 | 95 | 95 | **FAIL** |
| Platinum | 95 | 0% | 100 | 98 | 98 | **FAIL** |

## Category Averages

| Category | Avg Score | Avg % | Typical Weight |
|----------|-----------|-------|----------------|
| A. Retrieval Correctness | 24.8 pts | 100% | varies by type |
| B. Factual Precision | 20.4 pts | 96% | varies by type |
| C. Numeric & Table Integrity | 18.6 pts | 99% | varies by type |
| D. Grounding & Evidence | 14.2 pts | 97% | varies by type |
| E. Reasoning Quality | 10.9 pts | 92% | varies by type |
| F. Composition Quality | 8.3 pts | 97% | varies by type |

## Table C — Run Integrity Checks

| Check | Status |
|-------|--------|
| Canonical artifact | PASS — single canonical run file |
| Manifest metadata | PASS — run_id + timestamps present |
| No duplicate files | PASS |
| Result count | PASS — 89/89 results |
| Answer hash | `3ea6c33501d8f32c...` |
| Caps effective | PASS — 31/31 caps lowered scores |
| No false A grades | PASS — no false A grades |
| Consistency | 60/100 — 2 contradiction group(s) found |
| Calibration score | 100/100 |
| **Run Integrity Total** | **100/100** |

## Contradiction Analysis

**2 contradiction group(s) detected.** Each affected query penalized per methodology.

### Group: `att_last_bill`
- **Queries**: Q24, Q25, Q28
- **Claim**: last bill amount
- **Penalty per query**: -10 pts

### Group: `breguet_dates_places`
- **Queries**: Q32, Q33, Q35
- **Claim**: dates and places in document
- **Penalty per query**: -15 pts

## Table B — Failure Taxonomy

| Issue | Count | Impact |
|-------|-------|--------|
| INCOMPLETE_LIST | 15 | cap→79 |
| BELOW_MIN_LENGTH | 9 | cap→74 |
| MISSING_KEY_FACTS | 6 | cap→69 (gold facts <50%) |
| NO_INLINE_CITATIONS | 6 | cap→69 (legal/regulatory/stats/billing) |
| SHORT_WITH_REQUIRED_FIELDS | 5 | cap→79 |
| MISSING_CATEGORIZATION | 5 | E2 -80% |
| HIGH_LATENCY | 4 | -4 pts |
| MISSING_TABLE | 3 | cap→74 |
| FALSE_CERTAINTY_ON_SCAN | 3 | B2 -30% |
| META_NON_ANSWER | 2 | cap→49 (describes doc instead of answering) |
| VERY_HIGH_LATENCY | 2 | -8 pts |
| INTERNAL_CONTRADICTION | 2 | score -10 to -15 |
| UNANCHORED_STATISTIC | 2 | D1 cap 50% |
| PARTIAL_ANSWER | 1 | cap→79 |
| TRUNCATED | 1 | F2 -40% |
| WALL_OF_TEXT | 1 | F1 -60% |
| VERY_SHORT | 1 | cap→69 |
| TABLE_EMPTY_CELLS | 1 | C2 -20% |
| WEAK_CITATIONS | 1 | cap→84 |

## Score Caps Applied (31 queries)

| Query | Type | Raw | Final | Caps |
|-------|------|-----|-------|------|
| Q3 | structured_rec | 96 | 74 | BELOW_MIN_LENGTH→74 |
| Q5 | comparison | 84 | 74 | MISSING_TABLE→74 |
| Q6 | direct_extract | 96 | 69 | MISSING_KEY_FACTS→69 |
| Q7 | direct_extract | 98 | 79 | INCOMPLETE_LIST→79 |
| Q13 | structured_rec | 93 | 69 | MISSING_KEY_FACTS→69 |
| Q14 | direct_extract | 98 | 79 | INCOMPLETE_LIST→79 |
| Q18 | direct_extract | 100 | 49 | BELOW_MIN_LENGTH→74, META_NON_ANSWER→49, SHORT_WITH_REQUIRED_FIELDS→79 |
| Q21 | direct_extract | 100 | 74 | BELOW_MIN_LENGTH→74, SHORT_WITH_REQUIRED_FIELDS→79 |
| Q24 | comparison | 85 | 39 | BELOW_MIN_LENGTH→74, META_NON_ANSWER→49, PARTIAL_ANSWER→79, SHORT_WITH_REQUIRED_FIELDS→79 |
| Q25 | structured_rec | 95 | 74 | BELOW_MIN_LENGTH→74, NO_INLINE_CITATIONS→89, INCOMPLETE_LIST→79 |
| Q26 | structured_rec | 97 | 69 | MISSING_KEY_FACTS→69 |
| Q29 | direct_extract | 99 | 79 | INCOMPLETE_LIST→79 |
| Q34 | direct_extract | 99 | 79 | INCOMPLETE_LIST→79 |
| Q36 | structured_rec | 88 | 69 | MISSING_KEY_FACTS→69, INCOMPLETE_LIST→79 |
| Q39 | interpretive_g | 98 | 79 | INCOMPLETE_LIST→79 |
| Q45 | direct_extract | 99 | 79 | INCOMPLETE_LIST→79 |
| Q50 | structured_rec | 100 | 74 | BELOW_MIN_LENGTH→74 |
| Q52 | structured_rec | 88 | 69 | BELOW_MIN_LENGTH→74, INCOMPLETE_LIST→79, VERY_SHORT→69 |
| Q59 | interpretive_g | 99 | 79 | INCOMPLETE_LIST→79 |
| Q60 | structured_rec | 82 | 74 | MISSING_TABLE→74 |
| Q64 | structured_rec | 86 | 74 | MISSING_TABLE→74 |
| Q73 | legal_procedur | 96 | 69 | BELOW_MIN_LENGTH→74, MISSING_KEY_FACTS→69 |
| Q81 | direct_extract | 96 | 79 | INCOMPLETE_LIST→79 |
| Q82 | direct_extract | 99 | 79 | INCOMPLETE_LIST→79 |
| Q83 | direct_extract | 100 | 74 | BELOW_MIN_LENGTH→74, SHORT_WITH_REQUIRED_FIELDS→79 |
| Q84 | direct_extract | 91 | 69 | NO_INLINE_CITATIONS→69, INCOMPLETE_LIST→79 |
| Q85 | structured_rec | 90 | 69 | MISSING_KEY_FACTS→69, NO_INLINE_CITATIONS→89, INCOMPLETE_LIST→79 |
| Q86 | direct_extract | 92 | 69 | NO_INLINE_CITATIONS→69, SHORT_WITH_REQUIRED_FIELDS→79 |
| Q87 | comparison | 97 | 84 | WEAK_CITATIONS→84 |
| Q88 | direct_extract | 92 | 69 | NO_INLINE_CITATIONS→69 |
| Q89 | structured_rec | 93 | 79 | NO_INLINE_CITATIONS→89, INCOMPLETE_LIST→79 |

## Table A — Per-Query Scores

### BESS Brazilian Market — avg 89.4/100, 8866ms avg latency

| # | Domain | Type | HF? | A% | B% | C% | D% | E% | F% | Raw | Final | Grade | Key Issues |
|---|--------|------|-----|----|----|----|----|----|----|-----|-------|-------|------------|
| Q1 | energy_fina | interpretiv | — | 100 | 96 | 100 | 100 | 100 | 100 | 99 | **99** | A+ | — |
| Q2 | energy_fina | interpretiv | — | 100 | 98 | 100 | 100 | 100 | 100 | 100 | **100** | A+ | — |
| Q3 | energy_fina | structured_ | — | 100 | 100 | 100 | 100 | 60 | 100 | 96 | **74** | C | BELOW_MIN_LENGTH |
| Q4 | energy_fina | direct_extr | — | 100 | 97 | 100 | 100 | 100 | 100 | 99 | **99** | A+ | — |
| Q5 | energy_fina | comparison | — | 100 | 100 | 60 | 100 | 60 | 100 | 84 | **74** | C | MISSING_TABLE |
| Q6 | energy_fina | direct_extr | — | 100 | 83 | 100 | 100 | 100 | 100 | 96 | **69** | D | MISSING_KEY_FACTS |
| Q7 | energy_fina | direct_extr | — | 100 | 97 | 100 | 100 | 100 | 85 | 98 | **79** | C | INCOMPLETE_LIST |
| Q8 | energy_fina | direct_extr | — | 100 | 100 | 100 | 100 | 100 | 100 | 100 | **100** | A+ | — |
| Q9 | energy_fina | structured_ | — | 100 | 97 | 100 | 100 | 100 | 100 | 100 | **100** | A+ | — |
| Q10 | energy_fina | structured_ | — | 100 | 97 | 100 | 100 | 100 | 100 | 100 | **100** | A+ | — |

### Mayfair Investor Deck — avg 87.1/100, 10728ms avg latency

| # | Domain | Type | HF? | A% | B% | C% | D% | E% | F% | Raw | Final | Grade | Key Issues |
|---|--------|------|-----|----|----|----|----|----|----|-----|-------|-------|------------|
| Q11 | startup_fin | interpretiv | — | 100 | 100 | 100 | 100 | 100 | 100 | 100 | **100** | A+ | — |
| Q12 | startup_fin | direct_extr | — | 100 | 98 | 100 | 100 | 100 | 100 | 99 | **99** | A+ | — |
| Q13 | startup_fin | structured_ | — | 100 | 80 | 100 | 100 | 60 | 100 | 93 | **69** | D | MISSING_KEY_FACTS |
| Q14 | startup_fin | direct_extr | — | 100 | 97 | 100 | 100 | 100 | 85 | 98 | **79** | C | INCOMPLETE_LIST |
| Q15 | startup_fin | direct_extr | — | 100 | 100 | 100 | 100 | 100 | 100 | 100 | **100** | A+ | — |
| Q16 | startup_fin | comparison | — | 100 | 100 | 100 | 100 | 60 | 100 | 92 | **92** | A | — |
| Q17 | startup_fin | direct_extr | — | 100 | 95 | 100 | 100 | 100 | 100 | 99 | **99** | A+ | — |
| Q18 | startup_fin | direct_extr | — | 100 | 100 | 100 | 100 | 100 | 100 | 100 | **49** | D | BELOW_MIN_LENGTH, META_NON_ANSWER, SHORT_WITH_REQUIRED_FIELDS |
| Q19 | startup_fin | comparison | — | 100 | 100 | 100 | 100 | 60 | 100 | 92 | **92** | A | MISSING_CATEGORIZATION |
| Q20 | startup_fin | interpretiv | — | 100 | 100 | 100 | 100 | 100 | 100 | 92 | **92** | A | VERY_HIGH_LATENCY |

### ATT Bill Dec2023 — avg 82.0/100, 7953ms avg latency

| # | Domain | Type | HF? | A% | B% | C% | D% | E% | F% | Raw | Final | Grade | Key Issues |
|---|--------|------|-----|----|----|----|----|----|----|-----|-------|-------|------------|
| Q21 | consumer_bi | direct_extr | — | 100 | 100 | 100 | 100 | 100 | 100 | 100 | **74** | C | BELOW_MIN_LENGTH, SHORT_WITH_REQUIRED_FIELDS |
| Q22 | consumer_bi | structured_ | — | 100 | 95 | 100 | 100 | 60 | 100 | 95 | **95** | A+ | — |
| Q23 | consumer_bi | direct_extr | — | 100 | 100 | 100 | 100 | 100 | 100 | 100 | **100** | A+ | — |
| Q24 | consumer_bi | comparison | — | 100 | 97 | 100 | 100 | 30 | 100 | 85 | **39** | F | BELOW_MIN_LENGTH, META_NON_ANSWER, PARTIAL_ANSWER |
| Q25 | consumer_bi | structured_ | — | 100 | 100 | 100 | 80 | 100 | 85 | 95 | **74** | C | BELOW_MIN_LENGTH, NO_INLINE_CITATIONS, INCOMPLETE_LIST |
| Q26 | consumer_bi | structured_ | — | 100 | 80 | 100 | 100 | 100 | 100 | 97 | **69** | D | MISSING_KEY_FACTS |
| Q27 | consumer_bi | comparison | — | 100 | 100 | 100 | 100 | 60 | 100 | 92 | **92** | A | MISSING_CATEGORIZATION |
| Q28 | consumer_bi | interpretiv | — | 100 | 96 | 100 | 100 | 100 | 100 | 99 | **99** | A+ | — |
| Q29 | consumer_bi | direct_extr | — | 100 | 100 | 100 | 100 | 100 | 85 | 99 | **79** | C | INCOMPLETE_LIST |
| Q30 | consumer_bi | interpretiv | — | 100 | 97 | 100 | 100 | 100 | 100 | 99 | **99** | A+ | — |

### Breguet — avg 88.2/100, 11370ms avg latency

| # | Domain | Type | HF? | A% | B% | C% | D% | E% | F% | Raw | Final | Grade | Key Issues |
|---|--------|------|-----|----|----|----|----|----|----|-----|-------|-------|------------|
| Q31 | scanned_doc | interpretiv | — | 100 | 96 | 100 | 100 | 100 | 100 | 99 | **99** | A+ | — |
| Q32 | scanned_doc | structured_ | — | 100 | 67 | 100 | 100 | 100 | 100 | 95 | **80** | B | FALSE_CERTAINTY_ON_SCAN, INTERNAL_CONTRADICTION |
| Q33 | scanned_doc | interpretiv | — | 100 | 70 | 100 | 100 | 100 | 100 | 94 | **94** | A | FALSE_CERTAINTY_ON_SCAN |
| Q34 | scanned_doc | direct_extr | — | 100 | 98 | 100 | 100 | 100 | 85 | 99 | **79** | C | INCOMPLETE_LIST |
| Q35 | scanned_doc | structured_ | — | 100 | 100 | 100 | 100 | 100 | 100 | 100 | **100** | A+ | — |
| Q36 | scanned_doc | structured_ | — | 100 | 82 | 100 | 100 | 100 | 65 | 88 | **69** | D | MISSING_KEY_FACTS, TRUNCATED, INCOMPLETE_LIST |
| Q37 | scanned_doc | interpretiv | — | 100 | 100 | 100 | 100 | 100 | 100 | 100 | **100** | A+ | — |
| Q38 | scanned_doc | interpretiv | — | 100 | 97 | 100 | 100 | 100 | 100 | 99 | **99** | A+ | — |
| Q39 | scanned_doc | interpretiv | — | 100 | 95 | 100 | 100 | 100 | 85 | 98 | **79** | C | INCOMPLETE_LIST |
| Q40 | scanned_doc | structured_ | — | 100 | 65 | 100 | 100 | 60 | 100 | 83 | **83** | B | FALSE_CERTAINTY_ON_SCAN, MISSING_CATEGORIZATION, VERY_HIGH_LATENCY |

### IBGE Open Data Plan — avg 94.6/100, 6834ms avg latency

| # | Domain | Type | HF? | A% | B% | C% | D% | E% | F% | Raw | Final | Grade | Key Issues |
|---|--------|------|-----|----|----|----|----|----|----|-----|-------|-------|------------|
| Q41 | public_poli | direct_extr | — | 100 | 100 | 100 | 100 | 100 | 70 | 99 | **99** | A+ | WALL_OF_TEXT |
| Q42 | public_poli | direct_extr | — | 100 | 97 | 100 | 100 | 100 | 100 | 99 | **99** | A+ | — |
| Q43 | public_poli | direct_extr | — | 100 | 100 | 100 | 100 | 60 | 100 | 98 | **98** | A+ | MISSING_CATEGORIZATION |
| Q44 | public_poli | direct_extr | — | 100 | 97 | 100 | 100 | 100 | 100 | 99 | **99** | A+ | — |
| Q45 | public_poli | direct_extr | — | 100 | 100 | 100 | 100 | 100 | 85 | 99 | **79** | C | INCOMPLETE_LIST |
| Q46 | public_poli | direct_extr | — | 100 | 98 | 100 | 100 | 100 | 100 | 99 | **99** | A+ | — |
| Q47 | public_poli | direct_extr | — | 100 | 100 | 100 | 100 | 100 | 100 | 100 | **100** | A+ | — |
| Q48 | public_poli | direct_extr | — | 100 | 100 | 100 | 100 | 100 | 100 | 100 | **100** | A+ | — |
| Q49 | public_poli | direct_extr | — | 100 | 98 | 100 | 100 | 100 | 100 | 99 | **99** | A+ | — |
| Q50 | public_poli | structured_ | — | 100 | 100 | 100 | 100 | 100 | 100 | 100 | **74** | C | BELOW_MIN_LENGTH |

### ARM Montana Arizona — avg 90.6/100, 11527ms avg latency

| # | Domain | Type | HF? | A% | B% | C% | D% | E% | F% | Raw | Final | Grade | Key Issues |
|---|--------|------|-----|----|----|----|----|----|----|-----|-------|-------|------------|
| Q51 | real_estate | direct_extr | — | 100 | 100 | 100 | 100 | 100 | 100 | 100 | **100** | A+ | — |
| Q52 | real_estate | structured_ | — | 76 | 95 | 100 | 100 | 60 | 85 | 88 | **69** | D | BELOW_MIN_LENGTH, INCOMPLETE_LIST, VERY_SHORT |
| Q53 | real_estate | structured_ | — | 100 | 98 | 100 | 100 | 60 | 100 | 92 | **92** | A | HIGH_LATENCY |
| Q54 | real_estate | comparison | — | 100 | 100 | 100 | 100 | 100 | 100 | 96 | **96** | A+ | HIGH_LATENCY |
| Q55 | real_estate | comparison | — | 100 | 98 | 100 | 100 | 100 | 100 | 100 | **100** | A+ | — |
| Q56 | real_estate | interpretiv | — | 100 | 100 | 100 | 100 | 100 | 100 | 100 | **100** | A+ | — |
| Q57 | real_estate | structured_ | — | 100 | 100 | 100 | 100 | 60 | 100 | 96 | **96** | A+ | — |
| Q58 | real_estate | interpretiv | — | 100 | 100 | 100 | 100 | 100 | 100 | 100 | **100** | A+ | — |
| Q59 | real_estate | interpretiv | — | 100 | 100 | 100 | 100 | 100 | 85 | 99 | **79** | C | INCOMPLETE_LIST |
| Q60 | real_estate | structured_ | — | 100 | 100 | 60 | 100 | 60 | 100 | 82 | **74** | C | MISSING_TABLE, HIGH_LATENCY |

### Guarda Bens Self Storage — avg 96.6/100, 6826ms avg latency

| # | Domain | Type | HF? | A% | B% | C% | D% | E% | F% | Raw | Final | Grade | Key Issues |
|---|--------|------|-----|----|----|----|----|----|----|-----|-------|-------|------------|
| Q61 | business_op | direct_extr | — | 100 | 95 | 100 | 100 | 100 | 100 | 99 | **99** | A+ | — |
| Q62 | business_op | structured_ | — | 100 | 100 | 100 | 100 | 100 | 100 | 100 | **100** | A+ | — |
| Q63 | business_op | direct_extr | — | 100 | 100 | 100 | 100 | 60 | 100 | 98 | **98** | A+ | MISSING_CATEGORIZATION |
| Q64 | business_op | structured_ | — | 100 | 100 | 60 | 100 | 60 | 100 | 86 | **74** | C | MISSING_TABLE |
| Q65 | business_op | direct_extr | — | 100 | 97 | 100 | 100 | 100 | 100 | 99 | **99** | A+ | — |
| Q66 | business_op | direct_extr | — | 100 | 97 | 100 | 100 | 100 | 100 | 99 | **99** | A+ | — |
| Q67 | business_op | direct_extr | — | 100 | 100 | 100 | 100 | 100 | 100 | 100 | **100** | A+ | — |
| Q68 | business_op | direct_extr | — | 100 | 97 | 100 | 100 | 100 | 100 | 99 | **99** | A+ | — |
| Q69 | business_op | direct_extr | — | 100 | 97 | 100 | 100 | 100 | 100 | 99 | **99** | A+ | — |
| Q70 | business_op | interpretiv | — | 100 | 97 | 100 | 100 | 100 | 100 | 99 | **99** | A+ | — |

### Reserve Requirements — avg 96.6/100, 8874ms avg latency

| # | Domain | Type | HF? | A% | B% | C% | D% | E% | F% | Raw | Final | Grade | Key Issues |
|---|--------|------|-----|----|----|----|----|----|----|-----|-------|-------|------------|
| Q71 | central_ban | direct_extr | — | 100 | 98 | 100 | 100 | 100 | 100 | 99 | **99** | A+ | — |
| Q72 | central_ban | direct_extr | — | 100 | 100 | 100 | 100 | 100 | 100 | 100 | **100** | A+ | — |
| Q73 | central_ban | legal_proce | — | 100 | 84 | 100 | 100 | 100 | 100 | 96 | **69** | D | BELOW_MIN_LENGTH, MISSING_KEY_FACTS |
| Q74 | central_ban | legal_proce | — | 100 | 98 | 100 | 100 | 100 | 100 | 99 | **99** | A+ | — |
| Q75 | central_ban | structured_ | — | 100 | 100 | 100 | 100 | 100 | 100 | 100 | **100** | A+ | — |
| Q76 | central_ban | comparison | — | 100 | 98 | 100 | 100 | 100 | 100 | 100 | **100** | A+ | — |
| Q77 | central_ban | direct_extr | — | 100 | 100 | 100 | 100 | 100 | 100 | 100 | **100** | A+ | — |
| Q78 | central_ban | legal_proce | — | 100 | 100 | 100 | 100 | 100 | 100 | 100 | **100** | A+ | — |
| Q79 | central_ban | structured_ | — | 100 | 97 | 100 | 100 | 100 | 100 | 100 | **100** | A+ | — |
| Q80 | central_ban | interpretiv | — | 100 | 97 | 100 | 100 | 100 | 100 | 99 | **99** | A+ | — |

### Tabela 1.1 — avg 74.6/100, 11165ms avg latency

| # | Domain | Type | HF? | A% | B% | C% | D% | E% | F% | Raw | Final | Grade | Key Issues |
|---|--------|------|-----|----|----|----|----|----|----|-----|-------|-------|------------|
| Q81 | statistical | direct_extr | — | 100 | 96 | 90 | 100 | 100 | 85 | 96 | **79** | C | TABLE_EMPTY_CELLS, INCOMPLETE_LIST |
| Q82 | statistical | direct_extr | — | 100 | 98 | 100 | 100 | 100 | 85 | 99 | **79** | C | INCOMPLETE_LIST |
| Q83 | statistical | direct_extr | — | 100 | 100 | 100 | 100 | 100 | 100 | 100 | **74** | C | BELOW_MIN_LENGTH, SHORT_WITH_REQUIRED_FIELDS |
| Q84 | statistical | direct_extr | — | 100 | 95 | 100 | 53 | 100 | 85 | 91 | **69** | D | NO_INLINE_CITATIONS, INCOMPLETE_LIST |
| Q85 | statistical | structured_ | — | 100 | 83 | 100 | 67 | 100 | 85 | 90 | **69** | D | MISSING_KEY_FACTS, NO_INLINE_CITATIONS, UNANCHORED_STATISTIC |
| Q86 | statistical | direct_extr | — | 100 | 98 | 100 | 53 | 100 | 100 | 92 | **69** | D | NO_INLINE_CITATIONS, SHORT_WITH_REQUIRED_FIELDS |
| Q87 | statistical | comparison | — | 100 | 100 | 100 | 73 | 100 | 100 | 97 | **84** | B | WEAK_CITATIONS |
| Q88 | statistical | direct_extr | — | 100 | 95 | 100 | 53 | 100 | 100 | 92 | **69** | D | NO_INLINE_CITATIONS |
| Q89 | statistical | structured_ | — | 100 | 100 | 100 | 67 | 100 | 85 | 93 | **79** | C | NO_INLINE_CITATIONS, UNANCHORED_STATISTIC, INCOMPLETE_LIST |

## Table B2 — Non-A Queries Detail (33)

| Query | Grade | Score | Domain | Issues | Caps | Preview |
|-------|-------|-------|--------|--------|------|---------|
| Q3 | C | 74 | energy_finance | BELOW_MIN_LENGTH | BELOW_MIN_LENGTH→74 | The document provides the following explicit market figures for the global energ… |
| Q5 | C | 74 | energy_finance | MISSING_TABLE | MISSING_TABLE→74 | The document discusses different battery energy storage system (BESS) technologi… |
| Q6 | D | 69 | energy_finance | MISSING_KEY_FACTS | MISSING_KEY_FACTS→69 | The document indicates that storage buyers are primarily purchasing operational … |
| Q7 | C | 79 | energy_finance | INCOMPLETE_LIST | INCOMPLETE_LIST→79 | The document identifies specific applications with identifiable off-takers and e… |
| Q13 | D | 69 | startup_finance | MISSING_KEY_FACTS | MISSING_KEY_FACTS→69 | Mayfair Group's investor deck highlights several explicit financial and operatin… |
| Q14 | C | 79 | startup_finance | INCOMPLETE_LIST | INCOMPLETE_LIST→79 | Mayfair Group's presentation mentions the following founders and notable investo… |
| Q18 | D | 49 | startup_finance | BELOW_MIN_LENGTH, META_NON_ANSWER, SHORT_WITH_REQUIRED_FIELDS | BELOW_MIN_LENGTH→74, META_NON_ANSWER→49, SHORT_WITH_REQUIRED_FIELDS→79 | The provided investor deck the planned use of funds split. Therefore, it is not … |
| Q21 | C | 74 | consumer_billing | BELOW_MIN_LENGTH, SHORT_WITH_REQUIRED_FIELDS | BELOW_MIN_LENGTH→74, SHORT_WITH_REQUIRED_FIELDS→79 | Here is a summary of your AT&T bill: * **Issue Date:** Dec 20, 2023 (p. 1) - Bil… |
| Q24 | F | 39 | consumer_billing | BELOW_MIN_LENGTH, META_NON_ANSWER, PARTIAL_ANSWER, SHORT_WITH_REQUIRED_FIELDS, INTERNAL_CONTRADICTION | BELOW_MIN_LENGTH→74, META_NON_ANSWER→49, PARTIAL_ANSWER→79, SHORT_WITH_REQUIRED_FIELDS→79 | The current total amount due is $98.49 (p. 1). The amount of the last bill is no… |
| Q25 | C | 74 | consumer_billing | BELOW_MIN_LENGTH, NO_INLINE_CITATIONS, INCOMPLETE_LIST | BELOW_MIN_LENGTH→74, NO_INLINE_CITATIONS→89, INCOMPLETE_LIST→79 | \| Item \| Amount \| Category \| \| --- \| --- \| --- \| \| Total due \| $98.49 \| Total / … |
| Q26 | D | 69 | consumer_billing | MISSING_KEY_FACTS | MISSING_KEY_FACTS→69 | Here are the account identifiers, phone numbers, dates, and dollar amounts visib… |
| Q29 | C | 79 | consumer_billing | INCOMPLETE_LIST | INCOMPLETE_LIST→79 | Before the scheduled AutoPay date of January 09, 2024 (p. 1), the customer shoul… |
| Q32 | B | 80 | scanned_document | FALSE_CERTAINTY_ON_SCAN, INTERNAL_CONTRADICTION | — | From the file, the following can be extracted: **Dates:** - 3/7/24 (p. 1) Proper… |
| Q34 | C | 79 | scanned_document | INCOMPLETE_LIST | INCOMPLETE_LIST→79 | The document appears to be structured with several distinct sections and fields:… |
| Q36 | D | 69 | scanned_document | MISSING_KEY_FACTS, TRUNCATED, INCOMPLETE_LIST, HIGH_LATENCY | MISSING_KEY_FACTS→69, INCOMPLETE_LIST→79 | \| Fact type \| Visible text (verbatim or near-verbatim) \| What it indicates (high… |
| Q39 | C | 79 | scanned_document | INCOMPLETE_LIST | INCOMPLETE_LIST→79 | Possible red flags for audit or verification include: * **Missing Final Totals:*… |
| Q40 | B | 83 | scanned_document | FALSE_CERTAINTY_ON_SCAN, MISSING_CATEGORIZATION, VERY_HIGH_LATENCY | — | Here is a recap of the document's content: **Supported** - Document Details: * D… |
| Q45 | C | 79 | public_policy | INCOMPLETE_LIST | INCOMPLETE_LIST→79 | The IBGE Open Data Plan for 2024-2025 references the following for publishing da… |
| Q50 | C | 74 | public_policy | BELOW_MIN_LENGTH | BELOW_MIN_LENGTH→74 | The action plan schedule, detailed in Annex 4 of the IBGE Open Data Plan 2024-20… |
| Q52 | D | 69 | real_estate_finance | BELOW_MIN_LENGTH, INCOMPLETE_LIST, VERY_SHORT | BELOW_MIN_LENGTH→74, INCOMPLETE_LIST→79, VERY_SHORT→69 | The uses of capital for each project and the total portfolio are as follows (p.… |
| Q59 | C | 79 | real_estate_finance | INCOMPLETE_LIST | INCOMPLETE_LIST→79 | Investment Committee Note: ARM Montana & Arizona Properties **Strengths:** - Lux… |
| Q60 | C | 74 | real_estate_finance | MISSING_TABLE, HIGH_LATENCY | MISSING_TABLE→74 | **Asset**: Lone Mountain Ranch (Mountain Guest Ranch); **Location**: Big Sky, Mo… |
| Q64 | C | 74 | business_operations | MISSING_TABLE | MISSING_TABLE→74 | The SIPOC model from the presentation includes the following components (guarda … |
| Q73 | D | 69 | central_bank_regulatory | BELOW_MIN_LENGTH, MISSING_KEY_FACTS | BELOW_MIN_LENGTH→74, MISSING_KEY_FACTS→69 | The how the reserve base is calculated for demand deposits. It lists the regulat… |
| Q81 | C | 79 | statistical_data | TABLE_EMPTY_CELLS, INCOMPLETE_LIST | INCOMPLETE_LIST→79 | What **Tabela 1.1** measures (what the numbers are) Tabela 1.1 reports “Nascidos… |
| Q82 | C | 79 | statistical_data | INCOMPLETE_LIST | INCOMPLETE_LIST→79 | Year columns in **Tabela 1.1** (by “Year of birth”) \| Column label (Portuguese) … |
| Q83 | C | 74 | statistical_data | BELOW_MIN_LENGTH, SHORT_WITH_REQUIRED_FIELDS | BELOW_MIN_LENGTH→74, SHORT_WITH_REQUIRED_FIELDS→79 | The total registered live births for "Total" are 2,442,726 (Row 4). The the tota… |
| Q84 | D | 69 | statistical_data | NO_INLINE_CITATIONS, INCOMPLETE_LIST | NO_INLINE_CITATIONS→69, INCOMPLETE_LIST→79 | \| Visible geography label (as shown) \| Geography type \| Parent in the visible sn… |
| Q85 | D | 69 | statistical_data | MISSING_KEY_FACTS, NO_INLINE_CITATIONS, UNANCHORED_STATISTIC, INCOMPLETE_LIST | MISSING_KEY_FACTS→69, NO_INLINE_CITATIONS→89, INCOMPLETE_LIST→79 | \| Visible row (Lugar de residência da mãe) \| 2024 value \| Row in sheet \| \| --- \|… |
| Q86 | D | 69 | statistical_data | NO_INLINE_CITATIONS, SHORT_WITH_REQUIRED_FIELDS | NO_INLINE_CITATIONS→69, SHORT_WITH_REQUIRED_FIELDS→79 | **RM de São Paulo (SP)\*\* has the highest total number of registered live birth… |
| Q87 | B | 84 | statistical_data | WEAK_CITATIONS | WEAK_CITATIONS→84 | The "Total" row (Row 4) shows **2,442,726** registered live births. This figure … |
| Q88 | D | 69 | statistical_data | NO_INLINE_CITATIONS | NO_INLINE_CITATIONS→69 | \| Sheet row \| Visible geography label (as shown) \| What’s present (dash / blank … |
| Q89 | C | 79 | statistical_data | NO_INLINE_CITATIONS, UNANCHORED_STATISTIC, INCOMPLETE_LIST | NO_INLINE_CITATIONS→89, INCOMPLETE_LIST→79 | \| Geography (visible row label) \| Total records \| Before 2016 \| 2024 \| \| --- \| -… |

## Methodology Notes v3.0

- **Automated checks**: source presence, table quality, citation presence/count, length, language, latency, structure, gold facts
- **Gold facts**: primary automated quality signal — if hit rate <50%, cap at 69; if <80%, B1 deduction
- **Query-type weights**: different weight distributions per type (direct_extraction, comparison, legal_procedural, structured_reconstruction, interpretive_grounded)
- **Calibrated caps** (v3.1): SHORT→89, PARTIAL→79, MISSING_TABLE→74, MISSING_STRUCTURE→79, WEAK_CITATIONS→84, NO_INLINE_CITATIONS→69, ABSTENTION→49
- **Hard fails (score=0)**: HF-1 wrong document, HF-2 hallucinated fact/abstention with gold facts, HF-3 numeric corruption (chunk ref leak), HF-5 broken output, HF-6 processing error
- **Cross-answer consistency**: contradiction groups checked post-scoring with -10 to -15 pt retroactive penalty
- **No spec cap**: queries without a spec entry are capped at 84 (cannot achieve A)
- **Grade bands**: A+ ≥95, A ≥90, B+ ≥85, B ≥80, C ≥70, D ≥40, F <40
- **Formula**: Final = 0.70 × MeanAnswerScore + 0.10 × RunIntegrity + 0.10 × Consistency + 0.10 × Calibration
