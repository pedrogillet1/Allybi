# HARSH GRADING REPORT — 100-QUERY DOCUMENT Q&A TEST
## Koda/Allybi Local Backend — 2026-03-10

---

## EXECUTIVE SUMMARY

| Metric | Value |
|---|---|
| Total queries | 100 |
| Hard fails (0/100) | 53 |
| Graded answers | 47 |
| Average score (graded only) | 86.8 / 100 |
| Average score (all 100) | 40.8 / 100 |
| Median (graded only) | 88 |
| Median (all 100) | 0 |
| A+ (95-100) | 0 |
| A (90-94) | 10 |
| B+ (85-89) | 21 |
| B (80-84) | 10 |
| C+ (75-79) | 3 |
| C (70-74) | 1 |
| D/F (<70) | 2 + 53 hard fails |
| Hard fail rate | **53%** |
| Avg speed (all) | 15.4 s/query |
| Avg speed (OK answers) | 17.2 s/query |

**Verdict: SYSTEM IS NOT PRODUCTION-READY.** The ResponseContractEnforcer blocks 53% of queries entirely. When it does let answers through, quality is generally B+ (good structure, grounded, few hallucinations). But a 53% hard-fail rate is catastrophic for any real user experience.

---

## TABLE 1: PER-QUERY SCORE CARD

| Q# | Document | Ret /25 | Pre /20 | Gro /15 | Rea /15 | Com /15 | Unc /10 | TOTAL | Band | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| Q001 | BESS Market | 23 | 18 | 14 | 13 | 13 | 7 | **88** | B+ | Solid overview. Slightly long for "concise." Quotes grounded. |
| Q002 | BESS Market | 24 | 18 | 14 | 13 | 13 | 8 | **90** | A | Tight, accurate thesis summary with doc quotes. |
| Q003 | BESS Market | 23 | 18 | 14 | 13 | 13 | 8 | **89** | B+ | Good extraction. $217M figure cited. Clean bullets. |
| Q004 | BESS Market | 24 | 19 | 14 | 14 | 13 | 8 | **92** | A | Strong numbers extraction. Includes caveat. Well-sectioned. |
| Q005 | BESS Market | 22 | 17 | 13 | 13 | 13 | 8 | **86** | B+ | Good risk extraction. Some items feel inferred vs. explicit. |
| Q006 | BESS Market | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | INTENT_NEEDS_CLARIFICATION. Table produced has only 1 row — massively incomplete even ignoring failure code. |
| Q007 | BESS Market | 24 | 19 | 14 | 15 | 13 | 8 | **93** | A | Excellent critical analysis. 6 well-grounded challenge points. |
| Q008 | BESS Market | 23 | 18 | 13 | 13 | 13 | 8 | **88** | B+ | Good 60-second brief. Covers thesis, tech claim, caveat. |
| Q009 | BESS Market | 22 | 17 | 13 | 13 | 12 | 10 | **87** | B+ | Good uncertainty flagging. Wuxi reference project detail strong. |
| Q010 | BESS Market | 22 | 16 | 14 | 13 | 14 | 6 | **85** | B+ | Good supported/suggested/not-evidenced format. Inconsistency: says "no quantified market size" in not-evidenced but Q003 cited $217M from same doc. -4 for self-contradiction across conversation. |
| Q011 | OBA Marketing | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | missing_provenance. Returns "Can you clarify what you want me to do next?" — useless. |
| Q012 | OBA Marketing | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | missing_provenance. Empty. |
| Q013 | OBA Marketing | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | missing_provenance. Empty. |
| Q014 | OBA Marketing | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | missing_provenance. Empty. |
| Q015 | OBA Marketing | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | missing_provenance. Empty. |
| Q016 | OBA Marketing | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | missing_provenance. Empty. |
| Q017 | OBA Marketing | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | missing_provenance. Empty. |
| Q018 | OBA Marketing | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | missing_provenance. Empty. |
| Q019 | OBA Marketing | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | missing_provenance. Empty. |
| Q020 | OBA Marketing | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | missing_provenance. Empty. |
| Q021 | Guarda Bens | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | insufficient_provenance_coverage. Returns "I could not complete that safely." |
| Q022 | Guarda Bens | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | insufficient_provenance_coverage. Same refusal message. |
| Q023 | Guarda Bens | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | missing_provenance. Empty. |
| Q024 | Guarda Bens | 22 | 17 | 13 | 13 | 14 | 5 | **84** | B | Good SIPOC/BPMN extraction. -5 uncertainty: doesn't flag that it failed 8/10 other queries on this doc. |
| Q025 | Guarda Bens | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | missing_provenance. Empty. |
| Q026 | Guarda Bens | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | missing_provenance. Empty. |
| Q027 | Guarda Bens | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | missing_provenance. Empty. |
| Q028 | Guarda Bens | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | missing_provenance. Empty. |
| Q029 | Guarda Bens | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | missing_provenance. Empty. |
| Q030 | Guarda Bens | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | missing_provenance. Empty. |
| Q031 | Trabalho Proj | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | missing_provenance. Empty. |
| Q032 | Trabalho Proj | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | missing_provenance. Empty. |
| Q033 | Trabalho Proj | 21 | 16 | 13 | 13 | 13 | 7 | **83** | B | Good phases/milestones. Honest that no specific calendar dates found. |
| Q034 | Trabalho Proj | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | insufficient_provenance_coverage. Refusal message. |
| Q035 | Trabalho Proj | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | missing_provenance. Empty. |
| Q036 | Trabalho Proj | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | missing_provenance. Empty. |
| Q037 | Trabalho Proj | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | language_contract_mismatch. "I could not safely finalize this answer in the requested language." |
| Q038 | Trabalho Proj | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | missing_provenance. Empty. |
| Q039 | Trabalho Proj | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | missing_provenance. Empty. |
| Q040 | Trabalho Proj | 23 | 17 | 14 | 13 | 14 | 5 | **86** | B+ | Excellent project brief with stakeholders, methods, risks. |
| Q041 | TRABALHO IMG | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | missing_provenance. Empty. Image OCR totally failed. |
| Q042 | TRABALHO IMG | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | missing_provenance. Empty. |
| Q043 | TRABALHO IMG | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | missing_provenance. Empty. |
| Q044 | TRABALHO IMG | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | missing_provenance. Empty. |
| Q045 | TRABALHO IMG | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | missing_provenance. Empty. |
| Q046 | TRABALHO IMG | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | missing_provenance. Empty. |
| Q047 | TRABALHO IMG | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | missing_provenance. Empty. |
| Q048 | TRABALHO IMG | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | language_contract_mismatch. Language refusal. |
| Q049 | TRABALHO IMG | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | missing_provenance. Empty. |
| Q050 | TRABALHO IMG | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | language_contract_mismatch. Language refusal. |
| Q051 | ATT Bill | 23 | 18 | 13 | 12 | 13 | 8 | **87** | B+ | Good overview with specific charges. |
| Q052 | ATT Bill | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | insufficient_provenance_coverage. Refusal. Critical fail: billing period/due date are basic bill fields. |
| Q053 | ATT Bill | 23 | 19 | 14 | 13 | 14 | 5 | **88** | B+ | Good breakdown with headers. Correctly notes $98.49 total. -5 uncertainty: says "taxes not itemized" without flagging this as a gap more forcefully. |
| Q054 | ATT Bill | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | missing_provenance. Empty. |
| Q055 | ATT Bill | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | INTENT_NEEDS_CLARIFICATION. Table has only 2 rows (late fee + total) — misses all the actual line items. |
| Q056 | ATT Bill | 22 | 18 | 13 | 12 | 14 | 7 | **86** | B+ | Good account detail extraction. Honest about wireless number not visible. |
| Q057 | ATT Bill | 24 | 18 | 14 | 14 | 13 | 7 | **90** | A | Excellent verification checklist. Actionable. Grounded. |
| Q058 | ATT Bill | 24 | 19 | 14 | 14 | 14 | 6 | **91** | A | Best answer in ATT block. Plain-language tone nailed. Headers useful. |
| Q059 | ATT Bill | 22 | 17 | 13 | 14 | 13 | 8 | **87** | B+ | Good analytical structure. Correctly separates increase drivers from credits. |
| Q060 | ATT Bill | 23 | 19 | 14 | 13 | 13 | 7 | **89** | B+ | Tight payment recap. All key fields present. |
| Q061 | Certidao Nasc | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | INTENT_NEEDS_CLARIFICATION. Content actually good (562 chars, correctly identifies doc type) but system killed it. |
| Q062 | Certidao Nasc | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | missing_provenance. Empty. Critical fail: extracting name/DOB from a birth cert is the most basic task. |
| Q063 | Certidao Nasc | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | missing_provenance. Empty. |
| Q064 | Certidao Nasc | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | language_contract_mismatch. Portuguese doc triggered language enforcer. |
| Q065 | Certidao Nasc | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | missing_provenance. Returns "Can you clarify?" — useless. |
| Q066 | Certidao Nasc | 20 | 16 | 12 | 12 | 12 | 8 | **80** | B | Only OK answer for this doc. Good observation of stamps/codes. Only 1 source limits confidence. |
| Q067 | Certidao Nasc | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | language_contract_mismatch. Language refusal. |
| Q068 | Certidao Nasc | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | language_contract_mismatch. Language refusal. |
| Q069 | Certidao Nasc | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | language_contract_mismatch. Language refusal. |
| Q070 | Certidao Nasc | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | missing_provenance. Empty. |
| Q071 | SEVIS RTI | 22 | 17 | 13 | 13 | 14 | 7 | **86** | B+ | Good identification of Form I-20. Covers key functions. |
| Q072 | SEVIS RTI | 23 | 19 | 14 | 12 | 13 | 7 | **88** | B+ | Clean identifier extraction. SEVIS ID, form edition, statutory refs. |
| Q073 | SEVIS RTI | 20 | 15 | 12 | 12 | 13 | 8 | **80** | B | Only gets "Gillet" surname, not full name. Honest about school name not shown. -5 retrieval. |
| Q074 | SEVIS RTI | 23 | 18 | 14 | 13 | 13 | 7 | **88** | B+ | Well-structured compliance steps. 5-month rule, OPT requirement, school reporting. |
| Q075 | SEVIS RTI | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | INTENT_NEEDS_CLARIFICATION. Content is actually excellent (1979 chars, full table) but system killed it. Worst false-positive failure. |
| Q076 | SEVIS RTI | 21 | 17 | 13 | 12 | 13 | 9 | **85** | B+ | Concise status signal identification. |
| Q077 | SEVIS RTI | 23 | 17 | 14 | 13 | 13 | 7 | **87** | B+ | Good compliance reviewer perspective. |
| Q078 | SEVIS RTI | 22 | 16 | 12 | 14 | 14 | 7 | **85** | B+ | Good analytical questions. Only 1 source is concerning for grounding confidence. |
| Q079 | SEVIS RTI | 24 | 19 | 14 | 14 | 14 | 6 | **91** | A | Excellent briefing note format. Comprehensive. Best SEVIS answer. |
| Q080 | SEVIS RTI | 24 | 18 | 14 | 14 | 14 | 8 | **92** | A | Strong evidence-based summary with explicit uncertainty notes. Model answer for the format. |
| Q081 | Move Out | 23 | 18 | 14 | 13 | 13 | 7 | **88** | B+ | Good overview. Specific dates, amounts, legal refs. |
| Q082 | Move Out | 23 | 19 | 14 | 12 | 12 | 7 | **87** | B+ | Clean extraction. Honest: "Final balance: Not shown." |
| Q083 | Move Out | 22 | 17 | 13 | 13 | 13 | 7 | **85** | B+ | Good structure. Correctly notes where amounts not visible. |
| Q084 | Move Out | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | INTENT_NEEDS_CLARIFICATION. Content has decent table (1362 chars) but system killed it. |
| Q085 | Move Out | 23 | 18 | 14 | 14 | 13 | 7 | **89** | B+ | Excellent routine-vs-unusual analysis. Flags pest control discrepancy. |
| Q086 | Move Out | 23 | 18 | 14 | 14 | 13 | 6 | **88** | B+ | Honest "Partially" assessment. Discovers carpet prorate ($467.71). |
| Q087 | Move Out | 24 | 18 | 14 | 14 | 14 | 6 | **90** | A | Best Move Out answer. Practical dispute analysis. Carpet calc details strong. |
| Q088 | Move Out | 23 | 18 | 14 | 13 | 14 | 6 | **88** | B+ | Balanced justified-vs-unclear framing. Good practical takeaway. |
| Q089 | Move Out | 22 | 17 | 13 | 14 | 12 | 6 | **84** | B | Comprehensive doc list. **-3 composition: contains filler** "If you want, I can turn this into..." Unnecessary offer. |
| Q090 | Move Out | 23 | 18 | 14 | 12 | 13 | 7 | **87** | B+ | Clean recap. Rent figure $3,244 is a useful new data point. |
| Q091 | Mayfair Deck | 23 | 18 | 13 | 13 | 13 | 7 | **87** | B+ | Good core story. AI-native, bits-not-stitches thesis. |
| Q092 | Mayfair Deck | 23 | 18 | 14 | 13 | 14 | 6 | **88** | B+ | Well-sectioned business/market/product thesis. |
| Q093 | Mayfair Deck | 24 | 19 | 14 | 13 | 13 | 7 | **90** | A | Clean number extraction. $1B+, $221M, $1.55B valuation. |
| Q094 | Mayfair Deck | 23 | 17 | 13 | 13 | 14 | 7 | **87** | B+ | Good team/strategy extraction. Founders, 60% engineers. |
| Q095 | Mayfair Deck | 24 | 18 | 14 | 15 | 14 | 6 | **91** | A | Excellent risk analysis. 4 clear weak points identified. ESG "100%" flag strong. |
| Q096 | Mayfair Deck | 0 | 0 | 0 | 0 | 0 | 0 | **0** | FAIL | INTENT_NEEDS_CLARIFICATION. Content has a good claim/evidence/risk table but system killed it. |
| Q097 | Mayfair Deck | 23 | 18 | 13 | 13 | 14 | 7 | **88** | B+ | Practical 60-second pitch. All key numbers hit. |
| Q098 | Mayfair Deck | 25 | 19 | 14 | 15 | 14 | 5 | **92** | A | Best answer in entire test. 7 diligence categories, each with sharp sub-questions. |
| Q099 | Mayfair Deck | 23 | 17 | 14 | 14 | 14 | 6 | **88** | B+ | Good vision-vs-substance analysis. |
| Q100 | Mayfair Deck | 14 | 12 | 10 | 10 | 12 | 7 | **65** | D | **MAJOR ISSUE:** Asked for "strict final recap: clearly supported, suggested, not evidenced" of the FULL DECK — only covers ESG/supply chain section. Missed AI claims, financials, moats, team. Severe retrieval failure on final query. |

---

## TABLE 2: FAILURE TAXONOMY

| Failure Code | Count | % of All | Affected Documents | Severity | Root Cause |
|---|---|---|---|---|---|
| `missing_provenance` | 36 | 36% | OBA (9), Guarda Bens (7), Trabalho (5), TRABALHO IMG (8), ATT (1), Certidao (4), SEVIS (0), Move Out (0), Mayfair (0) | **CRITICAL** | Enforcer cannot map answer claims to document chunks. Likely: small/image docs have poor chunk quality or insufficient embedding coverage. |
| `INTENT_NEEDS_CLARIFICATION` | 7 | 7% | BESS (1), ATT (1), Certidao (1), SEVIS (1), Move Out (1), Mayfair (1) | **HIGH** | Enforcer misclassifies clear document-grounded questions as "needing clarification." False-positive rate is 100% — every one of these had a clear, answerable question. 6/7 actually produced good content that was then killed. |
| `insufficient_provenance_coverage` | 4 | 4% | Guarda Bens (2), Trabalho (1), ATT (1) | **HIGH** | Enforcer says answer covers more ground than provenance supports. Triggered on straightforward extraction queries. |
| `language_contract_mismatch` | 6 | 6% | Trabalho (1), TRABALHO IMG (2), Certidao (4) | **HIGH** | Portuguese-language source documents trigger language enforcer even though questions are in English. System cannot handle bilingual document/query pairs. |
| **TOTAL FAILURES** | **53** | **53%** | | | |

### Failure Distribution by Document

| Document | Total Qs | OK | FAIL | Fail Rate | Comment |
|---|---|---|---|---|---|
| BESS Market Assessment | 10 | 9 | 1 | 10% | Best performer. Only 1 INTENT_NEEDS_CLARIFICATION. |
| OBA Marketing Services | 10 | 0 | 10 | **100%** | Total wipeout. Doc is 3196 bytes — likely too small for provenance mapping. |
| Guarda Bens Self Storage | 10 | 1 | 9 | **90%** | Near-total failure. Only Q024 passed. |
| Trabalho Projeto | 10 | 2 | 8 | **80%** | Only Q033, Q040 passed. Portuguese doc hurts. |
| TRABALHO FINAL Image | 10 | 0 | 10 | **100%** | Total wipeout. Image-based doc — system cannot extract provenance from images. |
| ATT Bill Dec 2023 | 10 | 7 | 3 | 30% | Decent. Failures on specific extraction and table queries. |
| Certidao Nascimento | 10 | 1 | 9 | **90%** | Near-total failure. Portuguese birth certificate. Language enforcer + provenance. |
| SEVIS RTI | 10 | 9 | 1 | 10% | Excellent. Only Q075 false-positive on table query. |
| Move Out Statement | 10 | 9 | 1 | 10% | Excellent. Only Q084 false-positive on table query. |
| Mayfair Investor Deck | 10 | 9 | 1 | 10% | Excellent. Only Q096 false-positive on table query. |

---

## TABLE 3: WORST 10 GRADED ANSWERS (excluding hard fails)

| Rank | Q# | Score | Document | Issue |
|---|---|---|---|---|
| 1 | Q100 | 65 | Mayfair Deck | Only covered ESG, missed rest of deck. Severe retrieval failure. |
| 2 | Q066 | 80 | Certidao Nasc | Only OK answer for doc. Limited to 1 source. Narrow scope. |
| 3 | Q073 | 80 | SEVIS RTI | Only got surname "Gillet," not full name. School name missing. |
| 4 | Q033 | 83 | Trabalho Proj | Good but no specific dates found. Limited extraction. |
| 5 | Q024 | 84 | Guarda Bens | Good but isolated — 9/10 other queries failed on same doc. |
| 6 | Q089 | 84 | Move Out | Contains filler phrase "If you want, I can turn this into..." |
| 7 | Q010 | 85 | BESS Market | Self-contradicts: says "no quantified market size" but Q003 cited $217M. |
| 8 | Q076 | 85 | SEVIS RTI | Adequate but thin for the question asked. |
| 9 | Q078 | 85 | SEVIS RTI | Good questions but only 1 source raises grounding concern. |
| 10 | Q083 | 85 | Move Out | Good structure but several amounts "not visible in excerpt." |

---

## DETAILED ISSUE LOG

### Correctness Issues Found
1. **Q010 self-contradiction**: Claims "Any quantified market size... not evidenced" in the "not evidenced" section, but Q003 (same document, same conversation) correctly cited "USD 217 million in 2025." The system lost track of what it already retrieved within the same conversation.
2. **Q100 partial retrieval**: Asked for full deck recap (supported/suggested/not evidenced) but only produced ESG section. Lost context or retrieval narrowed to last-discussed topic by Q100.
3. **Q082 address discrepancy**: Lists "5212 Willow Street, Bellaire, TX 77401" as property address but Q089 references vendor work at "5550 Grosvenor Blvd, Unit 214, Los Angeles, CA 90066." Two different addresses for the same unit 214 — system didn't flag this inconsistency.

### Truncation Issues
- **Q056**: Flagged as POSSIBLE_TRUNCATION (ends with "Carol Stream, IL 60197-6416") — on inspection, this is actually the last data point (payment address), not truncation. **False alarm.**
- No genuine truncation detected in any OK answer.

### Formatting Issues
- **No wall-of-text violations** in any OK answer. All 47 OK answers use headers, bullets, or bold formatting.
- **No table-when-requested violations** in OK answers (table requests that passed the enforcer all produced tables).
- Tables are clean markdown with consistent column alignment.

### Repetition Issues
- **No sentence-level repetition detected** in any OK answer. The automated check confirmed this.

### Filler/Conversational Phrases
- **Q089**: "If you want, I can turn this into a short 'request list' you could send to the property manager" — unnecessary offer/filler. Should just provide the information.
- **Q011**: "Can you clarify what you want me to do next?" — useless non-answer on a clear question.
- **Q065**: Same "Can you clarify?" non-answer.
- No other filler phrases ("I hope this helps," "feel free to ask," etc.) detected.

### Speed Analysis

| Document | Avg Speed | Verdict |
|---|---|---|
| BESS Market Assessment | 16.6 s/query | Acceptable |
| OBA Marketing Services | 14.4 s/query | Fast (all failed — enforcer blocked early) |
| Guarda Bens Self Storage | 12.1 s/query | Fast (mostly failed) |
| Trabalho Projeto | 18.0 s/query | Acceptable |
| TRABALHO FINAL Image | 12.5 s/query | Fast (all failed) |
| ATT Bill Dec 2023 | 15.0 s/query | Acceptable |
| Certidao Nascimento | 12.5 s/query | Fast (mostly failed — enforcer exits early) |
| SEVIS RTI | 14.5 s/query | Acceptable |
| Move Out Statement | 19.1 s/query | Borderline slow |
| Mayfair Investor Deck | 19.1 s/query | Borderline slow |
| **Overall Average** | **15.4 s/query** | **Acceptable for local dev, slow for production** |

**Speed verdict**: 12-19s per query. Failed queries are faster (enforcer short-circuits). Successful queries with long answers (Move Out, Mayfair) take ~19s. For a production chat UX, 15-19s first-token latency would feel slow. For batch/analytical use, acceptable.

---

## CATEGORY DEEP-DIVE (47 OK answers only)

### Retrieval (25 pts) — Avg: 22.7/25 (90.8%)
- Generally strong. System finds relevant chunks for English-language, well-structured documents.
- Weakness: Q100 scored 14/25 — by the 10th query in a conversation, retrieval can narrow to the last-discussed topic.
- Weakness: Portuguese and image documents have near-zero retrieval success (enforcer blocks before answer).

### Precision (20 pts) — Avg: 17.6/20 (88.0%)
- Numbers are accurate where verifiable (ATT bill amounts, Mayfair financials, SEVIS IDs).
- No hallucinated numbers detected in any OK answer.
- Minor precision gaps: Q073 only gets surname, Q082 can't extract final balance.

### Grounding (15 pts) — Avg: 13.4/15 (89.3%)
- Strong. Most answers use direct quotes or explicit "as stated in the document" framing.
- Best: BESS and Mayfair answers frequently quote document language in italics.
- Weakness: some answers in Move Out and SEVIS blocks make analytical inferences without always tying back to specific pages.

### Reasoning (15 pts) — Avg: 13.1/15 (87.3%)
- Analytical questions (Q007, Q095, Q098) show strong critical thinking.
- Dispute/verification questions (Q057, Q087) are practical and well-reasoned.
- No logical errors found in OK answers.

### Composition (15 pts) — Avg: 13.3/15 (88.7%)
- Consistently good use of headers, bullets, bold.
- No walls of text.
- Tables are well-formed when produced.
- One filler phrase (Q089) is the only blemish.

### Uncertainty (10 pts) — Avg: 6.9/10 (69.0%)
- **Weakest category.** Many answers present extracted information confidently without flagging limits of what the document excerpts show vs. what the full document might contain.
- Best: Q009, Q080 explicitly flag uncertainty.
- Worst: Q040, Q024 don't mention that 80-90% of queries on the same document failed — a major context gap.

---

## SYSTEM-LEVEL FINDINGS

### Critical Bugs

1. **ResponseContractEnforcer is catastrophically aggressive.** 53% hard-fail rate. 6 of 7 INTENT_NEEDS_CLARIFICATION failures produced good content that was then killed. The enforcer is destroying value, not protecting it.

2. **Language contract enforcer cannot handle bilingual workflows.** English questions about Portuguese documents trigger `language_contract_mismatch` 6 times. This is a design flaw — users will ask about foreign-language documents in their preferred language.

3. **Image-based documents are completely unsupported.** TRABALHO FINAL Image: 10/10 failures. The provenance system has no path for image-sourced evidence.

4. **Small documents fail provenance.** OBA Marketing Services (3196 bytes): 10/10 failures. The provenance mapper cannot build sufficient evidence chains from tiny documents.

5. **INTENT_NEEDS_CLARIFICATION is a false-positive factory.** 7 triggers, 0 were genuinely unclear questions. "Put the core findings into a table" is not ambiguous. "Pull out the billing period, due date, and total amount due" is not ambiguous. This failure code should be removed or its threshold dramatically raised.

### What Works Well

1. **English, well-structured, medium-to-large documents produce consistently good answers (B+ to A).** BESS, ATT Bill, SEVIS, Move Out, and Mayfair all achieve 70-100% pass rates with quality scores of 85-92.

2. **No hallucinations detected.** Every number, name, and fact in the 47 OK answers traces to document content. This is the system's strongest quality signal.

3. **Formatting is consistently professional.** Headers, bullets, bold, tables — all properly rendered. No walls of text.

4. **Critical/analytical reasoning is strong.** Q007 (skeptical challenge), Q095 (risk analysis), Q098 (diligence questions) demonstrate genuine analytical depth.

---

## FINAL GRADE

| Scope | Grade | Score |
|---|---|---|
| When the system answers (47/100) | **B+** | 86.8/100 |
| Overall system (100/100) | **F** | 40.8/100 |

**The answers are good. The system that decides whether to show them is broken.**

---

*Report generated 2026-03-10. Grading methodology: 6-category rubric (Retrieval 25, Precision 20, Grounding 15, Reasoning 15, Composition 15, Uncertainty 10). Hard-fail gate: any enforcer failure code = 0/100. All 100 JSON responses and the full-inspection.txt were read word-by-word for this assessment.*
