# Benchmark V3 Harsh Grading Report

**Run ID**: 280f13fb-4262-422b-90c2-29be99fe95fb
**Date**: 2026-03-12T17:40:07.979Z
**Backend Commit**: a271aebbf (same code as V2 + structural gate downgrade + language contract fix)
**Runner Version**: 2.0.0
**Grading Date**: 2026-03-12
**Grader**: Production Benchmark Judge (harsh rubric v13)

---

## 1. EXECUTIVE SUMMARY

| Metric | Value | V2 Comparison |
|--------|-------|---------------|
| **Final Production Score** | **54.2 / 100** | +4.4 pts |
| **Tier** | **FAIL** | Same |
| **Run Valid?** | **CONDITIONAL** (1 doc group missing) | Same |
| **Mean Query Score** | 54.8 / 100 | +4.7 |
| **Hard-Fail Rate** | 0% (0/80) | -5 hard fails eliminated |
| **Hard-Fail Queries** | None | Was: Q1, Q30, Q44, Q46, Q78 |
| **Run Integrity** | 78 / 100 | Same |
| **Cross-Answer Consistency** | 83 / 100 | +1 |
| **Grading Calibration** | 76 / 100 | +1 |
| **Latency Quality** | 74 / 100 | +6 |
| **Avg Latency** | 11,755 ms | -154 ms |
| **Median Latency** | 11,273 ms | +655 ms |
| **P90 Latency** | 16,658 ms | -1,717 ms |
| **P95 Latency** | 17,609 ms | -3,884 ms |

### Change Summary (V2 -> V3)

**Fixes Applied:**
1. `structural_completeness` gate downgraded from "block" to "warn" — Q30, Q44, Q78 no longer hard fail
2. Language contract skip-on-evidence — Q1, Q46 no longer hard fail with "could not safely finalize"

**Net Impact:** +4.4 pts overall. All 5 hard fails eliminated. Score gain limited because underlying content quality on those queries is still poor (truncated or weak answers that previously were blocked are now visible).

### Top 10 Blockers

1. **Cadastro PDF is TOC-only** — 10 queries return TITLE_ONLY_EXTRACTION (Q1-Q10). Document has zero data values. No fix possible without replacing document.
2. **Non-Profit XLS not re-ingested** — 10 queries return WRONG_TABLE_CONTEXT / HONEST_BUT_EMPTY (Q51-Q60). Cell fact fix deployed but Tab02.xls needs re-ingestion.
3. **FDCA TOC domination persists** — 6/10 FDCA queries return TOC titles, not actual statutory text (Q62, Q63, Q65, Q68).
4. **CARES Act shallow retrieval** — 6/10 CARES queries return section titles without substance (Q72, Q74, Q75, Q76, Q78, Q80).
5. **Trade Act deep-section retrieval weak** — Q27, Q29, Q30 fail to retrieve specific provisions.
6. **Missing TMEP doc group** — 10 queries lost entirely, hurts run integrity.
7. **No inline citations for legal answers** — Most FDCA and CARES answers lack section references.
8. **INPI Fee Schedule incomplete answers** — Q44, Q46, Q48, Q50 have partial/weak responses.
9. **Broken sentence endings persist as warn** — Q12, Q30, Q56 have truncated endings (now shown instead of blocked).
10. **High latency on weak answers** — Multiple queries take 15s+ for partial answers.

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
| Run metadata fields complete | PASS | All fields present | None |

**Run Integrity Score: 78/100** (TMEP missing = -15, no manifest hash = -7)

---

## 3. PER-QUERY SCORE TABLE

### Cadastro Unico (PNAD 2014) -- Q1-Q10

| Q# | Type | Complexity | HF? | Retr | Prec | Num | Grnd | Reas | Comp | Content/90 | Lat Budget | Lat ms | Lat/10 | Lat Flags | Caps | Final | Grade |
|----|------|-----------|------|------|------|-----|------|------|------|-----------|-----------|--------|--------|-----------|------|-------|-------|
| Q01 | DIRECT_EXTRACTION | MED | - | 12 | 4 | 0 | 6 | 3 | 4 | 29 | 10000 | 9664 | 10 | - | TITLE_ONLY->49,TRUNC_END | **37** | **F** |
| Q02 | DIRECT_EXTRACTION | MED | - | 12 | 4 | 0 | 6 | 3 | 4 | 29 | 10000 | 12613 | 6 | HIGH_LAT | TITLE_ONLY->49 | **35** | **F** |
| Q03 | DIRECT_EXTRACTION | LOW | - | 12 | 4 | 0 | 6 | 4 | 4 | 30 | 8000 | 6440 | 10 | - | TITLE_ONLY->49 | **40** | **F** |
| Q04 | INTERP_DOC_GROUND | HIGH | - | 14 | 5 | 0 | 6 | 4 | 5 | 34 | 16000 | 15414 | 10 | - | TITLE_ONLY->49 | **44** | **F** |
| Q05 | DIRECT_EXTRACTION | MED | - | 12 | 4 | 0 | 6 | 3 | 5 | 30 | 10000 | 9927 | 10 | - | TITLE_ONLY->49 | **40** | **F** |
| Q06 | DIRECT_EXTRACTION | MED | - | 12 | 4 | 0 | 6 | 4 | 4 | 30 | 10000 | 11273 | 8 | HIGH_LAT | TITLE_ONLY->49 | **38** | **F** |
| Q07 | COMPARISON | MED | - | 10 | 4 | 0 | 5 | 3 | 3 | 25 | 12000 | 11413 | 10 | - | TITLE_ONLY->49 | **35** | **F** |
| Q08 | DIRECT_EXTRACTION | MED | - | 12 | 4 | 0 | 6 | 3 | 4 | 29 | 10000 | 13407 | 4 | V_HIGH_LAT | TITLE_ONLY->49 | **33** | **F** |
| Q09 | DIRECT_EXTRACTION | MED | - | 12 | 4 | 0 | 6 | 3 | 4 | 29 | 10000 | 13170 | 4 | V_HIGH_LAT | TITLE_ONLY->49 | **33** | **F** |
| Q10 | DIRECT_EXTRACTION | MED | - | 12 | 4 | 0 | 6 | 3 | 4 | 29 | 10000 | 10123 | 8 | HIGH_LAT | TITLE_ONLY->49 | **37** | **F** |

**Section Average: 37.2 / 100 (F)** (+6.3 from V2: Q1 exits hard fail)

### BCB Reserve Requirements -- Q11-Q20

| Q# | Type | Complexity | HF? | Retr | Prec | Num | Grnd | Reas | Comp | Content/90 | Lat Budget | Lat ms | Lat/10 | Lat Flags | Caps | Final | Grade |
|----|------|-----------|------|------|------|-----|------|------|------|-----------|-----------|--------|--------|-----------|------|-------|-------|
| Q11 | DIRECT_EXTRACTION | LOW | - | 20 | 16 | 14 | 12 | 4 | 6 | 72 | 8000 | 8974 | 8 | HIGH_LAT | - | **76** | **C** |
| Q12 | LEGAL_PROC_EXPL | MED | - | 14 | 12 | 8 | 10 | 10 | 6 | 60 | 14000 | 14527 | 8 | HIGH_LAT | TRUNC_START->79 | **68** | **D** |
| Q13 | DIRECT_EXTRACTION | LOW | - | 20 | 18 | 16 | 12 | 4 | 7 | 77 | 8000 | 6929 | 10 | - | - | **82** | **B** |
| Q14 | DIRECT_EXTRACTION | MED | - | 18 | 16 | 14 | 12 | 4 | 6 | 70 | 10000 | 9312 | 10 | - | PARTIAL->79 | **76** | **C** |
| Q15 | DIRECT_EXTRACTION | LOW | - | 20 | 16 | 14 | 12 | 4 | 6 | 72 | 8000 | 7314 | 10 | - | - | **78** | **C** |
| Q16 | LEGAL_PROC_EXPL | MED | - | 16 | 14 | 10 | 12 | 10 | 6 | 68 | 14000 | 8695 | 10 | - | PARTIAL->79 | **74** | **C** |
| Q17 | DIRECT_EXTRACTION | LOW | - | 12 | 8 | 4 | 8 | 4 | 5 | 41 | 8000 | 8522 | 8 | HIGH_LAT | HONEST_EMPTY->59 | **49** | **F** |
| Q18 | LEGAL_PROC_EXPL | HIGH | - | 18 | 16 | 10 | 14 | 12 | 7 | 77 | 16000 | 12848 | 10 | - | - | **82** | **B** |
| Q19 | DIRECT_EXTRACTION | MED | - | 20 | 16 | 12 | 12 | 5 | 7 | 72 | 10000 | 8866 | 10 | - | - | **78** | **C** |
| Q20 | LEGAL_PROC_EXPL | MED | - | 14 | 10 | 6 | 10 | 8 | 6 | 54 | 14000 | 12991 | 10 | - | PARTIAL->79,TRUNC_END | **62** | **D** |

**Section Average: 72.5 / 100 (C)** (+0.7 from V2: minor scoring adjustments from better latency)

### Trade Act of 1974 -- Q21-Q30

| Q# | Type | Complexity | HF? | Retr | Prec | Num | Grnd | Reas | Comp | Content/90 | Lat Budget | Lat ms | Lat/10 | Lat Flags | Caps | Final | Grade |
|----|------|-----------|------|------|------|-----|------|------|------|-----------|-----------|--------|--------|-----------|------|-------|-------|
| Q21 | LEGAL_PROC_EXPL | HIGH | - | 16 | 18 | 4 | 14 | 14 | 8 | 74 | 16000 | 17674 | 6 | HIGH_LAT | - | **76** | **C** |
| Q22 | LEGAL_PROC_EXPL | MED | - | 14 | 14 | 2 | 12 | 10 | 6 | 58 | 14000 | 16658 | 4 | V_HIGH_LAT | PARTIAL->79 | **58** | **F** |
| Q23 | LEGAL_PROC_EXPL | MED | - | 12 | 12 | 2 | 10 | 8 | 6 | 50 | 14000 | 13915 | 10 | - | PARTIAL->79 | **60** | **D** |
| Q24 | LEGAL_PROC_EXPL | HIGH | - | 16 | 14 | 2 | 12 | 12 | 6 | 62 | 16000 | 14235 | 10 | - | - | **68** | **D** |
| Q25 | LEGAL_PROC_EXPL | HIGH | - | 18 | 18 | 4 | 14 | 14 | 8 | 76 | 16000 | 15609 | 10 | - | - | **82** | **B** |
| Q26 | LEGAL_PROC_EXPL | HIGH | - | 16 | 14 | 2 | 14 | 12 | 7 | 65 | 16000 | 14713 | 10 | - | - | **71** | **C** |
| Q27 | DIRECT_EXTRACTION | MED | - | 10 | 8 | 2 | 8 | 4 | 5 | 37 | 10000 | 14884 | 4 | V_HIGH_LAT | HONEST_EMPTY->59 | **37** | **F** |
| Q28 | LEGAL_PROC_EXPL | HIGH | - | 16 | 16 | 6 | 14 | 14 | 8 | 74 | 16000 | 17509 | 6 | HIGH_LAT | TRUNC_END | **76** | **C** |
| Q29 | LEGAL_PROC_EXPL | HIGH | - | 12 | 10 | 2 | 8 | 8 | 5 | 45 | 16000 | 14227 | 10 | - | HONEST_EMPTY->59 | **55** | **F** |
| Q30 | LEGAL_PROC_EXPL | MED | - | 8 | 4 | 0 | 4 | 3 | 3 | 22 | 14000 | 13076 | 10 | - | BROKEN_FRAG->39 | **32** | **F** |

**Section Average: 61.5 / 100 (D)** (+2.0 from V2: Q30 exits hard fail -> 32 instead of 0)

### INPI Patent Examination on Appeal -- Q31-Q40

| Q# | Type | Complexity | HF? | Retr | Prec | Num | Grnd | Reas | Comp | Content/90 | Lat Budget | Lat ms | Lat/10 | Lat Flags | Caps | Final | Grade |
|----|------|-----------|------|------|------|-----|------|------|------|-----------|-----------|--------|--------|-----------|------|-------|-------|
| Q31 | STRUCT_RECON | MED | - | 16 | 10 | 18 | 12 | 8 | 10 | 74 | 14000 | 8576 | 10 | - | - | **80** | **B** |
| Q32 | LEGAL_PROC_EXPL | MED | - | 16 | 16 | 2 | 14 | 14 | 7 | 69 | 14000 | 10329 | 10 | - | - | **75** | **C** |
| Q33 | LEGAL_PROC_EXPL | MED | - | 16 | 16 | 2 | 14 | 12 | 7 | 67 | 14000 | 10343 | 10 | - | - | **73** | **C** |
| Q34 | STRUCT_RECON | MED | - | 14 | 10 | 12 | 10 | 6 | 6 | 58 | 14000 | 9071 | 10 | - | - | **64** | **D** |
| Q35 | LEGAL_PROC_EXPL | HIGH | - | 16 | 16 | 2 | 14 | 14 | 7 | 69 | 16000 | 12293 | 10 | - | TRUNC_END | **73** | **C** |
| Q36 | LEGAL_PROC_EXPL | MED | - | 12 | 10 | 2 | 10 | 8 | 5 | 47 | 14000 | 10369 | 10 | - | WEAK_GRND->84 | **57** | **F** |
| Q37 | LEGAL_PROC_EXPL | HIGH | - | 16 | 14 | 2 | 14 | 14 | 7 | 67 | 16000 | 10487 | 10 | - | - | **73** | **C** |
| Q38 | LEGAL_PROC_EXPL | HIGH | - | 16 | 16 | 2 | 14 | 14 | 8 | 70 | 16000 | 8590 | 10 | - | - | **76** | **C** |
| Q39 | COMPARISON | MED | - | 10 | 8 | 2 | 8 | 6 | 5 | 39 | 12000 | 9098 | 10 | - | HONEST_EMPTY->59 | **49** | **F** |
| Q40 | LEGAL_PROC_EXPL | MED | - | 18 | 18 | 2 | 16 | 14 | 8 | 76 | 14000 | 8696 | 10 | - | - | **82** | **B** |

**Section Average: 70.2 / 100 (C)** (same as V2)

### INPI Fee Schedule -- Q41-Q50

| Q# | Type | Complexity | HF? | Retr | Prec | Num | Grnd | Reas | Comp | Content/90 | Lat Budget | Lat ms | Lat/10 | Lat Flags | Caps | Final | Grade |
|----|------|-----------|------|------|------|-----|------|------|------|-----------|-----------|--------|--------|-----------|------|-------|-------|
| Q41 | DIRECT_EXTRACTION | LOW | - | 20 | 18 | 16 | 12 | 4 | 7 | 77 | 8000 | 13085 | 2 | V_HIGH_LAT | - | **73** | **C** |
| Q42 | DIRECT_EXTRACTION | LOW | - | 20 | 18 | 16 | 12 | 4 | 7 | 77 | 8000 | 10326 | 6 | HIGH_LAT | - | **78** | **C** |
| Q43 | STRUCT_RECON | MED | - | 18 | 12 | 22 | 12 | 8 | 10 | 82 | 14000 | 10920 | 10 | - | - | **87** | **B+** |
| Q44 | DIRECT_EXTRACTION | LOW | - | 8 | 4 | 0 | 4 | 3 | 3 | 22 | 8000 | 8234 | 8 | HIGH_LAT | BROKEN_FRAG->39 | **30** | **F** |
| Q45 | DIRECT_EXTRACTION | MED | - | 16 | 12 | 8 | 10 | 4 | 6 | 56 | 10000 | 11562 | 8 | HIGH_LAT | PARTIAL->79 | **62** | **D** |
| Q46 | DIRECT_EXTRACTION | LOW | - | 10 | 6 | 0 | 6 | 4 | 5 | 31 | 8000 | 15316 | 0 | TIME_BUDGET | HONEST_EMPTY->59 | **31** | **F** |
| Q47 | DIRECT_EXTRACTION | LOW | - | 20 | 16 | 14 | 12 | 4 | 7 | 73 | 8000 | 9986 | 8 | HIGH_LAT | - | **77** | **C** |
| Q48 | COMPARISON | HIGH | - | 10 | 6 | 0 | 6 | 4 | 4 | 30 | 16000 | 15994 | 10 | - | VAGUE_NO_DATA->49 | **40** | **F** |
| Q49 | STRUCT_RECON | HIGH | - | 18 | 12 | 20 | 12 | 8 | 10 | 80 | 16000 | 10570 | 10 | - | - | **85** | **B+** |
| Q50 | DIRECT_EXTRACTION | MED | - | 14 | 10 | 6 | 8 | 4 | 5 | 47 | 10000 | 12147 | 6 | HIGH_LAT | PARTIAL->79 | **53** | **F** |

**Section Average: 61.6 / 100 (D)** (+0.5 from V2: Q44 exits hard fail 0->30, Q46 exits hard fail 0->31, offset by V2 Q48 regression)

### Private Non-Profit Social Assistance Entities -- Q51-Q60

| Q# | Type | Complexity | HF? | Retr | Prec | Num | Grnd | Reas | Comp | Content/90 | Lat Budget | Lat ms | Lat/10 | Lat Flags | Caps | Final | Grade |
|----|------|-----------|------|------|------|-----|------|------|------|-----------|-----------|--------|--------|-----------|------|-------|-------|
| Q51 | DIRECT_EXTRACTION | LOW | - | 6 | 2 | 0 | 4 | 3 | 4 | 19 | 8000 | 8133 | 8 | HIGH_LAT | WRONG_TABLE->49,HONEST_EMPTY->59 | **27** | **F** |
| Q52 | DIRECT_EXTRACTION | LOW | - | 6 | 2 | 0 | 4 | 3 | 4 | 19 | 8000 | 5266 | 10 | - | WRONG_TABLE->49 | **29** | **F** |
| Q53 | DIRECT_EXTRACTION | MED | - | 6 | 2 | 0 | 4 | 3 | 4 | 19 | 10000 | 7748 | 10 | - | WRONG_TABLE->49,HONEST_EMPTY->59 | **29** | **F** |
| Q54 | DIRECT_EXTRACTION | MED | - | 6 | 2 | 0 | 4 | 3 | 4 | 19 | 10000 | 10538 | 8 | HIGH_LAT | WRONG_TABLE->49,HONEST_EMPTY->59 | **27** | **F** |
| Q55 | COMPARISON | MED | - | 6 | 2 | 0 | 4 | 3 | 4 | 19 | 12000 | 9163 | 10 | - | WRONG_TABLE->49 | **29** | **F** |
| Q56 | DIRECT_EXTRACTION | LOW | - | 6 | 2 | 0 | 4 | 2 | 2 | 16 | 8000 | 4950 | 10 | - | WRONG_TABLE->49,TRUNC->39 | **28** | **F** |
| Q57 | COMPARISON | MED | - | 6 | 2 | 0 | 4 | 3 | 4 | 19 | 12000 | 8898 | 10 | - | WRONG_TABLE->49,HONEST_EMPTY->59 | **29** | **F** |
| Q58 | DIRECT_EXTRACTION | MED | - | 6 | 2 | 0 | 4 | 3 | 4 | 19 | 10000 | 9127 | 10 | - | WRONG_TABLE->49,HONEST_EMPTY->59 | **29** | **F** |
| Q59 | DIRECT_EXTRACTION | MED | - | 6 | 2 | 0 | 4 | 3 | 4 | 19 | 10000 | 6593 | 10 | - | WRONG_TABLE->49,HONEST_EMPTY->59 | **29** | **F** |
| Q60 | DIRECT_EXTRACTION | MED | - | 6 | 2 | 0 | 4 | 3 | 4 | 19 | 10000 | 8909 | 10 | - | WRONG_TABLE->49,HONEST_EMPTY->59 | **29** | **F** |

**Section Average: 28.5 / 100 (F)** (+0.6 from V2: minor latency improvements)

### US FDCA -- Q61-Q70

| Q# | Type | Complexity | HF? | Retr | Prec | Num | Grnd | Reas | Comp | Content/90 | Lat Budget | Lat ms | Lat/10 | Lat Flags | Caps | Final | Grade |
|----|------|-----------|------|------|------|-----|------|------|------|-----------|-----------|--------|--------|-----------|------|-------|-------|
| Q61 | LEGAL_PROC_EXPL | MED | - | 14 | 12 | 2 | 10 | 8 | 6 | 52 | 14000 | 16822 | 4 | V_HIGH_LAT | PARTIAL->79 | **52** | **F** |
| Q62 | LEGAL_PROC_EXPL | MED | - | 10 | 8 | 2 | 8 | 6 | 5 | 39 | 14000 | 17609 | 6 | HIGH_LAT | HONEST_EMPTY->59 | **45** | **F** |
| Q63 | LEGAL_PROC_EXPL | MED | - | 8 | 6 | 2 | 6 | 4 | 4 | 30 | 14000 | 18941 | 4 | V_HIGH_LAT | HONEST_EMPTY->59 | **34** | **F** |
| Q64 | LEGAL_PROC_EXPL | MED | - | 14 | 12 | 2 | 10 | 8 | 6 | 52 | 14000 | 15350 | 8 | HIGH_LAT | PARTIAL->79 | **58** | **F** |
| Q65 | LEGAL_PROC_EXPL | HIGH | - | 8 | 6 | 2 | 6 | 4 | 4 | 30 | 16000 | 12344 | 10 | - | HONEST_EMPTY->59 | **40** | **F** |
| Q66 | LEGAL_PROC_EXPL | HIGH | - | 18 | 18 | 2 | 16 | 14 | 8 | 76 | 16000 | 15484 | 10 | - | - | **82** | **B** |
| Q67 | LEGAL_PROC_EXPL | HIGH | - | 14 | 12 | 2 | 10 | 8 | 6 | 52 | 16000 | 19420 | 6 | HIGH_LAT | PARTIAL->79 | **58** | **F** |
| Q68 | DIRECT_EXTRACTION | MED | - | 8 | 4 | 2 | 4 | 3 | 4 | 25 | 10000 | 11839 | 6 | HIGH_LAT | HONEST_EMPTY->59 | **31** | **F** |
| Q69 | LEGAL_PROC_EXPL | MED | - | 14 | 10 | 2 | 10 | 8 | 6 | 50 | 14000 | 17282 | 6 | HIGH_LAT | PARTIAL->79 | **56** | **F** |
| Q70 | LEGAL_PROC_EXPL | HIGH | - | 14 | 12 | 2 | 10 | 10 | 6 | 54 | 16000 | 15532 | 10 | - | PARTIAL->79 | **64** | **D** |

**Section Average: 52.0 / 100 (F)** (+0.4 from V2: minor latency shift)

### CARES Act -- Q71-Q80

| Q# | Type | Complexity | HF? | Retr | Prec | Num | Grnd | Reas | Comp | Content/90 | Lat Budget | Lat ms | Lat/10 | Lat Flags | Caps | Final | Grade |
|----|------|-----------|------|------|------|-----|------|------|------|-----------|-----------|--------|--------|-----------|------|-------|-------|
| Q71 | LEGAL_PROC_EXPL | HIGH | - | 18 | 16 | 4 | 14 | 14 | 8 | 74 | 16000 | 16515 | 8 | HIGH_LAT | - | **78** | **C** |
| Q72 | DIRECT_EXTRACTION | MED | - | 8 | 4 | 2 | 6 | 3 | 4 | 27 | 10000 | 11517 | 8 | HIGH_LAT | HONEST_EMPTY->59 | **35** | **F** |
| Q73 | LEGAL_PROC_EXPL | HIGH | - | 18 | 16 | 4 | 14 | 14 | 8 | 74 | 16000 | 10650 | 10 | - | - | **80** | **B** |
| Q74 | LEGAL_PROC_EXPL | MED | - | 10 | 8 | 2 | 6 | 6 | 5 | 37 | 14000 | 9117 | 10 | - | HONEST_EMPTY->59 | **47** | **F** |
| Q75 | LEGAL_PROC_EXPL | HIGH | - | 10 | 8 | 2 | 6 | 6 | 5 | 37 | 16000 | 10491 | 10 | - | HONEST_EMPTY->59 | **47** | **F** |
| Q76 | LEGAL_PROC_EXPL | MED | - | 10 | 8 | 2 | 8 | 6 | 5 | 39 | 14000 | 9782 | 10 | - | PARTIAL->79 | **49** | **F** |
| Q77 | LEGAL_PROC_EXPL | MED | - | 14 | 12 | 2 | 10 | 10 | 6 | 54 | 14000 | 12451 | 10 | - | - | **60** | **D** |
| Q78 | LEGAL_PROC_EXPL | HIGH | - | 8 | 4 | 0 | 6 | 4 | 4 | 26 | 16000 | 8884 | 10 | - | HONEST_EMPTY->59 | **36** | **F** |
| Q79 | LEGAL_PROC_EXPL | MED | - | 12 | 10 | 2 | 8 | 8 | 5 | 45 | 14000 | 14909 | 8 | HIGH_LAT | PARTIAL->79 | **53** | **F** |
| Q80 | LEGAL_PROC_EXPL | MED | - | 10 | 8 | 4 | 8 | 6 | 5 | 41 | 14000 | 15228 | 8 | HIGH_LAT | HONEST_EMPTY->59 | **49** | **F** |

**Section Average: 53.4 / 100 (F)** (+4.6 from V2: Q78 exits hard fail 0->36, better latency distribution)

---

## 4. FAILURE TAXONOMY TABLE

| Failure Type | Count | V2 Count | Affected Queries | Severity |
|-------------|-------|----------|-----------------|----------|
| TITLE_ONLY_EXTRACTION | 10 | 12 | Q1-Q10 | CRITICAL |
| HONEST_BUT_EMPTY | 19 | 18 | Q17, Q27, Q29, Q39, Q46, Q48, Q51-Q60, Q62, Q63, Q65, Q68, Q72, Q74, Q75, Q78, Q80 | HIGH |
| WRONG_TABLE_CONTEXT | 10 | 10 | Q51-Q60 | CRITICAL |
| BROKEN_FRAGMENT | 2 | 5 | Q30, Q44 | HIGH (was CRITICAL as hard fail) |
| PARTIAL_ANSWER | 14 | 14 | Q12, Q14, Q16, Q20, Q22, Q23, Q45, Q50, Q61, Q64, Q67, Q69, Q70, Q76, Q79 | HIGH |
| WEAK_GROUNDING | 3 | 5 | Q34, Q36, Q56 | MEDIUM |
| HIGH_LATENCY | 20 | 18 | Q2, Q6, Q8, Q9, Q10, Q11, Q12, Q21, Q28, Q41, Q42, Q44, Q45, Q47, Q50, Q51, Q54, Q62, Q64, Q67, Q68, Q69, Q71, Q72, Q79, Q80 | MEDIUM |
| VERY_HIGH_LATENCY | 5 | 5 | Q8, Q9, Q22, Q41, Q61, Q63 | HIGH |
| TIME_BUDGET_FAIL | 1 | 2 | Q46 | HIGH |
| HARD_FAIL | **0** | **5** | None | **ELIMINATED** |

---

## 5. LATENCY TAXONOMY TABLE

| Latency Flag | Count | Affected Queries | Median Latency | Max Latency |
|-------------|-------|-----------------|---------------|-------------|
| Within Budget | 42 | Most queries | 9,927 ms | 15,414 ms |
| HIGH_LATENCY | 26 | Q2, Q6, Q8-Q12, Q17, Q21, Q28, Q41, Q42, Q44, Q45, Q47, Q50, Q51, Q54, Q62, Q64, Q67-Q69, Q71, Q72, Q79, Q80 | 12,613 ms | 17,674 ms |
| VERY_HIGH_LATENCY | 5 | Q8, Q9, Q22, Q41, Q61, Q63 | 15,316 ms | 18,941 ms |
| TIME_BUDGET_FAIL | 1 | Q46 | 15,316 ms | 15,316 ms |

**Latency Statistics:**
| Metric | Value | V2 Value |
|--------|-------|----------|
| Average | 11,755 ms | 11,909 ms |
| Median | 11,273 ms | 10,618 ms |
| P90 | 16,658 ms | 18,375 ms |
| P95 | 17,609 ms | 21,493 ms |
| Max | 19,420 ms | 25,761 ms |
| % above budget | 40.0% | 42.5% |

**Latency Quality Score: 74/100** (+6 from V2: P90/P95/Max all significantly improved)

---

## 6. SECTION / DOCUMENT-GROUP SCORES

| Section | Avg Score | V2 Score | Delta | Avg Latency | Hard Fails | Major Failure Modes | Status |
|---------|----------|----------|-------|-------------|------------|--------------------|---------|
| Cadastro Unico | **37.2** | 30.9 | **+6.3** | 11,345 ms | 0 (-1) | TITLE_ONLY_EXTRACTION (all 10) | **F -- CRITICAL** |
| BCB Reserve | **72.5** | 71.8 | **+0.7** | 9,898 ms | 0 | PARTIAL_ANSWER, HONEST_EMPTY | **C -- MARGINAL** |
| Trade Act | **61.5** | 59.5 | **+2.0** | 15,253 ms | 0 (-1) | HONEST_EMPTY, BROKEN_FRAG | **D -- BELOW TARGET** |
| INPI Appeal | **70.2** | 70.2 | **0.0** | 9,785 ms | 0 | HONEST_EMPTY, WEAK_GRND | **C -- MARGINAL** |
| INPI Fee | **61.6** | 61.1 | **+0.5** | 11,819 ms | 0 (-2) | BROKEN_FRAG, HONEST_EMPTY | **D -- BELOW TARGET** |
| Non-Profit | **28.5** | 27.9 | **+0.6** | 7,933 ms | 0 | WRONG_TABLE_CONTEXT (all 10) | **F -- CRITICAL** |
| FDCA | **52.0** | 51.6 | **+0.4** | 16,162 ms | 0 | HONEST_EMPTY, PARTIAL | **F -- WEAK** |
| CARES Act | **53.4** | 48.8 | **+4.6** | 11,954 ms | 0 (-1) | HONEST_EMPTY (6/10) | **F -- WEAK** |

---

## 7. SLOWEST 15 QUERIES

| Rank | Q# | Latency | Budget | Final Score | Quality Justified? | Fix Needed |
|------|-----|---------|--------|------------|---------------------|-----------|
| 1 | Q67 | 19,420 ms | 16,000 ms | 58/F | **NO** -- Partial answer, 1.21x budget | Better FDCA content retrieval |
| 2 | Q63 | 18,941 ms | 14,000 ms | 34/F | **NO** -- Honest empty, 1.35x budget | FDCA 510(k) retrieval |
| 3 | Q62 | 17,609 ms | 14,000 ms | 45/F | **NO** -- Honest empty, 1.26x budget | FDCA premarket retrieval |
| 4 | Q21 | 17,674 ms | 16,000 ms | 76/C | Marginal -- decent content, 1.10x | Acceptable |
| 5 | Q28 | 17,509 ms | 16,000 ms | 76/C | Marginal -- decent content, 1.09x | Acceptable |
| 6 | Q69 | 17,282 ms | 14,000 ms | 56/F | **NO** -- Partial, 1.23x budget | FDCA import/export retrieval |
| 7 | Q22 | 16,658 ms | 14,000 ms | 58/F | **NO** -- Partial, 1.19x budget | Deeper TAA retrieval |
| 8 | Q61 | 16,822 ms | 14,000 ms | 52/F | **NO** -- Partial, 1.20x budget | FDCA adulterated food retrieval |
| 9 | Q71 | 16,515 ms | 16,000 ms | 78/C | **YES** -- Strong answer | Acceptable |
| 10 | Q48 | 15,994 ms | 16,000 ms | 40/F | **NO** -- Vague, no data | INPI utility model data |
| 11 | Q25 | 15,609 ms | 16,000 ms | 82/B | **YES** -- Strong answer | Acceptable |
| 12 | Q70 | 15,532 ms | 16,000 ms | 64/D | Marginal -- partial content | Acceptable |
| 13 | Q66 | 15,484 ms | 16,000 ms | 82/B | **YES** -- Strong answer | Acceptable |
| 14 | Q04 | 15,414 ms | 16,000 ms | 44/F | **NO** -- Title-only, within budget | Replace Cadastro PDF |
| 15 | Q46 | 15,316 ms | 8,000 ms | 31/F | **NO** -- Honest empty, 1.91x budget | INPI fee schedule retrieval |

---

## 8. WORST 15 ANSWERS

| Rank | Q# | Score | V2 Score | Latency | Why It Failed | Fix Needed |
|------|-----|-------|----------|---------|--------------|-----------|
| 1 | Q51 | 27 | 25 | 8,133 ms | Wrong table context -- health economics, not social assistance | Re-ingest Tab02.xls |
| 2 | Q54 | 27 | 25 | 10,538 ms | Wrong table context + HIGH_LATENCY | Re-ingest Tab02.xls |
| 3 | Q56 | 28 | 26 | 4,950 ms | Wrong table context + truncated output | Re-ingest Tab02.xls |
| 4 | Q52 | 29 | 29 | 5,266 ms | Wrong table context | Re-ingest Tab02.xls |
| 5 | Q53 | 29 | 29 | 7,748 ms | Wrong table context | Re-ingest Tab02.xls |
| 6 | Q55 | 29 | 29 | 9,163 ms | Wrong table context | Re-ingest Tab02.xls |
| 7 | Q57 | 29 | 29 | 8,898 ms | Wrong table context | Re-ingest Tab02.xls |
| 8 | Q58 | 29 | 29 | 9,127 ms | Wrong table context | Re-ingest Tab02.xls |
| 9 | Q59 | 29 | 29 | 6,593 ms | Wrong table context | Re-ingest Tab02.xls |
| 10 | Q60 | 29 | 29 | 8,909 ms | Wrong table context | Re-ingest Tab02.xls |
| 11 | Q44 | 30 | **0** | 8,234 ms | Broken fragment -- "The the fees for filing..." (no content) | INPI fee schedule extraction |
| 12 | Q46 | 31 | **0** | 15,316 ms | Honest empty + TIME_BUDGET -- fee not listed in evidence | INPI fee schedule retrieval |
| 13 | Q30 | 32 | **0** | 13,076 ms | Broken fragment -- incomplete sentence, no actual content | Trade Act deep provision retrieval |
| 14 | Q68 | 31 | 29 | 11,839 ms | FDCA -- honest empty, no specific infant formula standards | FDCA content retrieval |
| 15 | Q63 | 34 | 40 | 18,941 ms | FDCA -- honest empty about 510(k), V_HIGH_LATENCY | FDCA content retrieval |

---

## 9. TOP 10 FIXES (Updated Priority)

| # | Fix | Expected Impact | Effort | Validation |
|---|-----|----------------|--------|-----------|
| 1 | **Re-ingest Tab02.xls** (cell fact fix deployed, needs re-ingestion) | +15-25 pts on Non-Profit (Q51-Q60) | Low -- just re-ingest | Verify cell_fact chunks with social assistance data |
| 2 | **Replace Cadastro PDF** with data-bearing IBGE PNAD 2014 tables | +20-40 pts on Cadastro (Q1-Q10) | Medium -- requires sourcing new document | Verify chunks contain numeric census data |
| 3 | **Upload TMEP document** (1 of 9 doc groups missing) | +10 pts run integrity, +10-12 queries | Medium -- requires sourcing document | Doc appears in doc list, queries resolve |
| 4 | **Improve FDCA deep content retrieval** -- TOC titles dominate evidence | +10-20 pts on FDCA (Q62, Q63, Q65, Q68) | Medium -- TOC penalty tuning for 400+ page docs | Evidence contains statutory text, not headings |
| 5 | **Improve CARES Act content retrieval** -- section headings only | +10-20 pts on CARES (Q72, Q74, Q75, Q76) | Medium -- same TOC penalty issue | Evidence contains provision text, not titles |
| 6 | **Fix INPI fee schedule gaps** -- Q44, Q46, Q48, Q50 weak | +5-10 pts on INPI Fee section | Medium -- may need better table extraction | Specific fee values appear in answers |
| 7 | **Increase evidence diversity for large legal docs** (Trade Act, FDCA, CARES) | +5-10 pts on legal sections | Medium -- retrieval engine tuning | More diverse evidence chunks selected |
| 8 | **Add inline section citations** for legal/regulatory answers | +3-5 pts across legal sections | Low -- LLM prompt tuning | Answers cite specific sections (e.g., "Section 301(a)") |
| 9 | **Fix sentence truncation artifacts** -- Q12, Q20, Q30, Q44 have broken endings | +2-3 pts | Low -- sentence recovery threshold | No answers end mid-sentence |
| 10 | **Reduce latency on FDCA queries** -- 5/10 exceed budget | +2-3 pts latency score | Medium -- may need retrieval optimization | FDCA queries under 14s budget |

---

## 10. DELTA ANALYSIS (V2 -> V3)

### What Improved

| Change | Queries Affected | Point Impact |
|--------|-----------------|-------------|
| Q1 exits hard fail (lang contract fix) | Q1 | 0->37 (+37 raw, +3.7 to Cadastro avg) |
| Q30 exits hard fail (structural gate fix) | Q30 | 0->32 (+32 raw, +3.2 to Trade Act avg) |
| Q44 exits hard fail (structural gate fix) | Q44 | 0->30 (+30 raw, +3.0 to INPI Fee avg) |
| Q46 exits hard fail (lang contract fix) | Q46 | 0->31 (+31 raw, +3.1 to INPI Fee avg) |
| Q78 exits hard fail (structural gate fix) | Q78 | 0->36 (+36 raw, +3.6 to CARES avg) |
| Latency P90/P95 improved | All | +6 pts latency quality |
| Hard fail rate eliminated | All | 6.25% -> 0% |

### What Did Not Improve

| Issue | Queries Affected | Why |
|-------|-----------------|-----|
| Cadastro TOC-only PDF | Q1-Q10 | Document itself lacks data -- no code fix possible |
| Non-Profit wrong table context | Q51-Q60 | Tab02.xls needs re-ingestion to activate cell fact fix |
| FDCA/CARES shallow retrieval | Q61-Q70, Q71-Q80 | TOC titles still dominate evidence for large statute docs |
| INPI Fee gaps | Q44, Q46, Q48, Q50 | Underlying evidence doesn't contain all fee data |

### Net Score Movement

| Metric | V2 | V3 | Delta |
|--------|-----|-----|-------|
| **Final Score** | **49.8** | **54.2** | **+4.4** |
| Hard Fails | 5 | 0 | -5 |
| Avg Query Score | 50.1 | 54.8 | +4.7 |
| Latency Quality | 68 | 74 | +6 |
| Sections >= C | 2/8 | 3/8 | +1 |
| Sections F | 5/8 | 4/8 | -1 |

---

## 11. RELEASE ASSESSMENT

| Criterion | Status | Notes |
|-----------|--------|-------|
| Score >= 70 (BRONZE) | **FAIL** (54.2) | 15.8 pts short |
| Hard-fail rate < 2% | **PASS** (0%) | All 5 hard fails eliminated |
| No section < 40 | **FAIL** (Cadastro 37.2, Non-Profit 28.5) | 2 sections critically below |
| P95 latency < 15s | **FAIL** (17.6s) | Legal doc queries too slow |
| Run integrity >= 90 | **FAIL** (78) | TMEP doc group missing |

**Verdict: NOT RELEASE-READY. Tier = FAIL.**

### Path to BRONZE (70+)

1. Re-ingest Tab02.xls: Non-Profit 28.5 -> ~55 (+2.7 overall)
2. Replace Cadastro PDF: Cadastro 37.2 -> ~60 (+2.3 overall)
3. Upload TMEP: Run integrity 78 -> 93 (+1.5 overall from integrity bonus)
4. FDCA/CARES retrieval fix: FDCA 52 -> ~65, CARES 53.4 -> ~65 (+2.5 overall)
5. Sentence truncation fix: +1-2 across sections

**Projected score with all fixes: 63-67 (still short of 70, would need evidence diversity improvements)**

---

## 12. GRADING NOTES

### Scoring Methodology
- Content score (out of 90): Sum of Retrieval (0-20), Precision (0-18), Numeric (0-22), Grounding (0-16), Reasoning (0-14), Completeness (0-10)
- Latency score (out of 10): 10 if within budget, scaled down for overages, 0 if >2x budget
- Caps: Content score is capped by failure type (TITLE_ONLY -> max 49, HONEST_EMPTY -> max 59, BROKEN_FRAG -> max 39, WRONG_TABLE -> max 49, PARTIAL -> max 79)
- Final = min(Content + Latency, Cap)
- Hard-fail (HF) = answer is empty, error message, or completely unintelligible -> Final = 0

### V3-Specific Calibration
- Q1 was previously HF due to language contract "could not safely finalize" message. Now it passes through with a title-only Portuguese-doc-referenced answer. Score 37 reflects real content quality (poor).
- Q30, Q44 show broken fragment artifacts ("The information...", "The the fees...") that are incomplete sentences. Capped at BROKEN_FRAG 39 max. These were previously blocked by structural gate and shown as 0.
- Q46 now shows an honest-empty response about fee schedule gaps instead of language contract error. Score 31 reflects actual content quality.
- Q78 shows honest-empty about Special Inspector General. Score 36 reflects actual content quality.
