# SSOT Master Index — Koda Data Bank System
Generated: 2026-03-02 | Registry v4.0.1 | 1,023 banks | 5.1M tokens

---

## §1 Registry Reconciliation

| Metric | Count |
|--------|-------|
| Registered banks | 1,023 |
| On-disk JSON/JSONL files | 1,304 |
| Orphans (disk − registry) | 281 |
| Ghosts (registry − disk) | 0 |
| Checksum entries | 1,023 (100% coverage) |
| Dependency entries | 1,023 (100% coverage) |
| Aliases | 1,290 (1,023 self + 234 dot-notation + 33 other) |
| Dangling aliases | 0 |
| Dangling dependencies | 0 |
| Duplicate IDs | 0 |
| Duplicate paths | 0 |

### Orphan Breakdown (281 files)

| Category | Count | Notes |
|----------|-------|-------|
| Entity schemas (`.entities.schema`) | 172 | JSON Schema validation contracts for per-doctype entity extraction |
| Eval/test files | 38 | Certification, training, and evaluation data |
| Canonical mirrors | 29 | Domain-prefixed duplicates of registered banks (legal: 25, medical: 4) |
| Section definitions (`.sections.any`) | 14 | Per-doctype section membership files |
| Table definitions (`.tables.any`) | 14 | Per-doctype table structure files |
| Quarantine | 11 | February 2026 memory audit — pending review |
| Unclassified | 18 | 16 additional mirrors + 2 training JSONL + 1 implementation report |

**Assessment:** Registry is clean. Zero ghosts, zero dangling references. All orphans are intentionally outside the bank system (schemas, training data) or tracked as mirrors.

---

## §2 Category Inventory (24 categories)

Ordered by load priority (from `bank_registry.loadOrder`):

| # | Category | Banks | Tokens | Avg Tok/Bank | Complexity | Load Dependencies |
|---|----------|-------|--------|-------------|------------|-------------------|
| 1 | manifest | 15 | 437,385 | 29,159 | High | schemas, semantics |
| 2 | schemas | 16 | 7,543 | 471 | Low | manifest, semantics |
| 3 | normalizers | 10 | 133,004 | 13,300 | High | schemas, semantics |
| 4 | routing | 28 | 269,237 | 9,972 | High | manifest, normalizers, schemas, semantics |
| 5 | operators | 50 | 134,227 | 2,685 | Medium | normalizers, routing, semantics |
| 6 | semantics | 606 | 2,985,224 | 4,926 | Medium | manifest, normalizers, operators, quality, routing |
| 7 | scope | 3 | 3,532 | 1,177 | Low | (none) |
| 8 | retrieval | 37 | 156,108 | 4,336 | Medium | normalizers, operators, routing, semantics |
| 9 | formatting | 21 | 26,281 | 1,251 | Low | operators, routing, semantics |
| 10 | dictionaries | 31 | 50,055 | 1,615 | Low | semantics |
| 11 | lexicons | 34 | 82,073 | 2,414 | Medium | semantics |
| 12 | parsers | 10 | 27,831 | 2,783 | Medium | (none) |
| 13 | intent_patterns | 4 | 196,759 | 49,190 | Very High | (none) |
| 14 | microcopy | 12 | 32,147 | 2,922 | Medium | formatting, semantics |
| 15 | overlays | 6 | 11,645 | 1,941 | Medium | formatting, microcopy, retrieval, routing, semantics |
| 16 | prompts | 13 | 19,164 | 1,474 | Low | formatting, operators, routing |
| 17 | policies | 65 | 153,383 | 2,397 | Medium | formatting, operators, prompts, routing, semantics |
| 18 | fallbacks | 5 | 5,382 | 1,076 | Low | microcopy, policies |
| 19 | quality | 36 | 67,881 | 1,886 | Medium | formatting, microcopy, prompts, retrieval, routing, semantics |
| 20 | triggers | 2 | 9,889 | 4,945 | Medium | normalizers, operators, routing |
| 21 | ambiguity | 3 | 6,984 | 2,328 | Medium | operators, retrieval, routing |
| 22 | probes | 10 | 245,686 | 24,569 | High | formatting, quality, retrieval, routing, semantics |
| 23 | templates | 3 | 32,993 | 10,998 | High | quality, routing, semantics |
| 24 | tests | 3 | 1,545 | 515 | Low | (none) |

**Totals:** 1,023 banks | 5,095,958 tokens | 19.76 MB

### Concentration Risk
- `semantics` alone: 606 banks (59.3%), 2.99M tokens (58.6%)
- Top 5 heaviest banks consume 552K+ tokens: `medical_explanation_templates` (173K), `medical_report_ontology` (159K), `doc_taxonomy` (78K), `legal_clause_ontology` (77K), `excel_function_catalog` (66K)
- `intent_patterns` category: only 4 banks but 197K tokens (avg 49K each) — highest per-bank complexity

---

## §3 Concept Namespaces (12)

Every registered bank belongs to exactly one namespace.

### 3.1 Domain Definitions (~30 banks)
**SSOT Canonical:** `domain_ontology` (root taxonomy) + `di_domain_ontology` (DI enumeration)
**Conflict Cluster:** #1 (HIGH)
**Contents:** Root domain ontology, DI domain ontology, 14 domain profiles, domain archetypes
**Key issue:** Two independent domain ID sets with 7 shared, 3 root-only, 7 DI-only

### 3.2 Doc Types (~25 banks)
**SSOT Canonical:** `di_doc_type_ontology` (enumeration) + `doc_taxonomy` (retrieval profiles)
**Conflict Cluster:** #2 (MEDIUM)
**Contents:** DI doc type ontology (202 types), master doc taxonomy (230 types), per-domain catalogs
**Key issue:** 83 shared IDs, 119 DI-only, 147 taxonomy-only; incompatible domain sets

### 3.3 Sections (~10 banks)
**SSOT Canonical:** `di_section_ontology` (64 section IDs)
**Conflict Cluster:** #3 (MEDIUM — layered complementary)
**Contents:** Section ontology, 5 section priority banks, 172 per-doctype section files (orphans)

### 3.4 Entities (~10 banks)
**SSOT Canonical:** `di_entity_ontology` (45 entity types)
**Conflict Cluster:** #4 (LOW — complementary)
**Contents:** Entity ontology, 4 pattern banks (money, date, party, identifier), 172 entity schemas (orphans)

### 3.5 Evidence & Retrieval (~40 banks)
**SSOT Canonical:** `evidence_packaging` (packaging contract) + `extraction_policy` (modes)
**Conflict Cluster:** #5 (LOW — different abstraction levels)
**Contents:** Evidence packaging, extraction policy, query rewrites, boost rules, evidence requirements

### 3.6 Operators (~54 banks)
**SSOT Canonical:** `operator_contracts`
**Contents:** 50 operator banks + 4 intent pattern banks; operator contracts, output shapes, catalogs, collision matrix, playbooks

### 3.7 Quality (~36 banks)
**SSOT Canonical:** `hallucination_guards` + `doc_grounding_checks`
**Contents:** Quality gates, hallucination guards, grounding checks, dedup rules, privacy rules, PII labels

### 3.8 Prompts (~13 banks)
**SSOT Canonical:** `system_base` (identity) + `rag_policy` (grounding)
**Contents:** System prompts, RAG policy, citation policy, task templates, editing prompts

### 3.9 Formatting (~21 banks)
**SSOT Canonical:** `answer_style_policy`
**Contents:** Answer styles, banned phrases, bullet/table/quote/list/bolding rules, render policy

### 3.10 Microcopy (~12 banks)
**SSOT Canonical:** `processing_messages`
**Contents:** Processing messages, error catalogs, disambiguation microcopy, no-docs messages

### 3.11 Policies (~65 banks)
**SSOT Canonical:** Various — each policy is canonical for its domain
**Contents:** Compliance, logging, rate limit, refusal, memory, clarification, scope policies; per-domain policies

### 3.12 Infrastructure (~650+ banks)
**SSOT Canonical:** `bank_registry` (master index)
**Contents:** Manifests (15), schemas (16), normalizers (10), dictionaries (31), lexicons (34), parsers (10), scope (3), overlays (6), fallbacks (5), triggers (2), ambiguity (3), probes (10), templates (3), tests (3), remaining semantics (~500+)

---

## §4 Document Intelligence Deep-Dive

### Domain Coverage
The DI subsystem operates across **14 domains** (per `di_domain_ontology`) with deep support for 5 core domains (per `document_intelligence_bank_map`):

| Core Domain | Archetypes | Aliases | Section Priority | Query Rewrites | Boost Rules | Playbooks |
|-------------|-----------|---------|-----------------|---------------|-------------|-----------|
| accounting | ✅ | ✅ | ❌ | ❌ | ❌ | separate banks |
| finance | ✅ | ✅ | ✅ | ✅ | ✅ | 11 |
| legal | ✅ | ✅ | ✅ | ✅ | ✅ | 11 |
| medical | ✅ | ✅ | ✅ | ✅ | ✅ | 11 |
| ops | ✅ | ✅ | ✅ | ✅ | ✅ | 11 |

### DI Bank Map Required Banks
`document_intelligence_bank_map` declares **29+ required core bank IDs** and numerous optional banks including extraction hints, sections, tables, keyword taxonomies, disclaimers, and profiles.

### DI Wiring Gates
`runtime_wiring_gates.any.json` enforces 3 gates at boot for DI integrity.

---

## §5 Runtime-Required Banks

### RUNTIME_REQUIRED_BANKS (52 banks)
From `runtimeWiringIntegrity.service.ts`:

| Group | Banks | Count |
|-------|-------|-------|
| Intent/Routing | intent_config, intent_patterns, operator_families, operator_contracts, operator_output_shapes, operator_collision_matrix | 6 |
| Formatting | render_policy, answer_style_policy, truncation_and_limits, banned_phrases, bullet_rules, table_rules, bolding_rules, list_styles, table_styles, quote_styles, citation_styles | 11 |
| Prompts | prompt_registry, task_answer_with_sources, task_plan_generation, editing_task_prompts, llm_builder_policy, fallback_prompt | 6 |
| Microcopy | language_triggers, processing_messages, no_docs_messages, scoped_not_found_messages, disambiguation_microcopy, edit_error_catalog | 6 |
| Operators | operator_catalog, allybi_capabilities | 2 |
| Intent Patterns | intent_patterns_docx_en, intent_patterns_docx_pt, intent_patterns_excel_en, intent_patterns_excel_pt | 4 |
| DI | document_intelligence_bank_map | 1 |
| Fallback | fallback_router, fallback_processing, fallback_scope_empty, fallback_not_found_scope, fallback_extraction_recovery | 5 |
| Quality | doc_grounding_checks, hallucination_guards, dedupe_and_repetition, koda_product_help | 4 |
| Policies | privacy_minimal_rules, pii_field_labels, clarification_policy, compliance_policy, logging_policy, rate_limit_policy, refusal_policy | 7 |

### Integrity Check Categories (21)
The runtime wiring service validates 21 categories covering: missing banks, operator contract alignment, prompt layer validation, builder policy structure, legacy import detection, console usage, memory patterns, answer mode contract drift, and product help usage.

---

## §6 Load Order Summary

The 24 categories load in a deterministic order defined by `bank_registry.loadOrder`. Key observations:

1. **Bootstrap layer** (1-3): manifest → schemas → normalizers — establishes the bank system itself
2. **Routing layer** (4-5): routing → operators — establishes intent classification
3. **Knowledge layer** (6): semantics — 606 banks, the bulk of the system
4. **Application layer** (7-14): scope → retrieval → formatting → dictionaries → lexicons → parsers → intent_patterns → microcopy
5. **Policy layer** (15-19): overlays → prompts → policies → fallbacks → quality
6. **Extension layer** (20-24): triggers → ambiguity → probes → templates → tests

6 mutual dependency cycles exist at the category level (all involving semantics). These are resolved by the deterministic load order — earlier categories load first, later categories can reference earlier ones, and forward references are resolved post-load.

---

## Cross-References

- **Machine-readable map:** `SSOT_CANONICAL_MAP.json`
- **Conflict details:** `SSOT_CONFLICTS_AND_DUPES.md`
- **Migration plan:** `SSOT_MIGRATION_PATCHPLAN.md`
- **Runtime truth contract:** `SSOT_RUNTIME_TRUTH_CONTRACT.md`
- **Scorecard:** `SSOT_SCORECARD.md`
- **Existing audit:** `reports/unused_bank_audit.json`
- **Complexity report:** `notes/DATABANK_TYPES_AND_COMPLEXITY.md`
