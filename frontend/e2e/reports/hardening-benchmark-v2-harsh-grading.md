# Benchmark V2 Harsh Grading Report

**Run ID**: e0bb16bb-f51c-4acc-ab63-98ed82b1f2b6
**Date**: 2026-03-12T16:56:15.143Z
**Backend Commit**: a271aebbf
**Runner Version**: 2.0.0
**Grading Date**: 2026-03-12
**Grader**: Production Benchmark Judge (harsh rubric v13)

---

## 1. EXECUTIVE SUMMARY

| Metric | Value |
|--------|-------|
| **Final Production Score** | **49.8 / 100** |
| **Tier** | **FAIL** |
| **Run Valid?** | **CONDITIONAL** (1 doc group missing) |
| **Mean Query Score** | 50.1 / 100 |
| **Hard-Fail Rate** | 6.25% (5/80) |
| **Hard-Fail Queries** | Q1, Q30, Q44, Q46, Q78 |
| **Run Integrity** | 78 / 100 |
| **Cross-Answer Consistency** | 82 / 100 |
| **Grading Calibration** | 75 / 100 |
| **Latency Quality** | 68 / 100 |
| **Avg Latency** | 11,909 ms |
| **Median Latency** | 10,618 ms |
| **P90 Latency** | 18,375 ms |
| **P95 Latency** | 21,493 ms |

### Top 10 Blockers

1. **Cadastro PDF is TOC-only** — 10 queries return TITLE_ONLY_EXTRACTION (Q1-Q10). Document has zero data values.
2. **Non-Profit XLS not re-ingested** — 10 queries return WRONG_TABLE_CONTEXT / HONEST_BUT_EMPTY (Q51-Q60). Cell fact fix deployed but Tab02.xls needs re-ingestion.
3. **FDCA TOC domination persists** — 6/10 FDCA queries return table-of-contents titles, not actual statutory text (Q62, Q63, Q65, Q68, Q69, Q70).
4. **CARES Act shallow retrieval** — 6/10 CARES queries return section titles without substance (Q72, Q74, Q75, Q76, Q79, Q80).
5. **Language contract failures** — Q1, Q46 produce "could not safely finalize" messages = hard fail.
6. **Broken sentence fragments** — Q30, Q44, Q78 produce incomplete/truncated sentences.
7. **Trade Act deep-section retrieval weak** — Q27, Q29, Q30 fail to retrieve specific provisions.
8. **High latency on weak answers** — Q5 (25.7s), Q7 (24.5s), Q27 (21.5s) are slow AND weak.
9. **No inline citations for legal answers** — Most FDCA and CARES answers lack section references.
10. **INPI Fee Schedule partial legibility** — Q44, Q46, Q50 admit text "not fully legible."

---

## 2. RUN INTEGRITY TABLE

| Check | Pass/Fail | Evidence | Impact |
|-------|-----------|----------|--------|
| Single canonical answer artifact | PASS | One JSON + one MD file, consistent | None |
| Single grading artifact | PASS | First grading of this run | None |
| Run manifest present | PASS | runMetadata with runId, timestamp, commit, etc. | None |
| Manifest hash matches artifact | N/A | No hash field in manifest | Minor |
| All doc groups resolved | **FAIL** | TMEP skipped — "NOT FOUND" | -10 queries lost (11% of spec) |
| Query count consistent | PASS | 80 queries in JSON, MD, and meta | None |
| Single model/prompt version | PASS | No version mixing detected | None |
| Latency logs complete | PASS | All 80 queries have latencyMs | None |
| Run metadata fields complete | PASS | runId, timestamp, backendCommit, runnerVersion, accountId, queryCount, docGroupsResolved, docGroupsSkipped all present | None |

**Run Integrity Score: 78/100** (TMEP missing = -15, no manifest hash = -7)

---

## 3. PER-QUERY SCORE TABLE

### Cadastro Único (PNAD 2014) — Q1-Q10

| Q# | Type | Complexity | HF? | Retr | Prec | Num | Grnd | Reas | Comp | Content/90 | Lat Budget | Lat ms | Lat/10 | Lat Flags | Caps | Final | Grade |
|----|------|-----------|------|------|------|-----|------|------|------|-----------|-----------|--------|--------|-----------|------|-------|-------|
| Q01 | DIRECT_EXTRACTION | MED | **HF-5** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 10000 | 10049 | 8 | - | HF→0 | **0** | **F** |
| Q02 | DIRECT_EXTRACTION | MED | - | 12 | 4 | 0 | 6 | 3 | 4 | 29 | 10000 | 11451 | 6 | HIGH_LAT | TITLE_ONLY→49 | **35** | **F** |
| Q03 | DIRECT_EXTRACTION | LOW | - | 12 | 4 | 0 | 6 | 4 | 4 | 30 | 8000 | 7879 | 10 | - | TITLE_ONLY→49 | **40** | **F** |
| Q04 | INTERP_DOC_GROUND | HIGH | - | 14 | 5 | 0 | 6 | 4 | 4 | 33 | 16000 | 15440 | 10 | - | TITLE_ONLY→49 | **43** | **F** |
| Q05 | DIRECT_EXTRACTION | MED | - | 12 | 4 | 0 | 6 | 3 | 4 | 29 | 10000 | 25761 | 0 | TIME_BUDGET | TITLE_ONLY→49,TBF | **29** | **F** |
| Q06 | DIRECT_EXTRACTION | MED | - | 12 | 4 | 0 | 6 | 4 | 4 | 30 | 10000 | 10838 | 8 | HIGH_LAT | TITLE_ONLY→49 | **38** | **F** |
| Q07 | COMPARISON | MED | - | 10 | 4 | 0 | 5 | 3 | 3 | 25 | 12000 | 24544 | 0 | TIME_BUDGET | TITLE_ONLY→49,TBF | **25** | **F** |
| Q08 | DIRECT_EXTRACTION | MED | - | 12 | 4 | 0 | 6 | 3 | 4 | 29 | 10000 | 15303 | 4 | V_HIGH_LAT | TITLE_ONLY→49 | **33** | **F** |
| Q09 | DIRECT_EXTRACTION | MED | - | 12 | 4 | 0 | 6 | 3 | 4 | 29 | 10000 | 12377 | 6 | HIGH_LAT | TITLE_ONLY→49 | **35** | **F** |
| Q10 | DIRECT_EXTRACTION | MED | - | 12 | 4 | 0 | 6 | 3 | 4 | 29 | 10000 | 20971 | 2 | V_HIGH_LAT | TITLE_ONLY→49 | **31** | **F** |

**Section Average: 30.9 / 100 (F)**

### BCB Reserve Requirements — Q11-Q20

| Q# | Type | Complexity | HF? | Retr | Prec | Num | Grnd | Reas | Comp | Content/90 | Lat Budget | Lat ms | Lat/10 | Lat Flags | Caps | Final | Grade |
|----|------|-----------|------|------|------|-----|------|------|------|-----------|-----------|--------|--------|-----------|------|-------|-------|
| Q11 | DIRECT_EXTRACTION | LOW | - | 20 | 16 | 14 | 12 | 4 | 6 | 72 | 8000 | 9600 | 6 | HIGH_LAT | NO_INLINE_CIT→69 | **69** | **D** |
| Q12 | LEGAL_PROC_EXPL | MED | - | 14 | 14 | 8 | 10 | 10 | 6 | 62 | 14000 | 14524 | 8 | HIGH_LAT | PARTIAL→79 | **70** | **C** |
| Q13 | DIRECT_EXTRACTION | LOW | - | 20 | 18 | 16 | 12 | 4 | 7 | 77 | 8000 | 8339 | 8 | HIGH_LAT | - | **80** | **B** |
| Q14 | DIRECT_EXTRACTION | MED | - | 18 | 16 | 14 | 12 | 4 | 6 | 70 | 10000 | 13610 | 4 | V_HIGH_LAT | - | **74** | **C** |
| Q15 | DIRECT_EXTRACTION | LOW | - | 20 | 16 | 14 | 12 | 4 | 6 | 72 | 8000 | 8139 | 8 | HIGH_LAT | - | **76** | **C** |
| Q16 | LEGAL_PROC_EXPL | MED | - | 16 | 14 | 10 | 12 | 10 | 6 | 68 | 14000 | 8556 | 10 | - | PARTIAL→79 | **74** | **C** |
| Q17 | DIRECT_EXTRACTION | LOW | - | 12 | 8 | 4 | 8 | 4 | 5 | 41 | 8000 | 7805 | 10 | - | HONEST_EMPTY→59 | **51** | **F** |
| Q18 | LEGAL_PROC_EXPL | HIGH | - | 18 | 16 | 10 | 14 | 12 | 7 | 77 | 16000 | 12158 | 10 | - | - | **82** | **B** |
| Q19 | DIRECT_EXTRACTION | MED | - | 20 | 16 | 12 | 12 | 5 | 7 | 72 | 10000 | 8129 | 10 | - | - | **78** | **C** |
| Q20 | LEGAL_PROC_EXPL | MED | - | 14 | 10 | 6 | 10 | 8 | 6 | 54 | 14000 | 12470 | 10 | - | PARTIAL→79 | **64** | **D** |

**Section Average: 71.8 / 100 (C)**

### Trade Act of 1974 — Q21-Q30

| Q# | Type | Complexity | HF? | Retr | Prec | Num | Grnd | Reas | Comp | Content/90 | Lat Budget | Lat ms | Lat/10 | Lat Flags | Caps | Final | Grade |
|----|------|-----------|------|------|------|-----|------|------|------|-----------|-----------|--------|--------|-----------|------|-------|-------|
| Q21 | LEGAL_PROC_EXPL | HIGH | - | 16 | 18 | 4 | 14 | 14 | 8 | 74 | 16000 | 14315 | 10 | - | - | **80** | **B** |
| Q22 | LEGAL_PROC_EXPL | MED | - | 14 | 14 | 2 | 12 | 10 | 6 | 58 | 14000 | 16860 | 6 | HIGH_LAT | PARTIAL→79 | **64** | **D** |
| Q23 | LEGAL_PROC_EXPL | MED | - | 12 | 12 | 2 | 10 | 8 | 6 | 50 | 14000 | 11232 | 10 | - | PARTIAL→79 | **60** | **D** |
| Q24 | LEGAL_PROC_EXPL | HIGH | - | 16 | 14 | 2 | 12 | 12 | 6 | 62 | 16000 | 19909 | 6 | HIGH_LAT | - | **68** | **D** |
| Q25 | LEGAL_PROC_EXPL | HIGH | - | 18 | 18 | 4 | 14 | 14 | 8 | 76 | 16000 | 17807 | 8 | HIGH_LAT | - | **80** | **B** |
| Q26 | LEGAL_PROC_EXPL | HIGH | - | 16 | 14 | 2 | 12 | 12 | 7 | 63 | 16000 | 18667 | 6 | HIGH_LAT | - | **69** | **D** |
| Q27 | DIRECT_EXTRACTION | MED | - | 10 | 8 | 2 | 8 | 4 | 5 | 37 | 10000 | 21493 | 2 | V_HIGH_LAT | HONEST_EMPTY→59 | **39** | **F** |
| Q28 | LEGAL_PROC_EXPL | HIGH | - | 16 | 16 | 6 | 14 | 14 | 8 | 74 | 16000 | 14197 | 10 | - | - | **80** | **B** |
| Q29 | LEGAL_PROC_EXPL | HIGH | - | 12 | 10 | 2 | 8 | 8 | 5 | 45 | 16000 | 14450 | 10 | - | HONEST_EMPTY→59 | **55** | **F** |
| Q30 | LEGAL_PROC_EXPL | MED | **HF-5** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 14000 | 14783 | 8 | HIGH_LAT | HF→0 | **0** | **F** |

**Section Average: 59.5 / 100 (F)**

### INPI Patent Examination on Appeal — Q31-Q40

| Q# | Type | Complexity | HF? | Retr | Prec | Num | Grnd | Reas | Comp | Content/90 | Lat Budget | Lat ms | Lat/10 | Lat Flags | Caps | Final | Grade |
|----|------|-----------|------|------|------|-----|------|------|------|-----------|-----------|--------|--------|-----------|------|-------|-------|
| Q31 | STRUCT_RECON | MED | - | 16 | 10 | 18 | 12 | 8 | 10 | 74 | 14000 | 14439 | 8 | HIGH_LAT | - | **78** | **C** |
| Q32 | LEGAL_PROC_EXPL | MED | - | 16 | 16 | 2 | 14 | 14 | 7 | 69 | 14000 | 9387 | 10 | - | - | **75** | **C** |
| Q33 | LEGAL_PROC_EXPL | MED | - | 16 | 16 | 2 | 14 | 12 | 7 | 67 | 14000 | 9042 | 10 | - | - | **73** | **C** |
| Q34 | STRUCT_RECON | MED | - | 14 | 10 | 12 | 10 | 6 | 6 | 58 | 14000 | 8544 | 10 | - | SHORT→79 | **64** | **D** |
| Q35 | LEGAL_PROC_EXPL | HIGH | - | 16 | 16 | 2 | 14 | 14 | 7 | 69 | 16000 | 10893 | 10 | - | - | **75** | **C** |
| Q36 | LEGAL_PROC_EXPL | MED | - | 12 | 10 | 2 | 10 | 8 | 5 | 47 | 14000 | 11863 | 10 | - | WEAK_GRND→84 | **57** | **F** |
| Q37 | LEGAL_PROC_EXPL | HIGH | - | 16 | 14 | 2 | 14 | 14 | 7 | 67 | 16000 | 10360 | 10 | - | - | **73** | **C** |
| Q38 | LEGAL_PROC_EXPL | HIGH | - | 16 | 16 | 2 | 14 | 14 | 8 | 70 | 16000 | 9892 | 10 | - | - | **76** | **C** |
| Q39 | COMPARISON | MED | - | 10 | 8 | 2 | 8 | 6 | 5 | 39 | 12000 | 9849 | 10 | - | HONEST_EMPTY→59 | **49** | **F** |
| Q40 | LEGAL_PROC_EXPL | MED | - | 18 | 18 | 2 | 16 | 14 | 8 | 76 | 14000 | 9825 | 10 | - | - | **82** | **B** |

**Section Average: 70.2 / 100 (C)**

### INPI Fee Schedule — Q41-Q50

| Q# | Type | Complexity | HF? | Retr | Prec | Num | Grnd | Reas | Comp | Content/90 | Lat Budget | Lat ms | Lat/10 | Lat Flags | Caps | Final | Grade |
|----|------|-----------|------|------|------|-----|------|------|------|-----------|-----------|--------|--------|-----------|------|-------|-------|
| Q41 | DIRECT_EXTRACTION | LOW | - | 20 | 18 | 16 | 12 | 4 | 7 | 77 | 8000 | 10964 | 4 | V_HIGH_LAT | - | **77** | **C** |
| Q42 | DIRECT_EXTRACTION | LOW | - | 20 | 18 | 16 | 12 | 4 | 7 | 77 | 8000 | 10251 | 6 | HIGH_LAT | - | **78** | **C** |
| Q43 | STRUCT_RECON | MED | - | 18 | 12 | 22 | 12 | 8 | 10 | 82 | 14000 | 8717 | 10 | - | - | **87** | **B+** |
| Q44 | DIRECT_EXTRACTION | LOW | **HF-5** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8000 | 8080 | 8 | HIGH_LAT | HF→0 | **0** | **F** |
| Q45 | DIRECT_EXTRACTION | MED | - | 16 | 12 | 8 | 10 | 4 | 6 | 56 | 10000 | 9804 | 10 | - | PARTIAL→79 | **62** | **D** |
| Q46 | DIRECT_EXTRACTION | LOW | **HF-8** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 8000 | 14075 | 2 | V_HIGH_LAT | HF→0 | **0** | **F** |
| Q47 | DIRECT_EXTRACTION | LOW | - | 20 | 16 | 14 | 12 | 4 | 7 | 73 | 8000 | 8224 | 8 | HIGH_LAT | - | **77** | **C** |
| Q48 | STRUCT_RECON | HIGH | - | 18 | 12 | 22 | 12 | 8 | 11 | 83 | 16000 | 14113 | 10 | - | - | **88** | **B+** |
| Q49 | STRUCT_RECON | HIGH | - | 18 | 12 | 20 | 12 | 8 | 10 | 80 | 16000 | 10618 | 10 | - | - | **85** | **B+** |
| Q50 | DIRECT_EXTRACTION | MED | - | 14 | 10 | 6 | 8 | 4 | 5 | 47 | 10000 | 8667 | 10 | - | PARTIAL→79 | **57** | **F** |

**Section Average: 61.1 / 100 (D)**

### Private Non-Profit Social Assistance Entities — Q51-Q60

| Q# | Type | Complexity | HF? | Retr | Prec | Num | Grnd | Reas | Comp | Content/90 | Lat Budget | Lat ms | Lat/10 | Lat Flags | Caps | Final | Grade |
|----|------|-----------|------|------|------|-----|------|------|------|-----------|-----------|--------|--------|-----------|------|-------|-------|
| Q51 | DIRECT_EXTRACTION | LOW | - | 6 | 2 | 0 | 4 | 3 | 4 | 19 | 8000 | 9328 | 6 | HIGH_LAT | WRONG_TABLE→49,HONEST_EMPTY→59 | **25** | **F** |
| Q52 | DIRECT_EXTRACTION | LOW | - | 6 | 2 | 0 | 4 | 3 | 4 | 19 | 8000 | 4582 | 10 | - | WRONG_TABLE→49 | **29** | **F** |
| Q53 | DIRECT_EXTRACTION | MED | - | 6 | 2 | 0 | 4 | 3 | 4 | 19 | 10000 | 8952 | 10 | - | WRONG_TABLE→49 | **29** | **F** |
| Q54 | DIRECT_EXTRACTION | MED | - | 6 | 2 | 0 | 4 | 3 | 4 | 19 | 10000 | 12924 | 6 | HIGH_LAT | WRONG_TABLE→49 | **25** | **F** |
| Q55 | COMPARISON | MED | - | 6 | 2 | 0 | 4 | 3 | 4 | 19 | 12000 | 9641 | 10 | - | WRONG_TABLE→49 | **29** | **F** |
| Q56 | DIRECT_EXTRACTION | LOW | - | 6 | 2 | 0 | 4 | 2 | 2 | 16 | 8000 | 4492 | 10 | - | WRONG_TABLE→49,BROKEN→0 | **26** | **F** |
| Q57 | COMPARISON | MED | - | 6 | 2 | 0 | 4 | 3 | 4 | 19 | 12000 | 9096 | 10 | - | WRONG_TABLE→49 | **29** | **F** |
| Q58 | DIRECT_EXTRACTION | MED | - | 6 | 2 | 0 | 4 | 3 | 4 | 19 | 10000 | 8193 | 10 | - | WRONG_TABLE→49 | **29** | **F** |
| Q59 | DIRECT_EXTRACTION | MED | - | 6 | 2 | 0 | 4 | 3 | 4 | 19 | 10000 | 9152 | 10 | - | WRONG_TABLE→49 | **29** | **F** |
| Q60 | DIRECT_EXTRACTION | MED | - | 6 | 2 | 0 | 4 | 3 | 4 | 19 | 10000 | 8625 | 10 | - | WRONG_TABLE→49 | **29** | **F** |

**Section Average: 27.9 / 100 (F)**

### US FDCA — Q61-Q70

| Q# | Type | Complexity | HF? | Retr | Prec | Num | Grnd | Reas | Comp | Content/90 | Lat Budget | Lat ms | Lat/10 | Lat Flags | Caps | Final | Grade |
|----|------|-----------|------|------|------|-----|------|------|------|-----------|-----------|--------|--------|-----------|------|-------|-------|
| Q61 | LEGAL_PROC_EXPL | MED | - | 14 | 12 | 2 | 10 | 8 | 6 | 52 | 14000 | 13825 | 10 | - | PARTIAL→79,NO_CITE→69 | **58** | **F** |
| Q62 | LEGAL_PROC_EXPL | MED | - | 8 | 6 | 2 | 6 | 4 | 4 | 30 | 14000 | 12891 | 10 | - | HONEST_EMPTY→59 | **40** | **F** |
| Q63 | LEGAL_PROC_EXPL | MED | - | 8 | 6 | 2 | 6 | 4 | 4 | 30 | 14000 | 12916 | 10 | - | HONEST_EMPTY→59 | **40** | **F** |
| Q64 | LEGAL_PROC_EXPL | MED | - | 14 | 12 | 2 | 10 | 8 | 6 | 52 | 14000 | 12023 | 10 | - | PARTIAL→79,NO_CITE→69 | **58** | **F** |
| Q65 | LEGAL_PROC_EXPL | HIGH | - | 8 | 6 | 2 | 6 | 4 | 4 | 30 | 16000 | 11600 | 10 | - | HONEST_EMPTY→59 | **40** | **F** |
| Q66 | LEGAL_PROC_EXPL | HIGH | - | 18 | 18 | 2 | 16 | 14 | 8 | 76 | 16000 | 18375 | 6 | HIGH_LAT | - | **78** | **C** |
| Q67 | LEGAL_PROC_EXPL | HIGH | - | 14 | 12 | 2 | 10 | 8 | 6 | 52 | 16000 | 17096 | 8 | HIGH_LAT | PARTIAL→79 | **60** | **D** |
| Q68 | DIRECT_EXTRACTION | MED | - | 8 | 4 | 2 | 4 | 3 | 4 | 25 | 10000 | 14827 | 4 | V_HIGH_LAT | HONEST_EMPTY→59 | **29** | **F** |
| Q69 | LEGAL_PROC_EXPL | MED | - | 12 | 8 | 2 | 8 | 6 | 5 | 41 | 14000 | 6161 | 10 | - | TITLE_ONLY→49 | **49** | **F** |
| Q70 | LEGAL_PROC_EXPL | HIGH | - | 14 | 12 | 2 | 10 | 10 | 6 | 54 | 16000 | 12576 | 10 | - | PARTIAL→79 | **64** | **D** |

**Section Average: 51.6 / 100 (F)**

### CARES Act — Q71-Q80

| Q# | Type | Complexity | HF? | Retr | Prec | Num | Grnd | Reas | Comp | Content/90 | Lat Budget | Lat ms | Lat/10 | Lat Flags | Caps | Final | Grade |
|----|------|-----------|------|------|------|-----|------|------|------|-----------|-----------|--------|--------|-----------|------|-------|-------|
| Q71 | LEGAL_PROC_EXPL | HIGH | - | 18 | 16 | 4 | 14 | 14 | 8 | 74 | 16000 | 14664 | 10 | - | - | **80** | **B** |
| Q72 | DIRECT_EXTRACTION | MED | - | 8 | 4 | 2 | 6 | 3 | 4 | 27 | 10000 | 8773 | 10 | - | HONEST_EMPTY→59 | **37** | **F** |
| Q73 | LEGAL_PROC_EXPL | HIGH | - | 18 | 16 | 4 | 14 | 14 | 8 | 74 | 16000 | 14166 | 10 | - | - | **80** | **B** |
| Q74 | LEGAL_PROC_EXPL | MED | - | 10 | 8 | 2 | 6 | 6 | 5 | 37 | 14000 | 9538 | 10 | - | HONEST_EMPTY→59 | **47** | **F** |
| Q75 | LEGAL_PROC_EXPL | HIGH | - | 10 | 8 | 2 | 6 | 6 | 5 | 37 | 16000 | 9497 | 10 | - | HONEST_EMPTY→59 | **47** | **F** |
| Q76 | LEGAL_PROC_EXPL | MED | - | 10 | 8 | 2 | 8 | 6 | 5 | 39 | 14000 | 8214 | 10 | - | PARTIAL→79 | **49** | **F** |
| Q77 | LEGAL_PROC_EXPL | MED | - | 14 | 12 | 2 | 10 | 10 | 6 | 54 | 14000 | 10978 | 10 | - | TITLE_ONLY→49 | **60** | **D** |
| Q78 | LEGAL_PROC_EXPL | HIGH | **HF-5** | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 16000 | 8813 | 10 | - | HF→0 | **0** | **F** |
| Q79 | LEGAL_PROC_EXPL | MED | - | 10 | 8 | 2 | 6 | 6 | 5 | 37 | 14000 | 9749 | 10 | - | HONEST_EMPTY→59 | **47** | **F** |
| Q80 | LEGAL_PROC_EXPL | MED | - | 8 | 6 | 2 | 6 | 4 | 5 | 31 | 14000 | 11767 | 10 | - | HONEST_EMPTY→59 | **41** | **F** |

**Section Average: 48.8 / 100 (F)**

---

## 4. FAILURE TAXONOMY TABLE

| Failure Type | Count | Affected Queries | Severity |
|-------------|-------|-----------------|----------|
| TITLE_ONLY_EXTRACTION | 12 | Q2-Q10, Q69, Q77 | CRITICAL |
| HONEST_BUT_EMPTY | 18 | Q17, Q27, Q29, Q39, Q51-Q60, Q62, Q63, Q65, Q68, Q72, Q74, Q75, Q79, Q80 | HIGH |
| WRONG_TABLE_CONTEXT | 10 | Q51-Q60 | CRITICAL |
| BROKEN_FORMAT | 5 | Q1, Q30, Q44, Q46, Q78 | CRITICAL (hard fail) |
| PARTIAL_ANSWER | 14 | Q12, Q16, Q20, Q22, Q23, Q45, Q50, Q61, Q64, Q67, Q70, Q76 | HIGH |
| WEAK_GROUNDING | 5 | Q34, Q36, Q50, Q69, Q77 | MEDIUM |
| HIGH_LATENCY | 18 | Q2, Q5-Q10, Q11, Q13-Q15, Q22, Q24, Q26, Q30, Q41, Q42, Q47, Q54, Q66, Q67 | MEDIUM |
| VERY_HIGH_LATENCY | 5 | Q5, Q7, Q8, Q10, Q27, Q41, Q46, Q68 | HIGH |
| TIME_BUDGET_FAIL | 2 | Q5, Q7 | HIGH |
| NO_INLINE_CITATIONS | 8 | Q61, Q62, Q63, Q64, Q65, Q68, Q69, Q77 | MEDIUM |

---

## 5. LATENCY TAXONOMY TABLE

| Latency Flag | Count | Affected Queries | Median Latency | Max Latency |
|-------------|-------|-----------------|---------------|-------------|
| Within Budget | 38 | Q3, Q4, Q16-Q19, Q28, Q31-Q40, Q43, Q48-Q53, Q55-Q60, Q64-Q66, Q69-Q80 | 9,825 ms | 14,166 ms |
| HIGH_LATENCY | 25 | Q2, Q6, Q9, Q11-Q15, Q22, Q24, Q26, Q30, Q41, Q42, Q44, Q47, Q54, Q67 | 12,916 ms | 19,909 ms |
| VERY_HIGH_LATENCY | 5 | Q8, Q10, Q14, Q46, Q68 | 14,827 ms | 15,303 ms |
| TIME_BUDGET_FAIL | 4 | Q5, Q7, Q27 | 24,544 ms | 25,761 ms |

**Latency Statistics:**
| Metric | Value |
|--------|-------|
| Average | 11,909 ms |
| Median | 10,618 ms |
| P90 | 18,375 ms |
| P95 | 21,493 ms |
| Max | 25,761 ms |
| % above budget | 42.5% |
| % HIGH_LATENCY | 31.3% |
| % VERY_HIGH_LATENCY | 6.3% |
| % TIME_BUDGET_FAIL | 5.0% |

**Latency Quality Score: 68/100**

---

## 6. SECTION / DOCUMENT-GROUP SCORES

| Section | Avg Score | Avg Latency | P90 Latency | Hard Fails | Major Failure Modes | Status |
|---------|----------|-------------|-------------|------------|--------------------|---------|
| Cadastro Único | **30.9** | 14,537 ms | 24,544 ms | 1 (Q1) | TITLE_ONLY_EXTRACTION (all 10) | **F — CRITICAL** |
| BCB Reserve | **71.8** | 10,373 ms | 14,524 ms | 0 | PARTIAL_ANSWER (Q12, Q16, Q20) | **C — MARGINAL** |
| Trade Act | **59.5** | 16,218 ms | 19,909 ms | 1 (Q30) | HONEST_EMPTY, HIGH_LATENCY | **F — WEAK** |
| INPI Appeal | **70.2** | 10,449 ms | 14,439 ms | 0 | HONEST_EMPTY (Q39), WEAK_GROUNDING | **C — MARGINAL** |
| INPI Fee | **61.1** | 10,253 ms | 14,113 ms | 2 (Q44, Q46) | BROKEN_FORMAT, PARTIAL | **D — BELOW TARGET** |
| Non-Profit | **27.9** | 8,399 ms | 12,924 ms | 0 | WRONG_TABLE_CONTEXT (all 10) | **F — CRITICAL** |
| FDCA | **51.6** | 13,229 ms | 18,375 ms | 0 | HONEST_EMPTY, TITLE_ONLY | **F — WEAK** |
| CARES Act | **48.8** | 10,616 ms | 14,664 ms | 1 (Q78) | HONEST_EMPTY (6/10) | **F — WEAK** |

---

## 7. SLOWEST 15 QUERIES

| Rank | Q# | Latency | Budget | Final Score | Quality Justified? | Fix Needed |
|------|-----|---------|--------|------------|---------------------|-----------|
| 1 | Q05 | 25,761 ms | 10,000 ms | 29/F | **NO** — Title-only, 2.58× budget | Fix Cadastro extraction |
| 2 | Q07 | 24,544 ms | 12,000 ms | 25/F | **NO** — Title-only, 2.05× budget | Fix Cadastro extraction |
| 3 | Q27 | 21,493 ms | 10,000 ms | 39/F | **NO** — Honest empty, 2.15× budget | Deeper Trade Act retrieval |
| 4 | Q10 | 20,971 ms | 10,000 ms | 31/F | **NO** — Title-only, 2.10× budget | Fix Cadastro extraction |
| 5 | Q24 | 19,909 ms | 16,000 ms | 68/D | **NO** — Partial answer, 1.24× budget | Better Sec 301 retrieval |
| 6 | Q26 | 18,667 ms | 16,000 ms | 69/D | Marginal — decent content | Trim response or speed up |
| 7 | Q66 | 18,375 ms | 16,000 ms | 78/C | **YES** — Strong answer justifies latency | Acceptable |
| 8 | Q25 | 17,807 ms | 16,000 ms | 80/B | **YES** — Strong answer | Acceptable |
| 9 | Q67 | 17,096 ms | 16,000 ms | 60/D | **NO** — Partial, 1.07× budget | Better FDCA content retrieval |
| 10 | Q22 | 16,860 ms | 14,000 ms | 64/D | **NO** — Partial, 1.20× budget | Deeper TAA retrieval |
| 11 | Q08 | 15,303 ms | 10,000 ms | 33/F | **NO** — Title-only, 1.53× budget | Fix Cadastro extraction |
| 12 | Q04 | 15,440 ms | 16,000 ms | 43/F | **NO** — Title-only, within budget | Fix Cadastro extraction |
| 13 | Q30 | 14,783 ms | 14,000 ms | 0/F | **NO** — Hard fail, 1.06× budget | Fix broken output |
| 14 | Q68 | 14,827 ms | 10,000 ms | 29/F | **NO** — Honest empty, 1.48× budget | FDCA content retrieval |
| 15 | Q12 | 14,524 ms | 14,000 ms | 70/C | Marginal — partial answer | Acceptable |

---

## 8. WORST 15 ANSWERS

| Rank | Q# | Score | Latency | Why It Failed | Fix Needed |
|------|-----|-------|---------|--------------|-----------|
| 1 | Q01 | 0 | 10,049 ms | Language contract hard fail — "could not safely finalize" | Fix language contract for Portuguese docs queried in English |
| 2 | Q30 | 0 | 14,783 ms | Broken sentence fragment — answer is incomplete gibberish | Fix sentence boundary recovery for very short truncations |
| 3 | Q44 | 0 | 8,080 ms | Broken output — "The information on the fees for filing..." (no predicate) | Fix structural gate to catch broken outputs |
| 4 | Q46 | 0 | 14,075 ms | Language contract hard fail — "could not safely finalize" | Same as Q1 — language contract fix |
| 5 | Q78 | 0 | 8,813 ms | Broken output — "The information detailing the role..." (no predicate) | Fix structural completeness gate |
| 6 | Q05 | 29 | 25,761 ms | Title-only + TIME_BUDGET_FAIL — slow and empty | Replace Cadastro PDF with data-bearing document |
| 7 | Q07 | 25 | 24,544 ms | Title-only + TIME_BUDGET_FAIL | Same as Q05 |
| 8 | Q51 | 25 | 9,328 ms | Wrong table context — returns health economics, not social assistance | Re-ingest Tab02.xls to activate cell fact extraction |
| 9 | Q56 | 26 | 4,492 ms | Wrong table context + truncated output ("private non") | Re-ingest Tab02.xls + fix truncation |
| 10 | Q52 | 29 | 4,582 ms | Wrong table context — honest empty about wrong data | Re-ingest Tab02.xls |
| 11 | Q53 | 29 | 8,952 ms | Wrong table context | Re-ingest Tab02.xls |
| 12 | Q54 | 25 | 12,924 ms | Wrong table context + HIGH_LATENCY | Re-ingest Tab02.xls |
| 13 | Q57 | 29 | 9,096 ms | Wrong table context | Re-ingest Tab02.xls |
| 14 | Q58 | 29 | 8,193 ms | Wrong table context | Re-ingest Tab02.xls |
| 15 | Q68 | 29 | 14,827 ms | FDCA — honest empty, V_HIGH_LATENCY | Fix FDCA deep content retrieval |

---

## 9. TOP 20 FIXES

| # | Fix | Expected Impact | Owner/Area | Validation | Latency Impact |
|---|-----|----------------|------------|-----------|---------------|
| 1 | **Re-ingest Tab02.xls** (cell fact fix already deployed) | +15-25 pts on Non-Profit section (Q51-Q60) | Ingestion | Verify cell_fact chunks exist after re-ingest | None |
| 2 | **Replace Cadastro PDF** with data-bearing document (current PDF is TOC-only) | +20-40 pts on Cadastro section (Q1-Q10) | Data/Document | Verify chunks contain numeric census data | None |
| 3 | **Fix language contract** — Portuguese-origin docs queried in English should not trigger "could not safely finalize" | +8 pts (Q1, Q46 exit hard fail) | Runtime/CentralizedChatRuntimeDelegate | Test Portuguese docs with English queries | None |
| 4 | **Fix structural completeness gate enforcement** — Q30, Q44, Q78 ship broken fragments despite "block" severity | +5 pts (3 queries exit hard fail) | Quality Gates / Runtime | Verify gate fires and blocks broken outputs | None |
| 5 | **Improve FDCA deep content retrieval** — 6/10 queries return TOC titles instead of statute text | +10-20 pts on FDCA section | Retrieval Engine | Test Q62, Q63, Q65 for actual statutory content | Neutral |
| 6 | **Improve CARES Act content retrieval** — 6/10 queries return section headings only | +10-20 pts on CARES section | Retrieval Engine | Test Q72, Q74, Q75 for actual provision text | Neutral |
| 7 | **Fix TOC retrieval for large statutes** — further strengthen TOC penalty or increase content chunks | +5-10 pts on FDCA/CARES/Trade Act | Retrieval Engine | Verify evidence contains substantive text, not headings | Neutral |
| 8 | **Increase evidence slot count** for 400+ page legal docs | +5-10 pts on Trade Act, FDCA, CARES | Retrieval Engine | Test maxPerDocHard increase for large docs | +1-2s latency |
| 9 | **Add inline section citations** for legal/regulatory answers | +3-5 pts on legal sections (NO_CITE cap removal) | LLM Builder / Prompts | Verify answers cite specific sections | None |
| 10 | **Fix INPI fee schedule legibility** — "not fully legible" in Q44, Q50 | +3-5 pts on INPI Fee section | Extraction/Ingestion | Re-extract or improve PDF table extraction | None |
| 11 | **Reduce latency for weak answers** — kill slow retrieval paths that produce empty results | +2-3 pts (latency score improvement) | Retrieval Engine | Set hard timeout, return faster on low-confidence | -5s avg |
| 12 | **Fix sentence recovery for minimal outputs** — Q56 truncates at "private non" | +2 pts | Runtime | Test with sub-100 char outputs | None |
| 13 | **Add Trade Act deep-section retrieval** — Q27, Q29 fail to find specific provisions | +3-5 pts | Retrieval Engine | Test readjustment allowance and Jackson-Vanik queries | Neutral |
| 14 | **Upload TMEP document** to restore missing doc group | +10-15 pts on run integrity | Data/Document | Upload and verify 10 TMEP queries answer | None |
| 15 | **Improve honest-empty score** — when system correctly says "not available," provide what IS available | +2-5 pts across sections | LLM Prompts | Test honest-empty answers for useful partial info | None |
| 16 | **Validate Cadastro alternative source** — find actual PNAD 2014 census data tables | +20-30 pts if found | Data/Document | Source IBGE data tables | None |
| 17 | **Reduce P90 latency** below 15s | +3-5 pts on latency score | LLM Router | Profile slow queries, optimize retrieval | -3-5s P90 |
| 18 | **Add partial-extraction recovery** — when main extraction fails, try backup snippet strategy | +2-4 pts | Retrieval Engine | Test on FDCA and CARES queries | +1-2s |
| 19 | **Improve BCB Reserve Q17** — institution list exists but not extracted | +2 pts | Retrieval Engine | Test savings deposit institutions query | None |
| 20 | **Add dispatch model catalog for INPI** — Q34 only finds 2 of potentially many models | +1-2 pts | Retrieval Engine | Test with broader INPI dispatch queries | None |

---

## 10. FINAL VERDICT

### Can this run be trusted as a production gate?

**NO.** This run scores 49.8/100 — firmly in FAIL territory. Key issues:

1. **Two entire sections are catastrophically broken** (Cadastro: 30.9, Non-Profit: 27.9) accounting for 25% of queries.
2. **Hard-fail rate of 6.25%** (5 queries) exceeds the 2% threshold for any release tier.
3. **42.5% of queries exceed latency budget** with 5% hitting TIME_BUDGET_FAIL.
4. **5 of 8 sections score below 60** — only BCB Reserve (71.8) and INPI Appeal (70.2) approach acceptable quality.

### What would make the next run certifiable?

To reach **BRONZE (80/100)**:
- Fix #1: Re-ingest Tab02.xls → Non-Profit section exits F (+15-25 pts on section)
- Fix #2: Replace Cadastro PDF with data-bearing document → Cadastro exits F (+20-40 pts)
- Fix #3: Fix language contract → Q1, Q46 exit hard fail (+8 pts)
- Fix #4: Fix structural gate enforcement → Q30, Q44, Q78 exit hard fail (+5 pts)
- Fix #5-7: Improve FDCA/CARES content retrieval → sections exit F
- Fix #14: Upload TMEP document → run integrity ≥ 90
- Target: Hard-fail rate < 2%, mean query score ≥ 75

### Failure Classification

| Category | Count | Queries |
|----------|-------|---------|
| **Quality failures** (retrieval/extraction) | 45 | Q2-Q10, Q17, Q22, Q23, Q27, Q29, Q36, Q39, Q44, Q50-Q60, Q61-Q65, Q67-Q70, Q72, Q74-Q76, Q78-Q80 |
| **Data failures** (wrong/missing document) | 20 | Q1-Q10 (Cadastro TOC), Q51-Q60 (Tab02 not re-ingested) |
| **Runtime failures** (language contract, broken output) | 5 | Q1, Q30, Q44, Q46, Q78 |
| **Latency failures** | 4 | Q5, Q7, Q27, Q10 |
| **Benchmark governance** | 1 | TMEP missing |

---

## SCORE COMPUTATION

| Component | Weight | Score | Weighted |
|-----------|--------|-------|----------|
| Mean Query Score | 65% | 50.1 | 32.6 |
| Run Integrity | 10% | 78 | 7.8 |
| Cross-Answer Consistency | 10% | 82 | 8.2 |
| Grading Calibration | 5% | 75 | 3.8 |
| Latency Quality | 10% | 68 | 6.8 |
| **TOTAL** | **100%** | | **49.8** |

---

## COMPARISON TO BASELINE (51.4/100)

| Metric | Baseline (pre-fix) | This Run | Delta |
|--------|-------------------|----------|-------|
| Overall Score | 51.4 | 49.8 | **-1.6** |
| Cadastro Avg | 20.8 | 30.9 | **+10.1** |
| Non-Profit Avg | 27.1 | 27.9 | **+0.8** |
| BCB Reserve Avg | 64.1 | 71.8 | **+7.7** |
| Trade Act Avg | 56.3 | 59.5 | **+3.2** |
| INPI Appeal Avg | 70.6 | 70.2 | **-0.4** |
| INPI Fee Avg | 67.0 | 61.1 | **-5.9** |
| FDCA Avg | 51.4 | 51.6 | **+0.2** |
| CARES Avg | 52.2 | 48.8 | **-3.4** |
| Hard-Fail Rate | ~3.75% | 6.25% | **+2.5%** |

### Analysis

The code fixes delivered **mixed results**:
- **BCB Reserve improved +7.7 pts** (best gain) — likely from better token budget and retrieval
- **Cadastro improved +10.1 pts** — answers now properly identify table titles instead of failing silently, but still TITLE_ONLY
- **Trade Act improved +3.2 pts** — modest TOC penalty benefit
- **INPI Fee REGRESSED -5.9 pts** — Q44 and Q46 hard-failed this run (were previously weak but not zero)
- **CARES REGRESSED -3.4 pts** — Q78 hard-failed (was previously weak but scored ~15)
- **Hard-fail rate INCREASED** — the structural completeness gate may be catching more broken outputs but the runtime isn't properly replacing them with adaptive fallbacks

The **net effect is approximately neutral** — gains in some sections offset by regressions from new hard fails. The structural gate being set to "block" may be blocking answers without properly triggering the adaptive fallback message, producing zero-score hard fails instead of low-but-nonzero scores.

### Critical Next Steps (in priority order)

1. **Re-ingest Tab02.xls** — this is the #1 fix, zero code changes needed
2. **Debug structural gate → adaptive fallback path** — blocking is producing broken stubs (Q30, Q44, Q78) instead of clean failure messages
3. **Fix language contract** for cross-language queries (Q1, Q46)
4. **Source proper Cadastro data tables** from IBGE
5. **Upload TMEP document** for run integrity

**TIER: FAIL (49.8/100)**
