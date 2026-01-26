# Data Banks - Gap Analysis vs Target

**Generated:** 2026-01-18 16:14:46

---

## Executive Summary

| Metric | Target | Actual | Gap | % Complete |
|--------|--------|--------|-----|------------|
| Grand Total | ~75,000 | 52,817 | 22,183 | 70% |
| Triggers | ~10,650/lang | varies | - | ~80% |
| Negatives | ~2,600 | 5,162 | +2,562 | 199% |
| Overlays | ~3,020 | 2,173 | -847 | 72% |
| Formatting | ~1,200 | 1,687 | +487 | 141% |
| Normalizers | ~4,850 | 1,511 | -3,339 | 31% |
| Lexicons | ~18,100/lang | 4,729 | -13,371 | 26% |
| Templates | ~1,180/lang | 767 | -413 | 65% |

**Note:** Manifest targets appear to be aspirational estimates. Many categories exceed or approach targets despite lower totals.

---

## Detailed Gap Analysis by Category

### TRIGGERS

| Bank | Target | EN Actual | PT Actual | ES Actual | Status |
|------|--------|-----------|-----------|-----------|--------|
| primary_intents | 1,200 | 253 | 238 | 236 | **UNDER** (61% below) |
| decision_families | 500 | - | - | - | **MISSING** |
| documents_subintents | 1,600 | 127 | 126 | 126 | **UNDER** (92% below) |
| file_actions_subintents | 1,400 | 88 | 88 | 88 | **UNDER** (94% below) |
| excel_subintents | 800 | 1,111 | 1,103 | 1,062 | **OVER** (39% above) |
| finance_subintents | 900 | 34 | 29 | 28 | **UNDER** (97% below) |
| legal_subintents | 900 | 30 | 26 | 26 | **UNDER** (97% below) |
| accounting_subintents | 800 | 26 | 18 | 18 | **UNDER** (97% below) |
| medical_subintents | 1,200 | 33 | 30 | 30 | **UNDER** (97% below) |
| help_subintents | 250 | - | - | - | **MISSING** (file exists: help_product) |
| edit_subintents | 250 | - | - | - | **MISSING** |
| reasoning_subintents | 250 | - | - | - | **MISSING** |
| doc_stats_subintents | 250 | - | - | - | **MISSING** (scattered in doc_stats) |

**Trigger Assessment:**
- Excel subintents exceed target by 39%
- Most other subintents significantly under target
- Some target banks don't exist as named (decision_families)
- Pattern distribution shifted to content_location (~4,900 patterns) and format-specific banks

### NEGATIVES

| Bank | Target | EN Actual | PT Actual | ES Actual | Status |
|------|--------|-----------|-----------|-----------|--------|
| not_file_actions | 600 | 40 | 40 | 40 | **UNDER** but expanded variants exist |
| not_help | 450 | 30 | 30 | 30 | **UNDER** but block_help exists |
| not_conversation | 250 | 34 | 34 | 34 | **UNDER** but block_conversation exists |
| not_reasoning | 250 | 24 | 24 | 24 | **UNDER** |
| not_excel_finance | 300 | 22 | 22 | 22 | **UNDER** |
| not_inventory_when_doc_stats | 200 | 18 | 18 | 18 | **UNDER** but expanded version exists |
| not_filename_when_locator | 250 | 10 | 10 | 10 | **UNDER** |
| force_clarify | 180 | 10 | 10 | 10 | **UNDER** but expanded version exists |
| force_disambiguate | 120 | 10 | 10 | 10 | **UNDER** |

**Negative Assessment:**
- Core negatives under target BUT many expanded block_* variants created
- Total negatives (5,162) almost DOUBLE manifest target (~2,600)
- Effective coverage likely adequate due to variant expansion

### OVERLAYS

| Bank | Target | EN Actual | PT Actual | ES Actual | Status |
|------|--------|-----------|-----------|-----------|--------|
| followup_inherit | 600 | 13 | 12 | 12 | **UNDER** but expanded variants exist |
| followup_file_actions | 350 | 9 | 8 | 8 | **UNDER** |
| format_request | 900 | 15 | 14 | 13 | **UNDER** but expanded variants exist |
| clarify_required | 400 | 7 | 7 | 7 | **UNDER** but expanded variants exist |
| drift_detectors | 450 | 21 | - | - | **UNDER** (shared only) |
| scope_rules | 320 | 12 | - | - | **UNDER** (shared only) |

**Overlay Assessment:**
- All core overlays under target individually
- But expanded variants (followup_inherit_continuation, format_request_table, etc.) add ~1,500 more
- Total overlays (2,173) at 72% of target

### FORMATTING

| Bank | Target | Actual | Status |
|------|--------|--------|--------|
| constraints | 900 | 42 | **UNDER** |
| validators | 90 | 11 | **UNDER** |
| repair_rules | 120 | 5 | **UNDER** |
| readability_rules | 90 | 3 | **UNDER** |

**Formatting Assessment:**
- Core shared banks under target
- But language-specific banks (bullets, table, exact_count, etc.) add ~1,500 more
- Total formatting (1,687) exceeds manifest target (~1,200) by 41%

### NORMALIZERS

| Bank | Target | Actual | Status |
|------|--------|--------|--------|
| language_indicators | 800 | 52 | **UNDER** |
| filename | 500 | 6 | **UNDER** |
| filetypes | 200 | 25 | **UNDER** |
| months | 700 | 84+400 | **CLOSE** |
| quarters | 350 | 40+160 | **CLOSE** |
| time_windows | 300 | 33 | **UNDER** |
| numbers_currency | 600 | 14 | **UNDER** |
| typos | 500 | 8 | **UNDER** |
| diacritics_pt | 250 | 12 | **UNDER** |
| diacritics_es | 250 | 7 | **UNDER** |
| abbreviations_finance | 200 | 9 | **UNDER** |
| abbreviations_legal | 200 | 6 | **UNDER** |
| abbreviations_medical | 250 | 8 | **UNDER** |

**Normalizer Assessment:**
- Significantly under target in all banks
- Total (1,511) only 31% of target (~4,850)
- **Major gap area** - need expansion

### LEXICONS

| Bank | Target | EN Actual | PT Actual | ES Actual | Status |
|------|--------|-----------|-----------|-----------|--------|
| finance | 2,500 | 10 | 10 | 10 | **UNDER** but finance_accounting adds ~450 |
| accounting | 2,000 | 8 | 8 | 8 | **UNDER** |
| legal | 3,000 | 10 | 10 | 10 | **UNDER** |
| medical | 6,000 | 8 | 8 | 8 | **UNDER** |
| excel | 1,500 | 8 | 8 | 8 | **UNDER** |
| project_agile | 800 | 8 | 8 | 8 | **UNDER** but agile_project_mgmt adds 350 |
| marketing_service_quality | 1,000 | - | - | - | **UNDER** but shared version has 450 |
| analytics_telemetry | 800 | - | - | - | **UNDER** but shared version has 100+200 |
| ui_navigation | 500 | 8 | 8 | 8 | **UNDER** but navigation adds ~400/lang |

**Lexicon Assessment:**
- Language-specific banks extremely under target
- Shared banks partially compensate
- Total (4,729) only 26% of target (~18,100)
- **Major gap area** - lexicons need significant expansion

### TEMPLATES

| Bank | Target | EN Actual | PT Actual | ES Actual | Status |
|------|--------|-----------|-----------|-----------|--------|
| answer_styles | 600 | 6 | 6 | 6 | **UNDER** |
| file_actions_microcopy | 180 | 6 | 6 | 6 | **UNDER** but shared has 75 |
| clarify_templates | 200 | 5 | 5 | 5 | **UNDER** |
| error_templates | 200 | 5 | 5 | 5 | **UNDER** |

**Template Assessment:**
- Core template banks under target
- But format-specific banks (pdf_answers, pptx_answers, etc.) add significant coverage
- Total (767) at 65% of target (~1,180)

---

## Missing Banks (per Manifest)

| Bank | Category | Target | Status |
|------|----------|--------|--------|
| decision_families | triggers | 500 | **NOT CREATED** |
| help_subintents | triggers | 250 | **SCATTERED** (exists as help_product) |
| edit_subintents | triggers | 250 | **NOT CREATED** |
| reasoning_subintents | triggers | 250 | **NOT CREATED** |
| doc_stats_subintents | triggers | 250 | **SCATTERED** (exists as doc_stats) |

---

## Pattern Count Comparison

### What Manifest Expected vs Reality

| Category | Manifest Target | Actual | Variance |
|----------|-----------------|--------|----------|
| triggers (per lang) | ~10,650 | EN: ~11,000, PT: ~11,000, ES: ~8,500 | EN/PT OK, ES under |
| negatives | ~2,600 | 5,162 | +99% (overshoot) |
| overlays | ~3,020 | 2,173 | -28% |
| formatting | ~1,200 | 1,687 | +41% |
| normalizers | ~4,850 | 1,511 | -69% |
| lexicons (per lang) | ~18,100 | ~1,500/lang + 2,700 shared | -87% |
| templates (per lang) | ~1,180 | ~250/lang + 130 shared | -65% |

---

## Priority Gap Closure

### HIGH PRIORITY (Critical for routing accuracy)

1. **Normalizers expansion** - Currently 31% of target
   - language_indicators needs +750 patterns
   - time_windows needs +270 patterns
   - numbers_currency needs +580 patterns

2. **Lexicons expansion** - Currently 26% of target
   - medical needs +5,900 terms
   - legal needs +2,900 terms
   - finance needs +2,400 terms
   - accounting needs +1,900 terms

### MEDIUM PRIORITY (Quality improvements)

3. **Templates expansion** - Currently 65% of target
   - answer_styles needs richer variations
   - clarify_templates needs more scenarios

4. **ES language parity** - Currently 38% of EN/PT
   - ~95 more ES files needed

### LOWER PRIORITY (Nice to have)

5. **Missing trigger banks**
   - decision_families (500 patterns)
   - edit_subintents (250 patterns)
   - reasoning_subintents (250 patterns)

---

## Recommendations

1. **Lexicons are the biggest gap** - 26% complete. However, routing still works because triggers carry the load. Lexicons enhance domain detection precision.

2. **Normalizers are second biggest gap** - 31% complete. Query cleaning may miss some variations. Priority: time expressions, language detection.

3. **Manifest targets may be aspirational** - Some targets (18,100 lexicon terms/language) seem designed for perfect coverage. Current banks provide functional coverage.

4. **Pattern distribution differs from plan** - Manifest assumed even distribution. Reality: heavy investment in content_location and excel_subintents, lighter in domain lexicons.

5. **ES parity should be prioritized** - Core routing works in ES, but edge case handling weaker than EN/PT.
