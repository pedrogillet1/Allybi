# Parity Report

Generated: 2026-01-16T22:20:55.472Z

## Summary

| Metric | Value |
|--------|-------|
| Total Banks | 46 |
| Passed | 34 |
| Warnings | 1 |
| Failed | 11 |
| **Parity Score** | **74%** |

## Results by Bank

### triggers

| Category | EN | PT | Target | Status |
|----------|----|----|--------|--------|
| documents_qa | 220 | 220 | 220 | ✅ |
| documents_search_locator | 180 | 180 | 180 | ✅ |
| documents_extract_structured | 180 | 180 | 180 | ✅ |
| documents_summarize | 140 | 140 | 140 | ✅ |
| compare | 160 | 160 | 160 | ✅ |
| finance_excel | 260 | 260 | 260 | ✅ |
| analytics_metrics | 120 | 120 | 120 | ✅ |
| doc_stats | 120 | 120 | 120 | ✅ |
| file_list | 80 | 80 | 80 | ✅ |
| file_search_by_topic | 120 | 120 | 120 | ✅ |
| file_folder_ops | 120 | 120 | 120 | ✅ |
| file_open_preview | 120 | 120 | 80 | ✅ |
| help_product | 80 | 80 | 80 | ✅ |

### overlays

| Category | EN | PT | Target | Status |
|----------|----|----|--------|--------|
| followup_inherit | 110 | 110 | 220 | ❌ |
| format_request | 120 | 120 | 240 | ❌ |
| clarify_required | 60 | 60 | 120 | ❌ |

### negatives

| Category | EN | PT | Target | Status |
|----------|----|----|--------|--------|
| block_file_list_when_content | 180 | 180 | 180 | ✅ |
| block_help_when_content | 160 | 160 | 160 | ✅ |
| block_finance_when_no_terms | 120 | 120 | 120 | ✅ |
| block_doc_count_when_stats | 80 | 80 | 80 | ✅ |
| block_analytics_when_content | 80 | 80 | 80 | ✅ |
| block_exact_filename_fuzzy | 30 | 30 | 60 | ❌ |
| block_generic_empty_sources | 80 | 80 | 80 | ✅ |

### formatting

| Category | EN | PT | Target | Status |
|----------|----|----|--------|--------|
| exact_count | 140 | 140 | 140 | ✅ |
| bullets | 100 | 100 | 100 | ✅ |
| numbered_steps | 90 | 90 | 90 | ✅ |
| table | 120 | 120 | 120 | ✅ |
| sentence_limit | 70 | 70 | 70 | ✅ |
| line_limit | 35 | 35 | 70 | ❌ |
| category_grouping | 60 | 60 | 60 | ✅ |
| ranking_topn | 40 | 40 | 80 | ❌ |

### normalizers

| Category | EN | PT | Target | Status |
|----------|----|----|--------|--------|
| month | 400 | 400 | 400 | ✅ |
| quarter | 160 | 160 | 160 | ✅ |
| time_windows | 240 | 240 | 240 | ✅ |
| filename | 260 | 260 | 260 | ✅ |
| folder_path | 180 | 180 | 180 | ✅ |
| typos | 200 | 200 | 200 | ✅ |
| diacritics | 120 | 120 | 120 | ✅ |
| numbers_currency | 260 | 260 | 260 | ✅ |
| status_vocabulary | 120 | 120 | 120 | ✅ |

### lexicons

| Category | EN | PT | Target | Status |
|----------|----|----|--------|--------|
| agile_project_mgmt | 0 | 0 | 350 | ❌ |
| marketing_service_quality | 0 | 0 | 450 | ❌ |
| finance_accounting | 450 | 450 | 550 | ⚠️ |
| compliance_security | 100 | 100 | 450 | ❌ |
| analytics_telemetry | 100 | 100 | 300 | ❌ |
| navigation_ui | 50 | 50 | 250 | ❌ |

## Failed Items

- **overlays/followup_inherit**: MISSING: EN=110, PT=110 (target: 220)
- **overlays/format_request**: MISSING: EN=120, PT=120 (target: 240)
- **overlays/clarify_required**: MISSING: EN=60, PT=60 (target: 120)
- **negatives/block_exact_filename_fuzzy**: MISSING: EN=30, PT=30 (target: 60)
- **formatting/line_limit**: MISSING: EN=35, PT=35 (target: 70)
- **formatting/ranking_topn**: MISSING: EN=40, PT=40 (target: 80)
- **lexicons/agile_project_mgmt**: 350/350 terms, PT coverage: 0%
- **lexicons/marketing_service_quality**: 450/450 terms, PT coverage: 0%
- **lexicons/compliance_security**: 100/450 terms, PT coverage: 100%
- **lexicons/analytics_telemetry**: 100/300 terms, PT coverage: 100%
- **lexicons/navigation_ui**: 50/250 terms, PT coverage: 100%
