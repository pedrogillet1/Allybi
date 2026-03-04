# Data Bank Scorecard — All Families

> Generated: 2026-03-04 | Scoring: 0-100 per dimension | Final grade: weighted average | HARSH mode: P0 gate failure = overall F

---

## Executive Summary

| Family | Banks | SSOT | Coverage | Precision | Locale | Wiring | Deploy | Final | Top Issue |
|--------|-------|------|----------|-----------|--------|--------|--------|-------|-----------|
| manifest | 10 | 100 | 100 | 100 | N/A | 100 | 0 | **D** | Checksum gate FAILS (1,480 mismatches) |
| schemas | 16 | 100 | 100 | 100 | N/A | 0 | 100 | **D** | All schemas meta-only, no runtime getBank() |
| normalizers | 10 | 100 | 80 | 90 | 90 | 70 | 0 | **D** | Checksum stale; 2 dead banks |
| routing | 8 | 100 | 100 | 90 | N/A | 100 | 0 | **D** | Checksum gate |
| operators | 50 | 100 | 90 | 90 | N/A | 90 | 0 | **D** | Checksum gate |
| semantics | 606 | 60 | 90 | 90 | 95 | 90 | 0 | **F** | SSOT fork + checksum gate |
| scope | 3 | 100 | 100 | 100 | N/A | 100 | 0 | **D** | Checksum gate |
| retrieval | 36 | 100 | 95 | 90 | N/A | 100 | 0 | **D** | Checksum gate |
| formatting | 21 | 100 | 80 | 90 | N/A | 100 | 0 | **D** | 4 style stubs; checksum gate |
| dictionaries | 31 | 100 | 80 | 90 | 78 | 80 | 0 | **F** | excel_functions EN/PT gap (-61); checksum gate |
| lexicons | 34 | 100 | 100 | 100 | 100 | 100 | 0 | **D** | Checksum gate |
| parsers | 10 | 100 | 90 | 90 | 92 | 90 | 0 | **D** | Checksum gate; `range_resolution_rules` dead |
| intent_patterns | 4 | 100 | 90 | 60 | 97 | 100 | 0 | **F** | 8 collision clusters (4 HIGH) |
| microcopy | 11 | 100 | 80 | 90 | N/A | 65 | 0 | **F** | 6 dead (35% dead rate) |
| overlays | 6 | 100 | 80 | 90 | N/A | 80 | 0 | **D** | `followup_suggestions` dead |
| prompts | 13 | 100 | 80 | 90 | N/A | 76 | 0 | **D** | 4 dead; 7 lack tests |
| policies | 64 | 100 | 90 | 90 | N/A | 90 | 0 | **D** | Checksum gate |
| fallbacks | 5 | 100 | 90 | 90 | N/A | 100 | 0 | **D** | `fallback_extraction_recovery` thin |
| quality | 36 | 100 | 70 | 90 | N/A | 90 | 0 | **D** | `hallucination_guards` thin; 1 dead |
| triggers | 2 | 100 | 100 | 100 | 100 | 100 | 0 | **D** | Checksum gate |
| ambiguity | 3 | 100 | 100 | 100 | N/A | 100 | 0 | **D** | Checksum gate |
| probes | 10 | 100 | 90 | 90 | N/A | 50 | 0 | **D** | Test/eval only |
| templates | 3 | 100 | 90 | 90 | N/A | 50 | 0 | **D** | Loaded by dead DataBankRegistry |
| tests | 3 | 100 | 100 | N/A | N/A | 50 | 0 | **D** | Test data banks |
| agents/excel_calc | 21 | 100 | 95 | 70 | 100 | **0** | 0 | **F** | **P0 FAIL: ENTIRE subsystem DEAD** |
| document_intelligence | ~200 | 100 | 85 | 90 | 90 | 100 | 0 | **D** | `ops` domain missing; 166 orphan schemas |

> **NOTE**: Deploy dimension is 0 for ALL families because `banks:checksum:check` fails globally (1,480 mismatches). This single P0 failure drags every family to D or below. Fix checksums first.

---

## Scoring Methodology

| Dimension | Weight | Definition |
|-----------|--------|------------|
| SSOT | 15% | Bank registered, no duplicate truth, no conceptual fork |
| Coverage | 20% | All expected entries/rules/patterns present |
| Precision | 15% | No overly broad patterns, no collision clusters |
| Locale | 10% | EN/PT matching counts and key coverage |
| Wiring | 25% | Bank loaded by production service via getBank() |
| Deploy | 15% | Checksum passes, registry correct, no CI gate failures |

**P0 override**: If checksum gate fails, Deploy = 0 for all families.

---

## Detailed Per-Family Analysis

### manifest (10 banks) — Grade: D

| Bank ID | Path | SSOT | Wiring | Deploy | Notes |
|---------|------|------|--------|--------|-------|
| bank_registry | manifest/bank_registry.any.json | 100 | 100 | 0 | Boot-time loader; 1,008+ entries |
| bank_manifest | manifest/bank_manifest.any.json | 100 | 100 | 0 | 24 categories |
| bank_checksums | manifest/bank_checksums.any.json | 100 | 100 | 0 | **STALE — 1,480 mismatches** |
| bank_aliases | manifest/bank_aliases.any.json | 100 | 100 | 0 | ~1,290 aliases |
| bank_dependencies | manifest/bank_dependencies.any.json | 100 | 100 | 0 | 24 category deps |
| versioning | manifest/versioning.any.json | 100 | 0 | 0 | Meta-only |
| unused_bank_lifecycle | manifest/unused_bank_lifecycle.any.json | 100 | 0 | 0 | Meta-only |
| environments | manifest/environments.any.json | 100 | 0 | 0 | Meta-only |
| languages | manifest/languages.any.json | 100 | 0 | 0 | Meta-only |

### agents/excel_calc (21 banks) — Grade: F (P0 FAIL)

| Bank ID | Tokens | SSOT | Wiring | Notes |
|---------|--------|------|--------|-------|
| excel_function_catalog | 66,088 | 100 | **0** | 432 functions, zero consumers |
| python_recipe_catalog | 59,035 | 100 | **0** | 135 recipes, zero consumers |
| column_semantics_ontology | 39,846 | 100 | **0** | 270 fields, zero consumers |
| stats_method_ontology | 27,824 | 100 | **0** | 153 methods, zero consumers |
| range_resolution_rules | 22,958 | 100 | **0** | 88 rules, zero consumers |
| locale_numeric_date_rules | 18,836 | 100 | **0** | 68 rules, zero consumers |
| distribution_ontology | 15,141 | 100 | **0** | 51 distributions, zero consumers |
| calc_intent_patterns_en | ~49,000 | 100 | **0** | 247 patterns, zero consumers |
| calc_intent_patterns_pt | ~49,000 | 100 | **0** | 247 patterns, zero consumers |
| calc_task_taxonomy | ~10,000 | 100 | **0** | 135 families, zero consumers |
| slot_schemas_excel_calc | ~8,000 | 100 | **0** | 162 slots, zero consumers |
| numeric_integrity_rules | ~5,000 | 100 | **0** | 50 rules, zero consumers |
| result_verification_policy | ~3,000 | 100 | **0** | 22 sections, zero consumers |
| clarification_policy_excel_calc | ~1,000 | 100 | **0** | 1 policy, zero consumers |
| chart_intent_taxonomy | ~2,000 | 100 | **0** | 12 intents, zero consumers |
| chart_recipe_catalog | ~3,000 | 100 | **0** | 12 recipes, zero consumers |
| chart_templates | ~2,000 | 100 | **0** | 12 templates, zero consumers |
| python_chart_recipes | ~2,000 | 100 | **0** | Zero consumers |
| excel_calc_eval_suite_registry | ~1,000 | 100 | **0** | 3 suites, zero consumers |
| slot_extraction_cases | ~500 | 100 | **0** | Test data, zero consumers |

**Impact**: ~511K tokens of fully authored content sitting idle. No `ExcelCalcAgentService` exists. No bank loading path touches these IDs.

### Dead Banks — Cross-Family Summary

| Category | Dead Banks | Bank IDs |
|----------|-----------|----------|
| agents/excel_calc | 21 | ALL — see above |
| microcopy | 6 | conversation_messages, nav_microcopy, file_actions_microcopy, ui_intro_neutral, ui_next_step_suggestion, ui_soft_close |
| prompts | 4 | compose_answer_prompt, system_prompt, mode_editing_docx, mode_editing_sheets |
| dictionaries | 4 | agg_stats_terms_en, agg_stats_terms_pt, excel_functions_en, excel_functions_pt |
| semantics | 7 | format_semantics, spreadsheet_semantics, column_semantics_ontology, stats_method_ontology, excel_number_formats_structure, lab_result_patterns, telecom_usage_patterns |
| normalizers | 2 | locale_numeric_date_rules, month_normalization |
| parsers | 1 | range_resolution_rules |
| quality | 1 | numeric_integrity_rules |
| policies | 2 | result_verification_policy, refusal_phrases |
| overlays | 1 | followup_suggestions |
| manifest/meta | 4 | environments, languages, unused_bank_lifecycle, versioning |
| schemas | 16 | All 16 schema banks (meta-only, acceptable) |
| **TOTAL** | **~69** | |

### Intent Pattern Collision Risk

| Cluster | Severity | Patterns | Issue |
|---------|----------|----------|-------|
| DOCX Rewrite Family | HIGH | rewrite.paragraph, rewrite.section, rewrite.formal | All match "Rewrite this paragraph" |
| Excel Value Assignment | HIGH | set_value.single, set_value.range, set_value.numeric_convert | Overlap on "Change the value to 50" |
| DOCX Find&Replace vs Replace.Span | HIGH | find_replace (pri 80) vs replace.span (pri 85) | Priority inversion |
| DOCX List Operations | HIGH | list.convert_to_paragraphs, list.bullets_to_paragraph, list.remove | Triple collision |
| DOCX Formatting | MEDIUM | format.bold + format.italic | Overlap on compound requests |
| Excel Formatting vs Value | MEDIUM | format.number_format + format.custom_number_format | Overlap |
| Excel Chart Creation | MEDIUM | chart.create + chart.create_specific | Overlap |
| Excel vs Calc Agent Cross-Domain | HIGH | Same vocabulary in both bank families | "average", "sum", "compute" |

---

## Global Statistics

| Metric | Value |
|--------|-------|
| Total files on disk | 1,412 |
| Total registered banks | 1,019 |
| Total size | 30.34 MB / 7.8M tokens |
| Orphan files (unregistered) | 238 |
| Missing files (registered but absent) | 0 |
| Duplicate IDs | 0 |
| WIRED banks | ~230+ |
| DEAD banks | ~55 (excl. meta/schema) |
| Test-only banks | 3 |
| Meta-only banks | ~15 |
| EN/PT file parity | 60/60 (100%) |
| EN/PT content gaps | 6 |
| Intent collision clusters | 8 (4 HIGH, 4 MEDIUM) |
| SSOT conflict clusters | 3 (1 HIGH, 2 MEDIUM) |
| Families graded F | 5 (semantics, dictionaries, intent_patterns, microcopy, agents/excel_calc) |
| Checksum gate | **FAIL** (1,480 mismatches) |
