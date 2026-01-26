# Bank Gap Plan - ChatGPT-Feel Readiness

**Generated:** 2026-01-18 16:30:10
**Source:** data_banks_catalog_20260118_161446

---

## Executive Summary

| Category | Current Total | Target Total | Gap | % Complete |
|----------|---------------|--------------|-----|------------|
| Core Triggers | ~750/lang | ~10,650/lang | -9,900 | 7% |
| Normalizers | 1,511 | 4,850 | -3,339 | 31% |
| Lexicons | 4,729 | 18,100/lang | -13,371 | 26% |
| Templates | 767 | 1,180/lang | -413 | 65% |
| ES Parity | 59 files | 154 files | -95 | 38% |

**VERDICT: NOT READY** - Core triggers are at 7% of target. Normalizers at 31%. Must expand before testing.

---

## PHASE 0 GAPS: Core Triggers

### PRIMARY_INTENTS (Critical - Routes ALL queries)

| Language | Current | Target | Gap | % Complete |
|----------|---------|--------|-----|------------|
| EN | 253 | 1,200 | -947 | 21% |
| PT | 238 | 1,200 | -962 | 20% |
| ES | 236 | 1,200 | -964 | 20% |

**BLOCKER:** This bank determines the first-level routing decision. At 20%, many query patterns will fail to match any intent.

### DOCUMENTS_SUBINTENTS (Critical - Routes doc operations)

| Language | Current | Target | Gap | % Complete |
|----------|---------|--------|-----|------------|
| EN | 127 | 1,600 | -1,473 | 8% |
| PT | 126 | 1,600 | -1,474 | 8% |
| ES | 126 | 1,600 | -1,474 | 8% |

**BLOCKER:** Summarize/extract/compare/explain operations are severely underrepresented.

### FILE_ACTIONS_SUBINTENTS (Critical - Routes file operations)

| Language | Current | Target | Gap | % Complete |
|----------|---------|--------|-----|------------|
| EN | 88 | 1,400 | -1,312 | 6% |
| PT | 88 | 1,400 | -1,312 | 6% |
| ES | 88 | 1,400 | -1,312 | 6% |

**BLOCKER:** Open/show/locate/filter/sort/group operations severely underrepresented.

### DOMAIN SUBINTENTS (Finance/Legal/Accounting/Medical)

| Bank | EN | PT | ES | Target | % Complete |
|------|-----|-----|-----|--------|------------|
| finance_subintents | 34 | 29 | 28 | 900 | 3% |
| legal_subintents | 30 | 26 | 26 | 900 | 3% |
| accounting_subintents | 26 | 18 | 18 | 800 | 2% |
| medical_subintents | 33 | 30 | 30 | 1,200 | 3% |

**BLOCKER:** Domain-specific queries will fail to route correctly to specialized handlers.

### MISSING BANKS (per manifest)

| Bank | Expected | Status |
|------|----------|--------|
| decision_families | EN/PT/ES × 500 | **DOES NOT EXIST** |
| help_subintents | EN/PT/ES × 250 | **DOES NOT EXIST** |
| edit_subintents | EN/PT/ES × 250 | **DOES NOT EXIST** |
| reasoning_subintents | EN/PT/ES × 250 | **DOES NOT EXIST** |
| doc_stats_subintents | EN/PT/ES × 250 | **DOES NOT EXIST** |

---

## PHASE 0 GAPS: Normalizers

### CRITICAL NORMALIZERS (Query preprocessing)

| Bank | Current | Target | Gap | % Complete |
|------|---------|--------|-----|------------|
| filename | 6 | 500 | -494 | 1% |
| numbers_currency | 14 | 600 | -586 | 2% |
| typos | 8 | 500 | -492 | 2% |
| time_windows | 33 | 300 | -267 | 11% |
| language_indicators | 52 | 800 | -748 | 7% |
| diacritics_pt | 12 | 250 | -238 | 5% |
| diacritics_es | 7 | 250 | -243 | 3% |

**BLOCKER:** filename normalizer at 6 rules means:
- "termination date" gets parsed as filename
- "folder/path" expressions not recognized
- Fuzzy filename matching fails

---

## PHASE 0 GAPS: Lexicons

### CORE LEXICONS (Domain detection)

| Bank | EN | PT | ES | Target/lang | % Complete |
|------|-----|-----|-----|-------------|------------|
| finance | 10 | 10 | 10 | 2,500 | 0.4% |
| accounting | 8 | 8 | 8 | 2,000 | 0.4% |
| legal | 10 | 10 | 10 | 3,000 | 0.3% |
| medical | 8 | 8 | 8 | 6,000 | 0.1% |
| excel | 8 | 8 | 8 | 1,500 | 0.5% |

**BLOCKER:** Domain detection is essentially disabled. Finance terms like "EBITDA", "margin", "revenue" won't boost finance intent.

### UNWIRED LEXICONS (Present but not loaded)

| Bank | Entries | Status |
|------|---------|--------|
| agile_project_mgmt.json | 350 | **UNWIRED** |
| analytics_telemetry.json | 100 | **UNWIRED** |
| analytics_telemetry_ext.json | 200 | **UNWIRED** |
| compliance_security.json | 100 | **UNWIRED** |
| compliance_security_ext.json | 350 | **UNWIRED** |
| computation_lexicon.json | 419 | **UNWIRED** |
| marketing_service_quality.json | 450 | **UNWIRED** |
| navigation_lexicon.json | 306 | **PARTIAL** |
| navigation_ui.json | 50 | **UNWIRED** |
| navigation_ui_ext.json | 200 | **UNWIRED** |

**ACTION:** Either wire these or remove them.

---

## PHASE 0 GAPS: Templates

### CORE TEMPLATES (Answer composition)

| Bank | EN | PT | ES | Target/lang | % Complete |
|------|-----|-----|-----|-------------|------------|
| answer_styles | 6 | 6 | 6 | 600 | 1% |
| clarify_templates | 5 | 5 | 5 | 200 | 2.5% |
| error_templates | 5 | 5 | 5 | 200 | 2.5% |
| file_actions_microcopy | 6 | 6 | 6 | 180 | 3% |

**BLOCKER:** answer_styles at 6 entries means the model has almost no template guidance for different response types.

---

## PHASE 0 GAPS: ES Parity

| Category | EN Files | PT Files | ES Files | ES Gap |
|----------|----------|----------|----------|--------|
| triggers | ~90 | ~90 | ~35 | -55 |
| negatives | ~34 | ~34 | ~12 | -22 |
| overlays | ~18 | ~18 | ~5 | -13 |
| formatting | ~10 | ~10 | 0 | -10 |
| **TOTAL** | 154 | 154 | 59 | -95 |

**DECISION REQUIRED:** Either fill 95+ ES files or disable ES support.

---

## GENERATION TARGETS (Minimum for ChatGPT-feel)

### Triggers to Generate

| Bank | EN Target | PT Target | ES Target | Total New |
|------|-----------|-----------|-----------|-----------|
| primary_intents | +947 | +962 | +964 | 2,873 |
| documents_subintents | +1,473 | +1,474 | +1,474 | 4,421 |
| file_actions_subintents | +1,312 | +1,312 | +1,312 | 3,936 |
| finance_subintents | +866 | +871 | +872 | 2,609 |
| legal_subintents | +870 | +874 | +874 | 2,618 |
| accounting_subintents | +774 | +782 | +782 | 2,338 |
| help_subintents | +250 | +250 | +250 | 750 |
| edit_subintents | +250 | +250 | +250 | 750 |
| reasoning_subintents | +250 | +250 | +250 | 750 |
| doc_stats_subintents | +250 | +250 | +250 | 750 |
| **SUBTOTAL** | | | | ~21,800 |

### Normalizers to Generate

| Bank | Current | Target | To Generate |
|------|---------|--------|-------------|
| filename | 6 | 500 | +494 |
| numbers_currency | 14 | 600 | +586 |
| typos | 8 | 500 | +492 |
| time_windows | 33 | 300 | +267 |
| language_indicators | 52 | 800 | +748 |
| diacritics_pt | 12 | 250 | +238 |
| diacritics_es | 7 | 250 | +243 |
| **SUBTOTAL** | | | ~3,068 |

### Templates to Generate

| Bank | EN Target | PT Target | ES Target | Total New |
|------|-----------|-----------|-----------|-----------|
| answer_styles | +394 | +394 | +394 | 1,182 |
| clarify_templates | +195 | +195 | +195 | 585 |
| error_templates | +195 | +195 | +195 | 585 |
| file_actions_microcopy | +174 | +174 | +174 | 522 |
| **SUBTOTAL** | | | | ~2,874 |

### Lexicons (If wiring enabled)

| Bank | EN Target | PT Target | ES Target | Total New |
|------|-----------|-----------|-----------|-----------|
| finance | +2,490 | +2,490 | +2,490 | 7,470 |
| legal | +2,990 | +2,990 | +2,990 | 8,970 |
| accounting | +1,992 | +1,992 | +1,992 | 5,976 |
| excel | +1,492 | +1,492 | +1,492 | 4,476 |
| **SUBTOTAL** | | | | ~26,892 |

---

## RECOMMENDED APPROACH

### PHASE 4.1: Core Triggers (P0 - Do First)
Generate in order:
1. primary_intents.en/pt/es.json → 1,200 each
2. documents_subintents.en/pt/es.json → 1,600 each
3. file_actions_subintents.en/pt/es.json → 1,400 each

### PHASE 4.2: Normalizers (P0 - Do Second)
Generate in order:
1. filename.json → 500 rules
2. numbers_currency.json → 600 rules
3. language_indicators.json → 800 rules
4. time_windows.json → 300 rules
5. typos.json → 500 rules

### PHASE 4.3: Templates (P1 - Do Third)
Generate in order:
1. answer_styles.en/pt/es.json → 400 each
2. file_actions_microcopy.en/pt/es.json → 180 each

### PHASE 4.4: Domain Subintents (P2 - If time permits)
Generate finance/legal/accounting subintents to at least 500 each.

### PHASE 4.5: Lexicons (P3 - Optional)
Either wire existing lexicons or remove unwired ones.

---

## GATES BEFORE TESTING

| Gate | Requirement | Current | Status |
|------|-------------|---------|--------|
| primary_intents | ≥900/lang | 253 | **FAIL** |
| documents_subintents | ≥1,200/lang | 127 | **FAIL** |
| file_actions_subintents | ≥1,000/lang | 88 | **FAIL** |
| normalizers total | ≥3,500 | 1,511 | **FAIL** |
| templates total | ≥1,500 | 767 | **FAIL** |
| ES parity | ≥80% of EN | 38% | **FAIL** |
| Unwired lexicons | 0 or wired | 10 | **FAIL** |

**ALL GATES MUST PASS BEFORE STRICT 50 CERTIFICATION**
