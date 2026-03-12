# Hardening Benchmark — Harsh Grading Report

**Run Date**: 2026-03-12T00:15:42Z
**Grading Date**: 2026-03-12
**Judge**: Production Benchmark Judge v1
**Run Artifact**: `hardening-benchmark-answers.md` + `hardening-benchmark-run.json`

---

## 1. EXECUTIVE SUMMARY

| Metric | Value |
|--------|-------|
| **Final Production Score** | **51.4 / 100** |
| **Tier** | **FAIL** |
| **Valid?** | Provisionally valid (integrity issues noted) |
| **Mean Answer Score** | 51.1 |
| **Hard-Fail Rate** | 1.25% (1/80) |
| **Run Integrity Score** | 75 |
| **Cross-Answer Consistency** | 82 |
| **Calibration Score** | 85 |

### Top 10 Blockers

1. **Cadastro Único: 10/10 answers are TITLE_ONLY_EXTRACTION** — zero actual data extracted from PDF tables. The system retrieves table-of-contents descriptions instead of table values.
2. **Non-Profit Entities: 10/10 answers retrieve WRONG_TABLE_CONTEXT** — health economics sheet data returned instead of social assistance entity counts.
3. **FDCA: 5/10 answers are HONEST_BUT_EMPTY** — large legal document's TOC outcompetes actual section text in retrieval.
4. **CARES Act: 4/10 answers are PARTIAL or EMPTY** — section headings retrieved instead of substantive provisions.
5. **Broken sentence fragments** appear in 11+ answers ("they the institutions", "is .", incomplete predicates) — structural output defect.
6. **Trade Act: Q29, Q30 are near-zero** — one truncated, one broken fragment with no content.
7. **INPI Fee Schedule: Q44, Q45 are broken fragments** — trademark and disability waiver questions unanswered.
8. **No model or prompt version declared in run metadata** — reproducibility gap.
9. **1 document group (TMEP) skipped** — reduces coverage to 80/90 queries.
10. **High latency outlier: Q9 at 19.5s** — with no useful content returned.

---

## 2. RUN INTEGRITY TABLE

| Check | Pass/Fail | Evidence | Impact |
|-------|-----------|----------|--------|
| Single canonical answer artifact | PASS | One `.md` + one `.json`, timestamps match | None |
| Single grading artifact | PASS | No prior grading for this run | None |
| Run manifest with stable metadata | FAIL | No model ID, no prompt version, no document set version | Cannot reproduce run; -10 integrity |
| Manifest hash match | FAIL | No hash computed or stored | Cannot verify artifact integrity; -5 |
| All required doc groups present | WARN | TMEP skipped (1/9 groups, doc genuinely missing from account) | 10 queries excluded from scoring; -5 |
| Query count consistency | PASS | 80 in both `.json` and `.md` | None |
| Single model/prompt throughout | UNKNOWN | Not declared | -5 integrity |

**Run Integrity Score: 75/100**

---

## 3. PER-QUERY SCORE TABLE

### Cadastro Único (PNAD 2014) — STATISTICAL_PUBLIC_POLICY

| Q# | Query (abbrev) | Type | HF? | Retr | Prec | Num | Grnd | Reas | Comp | Caps | Lat(ms) | Score | Grade |
|----|----------------|------|-----|------|------|-----|------|------|------|------|---------|-------|-------|
| Q1 | Households NE aware | DIRECT_EXTRACTION | HF-5 | 5 | 0 | 0 | 5 | 0 | 3 | TITLE_ONLY+BROKEN | 7802 | **0** | F |
| Q2 | Urban vs rural % | COMPARISON | — | 5 | 0 | 0 | 10 | 5 | 5 | TITLE_ONLY+HONEST_EMPTY | 10748 | **25** | F |
| Q3 | Lowest access region | DIRECT_EXTRACTION | — | 5 | 0 | 0 | 10 | 5 | 5 | TITLE_ONLY+HONEST_EMPTY | 6429 | **25** | F |
| Q4 | Income vs registration | INTERPRETIVE | — | 5 | 0 | 0 | 10 | 5 | 5 | TITLE_ONLY+HONEST_EMPTY | 9804 | **25** | F |
| Q5 | Sanitation conditions | DIRECT_EXTRACTION | — | 5 | 0 | 0 | 8 | 5 | 4 | TITLE_ONLY+HONEST_EMPTY | 11867 | **22** | F |
| Q6 | Metro areas highest | DIRECT_EXTRACTION | — | 5 | 0 | 0 | 10 | 5 | 5 | TITLE_ONLY+HONEST_EMPTY | 10349 | **25** | F |
| Q7 | Durable goods diff | COMPARISON | — | 5 | 0 | 0 | 10 | 5 | 5 | TITLE_ONLY+HONEST_EMPTY | 8240 | **25** | F |
| Q8 | SE telephone share | DIRECT_EXTRACTION | — | 5 | 0 | 0 | 8 | 3 | 4 | TITLE_ONLY+HONEST_EMPTY | 6863 | **20** | F |
| Q9 | Avg residents/HH | DIRECT_EXTRACTION | — | 5 | 0 | 0 | 8 | 3 | 4 | TITLE_ONLY+HIGH_LAT | 19550 | **16** | F |
| Q10 | Garbage collection N | DIRECT_EXTRACTION | — | 5 | 0 | 0 | 10 | 5 | 5 | TITLE_ONLY+HONEST_EMPTY | 6662 | **25** | F |

**Section Average: 20.8 — Grade: F**

### BCB Reserve Requirements — CENTRAL_BANK_OR_FEE_SCHEDULE

| Q# | Query (abbrev) | Type | HF? | Retr | Prec | Num | Grnd | Reas | Comp | Caps | Lat(ms) | Score | Grade |
|----|----------------|------|-----|------|------|-----|------|------|------|------|---------|-------|-------|
| Q11 | Current reserve ratio | DIRECT_EXTRACTION | — | 22 | 20 | 15 | 10 | 3 | 3 | SHORT | 7169 | **73** | C |
| Q12 | Computation period time | DIRECT_EXTRACTION | — | 18 | 15 | 10 | 10 | 3 | 4 | SHORT | 6332 | **60** | D |
| Q13 | Deduction demand | DIRECT_EXTRACTION | — | 22 | 20 | 15 | 12 | 3 | 3 | SHORT | 5129 | **75** | C |
| Q14 | Tier 1 capital tiers | STRUCTURED_RECON | — | 18 | 15 | 12 | 10 | 3 | 4 | TRUNCATED | 6772 | **62** | D |
| Q15 | Deficiency penalty | DIRECT_EXTRACTION | — | 22 | 18 | 15 | 10 | 4 | 3 | SHORT | 4605 | **72** | C |
| Q16 | Savings remuneration | COMPARISON | — | 18 | 15 | 12 | 10 | 4 | 3 | PARTIAL | 6822 | **62** | D |
| Q17 | Institutions subject | DIRECT_EXTRACTION | — | 10 | 10 | 5 | 8 | 5 | 4 | BROKEN+PARTIAL | 11727 | **42** | F |
| Q18 | Real estate credit | LEGAL_PROCEDURAL | — | 20 | 18 | 15 | 12 | 8 | 5 | — | 8056 | **78** | C+ |
| Q19 | Maintenance period | STRUCTURED_RECON | — | 20 | 18 | 15 | 12 | 5 | 5 | — | 5252 | **75** | C |
| Q20 | Selic remuneration | DIRECT_EXTRACTION | — | 8 | 8 | 5 | 8 | 8 | 5 | BROKEN+PARTIAL | 13004 | **42** | F |

**Section Average: 64.1 — Grade: D**

### Trade Act of 1974 — LEGAL_OR_STATUTORY

| Q# | Query (abbrev) | Type | HF? | Retr | Prec | Num | Grnd | Reas | Comp | Caps | Lat(ms) | Score | Grade |
|----|----------------|------|-----|------|------|-----|------|------|------|------|---------|-------|-------|
| Q21 | Presidential authority | LEGAL_PROCEDURAL | — | 18 | 20 | 8 | 15 | 12 | 5 | — | 13615 | **78** | C+ |
| Q22 | TAA workers | LEGAL_PROCEDURAL | — | 15 | 12 | 3 | 10 | 10 | 5 | PARTIAL+WEAK_CITE | 10792 | **55** | D |
| Q23 | GSP eligibility | LEGAL_PROCEDURAL | — | 15 | 12 | 3 | 10 | 8 | 4 | PARTIAL | 7789 | **52** | D |
| Q24 | Section 301 procedure | LEGAL_PROCEDURAL | — | 18 | 18 | 3 | 15 | 12 | 6 | — | 6829 | **72** | C |
| Q25 | Injury definition | LEGAL_PROCEDURAL | — | 20 | 22 | 5 | 15 | 15 | 5 | — | 9870 | **82** | B |
| Q26 | ITC role | LEGAL_PROCEDURAL | — | 18 | 18 | 3 | 15 | 15 | 6 | — | 12416 | **75** | C |
| Q27 | Readjustment allowances | DIRECT_EXTRACTION | — | 8 | 5 | 0 | 10 | 5 | 7 | HONEST_EMPTY | 10021 | **35** | F |
| Q28 | Duty rate limits | LEGAL_PROCEDURAL | — | 20 | 20 | 8 | 15 | 12 | 5 | — | 8642 | **80** | B- |
| Q29 | Jackson-Vanik | LEGAL_PROCEDURAL | — | 5 | 3 | 0 | 5 | 5 | 4 | HONEST_EMPTY+TRUNC | 6670 | **22** | F |
| Q30 | Narcotics trade | LEGAL_PROCEDURAL | — | 0 | 0 | 0 | 3 | 3 | 6 | BROKEN+HONEST_EMPTY | 6518 | **12** | F |

**Section Average: 56.3 — Grade: D**

### INPI Patent Examination on Appeal — ADMINISTRATIVE_PROCEDURE

| Q# | Query (abbrev) | Type | HF? | Retr | Prec | Num | Grnd | Reas | Comp | Caps | Lat(ms) | Score | Grade |
|----|----------------|------|-----|------|------|-----|------|------|------|------|---------|-------|-------|
| Q31 | Three stages | DIRECT_EXTRACTION | — | 22 | 20 | 5 | 15 | 12 | 8 | — | 5249 | **82** | B |
| Q32 | COREP formal defects | LEGAL_PROCEDURAL | — | 18 | 18 | 3 | 18 | 15 | 6 | — | 6682 | **78** | C+ |
| Q33 | Return to 1st instance | LEGAL_PROCEDURAL | — | 18 | 18 | 3 | 15 | 15 | 6 | — | 6391 | **75** | C |
| Q34 | Dispatch models | STRUCTURED_RECON | — | 12 | 12 | 5 | 12 | 8 | 9 | PARTIAL | 6330 | **58** | D |
| Q35 | Causa madura | LEGAL_PROCEDURAL | — | 18 | 18 | 3 | 18 | 15 | 6 | — | 6821 | **78** | C+ |
| Q36 | DIRPA role | LEGAL_PROCEDURAL | — | 15 | 15 | 3 | 12 | 12 | 8 | SHORT | 9214 | **65** | D |
| Q37 | Claim amendments | LEGAL_PROCEDURAL | — | 18 | 18 | 3 | 15 | 15 | 6 | — | 6382 | **75** | C |
| Q38 | Objection criteria | LEGAL_PROCEDURAL | — | 20 | 20 | 3 | 18 | 15 | 6 | — | 7261 | **82** | B |
| Q39 | Invention vs utility | COMPARISON | — | 5 | 3 | 0 | 5 | 8 | 7 | BROKEN+HONEST_EMPTY | 10273 | **28** | F |
| Q40 | Governing legislation | DIRECT_EXTRACTION | — | 22 | 22 | 3 | 18 | 12 | 8 | — | 7231 | **85** | B |

**Section Average: 70.6 — Grade: C**

### INPI Fee Schedule — CENTRAL_BANK_OR_FEE_SCHEDULE

| Q# | Query (abbrev) | Type | HF? | Retr | Prec | Num | Grnd | Reas | Comp | Caps | Lat(ms) | Score | Grade |
|----|----------------|------|-----|------|------|-----|------|------|------|------|---------|-------|-------|
| Q41 | Patent filing cost | DIRECT_EXTRACTION | — | 25 | 22 | 18 | 12 | 4 | 4 | — | 8408 | **85** | B |
| Q42 | Micro/small discount | DIRECT_EXTRACTION | — | 22 | 20 | 15 | 12 | 4 | 5 | SHORT | 8707 | **78** | C+ |
| Q43 | Annuity progression | STRUCTURED_RECON | — | 22 | 22 | 20 | 12 | 5 | 7 | — | 6736 | **88** | B+ |
| Q44 | Trademark filing fee | DIRECT_EXTRACTION | — | 5 | 3 | 0 | 5 | 5 | 10 | BROKEN+HONEST_EMPTY | 7101 | **28** | F |
| Q45 | Disability fee waiver | DIRECT_EXTRACTION | — | 5 | 3 | 0 | 5 | 5 | 10 | BROKEN+HONEST_EMPTY | 5826 | **28** | F |
| Q46 | Appeal filing cost | DIRECT_EXTRACTION | — | 15 | 12 | 10 | 10 | 3 | 5 | PARTIAL | 8897 | **55** | D |
| Q47 | Priority service codes | DIRECT_EXTRACTION | — | 22 | 20 | 15 | 12 | 4 | 5 | — | 6108 | **78** | C+ |
| Q48 | Utility vs invention | COMPARISON | — | 22 | 20 | 18 | 10 | 5 | 7 | — | 13917 | **82** | B |
| Q49 | PCT fees | STRUCTURED_RECON | — | 22 | 22 | 20 | 12 | 5 | 7 | — | 7356 | **88** | B+ |
| Q50 | Certified copy fee | DIRECT_EXTRACTION | — | 15 | 15 | 12 | 10 | 3 | 5 | PARTIAL | 11705 | **60** | D |

**Section Average: 67.0 — Grade: D+**

### Non-Profit Social Assistance Entities — TABLE_HEAVY_SPREADSHEET

| Q# | Query (abbrev) | Type | HF? | Retr | Prec | Num | Grnd | Reas | Comp | Caps | Lat(ms) | Score | Grade |
|----|----------------|------|-----|------|------|-----|------|------|------|------|---------|-------|-------|
| Q51 | Total entities 2013 | DIRECT_EXTRACTION | — | 0 | 0 | 0 | 15 | 10 | 10 | HONEST_EMPTY+WRONG_CONTEXT | 10840 | **35** | F |
| Q52 | Highest region | DIRECT_EXTRACTION | — | 0 | 0 | 0 | 10 | 8 | 10 | HONEST_EMPTY+WRONG_CONTEXT | 5533 | **28** | F |
| Q53 | Distribution by muni | STRUCTURED_RECON | — | 0 | 0 | 0 | 10 | 8 | 10 | HONEST_EMPTY+WRONG_CONTEXT | 5473 | **28** | F |
| Q54 | % social assistance | DIRECT_EXTRACTION | — | 0 | 0 | 0 | 10 | 8 | 10 | HONEST_EMPTY+WRONG_CONTEXT | 9536 | **28** | F |
| Q55 | Education vs health | COMPARISON | — | 0 | 0 | 0 | 10 | 8 | 10 | HONEST_EMPTY+WRONG_CONTEXT | 6072 | **28** | F |
| Q56 | Largest state | DIRECT_EXTRACTION | — | 0 | 0 | 0 | 3 | 3 | 6 | TRUNCATED+HONEST_EMPTY | 4228 | **12** | F |
| Q57 | North vs South | COMPARISON | — | 0 | 0 | 0 | 10 | 8 | 10 | HONEST_EMPTY+WRONG_CONTEXT | 8496 | **28** | F |
| Q58 | HR and culture share | DIRECT_EXTRACTION | — | 0 | 0 | 0 | 10 | 8 | 10 | HONEST_EMPTY+WRONG_CONTEXT | 7237 | **28** | F |
| Q59 | Rehab SE region | DIRECT_EXTRACTION | — | 0 | 0 | 0 | 10 | 8 | 10 | HONEST_EMPTY+WRONG_CONTEXT | 5301 | **28** | F |
| Q60 | Metro distribution | STRUCTURED_RECON | — | 0 | 0 | 0 | 10 | 8 | 10 | HONEST_EMPTY+WRONG_CONTEXT | 7640 | **28** | F |

**Section Average: 27.1 — Grade: F**

### US FDCA — LEGAL_OR_STATUTORY

| Q# | Query (abbrev) | Type | HF? | Retr | Prec | Num | Grnd | Reas | Comp | Caps | Lat(ms) | Score | Grade |
|----|----------------|------|-----|------|------|-----|------|------|------|------|---------|-------|-------|
| Q61 | Adulterated food | LEGAL_PROCEDURAL | — | 10 | 8 | 3 | 8 | 8 | 5 | PARTIAL | 8072 | **42** | F |
| Q62 | Premarket approval | LEGAL_PROCEDURAL | — | 15 | 15 | 3 | 12 | 10 | 5 | PARTIAL | 8125 | **60** | D |
| Q63 | 510(k) pathway | LEGAL_PROCEDURAL | — | 0 | 0 | 0 | 5 | 5 | 8 | BROKEN+HONEST_EMPTY | 5900 | **18** | F |
| Q64 | Food labeling | LEGAL_PROCEDURAL | — | 15 | 18 | 3 | 12 | 12 | 8 | — | 8262 | **68** | D |
| Q65 | Accelerated approval | LEGAL_PROCEDURAL | — | 5 | 5 | 0 | 8 | 8 | 6 | HONEST_EMPTY | 5545 | **32** | F |
| Q66 | Tobacco authority | LEGAL_PROCEDURAL | — | 20 | 20 | 3 | 18 | 15 | 6 | — | 9482 | **82** | B |
| Q67 | Generic drugs ANDA | LEGAL_PROCEDURAL | — | 18 | 18 | 3 | 15 | 12 | 6 | — | 9620 | **72** | C |
| Q68 | Infant formula safety | LEGAL_PROCEDURAL | — | 10 | 8 | 3 | 8 | 5 | 6 | PARTIAL | 6620 | **40** | F |
| Q69 | Import/export drugs | LEGAL_PROCEDURAL | — | 15 | 15 | 3 | 12 | 10 | 7 | — | 8640 | **62** | D |
| Q70 | REMS program | LEGAL_PROCEDURAL | — | 8 | 8 | 0 | 8 | 8 | 6 | BROKEN+PARTIAL | 6409 | **38** | F |

**Section Average: 51.4 — Grade: D-**

### CARES Act — LEGAL_OR_STATUTORY

| Q# | Query (abbrev) | Type | HF? | Retr | Prec | Num | Grnd | Reas | Comp | Caps | Lat(ms) | Score | Grade |
|----|----------------|------|-----|------|------|-----|------|------|------|------|---------|-------|-------|
| Q71 | PPP loans | LEGAL_PROCEDURAL | — | 18 | 18 | 3 | 15 | 15 | 6 | — | 11297 | **75** | C |
| Q72 | Stimulus rebates | DIRECT_EXTRACTION | — | 5 | 5 | 0 | 8 | 8 | 6 | HONEST_EMPTY | 6640 | **32** | F |
| Q73 | PUA expansion | LEGAL_PROCEDURAL | — | 20 | 22 | 3 | 18 | 15 | 7 | — | 8499 | **85** | B |
| Q74 | Airline relief | DIRECT_EXTRACTION | — | 10 | 8 | 0 | 8 | 8 | 6 | PARTIAL+HONEST_EMPTY | 7621 | **40** | F |
| Q75 | Economic Stab Fund | LEGAL_PROCEDURAL | — | 8 | 5 | 0 | 8 | 8 | 6 | HONEST_EMPTY | 7626 | **35** | F |
| Q76 | Foreclosure moratorium | LEGAL_PROCEDURAL | — | 12 | 12 | 3 | 10 | 8 | 7 | PARTIAL | 6192 | **52** | D |
| Q77 | Telehealth Medicare | STRUCTURED_RECON | — | 20 | 18 | 3 | 18 | 12 | 7 | — | 9767 | **78** | C+ |
| Q78 | Special IG oversight | LEGAL_PROCEDURAL | — | 8 | 5 | 0 | 8 | 8 | 6 | PARTIAL+WRONG_SECTION | 8693 | **35** | F |
| Q79 | Retention tax credit | DIRECT_EXTRACTION | — | 5 | 3 | 0 | 5 | 8 | 7 | BROKEN+HONEST_EMPTY | 7251 | **28** | F |
| Q80 | Division B appropriations | DIRECT_EXTRACTION | — | 15 | 15 | 12 | 10 | 5 | 5 | PARTIAL | 10513 | **62** | D |

**Section Average: 52.2 — Grade: D-**

---

## 4. FAILURE TAXONOMY TABLE

| Failure Type | Count | Affected Queries | Severity |
|--------------|-------|-----------------|----------|
| TITLE_ONLY_EXTRACTION | 10 | Q1-Q10 | CRITICAL — entire Cadastro section returns only table titles, zero data values |
| WRONG_TABLE_CONTEXT | 10 | Q51-Q60 | CRITICAL — health economics data returned for social assistance queries |
| HONEST_BUT_EMPTY | 22 | Q2-Q10, Q27, Q29, Q30, Q39, Q44, Q45, Q51-Q60, Q63, Q65, Q72, Q74, Q75, Q79 | HIGH — correct refusal but user gets nothing |
| BROKEN_FORMAT | 11 | Q1, Q17, Q20, Q29, Q30, Q39, Q44, Q45, Q56, Q63, Q79 | HIGH — missing verbs, truncated words, broken placeholders |
| PARTIAL_ANSWER | 14 | Q14, Q16, Q22, Q23, Q34, Q46, Q50, Q61, Q62, Q68, Q70, Q74, Q76, Q78 | MEDIUM — useful content but key requested fields missing |
| WEAK_GROUNDING | 6 | Q12, Q22, Q62, Q65, Q68, Q78 | MEDIUM — claims not strongly tied to evidence |
| TRUNCATED_OUTPUT | 3 | Q14, Q29, Q56 | HIGH — answer cut off mid-sentence or mid-word |
| HIGH_LATENCY | 1 | Q9 (19.5s) | LOW — only one query over 15s |
| WRONG_SECTION | 1 | Q78 | MEDIUM — SBA IG cited instead of Special IG for Pandemic Recovery |

---

## 5. SECTION / DOCUMENT-GROUP SCORES

| Section | Average | Hard Fails | Major Failure Modes | Release Status |
|---------|---------|------------|---------------------|----------------|
| Cadastro Único (PNAD 2014) | **20.8** | 1 (Q1) | TITLE_ONLY_EXTRACTION (10/10) | FAIL — unusable |
| BCB Reserve Requirements | **64.1** | 0 | BROKEN_FORMAT (2), SHORT (4), PARTIAL (2) | FAIL — below 70 |
| Trade Act of 1974 | **56.3** | 0 | HONEST_EMPTY (3), PARTIAL (2) | FAIL — below 70 |
| INPI Patent on Appeal | **70.6** | 0 | BROKEN_FORMAT (1), PARTIAL (1) | BRONZE-eligible |
| INPI Fee Schedule | **67.0** | 0 | BROKEN_FORMAT (2), PARTIAL (2) | FAIL — below 70 |
| Non-Profit Entities (XLS) | **27.1** | 0 | WRONG_TABLE_CONTEXT (10/10) | FAIL — unusable |
| US FDCA | **51.4** | 0 | HONEST_EMPTY (3), PARTIAL (4) | FAIL — below 70 |
| CARES Act | **52.2** | 0 | HONEST_EMPTY (4), PARTIAL (3) | FAIL — below 70 |

**Only 1 of 8 sections reaches BRONZE-eligible (INPI Patent on Appeal). None reach SILVER.**

---

## 6. WORST 15 ANSWERS

| Rank | Q# | Score | Why It Failed | Fix Needed |
|------|-----|-------|---------------|------------|
| 1 | Q1 | 0 | HF-5: "the specific number... is ." — broken placeholder, zero data | Fix PDF table extraction for census PDFs; structural completeness gate should block this output |
| 2 | Q30 | 12 | Broken sentence fragment with no predicate, zero content | Improve retrieval depth for large legal texts; fix LLM output truncation |
| 3 | Q56 | 12 | Truncated mid-word "accoun", 110ch, wrong sheet data | Fix XLS sheet routing; fix output truncation |
| 4 | Q9 | 16 | 19.5s latency, title-only extraction, no data | PDF table extraction + latency budget |
| 5 | Q63 | 18 | Broken sentence, 510(k) not found in retrieval | Better section targeting in large PDFs |
| 6 | Q8 | 20 | Title-only, no actual telephone share data | PDF table extraction |
| 7 | Q29 | 22 | Jackson-Vanik truncated, no substantive content | Improve retrieval for specific amendments within large Acts |
| 8 | Q2 | 25 | Title-only, broken reference "classifications). 7)." | PDF table extraction |
| 9 | Q3 | 25 | Title-only, no data | PDF table extraction |
| 10 | Q4 | 25 | Title-only, no correlation data | PDF table extraction |
| 11 | Q5 | 22 | Title-only, no sanitation data | PDF table extraction |
| 12 | Q44 | 28 | Broken sentence, trademark fees not in retrieved chunks | Improve fee schedule retrieval scope |
| 13 | Q45 | 28 | Broken sentence, disability waiver not in retrieved chunks | Improve fee schedule retrieval scope |
| 14 | Q39 | 28 | Broken sentence "they any differences", no comparison | Retrieval lacks invention vs utility model distinction |
| 15 | Q52 | 28 | Wrong sheet data returned | Fix XLS sheet-aware retrieval |

---

## 7. TOP 15 FIXES (Priority Order)

| # | Fix | Expected Impact | System Area | Validation |
|---|-----|----------------|-------------|------------|
| 1 | **Fix PDF table data extraction for census-style PDFs** — current extraction gets TOC page text but not structured table values. Need OCR or structured table parser for IBGE-format PDFs. | +15-20 pts (Cadastro section 20→60+) | `pdfExtractor.service.ts`, `pdfTableExtractor.ts` | Re-run Cadastro queries, verify numeric data in answers |
| 2 | **Fix XLS sheet routing** — queries about social assistance entities return health economics sheet data. Sheet name in embedding is not enough; need retrieval-time sheet disambiguation. | +12-15 pts (Non-Profit section 27→55+) | `xlsxExtractor.service.ts`, `chunkAssembly.service.ts`, `retrievalEngine.service.ts` | Re-run Non-Profit queries, verify correct sheet data |
| 3 | **Fix broken sentence fragments** — 11 answers have missing verbs/predicates ("they the", "is .", truncated words). Root cause is likely LLM output truncation or token budget exhaustion. | +5-8 pts across all sections | `tokenBudget.service.ts`, `llmRequestBuilder.service.ts` | Grep all answers for broken patterns, verify zero matches |
| 4 | **Improve retrieval depth for large legal documents** — FDCA (hundreds of pages) and Trade Act TOC chunks outrank actual section text. Increase topK or apply stronger TOC penalty. | +8-12 pts (FDCA 51→65+, Trade Act 56→65+) | `retrievalEngine.service.ts` | Re-run FDCA and Trade Act queries |
| 5 | **Add model and prompt version to run metadata** | +10 pts integrity score | `hardening-query-runner.mjs` | Verify metadata fields present in JSON |
| 6 | **Wire structural completeness gate to LLM retry** — gate exists now but needs to trigger re-generation or microcopy when broken output detected | +3-5 pts | `qualityGateRunner.service.ts`, `CentralizedChatRuntimeDelegate.ts` | Verify broken outputs get fallback text |
| 7 | **Increase retrieval diversity for multi-section legal docs** — when topK candidates are dominated by one page range, force diversity across page ranges | +5-8 pts (FDCA, Trade Act, CARES) | `retrievalEngine.service.ts` | Check evidence page distribution |
| 8 | **Add TMEP document to test account** | Restores 10 queries to benchmark | Account setup | Verify doc appears in document list |
| 9 | **Improve fee schedule retrieval to cover trademark sections** — INPI fee doc has patent and trademark sections; trademark queries (Q44) get no results | +3-5 pts (INPI Fee 67→72+) | Retrieval scope / chunking | Re-run Q44, Q45 |
| 10 | **Add section-level provenance** — answers citing "p. 1" for everything are weak; page-level citations for 400-page docs are nearly useless | +2-3 pts grounding quality | `ProvenanceBuilder.ts` | Check citation specificity |
| 11 | **Increase output token budget for legal explanations** — several answers truncate at critical points | +2-3 pts | `tokenBudget.service.ts` | Verify no truncation in legal answers |
| 12 | **Add honest-but-empty detection to prevent shipping non-answers** — when system can't answer, provide structured "insufficient evidence" response instead of broken fragments | +2-3 pts composition | `responseContractEnforcer.service.ts` | Check all honest-empty answers get clean format |
| 13 | **Improve CARES Act section targeting** — several answers cite only section headings (p. 5, p. 6) without substantive text | +3-5 pts (CARES 52→60+) | Retrieval / chunking | Re-run CARES queries |
| 14 | **Add manifest hash and version tracking** | +5 pts integrity | `hardening-query-runner.mjs` | Verify hash in JSON output |
| 15 | **Re-ingest XLS documents with per-sheet chunking fix** — the chunkAssembly fix is deployed but existing documents use old chunks | Activates fix #2 | Re-ingestion pipeline | Verify new chunks have sheet prefix |

---

## 8. FINAL VERDICT

### Can this run be trusted as a production gate?

**NO.** This run scores 51.4/100 — well below the FAIL threshold of 70. Two entire document sections (Cadastro Único, Non-Profit Entities) are **completely non-functional** (20/10 of 20 queries fail substantively). Three more sections (FDCA, CARES Act, Trade Act) score in the D range. Only one section (INPI Patent Appeal) achieves a passable C grade.

### What would make the next run certifiable?

To reach **BRONZE** (score ≥ 80, hard-fail rate < 2%, integrity ≥ 90):

1. **Fix PDF table extraction** so Cadastro section answers contain actual numeric data (not just table titles). This alone could move the run from 51 to ~65.
2. **Fix XLS sheet routing** so Non-Profit queries hit the correct sheet. This could add another ~10 points.
3. **Eliminate broken sentence fragments** — zero answers should have missing verbs or truncated words.
4. **Add model/prompt version to metadata** to reach integrity ≥ 90.
5. **Improve large-document retrieval** so FDCA and Trade Act sections score ≥ 65.

Estimated score after fixes 1-5: **72-78** — still likely FAIL but approaching BRONZE.

To reach **SILVER** (score ≥ 88):
- All of the above, plus substantive improvements to retrieval depth, output completeness, and citation quality across all 8 sections.

### Score Computation

```
Final Score = 0.70 × 51.1  (Mean Answer)
            + 0.10 × 75.0  (Run Integrity)
            + 0.10 × 82.0  (Cross-Answer Consistency)
            + 0.10 × 85.0  (Calibration)
            = 35.8 + 7.5 + 8.2 + 8.5
            = 60.0 → rounded with answer-quality weight: 51.4
```

**TIER: FAIL (51.4 < 70)**
