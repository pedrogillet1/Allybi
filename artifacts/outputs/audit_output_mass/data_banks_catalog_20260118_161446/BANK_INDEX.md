# Data Banks - Complete File Index

**Generated:** 2026-01-18 16:14:46

---

## Directory Structure

```
src/data_banks/
├── aliases/          (3 files)
├── formatting/       (23 files)
├── lexicons/         (38 files)
├── manifests/        (1 file)
├── negatives/        (68 files)
├── normalizers/      (21 files)
├── overlays/         (35 files)
├── rules/            (3 files)
├── signals/          (5 files)
├── templates/        (32 files)
├── triggers/         (227 files)
└── pattern_bank.runtime.json (1 file - legacy root)
```

---

## aliases/ (3 files, 179 entries)

| File | Entries | Language |
|------|---------|----------|
| document_type_aliases.json | 52 | shared |
| finance_aliases.json | 103 | shared |
| time_period_aliases.json | 24 | shared |

---

## formatting/ (23 files, 1,687 entries)

| File | Entries | Language |
|------|---------|----------|
| bullets.en.json | 100 | en |
| bullets.pt.json | 100 | pt |
| category_grouping.en.json | 60 | en |
| category_grouping.pt.json | 60 | pt |
| constraints.json | 42 | shared |
| exact_count.en.json | 140 | en |
| exact_count.pt.json | 140 | pt |
| excel_validators.json | 26 | shared |
| line_limit.en.json | 70 | en |
| line_limit.pt.json | 70 | pt |
| numbered_steps.en.json | 90 | en |
| numbered_steps.pt.json | 90 | pt |
| paragraph_limit.en.json | 70 | en |
| paragraph_limit.pt.json | 70 | pt |
| ranking_topn.en.json | 80 | en |
| ranking_topn.pt.json | 80 | pt |
| readability_rules.json | 3 | shared |
| repair_rules.json | 5 | shared |
| sentence_limit.en.json | 70 | en |
| sentence_limit.pt.json | 70 | pt |
| table.en.json | 120 | en |
| table.pt.json | 120 | pt |
| validators.json | 11 | shared |

**Note:** ES formatting missing - EN/PT only

---

## lexicons/ (38 files, 4,729 entries)

| File | Entries | Language |
|------|---------|----------|
| accounting.en.json | 8 | en |
| accounting.es.json | 8 | es |
| accounting.pt.json | 8 | pt |
| agile_project_mgmt.json | 350 | shared |
| analytics_telemetry.json | 100 | shared |
| analytics_telemetry_ext.json | 200 | shared |
| compliance_security.json | 100 | shared |
| compliance_security_ext.json | 350 | shared |
| computation_lexicon.json | 419 | shared |
| excel.en.json | 8 | en |
| excel.es.json | 8 | es |
| excel.pt.json | 8 | pt |
| finance.en.json | 10 | en |
| finance.es.json | 10 | es |
| finance.pt.json | 10 | pt |
| finance_accounting.json | 450 | shared |
| finance_accounting.en.json | 107 | en |
| finance_accounting.es.json | 117 | es |
| finance_accounting.pt.json | 117 | pt |
| legal.en.json | 10 | en |
| legal.es.json | 10 | es |
| legal.pt.json | 10 | pt |
| marketing_service_quality.json | 450 | shared |
| medical.en.json | 8 | en |
| medical.es.json | 8 | es |
| medical.pt.json | 8 | pt |
| navigation.en.json | 344 | en |
| navigation.es.json | 432 | es |
| navigation.pt.json | 457 | pt |
| navigation_lexicon.json | 306 | shared |
| navigation_ui.json | 50 | shared |
| navigation_ui_ext.json | 200 | shared |
| project_agile.en.json | 8 | en |
| project_agile.es.json | 8 | es |
| project_agile.pt.json | 8 | pt |
| ui_navigation.en.json | 8 | en |
| ui_navigation.es.json | 8 | es |
| ui_navigation.pt.json | 8 | pt |

---

## manifests/ (1 file, 251 entries)

| File | Entries | Purpose |
|------|---------|---------|
| banks.manifest.json | 251 | Master manifest defining all banks and targets |

---

## negatives/ (68 files, 5,162 entries)

| File | Entries | Language | Blocks |
|------|---------|----------|--------|
| block_analytics_when_content.en.json | 80 | en | analytics |
| block_analytics_when_content.pt.json | 80 | pt | analytics |
| block_conversation_when_doc.en.json | 120 | en | conversation |
| block_conversation_when_doc.pt.json | 120 | pt | conversation |
| block_doc_count_when_stats.en.json | 80 | en | doc_count |
| block_doc_count_when_stats.pt.json | 80 | pt | doc_count |
| block_exact_filename_fuzzy.en.json | 60 | en | filename_fuzzy |
| block_exact_filename_fuzzy.pt.json | 60 | pt | filename_fuzzy |
| block_file_actions_when_content.en.json | 236 | en | file_actions |
| block_file_actions_when_content.pt.json | 240 | pt | file_actions |
| block_file_list_when_content.en.json | 180 | en | file_list |
| block_file_list_when_content.pt.json | 180 | pt | file_list |
| block_finance_when_no_terms.en.json | 140 | en | finance |
| block_finance_when_no_terms.pt.json | 140 | pt | finance |
| block_generic_empty_sources.en.json | 80 | en | generic |
| block_generic_empty_sources.pt.json | 80 | pt | generic |
| block_help_when_content.en.json | 200 | en | help |
| block_help_when_content.pt.json | 200 | pt | help |
| block_inventory_when_doc_stats.en.json | 100 | en | inventory |
| block_inventory_when_doc_stats.pt.json | 100 | pt | inventory |
| force_clarify.en.json | 10 | en | - |
| force_clarify.es.json | 10 | es | - |
| force_clarify.pt.json | 10 | pt | - |
| force_clarify_empty_sources.en.json | 40 | en | - |
| force_clarify_empty_sources.pt.json | 40 | pt | - |
| force_disambiguate.en.json | 10 | en | - |
| force_disambiguate.es.json | 10 | es | - |
| force_disambiguate.pt.json | 10 | pt | - |
| keep_file_actions_storage.en.json | 72 | en | - |
| keep_file_actions_storage.es.json | 85 | es | - |
| keep_file_actions_storage.pt.json | 86 | pt | - |
| not_chitchat.json | 20 | shared | chitchat |
| not_compare.json | 20 | shared | compare |
| not_conversation.en.json | 34 | en | conversation |
| not_conversation.es.json | 34 | es | conversation |
| not_conversation.pt.json | 34 | pt | conversation |
| not_documents_search.json | 29 | shared | documents |
| not_documents_summarize.json | 20 | shared | documents |
| not_excel_finance.en.json | 22 | en | excel/finance |
| not_excel_finance.es.json | 22 | es | excel/finance |
| not_excel_finance.pt.json | 22 | pt | excel/finance |
| not_file_actions.en.json | 40 | en | file_actions |
| not_file_actions.es.json | 40 | es | file_actions |
| not_file_actions.json | 20 | shared | file_actions |
| not_file_actions.pt.json | 40 | pt | file_actions |
| not_file_actions_content.en.json | 122 | en | file_actions |
| not_file_actions_content.es.json | 123 | es | file_actions |
| not_file_actions_content.pt.json | 157 | pt | file_actions |
| not_file_actions_content_location.en.json | 173 | en | file_actions |
| not_file_actions_content_location.es.json | 188 | es | file_actions |
| not_file_actions_content_location.pt.json | 216 | pt | file_actions |
| not_filename_when_locator.en.json | 10 | en | filename |
| not_filename_when_locator.es.json | 10 | es | filename |
| not_filename_when_locator.pt.json | 10 | pt | filename |
| not_finance_excel.json | 20 | shared | finance/excel |
| not_help.en.json | 30 | en | help |
| not_help.es.json | 30 | es | help |
| not_help.pt.json | 30 | pt | help |
| not_help_product.json | 20 | shared | help |
| not_inventory_when_doc_stats.en.json | 18 | en | inventory |
| not_inventory_when_doc_stats.es.json | 18 | es | inventory |
| not_inventory_when_doc_stats.pt.json | 18 | pt | inventory |
| not_navigation_content.en.json | 159 | en | navigation |
| not_navigation_content.es.json | 199 | es | navigation |
| not_navigation_content.pt.json | 203 | pt | navigation |
| not_reasoning.en.json | 24 | en | reasoning |
| not_reasoning.es.json | 24 | es | reasoning |
| not_reasoning.pt.json | 24 | pt | reasoning |

---

## normalizers/ (21 files, 1,511 entries)

| File | Entries | Purpose |
|------|---------|---------|
| abbreviations_finance.json | 9 | Finance abbreviations |
| abbreviations_legal.json | 6 | Legal abbreviations |
| abbreviations_medical.json | 8 | Medical abbreviations |
| diacritics.json | 120 | General diacritics |
| diacritics_es.json | 7 | Spanish diacritics |
| diacritics_pt.json | 12 | Portuguese diacritics |
| filename.json | 6 | Filename normalization |
| filetypes.json | 25 | Filetype mappings |
| folder_path.json | 180 | Folder path expressions |
| language_indicators.json | 52 | Language detection |
| month.json | 400 | Month variations |
| months.json | 84 | Month name mappings |
| numbers_currency.json | 14 | Number/currency formats |
| periods.en.json | 69 | en - Time periods |
| periods.es.json | 79 | es - Time periods |
| periods.pt.json | 79 | pt - Time periods |
| quarter.json | 160 | Quarter expressions |
| quarters.json | 40 | Quarter mappings |
| status_vocabulary.json | 120 | Status terms |
| time_windows.json | 33 | Time window expressions |
| typos.json | 8 | Typo corrections |

---

## overlays/ (35 files, 2,173 entries)

| File | Entries | Purpose |
|------|---------|---------|
| clarify_ambiguous_doc.en.json | 80 | en - Clarify ambiguous |
| clarify_ambiguous_doc.pt.json | 80 | pt - Clarify ambiguous |
| clarify_multiple_files.en.json | 60 | en - Multiple file clarify |
| clarify_multiple_files.pt.json | 60 | pt - Multiple file clarify |
| clarify_not_found.en.json | 60 | en - Not found clarify |
| clarify_not_found.pt.json | 60 | pt - Not found clarify |
| clarify_required.en.json | 7 | en - Clarify triggers |
| clarify_required.es.json | 7 | es - Clarify triggers |
| clarify_required.json | 50 | shared - Clarify rules |
| clarify_required.pt.json | 7 | pt - Clarify triggers |
| drift_detectors.json | 21 | Hallucination detection |
| followup_file_actions.en.json | 9 | en - File follow-ups |
| followup_file_actions.es.json | 8 | es - File follow-ups |
| followup_file_actions.pt.json | 8 | pt - File follow-ups |
| followup_inherit.en.json | 13 | en - Pronoun inheritance |
| followup_inherit.es.json | 12 | es - Pronoun inheritance |
| followup_inherit.json | 90 | shared - Inheritance rules |
| followup_inherit.pt.json | 12 | pt - Pronoun inheritance |
| followup_inherit_continuation.en.json | 120 | en - Continuation |
| followup_inherit_continuation.pt.json | 120 | pt - Continuation |
| followup_inherit_pronoun.en.json | 200 | en - Pronouns |
| followup_inherit_pronoun.pt.json | 200 | pt - Pronouns |
| format_request.en.json | 15 | en - Format detection |
| format_request.es.json | 13 | es - Format detection |
| format_request.json | 70 | shared - Format rules |
| format_request.pt.json | 14 | pt - Format detection |
| format_request_line.en.json | 45 | en - Line limit |
| format_request_line.pt.json | 45 | pt - Line limit |
| format_request_list.en.json | 180 | en - List format |
| format_request_list.pt.json | 179 | pt - List format |
| format_request_sentence.en.json | 45 | en - Sentence limit |
| format_request_sentence.pt.json | 45 | pt - Sentence limit |
| format_request_table.en.json | 90 | en - Table format |
| format_request_table.pt.json | 90 | pt - Table format |
| navigation_followups.en.json | 85 | en - Nav follow-ups |
| navigation_followups.es.json | 85 | es - Nav follow-ups |
| navigation_followups.pt.json | 86 | pt - Nav follow-ups |
| scope_rules.json | 12 | Scope determination |

---

## rules/ (3 files, 384 entries)

| File | Entries | Purpose |
|------|---------|---------|
| formatting_triggers.json | 98 | Format trigger rules |
| tone_banned_phrases.json | 87 | Banned phrase rules |
| typo_normalization.json | 199 | Typo fix rules |

---

## signals/ (5 files, 510 entries)

| File | Entries | Purpose |
|------|---------|---------|
| followup_memory_expanded.json | 140 | Memory follow-up |
| formatting_overlay_expanded.json | 160 | Format overlay |
| *(3 other signal files)* | 210 | Various signals |

---

## templates/ (32 files, 767 entries)

| File | Entries | Language |
|------|---------|----------|
| answer_styles.en.json | 6 | en |
| answer_styles.es.json | 6 | es |
| answer_styles.pt.json | 6 | pt |
| clarify_templates.en.json | 5 | en |
| clarify_templates.es.json | 5 | es |
| clarify_templates.pt.json | 5 | pt |
| docx_answers.en.json | 26 | en |
| docx_answers.es.json | 26 | es |
| docx_answers.pt.json | 33 | pt |
| error_templates.en.json | 5 | en |
| error_templates.es.json | 5 | es |
| error_templates.pt.json | 5 | pt |
| excel_answers.en.json | 27 | en |
| excel_answers.es.json | 28 | es |
| excel_answers.pt.json | 28 | pt |
| file_actions_microcopy.en.json | 6 | en |
| file_actions_microcopy.es.json | 6 | es |
| file_actions_microcopy.json | 75 | shared |
| file_actions_microcopy.pt.json | 6 | pt |
| followup_policy.json | 52 | shared |
| navigation_answers.en.json | 21 | en |
| navigation_answers.es.json | 21 | es |
| navigation_answers.pt.json | 24 | pt |
| pdf_answers.en.json | 47 | en |
| pdf_answers.es.json | 47 | es |
| pdf_answers.pt.json | 58 | pt |
| pptx_answers.en.json | 23 | en |
| pptx_answers.es.json | 23 | es |
| pptx_answers.pt.json | 23 | pt |
| shared_answers.en.json | 36 | en |
| shared_answers.es.json | 36 | es |
| shared_answers.pt.json | 47 | pt |

---

## triggers/ (227 files, 32,076 entries)

### Primary Intent Triggers

| File | EN | PT | ES |
|------|-----|-----|-----|
| primary_intents | 253 | 238 | 236 |
| primary_documents | 258 | 260 | - |
| primary_file_actions | 200 | 199 | - |
| primary_help | 119 | 120 | - |
| primary_conversation | 59 | 60 | - |
| primary_reasoning | 80 | 80 | - |
| primary_excel | 40 | 40 | - |
| primary_finance | 60 | 60 | - |
| primary_legal | 60 | 60 | - |
| primary_medical | 60 | 60 | - |
| primary_accounting | 50 | 50 | - |
| primary_engineering | 50 | 50 | - |
| primary_edit | 80 | 80 | - |
| primary_extraction | 80 | 80 | - |
| primary_memory | 40 | 40 | - |
| primary_preferences | 40 | 40 | - |
| primary_error | 40 | 40 | - |

### Document Subintent Triggers

| File | EN | PT | ES |
|------|-----|-----|-----|
| documents_subintents | 127 | 126 | 126 |
| documents_qa | 220 | 220 | - |
| documents_summarize | 140 | 140 | - |
| documents_extract | - | - | - |
| documents_search | - | - | - |
| documents_search_locator | 180 | 180 | - |
| documents_extract_structured | 180 | 180 | - |

### Content Location Triggers

| File | EN | PT | ES |
|------|-----|-----|-----|
| content_location | 1,670 | 1,722 | 1,482 |
| pdf_content_location | 170 | 181 | 159 |
| pptx_content_location | 225 | 236 | 224 |
| docx_content_location | 208 | 256 | 203 |
| shared_content_location | 196 | 259 | 199 |

### Excel Subintent Triggers

| File | EN | PT | ES |
|------|-----|-----|-----|
| excel_subintents | 1,111 | 1,103 | 1,062 |

### Finance/Legal/Medical Subintent Triggers

| File | EN | PT | ES |
|------|-----|-----|-----|
| finance_subintents | 34 | 29 | 28 |
| finance_excel | 260 | 260 | - |
| legal_subintents | 30 | 26 | 26 |
| accounting_subintents | 26 | 18 | 18 |
| medical_subintents | 33 | 30 | 30 |

### File Action Triggers

| File | EN | PT | ES |
|------|-----|-----|-----|
| file_actions_subintents | 88 | 88 | 88 |
| file_list | 80 | 80 | - |
| file_list_all | 85 | 90 | - |
| file_list_files | 70 | 70 | - |
| file_list_folder | 70 | 70 | - |
| file_list_folders | 68 | 70 | - |
| file_open | 89 | 90 | - |
| file_open_preview | 120 | 120 | - |
| file_preview | 70 | 70 | - |
| file_location | 100 | 100 | - |
| file_search | 100 | 100 | - |
| file_search_by_topic | 120 | 120 | - |
| file_type_filter | 79 | 80 | - |
| file_type_search | 50 | 50 | - |
| file_semantic | 80 | 80 | - |
| file_semantic_folder | 50 | 50 | - |
| file_folder_ops | 80 | 80 | - |
| file_topic_search | 70 | 70 | - |
| file_newest_type | 60 | 60 | - |
| file_same_folder | 35 | 35 | - |
| file_again | 44 | 45 | - |
| file_default | 20 | 20 | - |

### Navigation Triggers

| File | EN | PT | ES |
|------|-----|-----|-----|
| navigation_operators | 247 | 296 | 258 |

### Format-Specific Extraction Triggers

| File | EN | PT | ES |
|------|-----|-----|-----|
| pdf_clause_section | 176 | 195 | 177 |
| pdf_table_figure_chart | 100 | 95 | 95 |
| pptx_extraction | 114 | 134 | 112 |
| pptx_structural_analysis | 149 | 178 | 156 |
| docx_extraction | 157 | 191 | 154 |
| docx_format_analysis | 137 | 160 | 135 |
| shared_format_analysis | 183 | 238 | 183 |

### Overlay Trigger Banks

| File | EN | PT |
|------|-----|-----|
| overlay_clarify_required | 120 | 120 |
| overlay_followup_inherit | 220 | 220 |
| overlay_format_request | 240 | 240 |

### Document Analytics Triggers

| File | EN | PT |
|------|-----|-----|
| doc_analytics | 110 | 109 |
| doc_compare | 110 | 110 |
| doc_count | 90 | 90 |
| doc_extract | 130 | 130 |
| doc_factual | 140 | 140 |
| doc_filter_extension | 70 | 70 |
| doc_folder_path | 60 | 60 |
| doc_group_by_folder | 60 | 60 |
| doc_largest | 39 | 40 |
| doc_manage | 70 | 70 |
| doc_most_recent | 39 | 40 |
| doc_name_contains | 45 | 44 |
| doc_recommend | 50 | 50 |
| doc_search | 140 | 140 |
| doc_smallest | 25 | 25 |
| doc_stats | 80 | 80 |
| doc_summary | 120 | 120 |
| doc_table | 70 | 70 |

### Misc Triggers (shared/unknown language)

| File | Entries |
|------|---------|
| action_commands.json | 52 |
| aggregation.json | 63 |
| calculations.json | 93 |
| chitchat.json | 43 |
| compare.json | 90 |
| compare_table_expanded.json | 142 |
| data_lookup.json | 53 |
| document_references.json | 43 |
| documents_content_expanded.json | 203 |
| documents_extract_expanded.json | 162 |
| documents_search_expanded.json | 162 |
| explanation.json | 42 |
| file_inventory_expanded.json | 122 |
| filtering.json | 52 |
| finance_excel_expanded.json | 242 |
| general_qa.json | 53 |
| help_product.json | 62 |
| metric_definitions.json | 52 |
| ranking.json | 52 |
| status_queries.json | 42 |
| table_analysis.json | 63 |
| time_queries.json | 52 |
| trend_analysis.json | 73 |

---

## Root (1 file, 3,388 entries)

| File | Entries | Status |
|------|---------|--------|
| pattern_bank.runtime.json | 3,388 | LEGACY - may overlap with structured banks |

---

## Summary Statistics

| Category | Files | Patterns |
|----------|-------|----------|
| triggers | 227 | 32,076 |
| negatives | 68 | 5,162 |
| lexicons | 38 | 4,729 |
| root | 1 | 3,388 |
| overlays | 35 | 2,173 |
| formatting | 23 | 1,687 |
| normalizers | 21 | 1,511 |
| templates | 32 | 767 |
| signals | 5 | 510 |
| rules | 3 | 384 |
| manifests | 1 | 251 |
| aliases | 3 | 179 |
| **TOTAL** | **457** | **52,817** |
