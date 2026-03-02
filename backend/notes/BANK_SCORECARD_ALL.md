# Bank-by-Bank Scorecard

> Generated: 2026-03-01 | Scoring: 0.0-1.0 per dimension | Final grade: weighted average | HARSH mode: P0 gate failure = 0 for family

## Executive Summary

| Family | Banks | SSOT | Coverage | Precision | Locale | Wiring | Deploy | Final Grade | Top Issue |
|--------|-------|------|----------|-----------|--------|--------|--------|-------------|-----------|
| manifest | 10 | 1.0 | 1.0 | 1.0 | N/A | 1.0 | 1.0 | **A** | Clean |
| schemas | 11 | 1.0 | 1.0 | 1.0 | N/A | 0.0 | 1.0 | **D** | All schemas are meta-only, no runtime getBank() consumer |
| normalizers | 11 | 1.0 | 0.8 | 0.9 | 0.9 | 0.7 | 1.0 | **B-** | `locale_numeric_date_rules`, `month_normalization` DEAD |
| routing | 8 | 1.0 | 1.0 | 0.9 | N/A | 1.0 | 1.0 | **A** | Minor collision risk in operator_collision_matrix |
| operators | 54 | 1.0 | 0.9 | 0.9 | N/A | 0.9 | 1.0 | **A-** | 4 dead banks: creative_, connector_, email_action_, allybi_python_ |
| semantics | 577 | 1.0 | 0.9 | 0.9 | 0.95 | 0.9 | 1.0 | **A-** | 6 dead banks; `ops` domain missing from DI; `format_semantics` dead |
| scope | 3 | 1.0 | 1.0 | 1.0 | N/A | 1.0 | 1.0 | **A** | Clean |
| retrieval | 35 | 1.0 | 0.95 | 0.9 | N/A | 1.0 | 1.0 | **A** | Minor: ensure all 14 DI domains have retrieval strategies |
| formatting | 24 | 1.0 | 0.8 | 0.9 | N/A | 1.0 | 1.0 | **B+** | 4 style stubs (citation/list/quote/table) are config-only with no rules |
| dictionaries | 33 | 1.0 | 0.8 | 0.9 | 0.78 | 0.8 | 1.0 | **B-** | excel_functions EN/PT gap (273 vs 212); agg_stats dead |
| lexicons | 32 | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | **A** | Clean |
| parsers | 10 | 1.0 | 0.9 | 0.9 | 0.92 | 0.9 | 1.0 | **A-** | `range_resolution_rules` dead; excel_chart_types EN+3 gap |
| intent_patterns | 4 | 1.0 | 0.9 | 0.6 | 0.97 | 1.0 | 1.0 | **B-** | HIGH collision risk: 8 identified clusters; overly broad tokens_any |
| microcopy | 17 | 1.0 | 0.8 | 0.9 | N/A | 0.65 | 1.0 | **B-** | 6 dead microcopy banks (35% dead rate) |
| overlays | 6 | 1.0 | 0.8 | 0.9 | N/A | 0.8 | 1.0 | **B** | `followup_suggestions` dead |
| prompts | 17 | 1.0 | 0.8 | 0.9 | N/A | 0.76 | 1.0 | **B** | 4 dead prompts; 7 prompt files lack `tests` key |
| policies | 24 | 1.0 | 0.9 | 0.9 | N/A | 0.9 | 1.0 | **A-** | `result_verification_policy`, `refusal_phrases` dead |
| fallbacks | 5 | 1.0 | 0.9 | 0.9 | N/A | 1.0 | 1.0 | **A-** | `fallback_extraction_recovery` thin (2 rules) |
| quality | 12 | 1.0 | 0.7 | 0.9 | N/A | 0.9 | 1.0 | **B** | `hallucination_guards` thin (2 rules); `numeric_integrity_rules` dead (DI version used) |
| triggers | 2 | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 | **A** | Clean |
| ambiguity | 3 | 1.0 | 1.0 | 1.0 | N/A | 1.0 | 1.0 | **A** | Clean |
| probes | 10 | 1.0 | 0.9 | 0.9 | N/A | 0.5 | 1.0 | **B** | Test/eval only, no runtime consumer |
| templates | 3 | 1.0 | 0.9 | 0.9 | N/A | 0.5 | 1.0 | **B** | Loaded by dead DataBankRegistry only |
| tests | 3 | 1.0 | 1.0 | N/A | N/A | 0.5 | 1.0 | **B+** | Test data banks, not runtime |
| agents/excel_calc | 21 | 1.0 | 0.95 | 0.7 | 1.0 | **0.0** | 1.0 | **F** | **P0 FAIL: ENTIRE subsystem DEAD — zero runtime consumers** |
| document_intelligence | ~200 | 1.0 | 0.85 | 0.9 | 0.9 | 1.0 | 1.0 | **B+** | `ops` domain missing entirely; finance missing profile/detection; 166 entity schema orphans |

---

## Detailed Family Scorecards

### Manifest Family (10 banks)

| Bank ID | Path | Size | SSOT | Wiring | Deploy | Grade | Fix |
|---------|------|------|------|--------|--------|-------|-----|
| bank_registry | manifest/bank_registry.any.json | 1008 entries | 1.0 | 1.0 | 1.0 | A | — |
| bank_manifest | manifest/bank_manifest.any.json | 24 categories | 1.0 | 1.0 | 1.0 | A | — |
| bank_checksums | manifest/bank_checksums.any.json | 1008 entries | 1.0 | 1.0 | 1.0 | A | — |
| bank_aliases | manifest/bank_aliases.any.json | ~1000 aliases | 1.0 | 1.0 | 1.0 | A | — |
| bank_dependencies | manifest/bank_dependencies.any.json | 24 category deps | 1.0 | 1.0 | 1.0 | A | — |
| versioning | manifest/versioning.any.json | 24 compat rules | 1.0 | 0.0 | 1.0 | C | Meta-only, acceptable |
| unused_bank_lifecycle | manifest/unused_bank_lifecycle.any.json | Meta | 1.0 | 0.0 | 1.0 | C | Meta-only, acceptable |
| environments | manifest/environments.any.json | Meta | 1.0 | 0.0 | 1.0 | C | Meta-only, acceptable |
| languages | manifest/languages.any.json | Meta | 1.0 | 0.0 | 1.0 | C | Meta-only, acceptable |

### Routing Family (8 banks)

| Bank ID | Operators/Rules | SSOT | Wiring | Collision Risk | Grade | Fix |
|---------|----------------|------|--------|---------------|-------|-----|
| intent_config | 54 ops, 9 families | 1.0 | 1.0 | N/A | A | — |
| operator_families | 54 ops, 10 families | 1.0 | 1.0 | N/A | A | — |
| operator_collision_matrix | 3 rules | 1.0 | 1.0 | 0.9 | A- | Thin: only 3 collision rules for 54 operators |
| connectors_routing | — | 1.0 | 1.0 | N/A | A | — |
| email_routing | — | 1.0 | 1.0 | N/A | A | — |
| routing_priority | — | 1.0 | 1.0 | N/A | A | — |
| editing_routing | — | 1.0 | 1.0 | N/A | A | — |

### Intent Patterns Family (4 banks) — COLLISION RISK DETAIL

| Bank ID | Patterns | Operators | Locale | Collision Clusters | Grade | Fix |
|---------|----------|-----------|--------|-------------------|-------|-----|
| intent_patterns_docx_en | 62 | 22 | EN | 4 HIGH clusters | B- | Fix find_replace/replace.span priority inversion; tighten broad tokens |
| intent_patterns_docx_pt | 63 | 22 | PT | 4 HIGH clusters | B- | Same as EN + missing `docx.rewrite.informal` in EN |
| intent_patterns_excel_en | 60 | 35 | EN | 3 MEDIUM clusters | B | Remove overly broad tokens_any: "data", "create", "list", "maybe" |
| intent_patterns_excel_pt | 60 | 35 | PT | 3 MEDIUM clusters | B | Same as EN |

**Collision Clusters Identified:**

1. **DOCX Rewrite Family** (HIGH): `docx.rewrite.paragraph`, `docx.rewrite.section`, `docx.rewrite.formal` all match "Rewrite this paragraph"
2. **Excel Value Assignment** (HIGH): `excel.set_value.single`, `excel.set_value.range`, `excel.set_value.numeric_convert` overlap on "Change the value to 50"
3. **DOCX Find&Replace vs Replace.Span** (HIGH): Priority inversion — `replace.span` at 85 beats `find_replace` at 80 for "Find and replace all X with Y"
4. **DOCX List Operations** (HIGH): `list.convert_to_paragraphs`, `list.bullets_to_paragraph`, `list.remove` triple-match
5. **DOCX Formatting** (MEDIUM): `format.bold` + `format.italic` both fire on "Make this bold and italic"
6. **Excel Formatting vs Value** (MEDIUM): `format.number_format` + `format.custom_number_format` overlap
7. **Excel Chart Creation** (MEDIUM): `chart.create` + `chart.create_specific` both fire
8. **Excel vs Calc Agent Cross-Domain** (HIGH): Same vocabulary ("average", "sum", "compute") in both bank families

### agents/excel_calc Family (21 banks) — **GRADE: F (P0 FAIL)**

| Bank ID | Items | SSOT | Wiring | Grade | Fix |
|---------|-------|------|--------|-------|-----|
| calc_intent_patterns_en | 247 patterns | 1.0 | **0.0** | F | Wire into runtime via getBank() |
| calc_intent_patterns_pt | 247 patterns | 1.0 | **0.0** | F | Wire into runtime |
| calc_task_taxonomy | 135 families | 1.0 | **0.0** | F | Wire into runtime |
| slot_schemas_excel_calc | 162 slots | 1.0 | **0.0** | F | Wire into runtime |
| excel_function_catalog | 432 functions | 1.0 | **0.0** | F | Wire into runtime |
| python_recipe_catalog | 135 recipes | 1.0 | **0.0** | F | Wire into runtime |
| stats_method_ontology | 153 methods | 1.0 | **0.0** | F | Wire into runtime |
| distribution_ontology | 51 distributions | 1.0 | **0.0** | F | Wire into runtime |
| numeric_integrity_rules | 50 rules | 1.0 | **0.0** | F | Wire into runtime |
| result_verification_policy | 22 sections | 1.0 | **0.0** | F | Wire into runtime |
| clarification_policy_excel_calc | 1 policy | 1.0 | **0.0** | F | Wire into runtime |
| column_semantics_ontology | 270 fields | 1.0 | **0.0** | F | Wire into runtime |
| range_resolution_rules | 88 rules | 1.0 | **0.0** | F | Wire into runtime |
| locale_numeric_date_rules | 68 rules | 1.0 | **0.0** | F | Wire into runtime |
| chart_intent_taxonomy | 12 intents | 1.0 | **0.0** | F | Wire into runtime |
| chart_recipe_catalog | 12 recipes | 1.0 | **0.0** | F | Wire into runtime |
| chart_templates | 12 templates | 1.0 | **0.0** | F | Wire into runtime |
| excel_calc_eval_suite_registry | 3 suites | 1.0 | **0.0** | F | Wire into runtime |

### Document Intelligence (~200 banks)

| Sub-family | Banks | SSOT | Coverage | Locale | Wiring | Grade | Fix |
|------------|-------|------|----------|--------|--------|-------|-----|
| Ontologies (5) | 5 | 1.0 | 0.95 | N/A | 1.0 | A | — |
| Structure (7) | 7 | 1.0 | 0.95 | N/A | 1.0 | A | — |
| Entity patterns (6) | 6 | 1.0 | 0.8 | N/A | 0.7 | B | `lab_result_patterns`, `telecom_usage_patterns` dead |
| Domain packs - accounting | ~18 | 1.0 | 0.85 | 0.73 | 1.0 | B | Missing validation_policies, evidence_requirements; EN abbr +6 |
| Domain packs - banking | ~10 | 1.0 | 1.0 | 1.0 | 1.0 | A | — |
| Domain packs - billing | ~12 | 1.0 | 1.0 | 1.0 | 1.0 | A | — |
| Domain packs - education | ~12 | 1.0 | 1.0 | 1.0 | 1.0 | A | — |
| Domain packs - finance | ~25+ | 1.0 | 0.7 | 0.57 | 1.0 | C+ | Missing domain_profile, detection_rules; EN abbr 42 vs PT 24 |
| Domain packs - housing | ~12 | 1.0 | 1.0 | 1.0 | 1.0 | A | — |
| Domain packs - hr_payroll | ~11 | 1.0 | 1.0 | 1.0 | 1.0 | A | — |
| Domain packs - identity | ~10 | 1.0 | 1.0 | 1.0 | 1.0 | A | — |
| Domain packs - insurance | ~10 | 1.0 | 0.95 | 0.89 | 1.0 | A- | EN abbr 46 vs PT 41 |
| Domain packs - legal | ~20+ | 1.0 | 0.9 | 1.0 | 1.0 | A- | Missing reasoning_scaffolds |
| Domain packs - medical | ~20+ | 1.0 | 0.9 | 1.0 | 1.0 | A- | Missing reasoning_scaffolds |
| **Domain packs - ops** | **0** | **0.0** | **0.0** | **0.0** | **0.0** | **F** | **MISSING ENTIRELY — declared in ontology with 9 subdomains, eval expects 189 cases** |
| Domain packs - tax | ~10 | 1.0 | 1.0 | 1.0 | 1.0 | A | — |
| Domain packs - travel | ~12 | 1.0 | 1.0 | 1.0 | 1.0 | A | — |
| Abbreviation global | 1 | 1.0 | 1.0 | 1.0 | 1.0 | A | 68 abbreviations, all with EN+PT |
| Eval suites | 1 | 1.0 | 0.95 | N/A | 0.5 | B | 5 CI + 19 nightly suites |
| Usage manifest | 1 | 1.0 | 1.0 | N/A | 1.0 | A | 8 declared runtime consumers |
| Entity schemas (orphans) | 166 | **0.0** | 0.9 | N/A | 0.0 | D | All on disk but NOT in bank_registry |

### Microcopy Family (17 banks)

| Bank ID | Entries | SSOT | Wiring | Grade | Fix |
|---------|---------|------|--------|-------|-----|
| koda_product_help | 8 topics | 1.0 | 1.0 | A | — |
| processing_messages | 13 msgs | 1.0 | 1.0 | A | — |
| no_docs_messages | 6 scenarios | 1.0 | 1.0 | A | — |
| disambiguation_microcopy | 5 rules | 1.0 | 1.0 | A | — |
| editing_microcopy | 8 entries | 1.0 | 1.0 | A | — |
| editing_ux | — | 1.0 | 1.0 | A | — |
| edit_error_catalog | — | 1.0 | 1.0 | A | — |
| scoped_not_found_messages | — | 1.0 | 1.0 | A | — |
| capabilities_catalog | — | 1.0 | 1.0 | A | — |
| conversation_messages | 3+7 entries | 1.0 | **0.0** | F | DEAD: no getBank() consumer |
| nav_microcopy | — | 1.0 | **0.0** | F | DEAD |
| file_actions_microcopy | — | 1.0 | **0.0** | F | DEAD |
| ui_intro_neutral | — | 1.0 | **0.0** | F | DEAD |
| ui_next_step_suggestion | — | 1.0 | **0.0** | F | DEAD |
| ui_soft_close | — | 1.0 | **0.0** | F | DEAD |
| followup_suggestions | 7 rules | 1.0 | **0.0** | F | DEAD |

### Quality Family (12 banks)

| Bank ID | Rules | SSOT | Wiring | Depth | Grade | Fix |
|---------|-------|------|--------|-------|-------|-----|
| quality_gates | 12 gates | 1.0 | 1.0 | 1.0 | A | — |
| doc_grounding_checks | 2 checks | 1.0 | 1.0 | 0.3 | B- | Thin: only 2 checks |
| hallucination_guards | 2 rules | 1.0 | 1.0 | 0.3 | B- | Thin: only 2 rules |
| dedupe_and_repetition | 6 items | 1.0 | 1.0 | 0.7 | B+ | — |
| pii_field_labels | 13 items | 1.0 | 1.0 | 0.8 | A- | — |
| privacy_minimal_rules | 2 rules | 1.0 | 1.0 | 0.3 | B- | Thin: only 2 rules |
| numeric_integrity_rules | 50 rules | 1.0 | **0.0** | 1.0 | D | DEAD: DI version `numeric_integrity` used instead |

---

## Global Statistics

| Metric | Value |
|--------|-------|
| Total files on disk | 1,246 (active) + 42 (deprecated/quarantine) |
| Total registered banks | 1,008 |
| Total checksums | 1,008 (100% coverage) |
| Orphan files (unregistered) | 238 (166 DI entity schemas + 42 deprecated + 30 other) |
| Missing files (registered but absent) | 0 |
| Duplicate IDs | 0 |
| Duplicate paths | 0 |
| WIRED banks | ~230+ |
| DEAD banks | ~55 |
| Test-only banks | 3 |
| Meta-only banks | ~15 |
| EN/PT parity gaps | 6 (excel_functions -61, finance abbr -18, accounting abbr -6, insurance abbr -5, docx patterns -1, chart_types -3) |
| Intent pattern collision clusters | 8 (4 HIGH, 4 MEDIUM) |
| Families graded A or A- | 12 of 27 |
| Families graded F | 1 (agents/excel_calc — all DEAD) |
