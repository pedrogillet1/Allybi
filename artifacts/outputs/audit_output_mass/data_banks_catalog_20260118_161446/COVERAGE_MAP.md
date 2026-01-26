# Data Banks - Capability Coverage Map

**Generated:** 2026-01-18 16:14:46

---

## Capability → Banks Mapping

This document maps user-facing capabilities to the data banks that power them.

---

## 1. Intent Routing Capabilities

### PRIMARY_INTENTS → Which family?

| Capability | Banks Used | Patterns |
|------------|------------|----------|
| Detect documents intent | triggers/primary_intents.*.json, triggers/primary_documents.*.json | ~1,000 |
| Detect file_actions intent | triggers/primary_intents.*.json, triggers/primary_file_actions.*.json | ~700 |
| Detect help intent | triggers/primary_intents.*.json, triggers/primary_help.*.json | ~500 |
| Detect conversation intent | triggers/primary_intents.*.json, triggers/primary_conversation.*.json | ~400 |
| Detect reasoning intent | triggers/primary_intents.*.json, triggers/primary_reasoning.*.json | ~400 |
| Detect excel intent | triggers/primary_intents.*.json, triggers/primary_excel.*.json | ~320 |
| Detect finance intent | triggers/primary_intents.*.json, triggers/primary_finance.*.json | ~360 |
| Detect legal intent | triggers/primary_intents.*.json, triggers/primary_legal.*.json | ~360 |
| Detect medical intent | triggers/primary_intents.*.json, triggers/primary_medical.*.json | ~360 |
| Detect accounting intent | triggers/primary_intents.*.json, triggers/primary_accounting.*.json | ~340 |

### SUBINTENT_ROUTING → Which operation?

| Capability | Banks Used | Patterns |
|------------|------------|----------|
| Document summarization | triggers/documents_subintents.*.json, triggers/documents_summarize.*.json | ~500 |
| Document Q&A | triggers/documents_subintents.*.json, triggers/documents_qa.*.json | ~800 |
| Document extraction | triggers/documents_subintents.*.json, triggers/documents_extract*.json | ~700 |
| Document search | triggers/documents_subintents.*.json, triggers/documents_search*.json | ~700 |
| Document comparison | triggers/documents_subintents.*.json, triggers/doc_compare.*.json | ~340 |

---

## 2. File Actions Capabilities

### FILE_OPERATIONS → What to do with files?

| Capability | Banks Used | Patterns |
|------------|------------|----------|
| List all files | triggers/file_list*.json, triggers/file_actions_subintents.*.json | ~700 |
| Open/preview file | triggers/file_open*.json, triggers/file_preview.*.json | ~700 |
| Find file location | triggers/file_location.*.json, triggers/file_search.*.json | ~600 |
| Filter by type | triggers/file_type_filter.*.json, triggers/doc_filter_extension.*.json | ~300 |
| Search by topic | triggers/file_search_by_topic.*.json, triggers/file_semantic.*.json | ~400 |
| Folder operations | triggers/file_folder_ops.*.json, triggers/file_list_folder*.json | ~400 |

### NAVIGATION_OPERATORS → How to navigate?

| Capability | Banks Used | Patterns |
|------------|------------|----------|
| Locate file | triggers/navigation_operators.*.json (locate_file) | ~100 |
| Open file | triggers/navigation_operators.*.json (open_file) | ~100 |
| List folder | triggers/navigation_operators.*.json (list_folder) | ~100 |
| Show path | triggers/navigation_operators.*.json (show_path) | ~80 |
| Show siblings | triggers/navigation_operators.*.json (show_siblings) | ~80 |
| Show tree | triggers/navigation_operators.*.json (show_tree) | ~80 |
| Filter in context | triggers/navigation_operators.*.json (filter_in_context) | ~80 |
| Go up | triggers/navigation_operators.*.json (go_up) | ~60 |
| Recent files | triggers/navigation_operators.*.json (recent_files) | ~60 |
| File exists | triggers/navigation_operators.*.json (file_exists) | ~60 |

---

## 3. Content Location Capabilities

### CONTENT_LOCATION → Where in the document?

| Capability | Banks Used | Patterns |
|------------|------------|----------|
| Generic content location | triggers/content_location.*.json | ~4,900 |
| PDF-specific location | triggers/pdf_content_location.*.json, triggers/pdf_clause_section.*.json | ~1,000 |
| PPTX-specific location | triggers/pptx_content_location.*.json | ~700 |
| DOCX-specific location | triggers/docx_content_location.*.json | ~700 |
| Table/figure location | triggers/pdf_table_figure_chart.*.json | ~300 |

---

## 4. Domain-Specific Capabilities

### EXCEL_SPREADSHEET → Spreadsheet operations

| Capability | Banks Used | Patterns |
|------------|------------|----------|
| Sheet operations | triggers/excel_subintents.*.json (sheets) | ~400 |
| Column operations | triggers/excel_subintents.*.json (columns) | ~400 |
| Formula detection | triggers/excel_subintents.*.json (formulas) | ~300 |
| Totals/sums | triggers/excel_subintents.*.json (totals) | ~400 |
| Pivot tables | triggers/excel_subintents.*.json (pivots) | ~300 |
| Charts | triggers/excel_subintents.*.json (charts) | ~300 |
| Filters | triggers/excel_subintents.*.json (filters) | ~300 |
| Range operations | triggers/excel_subintents.*.json (ranges) | ~300 |

### FINANCE_DOMAIN → Finance queries

| Capability | Banks Used | Patterns |
|------------|------------|----------|
| EBITDA queries | triggers/finance_subintents.*.json, lexicons/finance*.json | ~200 |
| Revenue analysis | triggers/finance_subintents.*.json, lexicons/finance*.json | ~200 |
| Margin calculations | triggers/finance_subintents.*.json, lexicons/finance*.json | ~150 |
| Trend analysis | triggers/trend_analysis.json, triggers/finance_excel.*.json | ~400 |
| Financial ratios | triggers/finance_subintents.*.json | ~100 |

### LEGAL_DOMAIN → Legal queries

| Capability | Banks Used | Patterns |
|------------|------------|----------|
| Clause extraction | triggers/legal_subintents.*.json, triggers/pdf_clause_section.*.json | ~300 |
| Penalty detection | triggers/legal_subintents.*.json | ~80 |
| Liability clauses | triggers/legal_subintents.*.json | ~80 |
| Contract terms | triggers/legal_subintents.*.json, lexicons/legal.*.json | ~120 |

### MEDICAL_DOMAIN → Medical queries

| Capability | Banks Used | Patterns |
|------------|------------|----------|
| Lab results | triggers/medical_subintents.*.json | ~100 |
| Vitals extraction | triggers/medical_subintents.*.json | ~80 |
| Medication detection | triggers/medical_subintents.*.json | ~100 |
| Diagnosis extraction | triggers/medical_subintents.*.json | ~100 |

---

## 5. Negative Dampening Capabilities

### ROUTING_GUARDS → Prevent misrouting

| Capability | Banks Used | Patterns |
|------------|------------|----------|
| Block file_actions for content | negatives/not_file_actions*.json, negatives/block_file_actions*.json | ~1,000 |
| Block help for documents | negatives/not_help*.json, negatives/block_help*.json | ~500 |
| Block conversation for docs | negatives/not_conversation.*.json, negatives/block_conversation*.json | ~350 |
| Block navigation for content | negatives/not_navigation_content.*.json | ~560 |
| Block finance without terms | negatives/not_excel_finance.*.json, negatives/block_finance*.json | ~350 |
| Block reasoning for factual | negatives/not_reasoning.*.json | ~75 |

---

## 6. Context/Follow-up Capabilities

### CONTEXT_INHERITANCE → Multi-turn

| Capability | Banks Used | Patterns |
|------------|------------|----------|
| Pronoun resolution | overlays/followup_inherit*.json | ~750 |
| Continuation detection | overlays/followup_inherit_continuation.*.json | ~240 |
| File reference carry | overlays/followup_file_actions.*.json | ~25 |

### NAVIGATION_FOLLOWUPS → What next?

| Capability | Banks Used | Patterns |
|------------|------------|----------|
| After locate_file | overlays/navigation_followups.*.json | ~25 |
| After open_file | overlays/navigation_followups.*.json | ~25 |
| After list_folder | overlays/navigation_followups.*.json | ~25 |
| After disambiguation | overlays/navigation_followups.*.json | ~20 |

---

## 7. Format Detection Capabilities

### FORMAT_CONSTRAINTS → User format requests

| Capability | Banks Used | Patterns |
|------------|------------|----------|
| Bullet list request | overlays/format_request*.json, formatting/bullets.*.json | ~500 |
| Table request | overlays/format_request_table.*.json, formatting/table.*.json | ~420 |
| Line/sentence limit | overlays/format_request_line.*.json, formatting/*_limit.*.json | ~450 |
| Exact count | formatting/exact_count.*.json | ~280 |
| Ranking/top-N | formatting/ranking_topn.*.json | ~160 |

---

## 8. Query Normalization Capabilities

### NORMALIZATION → Clean query

| Capability | Banks Used | Patterns |
|------------|------------|----------|
| Language detection | normalizers/language_indicators.json | ~50 |
| Filename cleanup | normalizers/filename.json | ~6 |
| Filetype mapping | normalizers/filetypes.json | ~25 |
| Month normalization | normalizers/month*.json | ~500 |
| Quarter normalization | normalizers/quarter*.json | ~200 |
| Time window parsing | normalizers/time_windows.json | ~33 |
| Typo correction | normalizers/typos.json, rules/typo_normalization.json | ~210 |
| Diacritics stripping | normalizers/diacritics*.json | ~140 |
| Abbreviation expansion | normalizers/abbreviations*.json | ~25 |

---

## 9. Answer Generation Capabilities

### ANSWER_TEMPLATES → Response formatting

| Capability | Banks Used | Patterns |
|------------|------------|----------|
| Definition answers | templates/answer_styles.*.json | ~6 |
| Summary answers | templates/answer_styles.*.json | ~6 |
| List answers | templates/answer_styles.*.json | ~6 |
| PDF-specific | templates/pdf_answers.*.json | ~150 |
| PPTX-specific | templates/pptx_answers.*.json | ~70 |
| DOCX-specific | templates/docx_answers.*.json | ~85 |
| Excel-specific | templates/excel_answers.*.json | ~85 |
| Navigation responses | templates/navigation_answers.*.json | ~65 |
| File action microcopy | templates/file_actions_microcopy.*.json | ~95 |
| Clarification messages | templates/clarify_templates.*.json | ~15 |
| Error messages | templates/error_templates.*.json | ~15 |

---

## Capability Coverage Summary

| Capability Area | Banks | Patterns | Coverage |
|-----------------|-------|----------|----------|
| Intent Routing | 45 | ~8,000 | Strong |
| File Actions | 35 | ~4,500 | Strong |
| Navigation | 6 | ~1,200 | Strong |
| Content Location | 15 | ~7,500 | Strong |
| Excel Operations | 3 | ~3,500 | Strong |
| Finance Domain | 8 | ~1,500 | Good |
| Legal Domain | 5 | ~600 | Moderate |
| Medical Domain | 5 | ~500 | Moderate |
| Negative Guards | 35 | ~5,200 | Strong |
| Context/Follow-up | 12 | ~1,500 | Strong |
| Format Detection | 20 | ~2,500 | Strong |
| Normalization | 21 | ~1,500 | Strong |
| Answer Templates | 32 | ~800 | Strong |

---

## Gaps to Address

1. **Legal domain** - Only 600 patterns, needs expansion for clause types
2. **Medical domain** - Only 500 patterns, needs condition/procedure expansion
3. **Accounting subintents** - Only 62 patterns total, needs expansion
4. **ES language** - Many capabilities EN/PT only
