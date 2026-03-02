# Complete Report: Everything Missing That Needs To Be Generated

> Generated: 2026-03-01 | Based on exhaustive audit of 1,246 files, 1,008 registered banks, all npm scripts, all test references

---

## Table of Contents

1. [Missing Domain: ops (15+ new files)](#1-missing-domain-ops)
2. [Dead Excel Calc Agent — Missing Service Wiring (1 new service + loader changes)](#2-dead-excel-calc-agent)
3. [166 Unregistered DI Entity Schemas (registry entries)](#3-unregistered-di-entity-schemas)
4. [Missing Locale Parity Content (6 bank pairs)](#4-missing-locale-parity-content)
5. [Missing/Thin Bank Content (rules, patterns, tests)](#5-missingthin-bank-content)
6. [Missing Script Files Referenced in package.json (28 files)](#6-missing-script-files)
7. [Missing Test Files Referenced in package.json (10 files)](#7-missing-test-files)
8. [Intent Pattern Fixes Needed (4 banks)](#8-intent-pattern-fixes)
9. [Dead Code to Delete](#9-dead-code-to-delete)
10. [Summary Counts](#10-summary-counts)

---

## 1. Missing Domain: ops

**The `ops` domain is declared in `di_domain_ontology` as one of 14 canonical domains with 9 subdomains (`supply_chain`, `logistics`, `warehouse`, `fleet`, `maintenance`, `quality_control`, `procurement`, `capacity_planning`, `production`). The eval suite `domain_ops_full` expects 189 test cases. But the entire directory does not exist.**

### Files that need to be generated:

```
backend/src/data_banks/document_intelligence/domains/ops/
├── abbreviations/
│   ├── ops.en.any.json                          # EN abbreviations (target: ~20 entries)
│   └── ops.pt.any.json                          # PT abbreviations (target: ~20 entries)
├── lexicons/
│   ├── ops.en.any.json                          # EN domain lexicon
│   └── ops.pt.any.json                          # PT domain lexicon
├── doc_types/
│   ├── doc_type_catalog.any.json                # Catalog of ops doc types
│   ├── entities/
│   │   ├── ops_incident_report.entities.schema.json
│   │   ├── ops_maintenance_log.entities.schema.json
│   │   ├── ops_quality_report.entities.schema.json
│   │   ├── ops_shipping_manifest.entities.schema.json
│   │   ├── ops_sla_report.entities.schema.json
│   │   └── ops_work_order.entities.schema.json
│   ├── extraction/
│   │   ├── ops_incident_report.extraction_hints.any.json
│   │   ├── ops_maintenance_log.extraction_hints.any.json
│   │   ├── ops_quality_report.extraction_hints.any.json
│   │   ├── ops_shipping_manifest.extraction_hints.any.json
│   │   ├── ops_sla_report.extraction_hints.any.json
│   │   └── ops_work_order.extraction_hints.any.json
│   ├── sections/
│   │   ├── ops_incident_report.sections.any.json
│   │   ├── ops_maintenance_log.sections.any.json
│   │   ├── ops_quality_report.sections.any.json
│   │   ├── ops_shipping_manifest.sections.any.json
│   │   ├── ops_sla_report.sections.any.json
│   │   └── ops_work_order.sections.any.json
│   └── tables/
│       ├── ops_incident_report.tables.any.json
│       ├── ops_maintenance_log.tables.any.json
│       ├── ops_quality_report.tables.any.json
│       ├── ops_shipping_manifest.tables.any.json
│       ├── ops_sla_report.tables.any.json
│       └── ops_work_order.tables.any.json
├── answer_style_bank.any.json
├── disclaimer_policy.any.json
├── domain_detection_rules.any.json
├── domain_profile.any.json
├── evidence_requirements.any.json
├── reasoning_scaffolds.any.json
├── redaction_and_safety_rules.any.json
├── retrieval_strategies.any.json
└── validation_policies.any.json
```

**Total new files: ~39** (9 core config + 4 abbreviation/lexicon + 1 catalog + ~24 doc_type files for 6 doc types × 4 facets)

**After creating**: Register all in `bank_registry.any.json`, run `npm run banks:integrity:generate`.

---

## 2. Dead Excel Calc Agent — Missing Service Wiring

**21 banks with 432 functions, 247 routing patterns, 153 stats methods, 135 python recipes, 162 slot schemas — all registered with checksums but zero runtime consumers.**

### New file needed:

```
backend/src/services/agents/excelCalcAgent.service.ts
```

This service must:
- Load all 18+ calc-agent banks via `getOptionalBank()`
- Implement calc intent routing pipeline (parse → classify → slot-fill → execute)
- Provide chart generation using `chart_*` banks
- Provide Python recipe execution using `python_recipe_catalog`, `distribution_ontology`, `stats_method_ontology`
- Quality-gate results via `result_verification_policy` and `numeric_integrity_rules`

### Existing files that need modification:

| File | Change |
|------|--------|
| `services/editing/allybi/loadBanks.ts` | Add calc-agent bank loading to `loadAllybiBanks()` |
| `services/editing/allybi/operatorPlanner.ts` | Wire `XLSX_COMPUTE` operator class to calc-agent execution path |
| `bootstrap/container.ts` | Register `ExcelCalcAgentService` if using DI |

---

## 3. Unregistered DI Entity Schemas

**166 `.entities.schema.json` files exist on disk under `document_intelligence/domains/*/doc_types/entities/` but are NOT in `bank_registry.any.json`.**

Breakdown by domain:

| Domain | Orphan Entity Schemas |
|--------|----------------------|
| legal | 42 |
| medical | 30 |
| finance | 25 |
| accounting | 24 |
| education | 6 |
| housing | 6 |
| billing | 6 |
| travel | 6 |
| hr_payroll | 5 |
| banking | 4 |
| identity | 4 |
| insurance | 4 |
| tax | 4 |

**Action**: Add 166 registry entries to `bank_registry.any.json` with category `schemas`. Run `npm run banks:integrity:generate` to update checksums.

---

## 4. Missing Locale Parity Content

### 4a. excel_functions dictionary — EN has 273, PT has 212 (61 missing from PT)

**File to modify**: `backend/src/data_banks/dictionaries/excel_functions.pt.any.json`
**Action**: Add 61 missing PT function localizations (e.g., `VLOOKUP`→`PROCV`, `SUMIFS`→`SOMASES`)

### 4b. finance abbreviations — EN has 42, PT has 24 (18 missing from PT)

**File to modify**: `backend/src/data_banks/document_intelligence/domains/finance/abbreviations/finance.pt.any.json`
**Action**: Translate and add 18 missing abbreviation entries

### 4c. accounting abbreviations — EN has 22, PT has 16 (6 missing from PT)

**File to modify**: `backend/src/data_banks/document_intelligence/domains/accounting/abbreviations/accounting.pt.any.json`
**Action**: Translate and add 6 missing abbreviation entries

### 4d. insurance abbreviations — EN has 46, PT has 41 (5 missing from PT)

**File to modify**: `backend/src/data_banks/document_intelligence/domains/insurance/abbreviations/insurance.pt.any.json`
**Action**: Translate and add 5 missing abbreviation entries

### 4e. DOCX intent patterns — `docx.rewrite.informal` exists in PT but missing from EN

**File to modify**: `backend/src/data_banks/intent_patterns/docx.en.any.json`
**Action**: Add `docx.rewrite.informal` pattern translated to English

### 4f. excel_chart_types parser — EN has 36, PT has 33 (3 missing from PT)

**File to modify**: `backend/src/data_banks/parsers/excel_chart_types.pt.any.json`
**Action**: Add 3 missing chart type entries

---

## 5. Missing/Thin Bank Content

### 5a. Quality Banks — Need More Rules

| Bank | Current | Need | Missing Rules to Generate |
|------|---------|------|---------------------------|
| `quality/hallucination_guards.any.json` | 2 rules | 7 | `HG_003_numeric_fabrication`, `HG_004_entity_attribution_required`, `HG_005_cross_document_contamination`, `HG_006_temporal_claim_without_evidence`, `HG_007_confident_language_on_ambiguous_evidence` |
| `quality/privacy_minimal_rules.any.json` | 2 rules | 7 | `PMR_003_no_api_keys_or_tokens`, `PMR_004_no_raw_stack_traces`, `PMR_005_no_internal_urls`, `PMR_006_no_environment_variables`, `PMR_007_no_raw_connection_strings` |
| `quality/doc_grounding_checks.any.json` | 2 checks | 5 | `DGC_003_evidence_relevance_threshold`, `DGC_004_evidence_recency`, `DGC_005_evidence_coverage_vs_claim_count` |

### 5b. Formatting Style Stubs — Need Rules, Patterns, and Tests

| Bank | Current State | What Needs to Be Generated |
|------|--------------|---------------------------|
| `formatting/citation_styles.any.json` | Config-only (3 booleans) | Add: `patterns[]` (regex for citation artifacts), `rules[]` (CS_001 through CS_003), `templates{}` (attribution by language), `tests{}` |
| `formatting/list_styles.any.json` | Config-only (5 settings) | Add: `rules[]` (LS_001 through LS_003), `nestedListLimits{}`, `numberedListConfig{}`, `tests{}` |
| `formatting/quote_styles.any.json` | Config-only (3 settings) | Add: `rules[]` (QS_001 through QS_003), `attributionTemplates{}`, `truncation{}`, `tests{}` |
| `formatting/table_styles.any.json` | Config-only (4 settings) | Add: `rules[]` (TS_001 through TS_003), `formatting{}`, `tests{}` |

### 5c. Operator Collision Matrix — Needs 7 More Rules

**File**: `operators/operator_collision_matrix.any.json` (currently 3 rules for 57 operators)

Rules to generate:
| Rule ID | Description |
|---------|------------|
| `CM_0004_edit_ops_vs_retrieval_questions` | Suppress edit operators for read-only queries |
| `CM_0005_compute_vs_summarize` | Suppress COMPUTE for summarization/narrative requests |
| `CM_0006_connector_vs_doc_retrieval` | Suppress connectors when local documents in scope |
| `CM_0007_greeting_vs_help` | Suppress conversational operators for help-seeking queries |
| `CM_0008_email_draft_vs_email_explain` | Suppress compose operators for read/explain email queries |
| `CM_0009_chart_vs_compute` | Suppress chart operators when only calculation requested |
| `CM_0010_slide_edit_vs_doc_edit` | Suppress wrong-format edit operators based on active file type |

### 5d. Fallback Extraction Recovery — Needs 5 More Rules

**File**: `fallbacks/fallback_extraction_recovery.any.json` (currently 2 rules)

Rules to generate:
| Rule ID | Description |
|---------|------------|
| `fer_ocr_degraded_quality` | Warn on low-confidence OCR, suggest re-upload |
| `fer_password_protected_extraction` | Specific message for encrypted/protected documents |
| `fer_unsupported_format_extraction` | Specific message for corrupted/unsupported formats |
| `fer_partial_page_extraction` | Indicate which pages were readable |
| `fer_table_extraction_degraded` | Warn on degraded table structure extraction |

### 5e. Prompt Banks — Need `tests` Key Added

These 7 prompt banks lack self-validation test suites:

| File | Test Cases Needed |
|------|-------------------|
| `prompts/mode_chat.any.json` | Test short paragraphs, no filler, max 1 clarification |
| `prompts/mode_editing.any.json` | Test number/name/date preservation |
| `prompts/mode_editing_docx.any.json` | Test scope-limited to explicit targets |
| `prompts/mode_editing_sheets.any.json` | Test ambiguous range clarification |
| `prompts/policy_citations.any.json` | Test no inline "Sources:" section |
| `prompts/rag_policy.any.json` | Test ignoring embedded instructions in retrieved content |
| `prompts/system_base.any.json` | Test table limits (5 cols / 12 rows) |

### 5f. Quality dedupe_and_repetition — Needs 2 More Rules

**File**: `quality/dedupe_and_repetition.any.json` (currently 1 rule)

Missing:
- `DR_002_near_duplicate_paraphrase` — Detect paraphrased repetition within same answer
- `DR_003_cross_turn_repetition` — Detect repeating same answer across conversation turns

---

## 6. Missing Script Files Referenced in package.json

**28 script files referenced in npm scripts that do not exist on disk:**

### Deployment Scripts (6 files)
| File | npm script |
|------|-----------|
| `scripts/deploy.sh` | `deploy` |
| `scripts/deploy.ps1` | `deploy:win` |
| `scripts/GUARANTEED_DEPLOY.sh` | `deploy:guaranteed` |
| `scripts/GUARANTEED_DEPLOY.ps1` | `deploy:guaranteed:win` |
| `scripts/check-types.sh` | `check:deploy` |
| `scripts/check-types.ps1` | `check:deploy:win` |

### Testing Infrastructure Scripts (8 files)
| File | npm script |
|------|-----------|
| `scripts/test-functionality.sh` | `test:functionality` |
| `scripts/test-functionality.ps1` | `test:functionality:win` |
| `scripts/test-chat-complete.sh` | `test:chat` |
| `scripts/test-chat-complete.ps1` | `test:chat:win` |
| `scripts/upload-test-runner.js` | `upload-test:run` |
| `scripts/truth-report.js` | `upload-test:report` |
| `scripts/generate-test-token.js` | `upload-test:token` |
| `scripts/run-upload-tests.sh` | `upload:test:*` |

### Build/Compilation Scripts (2 files)
| File | npm script |
|------|-----------|
| `tools/build/compile_runtime_patterns.ts` | `build:runtime-patterns` |
| `scripts/verify-local-setup.ts` | `verify:local` |

### Test Harness Directory (1 directory)
| File | npm script |
|------|-----------|
| `test-harness/generate-test-datasets.sh` | `upload-test:generate` |

---

## 7. Missing Test Files Referenced in package.json

**10 test files referenced in npm test scripts that do not exist:**

| File | npm script |
|------|-----------|
| `src/tests/benchmarks/runBenchmarks.test.ts` | `test:benchmarks:index` |
| `src/services/core/retrieval/retrievalDocLock.benchmark.test.ts` | `test:retrieval:doclock` |
| `src/tests/ultimate-koda.test.ts` | `test:ultimate` |
| `src/tests/rag-precision-test.ts` | `test:rag-precision` |
| `src/tests/rag-reasoning-visualizer.ts` | `visualize-reasoning` |
| `src/tests/conversation-behavior.test.ts` | `test:behavior` |
| `src/tests/generation-streaming.test.ts` | `test:generation` |
| `src/tests/generation-validation-suite.test.ts` | `test:validation` |
| `tests/architectureFlows.test.ts` | `test:flows` |
| `tests/runComprehensiveTest.ts` | `test:comprehensive` |

---

## 8. Intent Pattern Fixes Needed

### 8a. Priority Inversion: find_replace vs replace.span

**Files**: `intent_patterns/docx.en.any.json`, `intent_patterns/docx.pt.any.json`

- `docx.find_replace` priority 80 vs `docx.replace.span` priority 85
- "Find and replace all X with Y" matches both; `replace.span` wins incorrectly
- **Fix**: Bump `docx.find_replace` priority to 90, OR add `tokens_none: ["find"]` to `docx.replace.span`

### 8b. Triple Collision: DOCX List Operations

**Files**: `intent_patterns/docx.en.any.json`, `intent_patterns/docx.pt.any.json`

- `docx.list.convert_to_paragraphs`, `docx.list.bullets_to_paragraph`, `docx.list.remove` all match "Convert bullets to paragraphs"
- **Fix**: Merge `list.convert_to_paragraphs` and `list.bullets_to_paragraph` into one pattern

### 8c. Overly Broad tokens_any (41 patterns affected in DOCX EN)

**Highest-risk patterns that MUST be tightened:**

| Pattern | Problematic token | Why |
|---------|-------------------|-----|
| `docx.format.font_size` | `"size"` (sole token!) | "what is the size of this company?" would match |
| `docx.spacing.paragraph` | `"increase"`, `"space"`, `"after"`, `"before"` | "what happened before the merger?" would match |
| `docx.list.numbering` | `"number"` | "what is the number of employees?" would match |
| `docx.align.left` | `"left"`, `"text"` | "the text on the left side mentions..." would match |
| `docx.align.right` | `"right"`, `"text"` | "the text on the right..." would match |
| `docx.spacing.line` | `"line"`, `"change"`, `"single"` | "change the line item" would match |
| `docx.format.remove_bold` | `"text"`, `"remove"`, `"turn"` | "remove the text about..." would match |
| `docx.rewrite.formal` | `"more"` | "I need more data" would match |
| `docx.replace.span` | `"text"`, `"change"` | "change the text..." in retrieval context would match |
| `docx.toc.insert` | `"add"`, `"create"` | "add a new document" / "create a summary" would match |

### 8d. Calc Agent Patterns — Empty tokens_none

**Files**: `agents/excel_calc/routing/calc_intent_patterns.en.any.json`, `.pt.any.json`

247 patterns have empty `tokens_none` arrays. Need to add negative guards for common cross-domain vocabulary (`"delete"`, `"remove"`, `"format"`, `"bold"`, `"font"`, `"heading"`, `"paragraph"`, `"rewrite"`, `"translate"`, `"replace"`) to prevent calc patterns matching editing queries.

---

## 9. Dead Code to Delete

| Item | File | Lines | Reason |
|------|------|-------|--------|
| DataBankRegistry class | `data_banks/dataBankRegistry.ts` | 1,365 | Zero imports from any service/module/test |
| Orphan productHelp service | `services/llm/core/productHelp.service.ts` | ~200 | Duplicate; active version is `services/chat/productHelp.service.ts` |
| Orphan productHelp test | `services/llm/core/productHelp.service.test.ts` | ~100 | Test for orphan service |
| 6 dead microcopy banks | Various in `microcopy/` | ~6 files | `conversation_messages`, `nav_microcopy`, `file_actions_microcopy`, `ui_intro_neutral`, `ui_next_step_suggestion`, `ui_soft_close` — no consumer |
| 4 dead operator banks | Various in `operators/` | ~4 files | `creative_operators`, `connector_operators`, `email_action_operators`, `allybi_python_operators` — no consumer |
| 4 dead prompt banks | Various in `prompts/` | ~4 files | `compose_answer_prompt`, `system_prompt`, `mode_editing_docx`, `mode_editing_sheets` — not in promptRegistry layers |
| 4 dead dictionary banks | Various in `dictionaries/` | ~4 files | `agg_stats_terms_en/pt`, `excel_functions_en/pt` — not loaded by ID |
| 7 dead semantics banks | Various in `semantics/` | ~7 files | `format_semantics`, `spreadsheet_semantics`, `column_semantics_ontology`, `stats_method_ontology`, `excel_number_formats_structure`, `lab_result_patterns`, `telecom_usage_patterns` |
| Dead normalizers | Various | ~2 files | `locale_numeric_date_rules`, `month_normalization` |
| Dead parsers | Various | ~1 file | `range_resolution_rules` |
| Dead quality bank | `quality/numeric_integrity_rules.any.json` | ~1 file | DI version `numeric_integrity` used instead |
| Dead policy banks | Various | ~2 files | `result_verification_policy`, `refusal_phrases` |
| Dead overlay | `overlays/followup_suggestions.any.json` | ~1 file | No references anywhere |

**Alternative**: Instead of deleting, move dead banks to `_deprecated/` or add `"futureUse": true` in registry entries.

---

## 10. Summary Counts

| Category | Count |
|----------|-------|
| **New files to create** | |
| ops domain (data banks) | ~39 files |
| ExcelCalcAgent service | 1 file |
| Missing npm scripts | 17 files |
| Missing test files | 10 files |
| Test harness directory | 1 directory |
| **Subtotal new files** | **~68 files** |
| | |
| **Registry entries to add** | |
| DI entity schema registrations | 166 entries |
| ops domain bank registrations | ~20 entries |
| **Subtotal registry entries** | **~186 entries** |
| | |
| **Existing files to modify** | |
| Locale parity content (6 banks) | 6 files |
| Quality bank rules to add | 3 files (+13 new rules) |
| Formatting style stubs to flesh out | 4 files (+12 rules, patterns, tests) |
| Operator collision matrix rules | 1 file (+7 rules) |
| Fallback extraction recovery rules | 1 file (+5 rules) |
| Prompt bank tests to add | 7 files (+7 test suites) |
| Intent pattern fixes | 4 files (priority, collisions, broad tokens) |
| Calc agent tokens_none guards | 2 files (247 patterns) |
| Quality dedupe rules | 1 file (+2 rules) |
| loadBanks.ts (calc agent wiring) | 1 file |
| operatorPlanner.ts (calc routing) | 1 file |
| **Subtotal files to modify** | **~31 files** |
| | |
| **Dead code to delete/deprecate** | |
| Dead DataBankRegistry class | 1 file (1,365 lines) |
| Orphan productHelp service + test | 2 files |
| Dead bank files (if deleting) | ~36 files |
| Dead npm script entries in package.json | ~28 entries |
| **Subtotal deletions** | **~39 files + 28 script entries** |
| | |
| **GRAND TOTAL actions** | **~68 new files + ~186 registry entries + ~31 modifications + ~39 deletions** |
