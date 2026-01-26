# Data Banks - Language Parity Report

**Generated:** 2026-01-18 16:14:46

---

## Executive Summary

| Language | Files | % of Total |
|----------|-------|------------|
| English (en) | 154 | 33.7% |
| Portuguese (pt) | 154 | 33.7% |
| Spanish (es) | 59 | 12.9% |
| Unknown/Shared | 90 | 19.7% |

**Status:** EN/PT have perfect parity (154 files each). ES significantly behind with only 38% coverage.

---

## Parity by Category

### Triggers (227 files)

| Bank Family | EN | PT | ES | Parity Status |
|-------------|-----|-----|-----|---------------|
| primary_intents | 253 | 238 | 236 | OK |
| documents_subintents | 127 | 126 | 126 | OK |
| file_actions_subintents | 88 | 88 | 88 | OK |
| excel_subintents | 1,111 | 1,103 | 1,062 | OK |
| finance_subintents | 34 | 29 | 28 | OK |
| legal_subintents | 30 | 26 | 26 | OK |
| accounting_subintents | 26 | 18 | 18 | OK |
| medical_subintents | 33 | 30 | 30 | OK |
| navigation_operators | 247 | 296 | 258 | OK |
| content_location | 1,670 | 1,722 | 1,482 | OK |
| pdf_content_location | 170 | 181 | 159 | OK |
| pptx_content_location | 225 | 236 | 224 | OK |
| docx_content_location | 208 | 256 | 203 | OK |
| shared_content_location | 196 | 259 | 199 | OK |
| pdf_clause_section | 176 | 195 | 177 | OK |
| pdf_table_figure_chart | 100 | 95 | 95 | OK |
| pptx_extraction | 114 | 134 | 112 | OK |
| pptx_structural_analysis | 149 | 178 | 156 | OK |
| docx_extraction | 157 | 191 | 154 | OK |
| docx_format_analysis | 137 | 160 | 135 | OK |
| shared_format_analysis | 183 | 238 | 183 | OK |
| primary_documents | 258 | 260 | - | **MISSING ES** |
| primary_file_actions | 200 | 199 | - | **MISSING ES** |
| primary_help | 119 | 120 | - | **MISSING ES** |
| documents_qa | 220 | 220 | - | **MISSING ES** |
| documents_summarize | 140 | 140 | - | **MISSING ES** |
| finance_excel | 260 | 260 | - | **MISSING ES** |
| *(many more EN/PT only)* | - | - | - | - |

### Negatives (68 files)

| Bank Family | EN | PT | ES | Parity Status |
|-------------|-----|-----|-----|---------------|
| not_file_actions | 40 | 40 | 40 | OK |
| not_help | 30 | 30 | 30 | OK |
| not_conversation | 34 | 34 | 34 | OK |
| not_reasoning | 24 | 24 | 24 | OK |
| not_excel_finance | 22 | 22 | 22 | OK |
| not_inventory_when_doc_stats | 18 | 18 | 18 | OK |
| not_filename_when_locator | 10 | 10 | 10 | OK |
| force_clarify | 10 | 10 | 10 | OK |
| force_disambiguate | 10 | 10 | 10 | OK |
| keep_file_actions_storage | 72 | 86 | 85 | OK |
| not_file_actions_content | 122 | 157 | 123 | OK |
| not_file_actions_content_location | 173 | 216 | 188 | OK |
| not_navigation_content | 159 | 203 | 199 | OK |
| block_file_actions_when_content | 236 | 240 | - | **MISSING ES** |
| block_file_list_when_content | 180 | 180 | - | **MISSING ES** |
| block_help_when_content | 200 | 200 | - | **MISSING ES** |
| block_finance_when_no_terms | 140 | 140 | - | **MISSING ES** |
| block_conversation_when_doc | 120 | 120 | - | **MISSING ES** |
| block_inventory_when_doc_stats | 100 | 100 | - | **MISSING ES** |
| block_analytics_when_content | 80 | 80 | - | **MISSING ES** |
| block_doc_count_when_stats | 80 | 80 | - | **MISSING ES** |
| block_generic_empty_sources | 80 | 80 | - | **MISSING ES** |
| block_exact_filename_fuzzy | 60 | 60 | - | **MISSING ES** |
| force_clarify_empty_sources | 40 | 40 | - | **MISSING ES** |

### Overlays (35 files)

| Bank Family | EN | PT | ES | Parity Status |
|-------------|-----|-----|-----|---------------|
| followup_inherit | 13 | 12 | 12 | OK |
| followup_file_actions | 9 | 8 | 8 | OK |
| format_request | 15 | 14 | 13 | OK |
| clarify_required | 7 | 7 | 7 | OK |
| navigation_followups | 85 | 86 | 85 | OK |
| followup_inherit_continuation | 120 | 120 | - | **MISSING ES** |
| followup_inherit_pronoun | 200 | 200 | - | **MISSING ES** |
| format_request_line | 45 | 45 | - | **MISSING ES** |
| format_request_list | 180 | 179 | - | **MISSING ES** |
| format_request_sentence | 45 | 45 | - | **MISSING ES** |
| format_request_table | 90 | 90 | - | **MISSING ES** |
| clarify_ambiguous_doc | 80 | 80 | - | **MISSING ES** |
| clarify_multiple_files | 60 | 60 | - | **MISSING ES** |
| clarify_not_found | 60 | 60 | - | **MISSING ES** |

### Formatting (23 files)

| Bank Family | EN | PT | ES | Parity Status |
|-------------|-----|-----|-----|---------------|
| bullets | 100 | 100 | - | **MISSING ES** |
| category_grouping | 60 | 60 | - | **MISSING ES** |
| exact_count | 140 | 140 | - | **MISSING ES** |
| line_limit | 70 | 70 | - | **MISSING ES** |
| numbered_steps | 90 | 90 | - | **MISSING ES** |
| paragraph_limit | 70 | 70 | - | **MISSING ES** |
| ranking_topn | 80 | 80 | - | **MISSING ES** |
| sentence_limit | 70 | 70 | - | **MISSING ES** |
| table | 120 | 120 | - | **MISSING ES** |

### Normalizers (21 files)

| Bank Family | EN | PT | ES | Parity Status |
|-------------|-----|-----|-----|---------------|
| periods | 69 | 79 | 79 | OK |
| diacritics_pt | - | 12 | - | PT only |
| diacritics_es | - | - | 7 | ES only |
| *(all others)* | - | - | - | Shared (language-agnostic) |

### Lexicons (38 files)

| Bank Family | EN | PT | ES | Parity Status |
|-------------|-----|-----|-----|---------------|
| finance | 10 | 10 | 10 | OK |
| accounting | 8 | 8 | 8 | OK |
| legal | 10 | 10 | 10 | OK |
| medical | 8 | 8 | 8 | OK |
| excel | 8 | 8 | 8 | OK |
| project_agile | 8 | 8 | 8 | OK |
| ui_navigation | 8 | 8 | 8 | OK |
| navigation | 344 | 457 | 432 | OK |
| finance_accounting | 107 | 117 | 117 | OK |

### Templates (32 files)

| Bank Family | EN | PT | ES | Parity Status |
|-------------|-----|-----|-----|---------------|
| answer_styles | 6 | 6 | 6 | OK |
| clarify_templates | 5 | 5 | 5 | OK |
| error_templates | 5 | 5 | 5 | OK |
| file_actions_microcopy | 6 | 6 | 6 | OK |
| navigation_answers | 21 | 24 | 21 | OK |
| pdf_answers | 47 | 58 | 47 | OK |
| pptx_answers | 23 | 23 | 23 | OK |
| docx_answers | 26 | 33 | 26 | OK |
| excel_answers | 27 | 28 | 28 | OK |
| shared_answers | 36 | 47 | 36 | OK |

---

## ES Gap Analysis

### Files Missing ES Versions

**HIGH PRIORITY (triggers):**
- primary_documents, primary_file_actions, primary_help
- documents_qa, documents_summarize
- finance_excel
- All file_* triggers (file_list, file_open, file_search, etc.)
- doc_* triggers (doc_analytics, doc_compare, doc_count, etc.)
- overlay_* triggers

**MEDIUM PRIORITY (negatives):**
- block_file_actions_when_content
- block_file_list_when_content
- block_help_when_content
- block_finance_when_no_terms
- All block_* files

**MEDIUM PRIORITY (overlays):**
- followup_inherit_continuation
- followup_inherit_pronoun
- format_request_line, format_request_list, format_request_sentence, format_request_table
- clarify_ambiguous_doc, clarify_multiple_files, clarify_not_found

**LOWER PRIORITY (formatting):**
- All formatting banks (bullets, exact_count, line_limit, etc.)

### Estimated Work to Full ES Parity

| Category | Files Needed | Patterns Needed |
|----------|--------------|-----------------|
| triggers | ~80 | ~8,000 |
| negatives | ~20 | ~2,000 |
| overlays | ~12 | ~1,000 |
| formatting | ~10 | ~800 |
| **TOTAL** | **~122** | **~11,800** |

---

## Recommendations

1. **ES is functional for core operations** - Navigation, primary intents, format-specific templates, lexicons have full ES coverage

2. **ES gaps mainly affect edge cases** - Missing ES files are mostly expanded/detailed trigger variants

3. **Prioritize ES negatives** - Missing negative banks could cause routing confusion in ES queries

4. **Formatting ES not critical** - Most formatting constraints work language-agnostically

5. **Consider consolidation** - Many EN/PT-only files could be combined into shared banks with multi-language patterns
