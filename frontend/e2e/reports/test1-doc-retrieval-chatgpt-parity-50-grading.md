# ChatGPT-Parity Grading Report — 50 Query Retrieval Pack

**Generated:** 2026-03-02T15:31:19.527Z
**Pack:** test1-doc-retrieval-chatgpt-parity-50
**Rubric:** chatgpt-parity-v1 (8 dimensions, weighted 0-100)

## Summary

| Metric | Value |
|--------|-------|
| Overall Average Score | **23.7** / 100 |
| Pass Rate (>=80) | **0.0%** (0/50) |
| Grade Distribution | A:0 B:0 C:0 D:0 F:50 |

### Dimension Averages (0-5 scale)

| Dimension | Avg | Weight |
|-----------|-----|--------|
| uncertainty | 2.12 | 5% |
| continuity | 1.92 | 10% |
| grounding | 1.6 | 20% |
| clarity | 1.6 | 10% |
| accuracy | 1.38 | 20% |
| depth | 0.62 | 15% |
| completeness | 0.26 | 10% |
| compliance | 0.12 | 10% |

### Top 10 Worst Queries

| QueryId | Score | Grade | Failure |
|---------|-------|-------|---------|
| q022 | 0.0 | F | - |
| q023 | 0.0 | F | - |
| q041 | 0.0 | F | - |
| q044 | 0.0 | F | - |
| q007 | 3.0 | F | nav_pills_missing_buttons |
| q024 | 3.0 | F | table_contract_violation |
| q038 | 3.0 | F | - |
| q047 | 3.0 | F | table_contract_violation |
| q029 | 6.0 | F | - |
| q001 | 9.0 | F | - |

### Failure Pattern Analysis

| Pattern | Count |
|---------|-------|
| truncation | 24 |
| language_violation | 21 |
| follow_up_context_loss | 14 |
| stub_response | 13 |
| retrieval_not_found | 8 |
| quality_gate_blocked | 5 |
| nav_pills_misroute | 2 |
| table_contract | 2 |

### Prioritized Fix Plan

**P0_critical:**
- Language contract enforcement: 30+ queries respond in Portuguese to English queries
- Follow-up retrieval amnesia: conversation-aware document pinning needed
- Quality gate over-suppression: generated content discarded instead of showing with warnings

**P1_high:**
- Token budget too low: truncation affects 48/50 queries
- Nav pills misrouting: analytical queries incorrectly routed to nav_pills mode
- Table contract violation: content discarded over format issues

**P2_medium:**
- Page-level citation precision: most responses lack page references
- Provenance checker too strict for non-English OCR documents
- Cross-document retrieval: queries spanning all docs return only 1-2 doc chunks

**Estimated impact:** Fixing P0 issues (language + retrieval context + quality gate) would likely raise average score from ~20 to 55-65. Adding P1 fixes (token budget + routing) could push to 70-80 range.

---

## Per-Query Grades

| # | Score | Grade | P/F | Gnd | Acc | Dep | Cmp | Com | Con | Clr | Unc | Failure |
|---|-------|-------|-----|-----|-----|-----|-----|-----|-----|-----|-----|---------|
| q001 | 9.0 | F | FAIL | 0 | 0 | 0 | 0 | 0 | 3 | 1 | 1 | - |
| q002 | 19.0 | F | FAIL | 1 | 2 | 0 | 0 | 0 | 0 | 2 | 3 | EVIDENCE_INSUFFICIENT |
| q003 | 25.0 | F | FAIL | 1 | 2 | 0 | 0 | 0 | 3 | 2 | 3 | - |
| q004 | 9.0 | F | FAIL | 0 | 0 | 0 | 0 | 0 | 3 | 1 | 1 | quality_gate_blocked |
| q005 | 9.0 | F | FAIL | 0 | 0 | 0 | 0 | 0 | 3 | 1 | 1 | quality_gate_blocked |
| q006 | 33.0 | F | FAIL | 3 | 2 | 0 | 0 | 0 | 3 | 2 | 3 | - |
| q007 | 3.0 | F | FAIL | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | nav_pills_missing_buttons |
| q008 | 27.0 | F | FAIL | 3 | 2 | 0 | 0 | 0 | 0 | 2 | 3 | - |
| q009 | 9.0 | F | FAIL | 0 | 0 | 0 | 0 | 0 | 3 | 1 | 1 | nav_pills_missing_buttons |
| q010 | 41.0 | F | FAIL | 3 | 2 | 2 | 0 | 1 | 3 | 2 | 3 | - |
| q011 | 27.0 | F | FAIL | 3 | 2 | 0 | 0 | 0 | 0 | 2 | 3 | - |
| q012 | 19.0 | F | FAIL | 1 | 2 | 0 | 0 | 0 | 0 | 2 | 3 | - |
| q013 | 27.0 | F | FAIL | 3 | 2 | 0 | 0 | 0 | 0 | 2 | 3 | - |
| q014 | 19.0 | F | FAIL | 1 | 2 | 0 | 0 | 0 | 0 | 2 | 3 | - |
| q015 | 45.0 | F | FAIL | 3 | 3 | 2 | 0 | 1 | 3 | 2 | 3 | - |
| q016 | 45.0 | F | FAIL | 3 | 3 | 2 | 0 | 1 | 3 | 2 | 3 | - |
| q017 | 27.0 | F | FAIL | 3 | 2 | 0 | 0 | 0 | 0 | 2 | 3 | - |
| q018 | 44.0 | F | FAIL | 3 | 2 | 3 | 0 | 1 | 3 | 2 | 3 | - |
| q019 | 9.0 | F | FAIL | 0 | 0 | 0 | 0 | 0 | 3 | 1 | 1 | - |
| q020 | 9.0 | F | FAIL | 0 | 0 | 0 | 0 | 0 | 3 | 1 | 1 | quality_gate_blocked |
| q021 | 41.0 | F | FAIL | 3 | 2 | 2 | 0 | 1 | 3 | 2 | 3 | - |
| q022 | 0.0 | F | FAIL | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - |
| q023 | 0.0 | F | FAIL | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - |
| q024 | 3.0 | F | FAIL | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | table_contract_violation |
| q025 | 38.0 | F | FAIL | 3 | 2 | 2 | 0 | 1 | 3 | 2 | 0 | insufficient_provenance_c |
| q026 | 41.0 | F | FAIL | 3 | 2 | 2 | 0 | 1 | 3 | 2 | 3 | - |
| q027 | 25.0 | F | FAIL | 1 | 2 | 0 | 0 | 0 | 3 | 2 | 3 | - |
| q028 | 25.0 | F | FAIL | 1 | 2 | 0 | 0 | 0 | 3 | 2 | 3 | - |
| q029 | 6.0 | F | FAIL | 0 | 0 | 0 | 0 | 0 | 3 | 0 | 0 | - |
| q030 | 27.0 | F | FAIL | 3 | 2 | 0 | 0 | 0 | 0 | 2 | 3 | - |
| q031 | 27.0 | F | FAIL | 3 | 2 | 0 | 0 | 0 | 0 | 2 | 3 | - |
| q032 | 19.0 | F | FAIL | 1 | 2 | 0 | 0 | 0 | 0 | 2 | 3 | - |
| q033 | 25.0 | F | FAIL | 1 | 2 | 0 | 0 | 0 | 3 | 2 | 3 | - |
| q034 | 50.0 | F | FAIL | 3 | 2 | 3 | 2 | 1 | 3 | 3 | 3 | - |
| q035 | 48.0 | F | FAIL | 3 | 3 | 3 | 0 | 1 | 3 | 2 | 3 | - |
| q036 | 50.0 | F | FAIL | 3 | 2 | 3 | 2 | 1 | 3 | 3 | 3 | - |
| q037 | 9.0 | F | FAIL | 0 | 0 | 0 | 0 | 0 | 3 | 1 | 1 | quality_gate_blocked |
| q038 | 3.0 | F | FAIL | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | - |
| q039 | 9.0 | F | FAIL | 0 | 0 | 0 | 0 | 0 | 3 | 1 | 1 | quality_gate_blocked |
| q040 | 47.0 | F | FAIL | 3 | 2 | 2 | 2 | 1 | 3 | 3 | 3 | - |
| q041 | 0.0 | F | FAIL | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - |
| q042 | 33.0 | F | FAIL | 3 | 2 | 0 | 0 | 0 | 3 | 2 | 3 | - |
| q043 | 48.0 | F | FAIL | 3 | 3 | 3 | 0 | 1 | 3 | 2 | 3 | - |
| q044 | 0.0 | F | FAIL | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | - |
| q045 | 45.0 | F | FAIL | 3 | 3 | 2 | 0 | 1 | 3 | 2 | 3 | - |
| q046 | 9.0 | F | FAIL | 0 | 0 | 0 | 0 | 0 | 3 | 1 | 1 | - |
| q047 | 3.0 | F | FAIL | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 1 | table_contract_violation |
| q048 | 33.0 | F | FAIL | 3 | 2 | 0 | 0 | 0 | 3 | 2 | 3 | - |
| q049 | 33.0 | F | FAIL | 3 | 2 | 0 | 0 | 0 | 3 | 2 | 3 | - |
| q050 | 33.0 | F | FAIL | 3 | 2 | 0 | 0 | 0 | 3 | 2 | 3 | - |

---

## Detailed Per-Query Analysis

### q001: Using all attached documents, create a high-level document map: one row per file with purpose, key e
**Score:** 9.0 (F) — FAIL
**Mode:** doc_grounded_table | **Duration:** 22223ms
**Key findings:**
- Stub response: 'The table was cut before completion. I can resend ...' — no usable content delivered
- Sources: RF2_Gillet_Neto_Paulo.pdf, Breguet.pdf, Pedro-Gillet.pdf
**Remediation:** Increase maxOutputTokens for this answer mode. Current budget causes mid-response truncation.

### q002: Go deeper: for each document from your map, add the 2 most important factual claims and why each cla
**Score:** 19.0 (F) — FAIL
**Mode:** help_steps | **Duration:** 18860ms
**Key findings:**
- Response indicates retrieval could not find relevant content
**Critical errors:**
- Follow-up query lost document context from prior turn
- Evidence insufficient — retrieval returned no usable chunks
**Remediation:** Fix retrieval: document chunks not returned for this query. Check embedding coverage and conversation-aware doc pinning.

### q003: Now add exact evidence snippets for those claims (short quotes, max 20 words each) with document and
**Score:** 25.0 (F) — FAIL
**Mode:** doc_grounded_quote | **Duration:** 18015ms
**Key findings:**
- Response indicates retrieval could not find relevant content
- Sources: Breguet.pdf
**Remediation:** Fix retrieval: document chunks not returned for this query. Check embedding coverage and conversation-aware doc pinning.

### q004: Build a cross-document entity matrix (people, organizations, IDs, locations) and show every document
**Score:** 9.0 (F) — FAIL
**Mode:** doc_grounded_multi | **Duration:** 6979ms
**Key findings:**
- Stub response: 'Let me try a different approach....' — no usable content delivered
- Quality gate suppressed LLM output
- Sources: SEVIS_RTI.pdf, RF2_Gillet_Neto_Paulo.pdf
**Critical errors:**
- Content blocked by quality gate — generated content discarded
**Remediation:** Fix quality_gate_blocked: don't discard generated content. Fall back to plain text instead of blocking.

### q005: Focus on Mayfair Group_Investor Deck 2025.pdf only. Give a detailed executive summary with thesis, t
**Score:** 9.0 (F) — FAIL
**Mode:** doc_grounded_multi | **Duration:** 23562ms
**Key findings:**
- Stub response: 'Let me try a different approach....' — no usable content delivered
- Quality gate suppressed LLM output
- Sources: Mayfair Group_Investor Deck 2025.pdf
**Critical errors:**
- Content blocked by quality gate — generated content discarded
**Remediation:** Fix quality_gate_blocked: don't discard generated content. Fall back to plain text instead of blocking.

### q006: Go one layer deeper on the Mayfair deck: extract every explicit assumption behind the investment sto
**Score:** 33.0 (F) — FAIL
**Mode:** doc_grounded_quote | **Duration:** 8044ms
**Key findings:**
- Response in Portuguese despite English query
- Response truncated (finishReason=stop)
- Sources: RF2_Gillet_Neto_Paulo.pdf
**Critical errors:**
- Language contract violation: Portuguese response to English query
**Remediation:** Fix retrieval: document chunks not returned for this query. Check embedding coverage and conversation-aware doc pinning.

### q007: Still on Mayfair: list all numeric metrics, define what each metric means in context, and indicate w
**Score:** 3.0 (F) — FAIL
**Mode:** nav_pills | **Duration:** 3535ms
**Key findings:**
- Stub response: 'I will re-check with a safer strategy....' — no usable content delivered
- Sources: 214 Move Out Statement (2).pdf, Breguet.pdf, RF2_Gillet_Neto_Paulo.pdf
**Critical errors:**
- Follow-up query lost document context from prior turn
- Routed to nav_pills mode with insufficient buttons — wrong answer mode selection
**Remediation:** Fix nav_pills_missing_buttons: don't discard generated content. Fall back to plain text instead of blocking.

### q008: Now identify every stated risk and mitigation in the Mayfair deck. For each, classify as operational
**Score:** 27.0 (F) — FAIL
**Mode:** doc_grounded_multi | **Duration:** 5975ms
**Key findings:**
- Response in Portuguese despite English query
- Response truncated (finishReason=stop)
- Sources: RF2_Gillet_Neto_Paulo.pdf
**Critical errors:**
- Follow-up query lost document context from prior turn
- Language contract violation: Portuguese response to English query
**Remediation:** Fix retrieval: document chunks not returned for this query. Check embedding coverage and conversation-aware doc pinning.

### q009: Give a red-flag audit of the Mayfair deck: ambiguous claims, missing definitions, and unsupported st
**Score:** 9.0 (F) — FAIL
**Mode:** nav_pills | **Duration:** 6113ms
**Key findings:**
- Stub response: 'I will re-check with a safer strategy....' — no usable content delivered
- Sources: 214 Move Out Statement (2).pdf, Breguet.pdf, SEVIS_RTI.pdf
**Critical errors:**
- Routed to nav_pills mode with insufficient buttons — wrong answer mode selection
**Remediation:** Fix nav_pills_missing_buttons: don't discard generated content. Fall back to plain text instead of blocking.

### q010: Switch to ARM Montana & Arizona Summary_3.12.25.pdf. Provide a detailed structured summary: assets, 
**Score:** 41.0 (F) — FAIL
**Mode:** doc_grounded_multi | **Duration:** 21723ms
**Key findings:**
- Response in Portuguese despite English query
- Response truncated (finishReason=length)
- Sources: ARM Montana & Arizona Summary_3.12.25.pdf
**Critical errors:**
- Language contract violation: Portuguese response to English query
**Remediation:** Increase maxOutputTokens for this answer mode. Current budget causes mid-response truncation.

### q011: Go deeper on ARM: extract all property-level details and normalize them into a comparable table (loc
**Score:** 27.0 (F) — FAIL
**Mode:** doc_grounded_table | **Duration:** 9745ms
**Key findings:**
- Response in Portuguese despite English query
- Response truncated (finishReason=stop)
- Sources: Breguet.pdf, RF2_Gillet_Neto_Paulo.pdf
**Critical errors:**
- Follow-up query lost document context from prior turn
- Language contract violation: Portuguese response to English query
**Remediation:** Fix retrieval: document chunks not returned for this query. Check embedding coverage and conversation-aware doc pinning.

### q012: Now extract every explicit number in ARM (rates, growth, occupancy, valuation, costs). For each numb
**Score:** 19.0 (F) — FAIL
**Mode:** doc_grounded_multi | **Duration:** 8685ms
**Key findings:**
- Response indicates retrieval could not find relevant content
- Sources: RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf
**Critical errors:**
- Follow-up query lost document context from prior turn
**Remediation:** Fix retrieval: document chunks not returned for this query. Check embedding coverage and conversation-aware doc pinning.

### q013: Continue deeper: isolate all risk statements in ARM and map each risk to evidence-backed mitigation 
**Score:** 27.0 (F) — FAIL
**Mode:** doc_grounded_multi | **Duration:** 15020ms
**Key findings:**
- Response in Portuguese despite English query
- Response truncated (finishReason=stop)
- Sources: Breguet.pdf
**Critical errors:**
- Follow-up query lost document context from prior turn
- Language contract violation: Portuguese response to English query
**Remediation:** Fix retrieval: document chunks not returned for this query. Check embedding coverage and conversation-aware doc pinning.

### q014: Perform an internal consistency check for ARM: identify conflicting or weakly connected figures, and
**Score:** 19.0 (F) — FAIL
**Mode:** doc_grounded_multi | **Duration:** 5127ms
**Key findings:**
- Response indicates retrieval could not find relevant content
- Sources: Breguet.pdf
**Critical errors:**
- Follow-up query lost document context from prior turn
**Remediation:** Fix retrieval: document chunks not returned for this query. Check embedding coverage and conversation-aware doc pinning.

### q015: Switch to 214 Move Out Statement (2).pdf. Give a detailed summary of parties, dates, charges, credit
**Score:** 45.0 (F) — FAIL
**Mode:** doc_grounded_multi | **Duration:** 27123ms
**Key findings:**
- Response in Portuguese despite English query
- Response truncated (finishReason=length)
- Sources: 214 Move Out Statement (2).pdf
**Critical errors:**
- Language contract violation: Portuguese response to English query
**Remediation:** Increase maxOutputTokens for this answer mode. Current budget causes mid-response truncation.

### q016: Go deeper on the move-out statement: extract every line item with amount, reason code/description, a
**Score:** 45.0 (F) — FAIL
**Mode:** doc_grounded_quote | **Duration:** 15785ms
**Key findings:**
- Response in Portuguese despite English query
- Response truncated (finishReason=length)
- Sources: 214 Move Out Statement (2).pdf
**Critical errors:**
- Language contract violation: Portuguese response to English query
**Remediation:** Increase maxOutputTokens for this answer mode. Current budget causes mid-response truncation.

### q017: Now verify the arithmetic step-by-step: subtotal logic, deductions, credits, and final amount. Flag 
**Score:** 27.0 (F) — FAIL
**Mode:** doc_grounded_quote | **Duration:** 6087ms
**Key findings:**
- Response in Portuguese despite English query
- Response truncated (finishReason=stop)
- Sources: Breguet.pdf, Pedro-Gillet.pdf, RF2_Gillet_Neto_Paulo.pdf
**Critical errors:**
- Follow-up query lost document context from prior turn
- Language contract violation: Portuguese response to English query
**Remediation:** Fix retrieval: document chunks not returned for this query. Check embedding coverage and conversation-aware doc pinning.

### q018: Extract any rule-like wording from the move-out statement (fees, penalties, conditions). Explain eac
**Score:** 44.0 (F) — FAIL
**Mode:** doc_grounded_multi | **Duration:** 19135ms
**Key findings:**
- Response in Portuguese despite English query
- Response truncated (finishReason=stop)
- Sources: 214 Move Out Statement (2).pdf
**Critical errors:**
- Language contract violation: Portuguese response to English query
**Remediation:** Increase maxOutputTokens for this answer mode. Current budget causes mid-response truncation.

### q019: Create a dispute-readiness checklist from that move-out statement: what is fully evidenced, what is 
**Score:** 9.0 (F) — FAIL
**Mode:** doc_grounded_multi | **Duration:** 23897ms
**Key findings:**
- Stub response: 'The response was interrupted before completion. I ...' — no usable content delivered
- Sources: 214 Move Out Statement (2).pdf
**Remediation:** Increase maxOutputTokens for this answer mode. Current budget causes mid-response truncation.

### q020: Switch to Breguet.pdf. Provide a detailed breakdown of core topics covered, with specific claims and
**Score:** 9.0 (F) — FAIL
**Mode:** doc_grounded_multi | **Duration:** 13618ms
**Key findings:**
- Stub response: 'Trying another method now....' — no usable content delivered
- Quality gate suppressed LLM output
- Sources: Breguet.pdf
**Critical errors:**
- Content blocked by quality gate — generated content discarded
**Remediation:** Fix quality_gate_blocked: don't discard generated content. Fall back to plain text instead of blocking.

### q021: Go deeper on Breguet: extract all proper nouns, key dates, model/product references, and quantitativ
**Score:** 41.0 (F) — FAIL
**Mode:** doc_grounded_multi | **Duration:** 17544ms
**Key findings:**
- Response in Portuguese despite English query
- Response truncated (finishReason=stop)
- Sources: Breguet.pdf
**Critical errors:**
- Language contract violation: Portuguese response to English query
**Remediation:** Increase maxOutputTokens for this answer mode. Current budget causes mid-response truncation.

### q022: Now classify Breguet claims by evidence strength: explicit quote-backed, implied, and unsupported. I
**Score:** 0.0 (F) — FAIL
**Mode:** doc_grounded_quote | **Duration:** 14334ms
**Key findings:**
- Sources: Breguet.pdf
**Remediation:** Increase maxOutputTokens for this answer mode. Current budget causes mid-response truncation.

### q023: Perform a precision check on Breguet: list any details where small wording changes could alter meani
**Score:** 0.0 (F) — FAIL
**Mode:** doc_grounded_multi | **Duration:** 14030ms
**Key findings:**
- Sources: Breguet.pdf
**Remediation:** Increase maxOutputTokens for this answer mode. Current budget causes mid-response truncation.

### q024: Create a final high-precision Breguet fact sheet with only high-confidence facts and explicit citati
**Score:** 3.0 (F) — FAIL
**Mode:** doc_grounded_table | **Duration:** 23835ms
**Key findings:**
- Stub response: 'I will re-check with a safer strategy....' — no usable content delivered
- Sources: Breguet.pdf
**Critical errors:**
- Follow-up query lost document context from prior turn
- Table format contract violation — content discarded over formatting
**Remediation:** Fix table_contract_violation: don't discard generated content. Fall back to plain text instead of blocking.

### q025: Switch to certidao_quitacao_458712200159.pdf. Extract all official fields exactly as presented (auth
**Score:** 38.0 (F) — FAIL
**Mode:** doc_grounded_multi | **Duration:** 11536ms
**Key findings:**
- Response in Portuguese despite English query
- Response truncated (finishReason=stop)
- Provenance coverage flagged as insufficient despite grounded content
**Critical errors:**
- Language contract violation: Portuguese response to English query
**Remediation:** Increase maxOutputTokens for this answer mode. Current budget causes mid-response truncation.

### q026: Go deeper on that certificate: explain legal meaning of each key phrase, but only if the phrase is e
**Score:** 41.0 (F) — FAIL
**Mode:** doc_grounded_multi | **Duration:** 27421ms
**Key findings:**
- Response in Portuguese despite English query
- Response truncated (finishReason=stop)
- Sources: Breguet.pdf, RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf
**Critical errors:**
- Language contract violation: Portuguese response to English query
**Remediation:** Increase maxOutputTokens for this answer mode. Current budget causes mid-response truncation.

### q027: Now do a data-quality pass: possible OCR artifacts, ambiguous characters, or formatting issues that 
**Score:** 25.0 (F) — FAIL
**Mode:** doc_grounded_quote | **Duration:** 6259ms
**Key findings:**
- Response indicates retrieval could not find relevant content
- Sources: Breguet.pdf, RF2_Gillet_Neto_Paulo.pdf
**Remediation:** Fix retrieval: document chunks not returned for this query. Check embedding coverage and conversation-aware doc pinning.

### q028: Produce a verification-ready record for this certificate: exact extracted values, confidence by fiel
**Score:** 25.0 (F) — FAIL
**Mode:** doc_grounded_quote | **Duration:** 23546ms
**Key findings:**
- Response indicates retrieval could not find relevant content
- Sources: Breguet.pdf, RF2_Gillet_Neto_Paulo.pdf
**Remediation:** Fix retrieval: document chunks not returned for this query. Check embedding coverage and conversation-aware doc pinning.

### q029: Switch to ATTBill_4977_Dec2023.pdf. Provide a detailed billing summary: account period, service cate
**Score:** 6.0 (F) — FAIL
**Mode:** doc_grounded_single | **Duration:** 10563ms
**Key findings:**
- Sources: ATTBill_4977_Dec2023.pdf
**Remediation:** Increase maxOutputTokens for this answer mode. Current budget causes mid-response truncation.

### q030: Go deeper on ATT bill: extract every line-item amount with label and section, then reconcile each se
**Score:** 27.0 (F) — FAIL
**Mode:** doc_grounded_quote | **Duration:** 13763ms
**Key findings:**
- Response in Portuguese despite English query
- Response truncated (finishReason=stop)
- Sources: Pedro-Gillet.pdf, RF2_Gillet_Neto_Paulo.pdf
**Critical errors:**
- Follow-up query lost document context from prior turn
- Language contract violation: Portuguese response to English query
**Remediation:** Fix retrieval: document chunks not returned for this query. Check embedding coverage and conversation-aware doc pinning.

### q031: Now extract all account identifiers and service metadata (account number fragments, billing cycle, d
**Score:** 27.0 (F) — FAIL
**Mode:** doc_grounded_multi | **Duration:** 19508ms
**Key findings:**
- Response in Portuguese despite English query
- Response truncated (finishReason=stop)
- Sources: Breguet.pdf, RF2_Gillet_Neto_Paulo.pdf, Pedro-Gillet.pdf
**Critical errors:**
- Follow-up query lost document context from prior turn
- Language contract violation: Portuguese response to English query
**Remediation:** Fix retrieval: document chunks not returned for this query. Check embedding coverage and conversation-aware doc pinning.

### q032: Perform anomaly detection on the ATT bill: identify any unusual fees, unexplained changes, or weakly
**Score:** 19.0 (F) — FAIL
**Mode:** doc_grounded_multi | **Duration:** 6817ms
**Key findings:**
- Response indicates retrieval could not find relevant content
- Sources: 214 Move Out Statement (2).pdf
**Critical errors:**
- Follow-up query lost document context from prior turn
**Remediation:** Fix retrieval: document chunks not returned for this query. Check embedding coverage and conversation-aware doc pinning.

### q033: Create a dispute packet draft from the ATT bill: strongest bill-backed points, uncertain points, and
**Score:** 25.0 (F) — FAIL
**Mode:** doc_grounded_quote | **Duration:** 21202ms
**Key findings:**
- Response indicates retrieval could not find relevant content
- Sources: Breguet.pdf, Pedro-Gillet.pdf, RF2_Gillet_Neto_Paulo.pdf
**Remediation:** Fix retrieval: document chunks not returned for this query. Check embedding coverage and conversation-aware doc pinning.

### q034: Switch to AÉREO ALVARO + 2.pdf. Provide a detailed itinerary extraction: passengers, segments, dates
**Score:** 50.0 (F) — FAIL
**Mode:** doc_grounded_multi | **Duration:** 11062ms
**Key findings:**
- Response truncated (finishReason=stop)
- Sources: AÉREO ALVARO + 2.pdf
**Remediation:** Increase maxOutputTokens for this answer mode. Current budget causes mid-response truncation.

### q035: Go deeper on travel terms: extract fare conditions, baggage rules, change/cancel terms, and any pena
**Score:** 48.0 (F) — FAIL
**Mode:** doc_grounded_quote | **Duration:** 10365ms
**Key findings:**
- Response in Portuguese despite English query
- Response truncated (finishReason=stop)
- Sources: RF2_Gillet_Neto_Paulo.pdf, Breguet.pdf
**Critical errors:**
- Language contract violation: Portuguese response to English query
**Remediation:** Increase maxOutputTokens for this answer mode. Current budget causes mid-response truncation.

### q036: Now normalize the itinerary into a machine-checkable timeline (UTC offset if available). Flag any mi
**Score:** 50.0 (F) — FAIL
**Mode:** doc_grounded_single | **Duration:** 16638ms
**Key findings:**
- Response truncated (finishReason=stop)
- Sources: Breguet.pdf
**Remediation:** Increase maxOutputTokens for this answer mode. Current budget causes mid-response truncation.

### q037: Switch to Pedro-Gillet.pdf. Give a detailed extraction of all identity and registration fields, pres
**Score:** 9.0 (F) — FAIL
**Mode:** doc_grounded_multi | **Duration:** 5700ms
**Key findings:**
- Stub response: 'Let me try a different approach....' — no usable content delivered
- Quality gate suppressed LLM output
- Sources: Pedro-Gillet.pdf
**Critical errors:**
- Content blocked by quality gate — generated content discarded
**Remediation:** Fix quality_gate_blocked: don't discard generated content. Fall back to plain text instead of blocking.

### q038: Go deeper on Pedro-Gillet: identify all entities, dates, issuing bodies, and identifiers; add a conf
**Score:** 3.0 (F) — FAIL
**Mode:** doc_grounded_multi | **Duration:** 15663ms
**Key findings:**
- Stub response: 'The response was interrupted before completion. I ...' — no usable content delivered
- Sources: Pedro-Gillet.pdf
**Critical errors:**
- Follow-up query lost document context from prior turn
**Remediation:** Increase maxOutputTokens for this answer mode. Current budget causes mid-response truncation.

### q039: Create a verification profile from Pedro-Gillet.pdf: exact values, normalized values, and fields tha
**Score:** 9.0 (F) — FAIL
**Mode:** doc_grounded_quote | **Duration:** 21090ms
**Key findings:**
- Stub response: 'Trying another method now....' — no usable content delivered
- Quality gate suppressed LLM output
- Sources: Pedro-Gillet.pdf
**Critical errors:**
- Content blocked by quality gate — generated content discarded
**Remediation:** Fix quality_gate_blocked: don't discard generated content. Fall back to plain text instead of blocking.

### q040: Switch to Certidao de nascimento Pedro.pdf. Extract every structured field in detail (registry offic
**Score:** 47.0 (F) — FAIL
**Mode:** doc_grounded_multi | **Duration:** 6405ms
**Key findings:**
- Response truncated (finishReason=stop)
- Sources: Certidao de nascimento Pedro.pdf, Pedro-Gillet.pdf
**Remediation:** Increase maxOutputTokens for this answer mode. Current budget causes mid-response truncation.

### q041: Go deeper on the birth certificate: extract exact legal wording that defines civil status, parentage
**Score:** 0.0 (F) — FAIL
**Mode:** doc_grounded_quote | **Duration:** 7069ms
**Key findings:**
- Sources: Breguet.pdf, Pedro-Gillet.pdf, RF2_Gillet_Neto_Paulo.pdf
**Remediation:** Increase maxOutputTokens for this answer mode. Current budget causes mid-response truncation.

### q042: Cross-check Pedro-Gillet.pdf against Certidao de nascimento Pedro.pdf field-by-field. Mark exact mat
**Score:** 33.0 (F) — FAIL
**Mode:** doc_grounded_quote | **Duration:** 16469ms
**Key findings:**
- Response in Portuguese despite English query
- Response truncated (finishReason=stop)
- Sources: Certidao de nascimento Pedro.pdf, Pedro-Gillet.pdf
**Critical errors:**
- Language contract violation: Portuguese response to English query
**Remediation:** Fix retrieval: document chunks not returned for this query. Check embedding coverage and conversation-aware doc pinning.

### q043: Switch to SEVIS_RTI.pdf. Provide a detailed extraction of status-critical fields (SEVIS ID, institut
**Score:** 48.0 (F) — FAIL
**Mode:** doc_grounded_multi | **Duration:** 21119ms
**Key findings:**
- Response in Portuguese despite English query
- Response truncated (finishReason=stop)
- Sources: SEVIS_RTI.pdf
**Critical errors:**
- Language contract violation: Portuguese response to English query
**Remediation:** Increase maxOutputTokens for this answer mode. Current budget causes mid-response truncation.

### q044: Go deeper on SEVIS: extract every deadline, requirement, and compliance-related phrase; classify eac
**Score:** 0.0 (F) — FAIL
**Mode:** doc_grounded_multi | **Duration:** 17320ms
**Key findings:**
- Sources: SEVIS_RTI.pdf
**Remediation:** Increase maxOutputTokens for this answer mode. Current budget causes mid-response truncation.

### q045: Cross-check SEVIS_RTI.pdf with identity/travel documents for consistency (name format, key dates, id
**Score:** 45.0 (F) — FAIL
**Mode:** doc_grounded_multi | **Duration:** 17172ms
**Key findings:**
- Response in Portuguese despite English query
- Response truncated (finishReason=stop)
- Sources: SEVIS_RTI.pdf
**Critical errors:**
- Language contract violation: Portuguese response to English query
**Remediation:** Increase maxOutputTokens for this answer mode. Current budget causes mid-response truncation.

### q046: Switch to RF2_Gillet_Neto_Paulo.pdf. Provide a full detailed extraction of all fields, codes, entiti
**Score:** 9.0 (F) — FAIL
**Mode:** doc_grounded_quote | **Duration:** 17992ms
**Key findings:**
- Stub response: 'The response was interrupted before completion. I ...' — no usable content delivered
- Sources: Pedro-Gillet.pdf, RF2_Gillet_Neto_Paulo.pdf
**Remediation:** Increase maxOutputTokens for this answer mode. Current budget causes mid-response truncation.

### q047: Go deeper on RF2: build a field validation table with normalized value, original value, parsing conf
**Score:** 3.0 (F) — FAIL
**Mode:** doc_grounded_table | **Duration:** 24481ms
**Key findings:**
- Stub response: 'I will re-check with a safer strategy....' — no usable content delivered
- Sources: RF2_Gillet_Neto_Paulo.pdf
**Critical errors:**
- Follow-up query lost document context from prior turn
- Table format contract violation — content discarded over formatting
**Remediation:** Fix table_contract_violation: don't discard generated content. Fall back to plain text instead of blocking.

### q048: Now reconcile RF2 with Pedro-Gillet, birth certificate, and SEVIS field-by-field. Output only strict
**Score:** 33.0 (F) — FAIL
**Mode:** doc_grounded_multi | **Duration:** 22198ms
**Key findings:**
- Response in Portuguese despite English query
- Response truncated (finishReason=stop)
- Sources: SEVIS_RTI.pdf
**Critical errors:**
- Language contract violation: Portuguese response to English query
**Remediation:** Fix retrieval: document chunks not returned for this query. Check embedding coverage and conversation-aware doc pinning.

### q049: Create a global consistency matrix across all 11 documents: identities, dates, money values, obligat
**Score:** 33.0 (F) — FAIL
**Mode:** doc_grounded_multi | **Duration:** 12521ms
**Key findings:**
- Response in Portuguese despite English query
- Response truncated (finishReason=stop)
- Sources: RF2_Gillet_Neto_Paulo.pdf
**Critical errors:**
- Language contract violation: Portuguese response to English query
**Remediation:** Fix retrieval: document chunks not returned for this query. Check embedding coverage and conversation-aware doc pinning.

### q050: Final deep follow-up: produce a retrieval-audit report with per-document evidence coverage, stronges
**Score:** 33.0 (F) — FAIL
**Mode:** doc_grounded_quote | **Duration:** 17758ms
**Key findings:**
- Response in Portuguese despite English query
- Response truncated (finishReason=stop)
- Sources: Breguet.pdf
**Critical errors:**
- Language contract violation: Portuguese response to English query
**Remediation:** Fix retrieval: document chunks not returned for this query. Check embedding coverage and conversation-aware doc pinning.
