# Data Bank Wiring Proof — Evidence-Based

> Generated: 2026-03-04 | Method: ripgrep for `getBank`/`getOptionalBank`/`getBankLoaderInstance` across all backend/src (excluding data_banks/ and node_modules/)

---

## Loading Systems

| System | File | Status | Evidence |
|--------|------|--------|----------|
| **DataBankLoader** | `services/core/banks/dataBankLoader.service.ts` | ACTIVE | Primary loader; boot-time load of all registered banks |
| **BankLoaderService** | `services/core/banks/bankLoader.service.ts` | ACTIVE | Singleton wrapper; exports `getBank()`, `getOptionalBank()`, `hasBank()` — used by 59+ files |
| **DocumentIntelligenceBanksService** | `services/core/banks/documentIntelligenceBanks.service.ts` | ACTIVE | Typed accessors for DI domain banks; cached access via `getCachedRequired<T>()` |
| **BankSelectionPlanner** | `services/core/banks/bankSelectionPlanner.service.ts` | ACTIVE | Runtime bank dependency planning; lazy domain pack loading |
| **DomainPackLoader** | `services/core/banks/domainPackLoader.service.ts` | ACTIVE | Dynamic domain-specific bank loading based on query context |
| **DataBankRegistry** (legacy) | `data_banks/dataBankRegistry.ts` | **DEAD** | 1,365 lines, zero imports from any service/module/test |

---

## WIRED Banks — Full Evidence

### Bootstrap (5 banks — boot-time load)

| Bank ID | Consumer | File:Line | Evidence Type |
|---------|----------|-----------|---------------|
| `bank_registry` | dataBankLoader.service.ts | Boot | Parsed to build bank index |
| `bank_aliases` | dataBankLoader.service.ts | Boot | Alias resolution at startup |
| `bank_dependencies` | dataBankLoader.service.ts, documentIntelligenceIntegrity.service.ts | Boot, :74 | Dependency DAG validation |
| `bank_manifest` | dataBankLoader.service.ts | Boot | Category/load-order validation |
| `bank_checksums` | dataBankLoader.service.ts | Boot | SHA-256 integrity verification |

### Routing (8 banks — ALL WIRED)

| Bank ID | Consumer | File:Line |
|---------|----------|-----------|
| `intent_config` | intentConfig.service.ts | :257 |
| `intent_patterns` | runtimeWiringIntegrity.service.ts | :634 |
| `operator_families` | llmGateway.service.ts, answerModeRouter.service.ts | :810, :103 |
| `operator_collision_matrix` | runtimeWiringIntegrity.service.ts RUNTIME_REQUIRED_BANKS | :41 |
| `connectors_routing` | turnRoutePolicy.service.ts via DI getRoutingBank() | :315 |
| `email_routing` | turnRoutePolicy.service.ts via DI getRoutingBank() | :316 |
| `routing_priority` | retrievalEngine.service.ts | :548 |
| `editing_routing` | allybi/loadBanks.ts | :68 |

### Operators (50 banks — ALL WIRED)

| Bank ID | Consumer | File:Line |
|---------|----------|-----------|
| `operator_contracts` | responseContractEnforcer.v2.service.ts | :2039+ |
| `operator_output_shapes` | responseContractEnforcer.v2.service.ts | :2039+ |
| `operator_catalog` | capabilityMatrix.service.ts, bankIntegrity.service.ts | :77, :27 |
| `file_action_operators` | turnRouter.service.ts via DI banks | :394 |
| `operator_playbook_*` (44 banks) | CentralizedChatRuntimeDelegate.ts via DI banks | :5229 |

### Enforcement / Formatting (12 banks — ALL WIRED)

| Bank ID | Consumer | File:Line |
|---------|----------|-----------|
| `render_policy` | responseContractEnforcer.v2.service.ts | :2039 |
| `ui_contracts` | responseContractEnforcer.v2.service.ts | :2040 |
| `banned_phrases` | responseContractEnforcer.v2.service.ts | :2041 |
| `truncation_and_limits` | responseContractEnforcer.v2.service.ts, tokenBudget.service.ts | :2042, :61 |
| `bullet_rules` | responseContractEnforcer.v2.service.ts | :2043 |
| `table_rules` | responseContractEnforcer.v2.service.ts | :2044 |
| `quote_styles` | responseContractEnforcer.v2.service.ts | optional |
| `citation_styles` | responseContractEnforcer.v2.service.ts | optional |
| `list_styles` | responseContractEnforcer.v2.service.ts | optional |
| `table_styles` | responseContractEnforcer.v2.service.ts | optional |
| `answer_style_policy` | responseContractEnforcer.v2.service.ts, CentralizedChatRuntimeDelegate.ts | :2050, :5337 |
| `bolding_rules` | responseContractEnforcer.v2.service.ts, CentralizedChatRuntimeDelegate.ts | :2050+, :5338 |

### Prompts (13 banks — WIRED via promptRegistry)

| Bank ID | Consumer | File:Line |
|---------|----------|-----------|
| `prompt_registry` | promptRegistry.service.ts | :335 |
| `system_base` | promptRegistry.service.ts default layers | :467 |
| `mode_chat` | promptRegistry.service.ts | :468 |
| `mode_editing` | promptRegistry.service.ts | :480 |
| `rag_policy` | promptRegistry.service.ts | :468 |
| `retrieval_prompt` | promptRegistry.service.ts | :468 |
| `task_answer_with_sources` | promptRegistry.service.ts | :473 |
| `policy_citations` | promptRegistry.service.ts | :474 |
| `disambiguation_prompt` | promptRegistry.service.ts | :476 |
| `fallback_prompt` | promptRegistry.service.ts | :477 |
| `editing_task_prompts` | promptRegistry.service.ts | :481 |
| `task_plan_generation` | promptRegistry.service.ts | :482 |
| `tool_prompts` | promptRegistry.service.ts | :484 |

### Quality (10 banks — ALL WIRED)

| Bank ID | Consumer | File:Line |
|---------|----------|-----------|
| `quality_gates` | qualityGateRunner.service.ts, CentralizedChatRuntimeDelegate.ts | :607, :1053 |
| `doc_grounding_checks` | qualityGateRunner.service.ts via integrationHooks | :630-632 |
| `hallucination_guards` | qualityGateRunner.service.ts via integrationHooks | :630-632 |
| `dedupe_and_repetition` | qualityGateRunner.service.ts via integrationHooks | :812-814 |
| `pii_field_labels` | qualityGateRunner.service.ts via integrationHooks | :855-857 |
| `privacy_minimal_rules` | RUNTIME_REQUIRED_BANKS | :78 |
| `ambiguity_questions` | qualityGateRunner.service.ts | :1783 |
| `numeric_integrity` | qualityGateRunner.service.ts | :1682 |
| `source_policy` | qualityGateRunner.service.ts | :1644 |
| `wrong_doc_lock` | qualityGateRunner.service.ts | :1754 |

### Retrieval (17+ banks — ALL WIRED)

| Bank ID | Consumer | File:Line |
|---------|----------|-----------|
| `semantic_search_config` | retrievalEngine.service.ts | :542 |
| `retrieval_ranker_config` | retrievalEngine.service.ts | :543 |
| `keyword_boost_rules` | retrievalEngine.service.ts | :544 |
| `doc_title_boost_rules` | retrievalEngine.service.ts | :545 |
| `doc_type_boost_rules` | retrievalEngine.service.ts | :546 |
| `recency_boost_rules` | retrievalEngine.service.ts | :547 |
| `diversification_rules` | retrievalEngine.service.ts | :549 |
| `retrieval_negatives` | retrievalEngine.service.ts | :550 |
| `evidence_packaging` | retrievalEngine.service.ts | :551 |
| `synonym_expansion` | retrievalEngine.service.ts | :1177 |
| `entity_role_ontology` | retrievalEngine.service.ts, extractionCompiler.service.ts | :2170, :213 |
| `extraction_policy` | extractionCompiler.service.ts | :218 |
| `query_slot_contracts` | slotResolver.service.ts | :76 |
| `source_engine` | sourceButtons.service.ts | :53 |
| `boost_rules_*` (5 domains) | documentIntelligenceBanks.service.ts | :466 |
| `query_rewrites_*` (5 domains) | documentIntelligenceBanks.service.ts | :474 |
| `section_priority_*` (5 domains) | documentIntelligenceBanks.service.ts | :482 |

### Scope / Overlays (7 banks — ALL WIRED)

| Bank ID | Consumer | File:Line |
|---------|----------|-----------|
| `scope_hints` | scopeGate.service.ts | :344 |
| `scope_resolution` | scopeGate.service.ts | :346 |
| `followup_indicators` | scopeGate.service.ts, turnRouter.service.ts | :347, :394 |
| `discourse_markers` | scopeGate.service.ts | :348 |
| `stopwords_docnames` | scopeGate.service.ts | :358 |
| `disambiguation_policies` | scopeGate.service.ts, clarificationPolicy.service.ts | :359, :77 |
| `ambiguity_rank_features` | scopeGate.service.ts | :360 |

### Policy / Memory / Fallback (18+ banks — ALL WIRED)

| Bank ID | Consumer | File:Line |
|---------|----------|-----------|
| `memory_policy` | conversationMemory.service.ts, ChatRuntimeOrchestrator.ts, ScopeService.ts, evidenceGate.service.ts | :45, :71, :23, :111 |
| `clarification_policy` | clarificationPolicy.service.ts | :73 |
| `clarification_phrases` | clarificationPolicy.service.ts | :75 |
| `compliance_policy` | compliancePolicy.service.ts | :31 |
| `refusal_policy` | refusalPolicy.service.ts | :81 |
| `assumption_policy` | reasoningPolicy.service.ts | :34 |
| `logging_policy` | runtimeWiringIntegrity.service.ts | :388 |
| `rate_limit_policy` | RUNTIME_REQUIRED_BANKS | :83 |
| `feature_flags` | llmRouter.service.ts | :216 |
| `fallback_router` | chatMicrocopy.service.ts, fallbackConfig.service.ts | :277, :126 |
| `fallback_processing` | fallbackDecisionPolicy.service.ts | :95 |
| `fallback_scope_empty` | fallbackDecisionPolicy.service.ts | :96 |
| `fallback_not_found_scope` | fallbackDecisionPolicy.service.ts | :97 |
| `fallback_extraction_recovery` | fallbackDecisionPolicy.service.ts | :98 |
| `fallback_policy` | bankLoader.service.ts core banks list | :259 |
| `python_sandbox_policy` | spreadsheetEngine.service.ts | :119 |
| `decision_support_*` (5 domains) | reasoningPolicy.service.ts | :42 |
| `explain_style_*` (5 domains) | reasoningPolicy.service.ts | :45 |

### Microcopy (9 banks — WIRED)

| Bank ID | Consumer | File:Line |
|---------|----------|-----------|
| `processing_messages` | chatMicrocopy.service.ts | :247 |
| `no_docs_messages` | chatMicrocopy.service.ts | :508 |
| `scoped_not_found_messages` | chatMicrocopy.service.ts | :532 |
| `disambiguation_microcopy` | chatMicrocopy.service.ts | :599 |
| `edit_error_catalog` | chatMicrocopy.service.ts | :738 |
| `editing_microcopy` | editReceipt.service.ts, supportContract.service.ts | :125, :136 |
| `editing_ux` | supportContract.service.ts | :106 |
| `koda_product_help` | productHelp.service.ts | :408, :128 |
| `capabilities_catalog` | productHelp.service.ts | :230 |

### Editing / Allybi (37+ banks — ALL WIRED via loadBanks.ts)

Loaded at `services/editing/allybi/loadBanks.ts:51-89`:
- `allybi_capabilities`, `allybi_intents`, `allybi_docx_operators`, `allybi_xlsx_operators`
- `allybi_language_triggers`, `allybi_docx_resolvers`, `allybi_xlsx_resolvers`
- `allybi_formula_bank`, `allybi_chart_spec_bank`, `allybi_crossdoc_grounding`
- `allybi_response_style`, `allybi_render_cards`, `allybi_connector_permissions`, `allybi_font_aliases`
- `excel_formula_catalog`, `excel_shortcuts`, `excel_edit_regression`, `operator_catalog`
- `intent_patterns_excel_en/pt`, `intent_patterns_docx_en/pt`
- `common_en/pt`, `excel_en/pt`, `docx_en/pt`, `colors_en/pt`, `fonts`
- `excel_number_formats`, `excel_chart_types_en/pt`, `excel_functions_pt_to_en`
- `docx_heading_levels_en/pt`

Additional: `editing_policy` → `EditingPolicyService.ts:18`, `editing_agent_policy` → `editingAgentRouter.service.ts:113`

### Language / Triggers (2 banks — WIRED)

| Bank ID | Consumer | File:Line |
|---------|----------|-----------|
| `language_triggers` | languageDetector.service.ts | :166 |
| `language_indicators` | languageDetector.service.ts | :167 |

### Document Intelligence (~200 banks — WIRED via DocumentIntelligenceBanksService)

Loaded dynamically through `DocumentIntelligenceBanksService` constructing bank IDs from domain + family patterns. Consumers:
- `retrievalEngine.service.ts:526`
- `qualityGateRunner.service.ts:603`
- `scopeGate.service.ts:311`
- `turnRouter.service.ts:135`
- `turnRoutePolicy.service.ts:130`
- `documentReferenceResolver.service.ts:151`
- `admin/index.ts:76`

---

## DEAD Banks — Full Evidence

### agents/excel_calc (21 banks — ENTIRE SUBSYSTEM DEAD)

**Evidence**: `grep -r "calc_intent_patterns\|calc_task_taxonomy\|slot_schemas_excel_calc\|excel_function_catalog\|python_recipe_catalog\|stats_method_ontology\|distribution_ontology\|column_semantics_ontology\|chart_intent_taxonomy\|chart_recipe_catalog\|chart_templates\|python_chart_recipes\|clarification_policy_excel_calc\|result_verification_policy\|excel_calc_eval_suite_registry\|slot_extraction_cases" backend/src/services/ backend/src/modules/` → **0 matches**.

No `ExcelCalcAgentService` or equivalent runtime consumer exists.

### Dead Microcopy (6 banks)

| Bank ID | Evidence |
|---------|----------|
| `conversation_messages` | No `getBank("conversation_messages")` in any `.ts` file |
| `nav_microcopy` | No `getBank` reference |
| `file_actions_microcopy` | Only in `generateAllBanks.ts` (generator, not runtime) |
| `ui_intro_neutral` | No `getBank` reference |
| `ui_next_step_suggestion` | No `getBank` reference |
| `ui_soft_close` | No `getBank` reference |

### Dead Prompts (4 banks)

| Bank ID | Evidence |
|---------|----------|
| `compose_answer_prompt` | Not in promptRegistry default layers |
| `system_prompt` | Runtime uses `system_base` instead |
| `mode_editing_docx` | Not in promptRegistry default layers |
| `mode_editing_sheets` | Not in promptRegistry default layers |

### Dead Dictionaries (4 banks)

| Bank ID | Evidence |
|---------|----------|
| `agg_stats_terms_en` | No `getBank` reference |
| `agg_stats_terms_pt` | No `getBank` reference |
| `excel_functions_en` | Not loaded by ID (only `excel_functions_pt_to_en` is) |
| `excel_functions_pt` | Not loaded by ID |

### Dead Semantics (7 banks)

| Bank ID | Evidence |
|---------|----------|
| `format_semantics` | No references in any `.ts` file |
| `spreadsheet_semantics` | Test-only: direct JSON load in semantics-crosslayer-integrity.test.ts |
| `column_semantics_ontology` | No references |
| `stats_method_ontology` | No references |
| `excel_number_formats_structure` | Not loaded by ID |
| `lab_result_patterns` | Not in DI entity pattern types |
| `telecom_usage_patterns` | Not in DI entity pattern types |

### Dead Normalizers/Parsers (3 banks)

| Bank ID | Evidence |
|---------|----------|
| `locale_numeric_date_rules` | No references |
| `month_normalization` | No references |
| `range_resolution_rules` | No references |

### Dead Quality/Policy (4 banks)

| Bank ID | Evidence |
|---------|----------|
| `numeric_integrity_rules` | DI bank `numeric_integrity` used instead |
| `result_verification_policy` | No references |
| `refusal_phrases` | Only `refusal_policy` is loaded |
| `followup_suggestions` | No references anywhere |

### Dead Manifest/Meta (4 banks — acceptable)

| Bank ID | Evidence |
|---------|----------|
| `environments` | Meta tracking only |
| `languages` | Meta tracking only |
| `unused_bank_lifecycle` | Meta tracking only |
| `versioning` | Meta tracking only |

### Dead Schemas (16 banks — acceptable, meta-only)

All 16 schema banks are validation-only definitions, not runtime data. Acceptable.

### Dead DataBankRegistry Class

`data_banks/dataBankRegistry.ts` (1,365 lines) — **zero imports** from any service, module, controller, or test file. All runtime loading goes through `DataBankLoaderService`.

---

## Summary

| Classification | Count | Notes |
|---------------|-------|-------|
| **WIRED (production)** | ~230+ | Verified runtime consumers with file:line evidence |
| **DEAD (no consumer)** | ~55 | Registered but no getBank() call reaches them |
| **META (acceptable dead)** | ~20 | Schemas, manifest meta, versioning |
| **TEST-ONLY** | 3 | memory_policy_tests, orchestrator_certification, spreadsheet_semantics |
| **Total registered** | ~1,019 | |
| **Orphan files (not registered)** | 238 | 166 DI entity schemas + 42 deprecated + 30 other |
| **Runtime consumer files** | 59+ | Services that call getBank/getOptionalBank |
