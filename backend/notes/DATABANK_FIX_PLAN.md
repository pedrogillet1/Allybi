# Data Bank Fix Plan — Top 25 Fixes to A+

> Generated: 2026-03-04 | Current grade: F (38/100) | Target: A+ (95+/100)

---

## Critical Path

The single highest-leverage action is **regenerating checksums** (`npm run banks:integrity:generate`). This alone would lift every family's Deploy score from 0 to 100, moving the overall grade from F to approximately B+/A-.

After checksums, the remaining fixes target dead banks, SSOT conflicts, locale parity, collision risk, and missing content.

---

## Fix Priority Tiers

### Tier 0 — P0 Gate Fixes (MUST DO FIRST)

| # | Fix | Files to Edit | Impact | Effort |
|---|-----|---------------|--------|--------|
| 1 | **Regenerate checksums**: `npm run banks:integrity:generate` | `manifest/bank_checksums.any.json`, `manifest/bank_aliases.any.json`, `manifest/bank_dependencies.any.json` | Fixes P0 checksum gate (1,480 mismatches → 0). Lifts ALL families from D to their natural grade. | 1 command |
| 2 | **Fix domain ontology SSOT fork**: Add `dependsOn: ["domain_ontology"]` to `di_domain_ontology`, add `_meta.ssotRole` markers, add cross-validation integrity check | `document_intelligence/semantics/domain_ontology.any.json`, `services/core/banks/documentIntelligenceIntegrity.service.ts` | Fixes P0 SSOT gate. Prevents domain drift. | 2-3 hours |
| 3 | **Wire or deprecate excel_calc agent banks**: Create `ExcelCalcAgentService` that loads all 21 banks via `getBank()`, OR move all 21 to `_deprecated/` | New: `services/agents/excelCalcAgent.service.ts`; Edit: `services/editing/allybi/loadBanks.ts`, `bootstrap/container.ts` | Fixes P0 decorative JSON gate. 511K tokens either become useful or stop cluttering. | 1-2 days (wire) OR 1 hour (deprecate) |
| 4 | **Fix EN/PT content parity gaps**: Add missing translations | See per-file details below | Fixes P0 locale parity gate. | 4-6 hours |

### Tier 1 — High-Impact Quality Fixes

| # | Fix | Files to Edit | Impact | Effort |
|---|-----|---------------|--------|--------|
| 5 | **Wire or deprecate 6 dead microcopy banks** | `microcopy/conversation_messages.any.json`, `microcopy/nav_microcopy.any.json`, `microcopy/file_actions_microcopy.any.json`, `microcopy/ui_intro_neutral.any.json`, `microcopy/ui_next_step_suggestion.any.json`, `microcopy/ui_soft_close.any.json` | Removes 35% dead rate from microcopy family. | 2 hours |
| 6 | **Wire or deprecate 4 dead prompt banks** | `prompts/compose_answer_prompt.any.json`, `prompts/system_prompt.any.json`, `prompts/mode_editing_docx.any.json`, `prompts/mode_editing_sheets.any.json` | Cleans prompt family. | 1 hour |
| 7 | **Wire or deprecate 4 dead dictionary banks** | `dictionaries/agg_stats_terms_en.any.json`, `dictionaries/agg_stats_terms_pt.any.json`, `dictionaries/excel_functions_en.any.json`, `dictionaries/excel_functions_pt.any.json` | Cleans dictionary family. | 1 hour |
| 8 | **Wire or deprecate 7 dead semantics banks** | `format_semantics`, `spreadsheet_semantics`, `column_semantics_ontology`, `stats_method_ontology`, `excel_number_formats_structure`, `lab_result_patterns`, `telecom_usage_patterns` | Cleans semantics family. | 2 hours |
| 9 | **Delete dead DataBankRegistry class** | `data_banks/dataBankRegistry.ts` (1,365 lines) | Removes 1,365 lines of dead code. | 30 mins |
| 10 | **Fix intent pattern priority inversion** | `intent_patterns/docx.en.any.json`, `intent_patterns/docx.pt.any.json` | Fixes find_replace (pri 80) vs replace.span (pri 85) inversion. | 1 hour |

### Tier 2 — Content Completeness

| # | Fix | Files to Edit | Impact | Effort |
|---|-----|---------------|--------|--------|
| 11 | **Register 166 DI entity schemas** | `manifest/bank_registry.any.json` | Reduces orphan count from 238 to 72. | 2-3 hours |
| 12 | **Expand hallucination_guards** (2→7 rules) | `quality/hallucination_guards.any.json` | Add HG_003 through HG_007. Strengthens quality gates. | 2 hours |
| 13 | **Expand privacy_minimal_rules** (2→7 rules) | `quality/privacy_minimal_rules.any.json` | Add PMR_003 through PMR_007. | 1 hour |
| 14 | **Expand doc_grounding_checks** (2→5 checks) | `quality/doc_grounding_checks.any.json` | Add DGC_003 through DGC_005. | 1 hour |
| 15 | **Flesh out 4 formatting style stubs** | `formatting/citation_styles.any.json`, `formatting/list_styles.any.json`, `formatting/quote_styles.any.json`, `formatting/table_styles.any.json` | Add rules[], patterns[], templates{}, tests{} to each. | 3-4 hours |
| 16 | **Expand operator collision matrix** (3→10 rules) | `operators/operator_collision_matrix.any.json` | Add CM_0004 through CM_0010. Reduces collision risk. | 2 hours |
| 17 | **Expand fallback_extraction_recovery** (2→7 rules) | `fallbacks/fallback_extraction_recovery.any.json` | Add fer_ocr_degraded through fer_table_extraction. | 1 hour |
| 18 | **Add test suites to 7 prompt banks** | `prompts/mode_chat.any.json`, `prompts/mode_editing.any.json`, `prompts/mode_editing_docx.any.json`, `prompts/mode_editing_sheets.any.json`, `prompts/policy_citations.any.json`, `prompts/rag_policy.any.json`, `prompts/system_base.any.json` | Self-validation coverage. | 3-4 hours |
| 19 | **Tighten overly broad intent tokens** | `intent_patterns/docx.en.any.json`, `intent_patterns/docx.pt.any.json` | Fix 10+ patterns with single-word tokens_any (e.g., "size", "number", "left"). Add tokens_none guards. | 3-4 hours |
| 20 | **Add tokens_none guards to calc patterns** | `agents/excel_calc/routing/calc_intent_patterns.en.any.json`, `agents/excel_calc/routing/calc_intent_patterns.pt.any.json` | 247 patterns with empty tokens_none — add cross-domain negative guards. | 2-3 hours |

### Tier 3 — Structural & CI Improvements

| # | Fix | Files to Edit | Impact | Effort |
|---|-----|---------------|--------|--------|
| 21 | **Create ops domain** (entirely missing) | ~39 new files under `document_intelligence/domains/ops/` | Completes the 14th declared domain. | 1-2 days |
| 22 | **Delete 29 canonical mirrors** | 25 legal + 4 medical files in `document_intelligence/domains/` | Removes disk clutter and developer confusion. | 30 mins |
| 23 | **Delete or resolve 11 quarantine files** | `_quarantine/2026-02-memory-audit/*` | Clears governance backlog. | 1 hour |
| 24 | **Add CI gates for parity and SSOT tests** | `.github/workflows/bank-quality-gates.yml` | Gate `doc-taxonomy-ssot.test.ts`, `patternParity.en_pt.test.ts`, `editingRouting.bankWiring.test.ts` in CI. | 1 hour |
| 25 | **Add abbreviation/dictionary parity test** | New: `src/tests/dictionaryParity.en_pt.test.ts` | Currently only pattern banks have parity tests. Dictionaries and abbreviations need the same. | 2 hours |

---

## Detailed Fix Instructions

### Fix 1: Regenerate Checksums

```bash
cd backend
npm run banks:integrity:generate
```

This runs:
1. `banks:deps:generate` — regenerates dependency graph
2. `banks:aliases:generate` — regenerates alias map
3. `banks:checksum:generate` — regenerates SHA-256 checksums

Then verify: `npm run banks:integrity:check`

### Fix 2: Domain Ontology SSOT

**File**: `backend/src/data_banks/document_intelligence/semantics/domain_ontology.any.json`

Add to `_meta`:
```json
{
  "dependsOn": ["domain_ontology"],
  "_meta": {
    "ssotRole": "di_enumeration",
    "ssotCanonical": "domain_ontology"
  }
}
```

**File**: `backend/src/data_banks/semantics/domain_ontology.any.json`

Add to `_meta`:
```json
{
  "_meta": {
    "ssotRole": "root_taxonomy"
  }
}
```

**File**: `backend/src/services/core/banks/documentIntelligenceIntegrity.service.ts`

Add cross-validation that verifies the 7 shared domain IDs match between root and DI ontologies.

### Fix 4: EN/PT Content Parity

| File | Action | Count |
|------|--------|-------|
| `dictionaries/excel_functions.pt.any.json` | Add 61 missing PT function localizations | -61 gap |
| `document_intelligence/domains/finance/abbreviations/finance.pt.any.json` | Add 18 missing PT abbreviations | -18 gap |
| `document_intelligence/domains/accounting/abbreviations/accounting.pt.any.json` | Add 6 missing PT abbreviations | -6 gap |
| `document_intelligence/domains/insurance/abbreviations/insurance.pt.any.json` | Add 5 missing PT abbreviations | -5 gap |
| `parsers/excel_chart_types.pt.any.json` | Add 3 missing chart type entries | -3 gap |
| `intent_patterns/docx.en.any.json` | Add `docx.rewrite.informal` pattern (exists in PT, missing from EN) | -1 gap |

### Fix 10: Intent Pattern Priority Inversion

**Files**: `intent_patterns/docx.en.any.json`, `intent_patterns/docx.pt.any.json`

Change `docx.find_replace` priority from 80 to 90, OR add `tokens_none: ["find"]` to `docx.replace.span`.

Also merge `list.convert_to_paragraphs` and `list.bullets_to_paragraph` into one pattern to fix triple collision.

---

## Expected Grade After All Fixes

| Phase | Grade | Score | Key Change |
|-------|-------|-------|------------|
| Current | F | 38/100 | Checksum gate fails, 55 dead banks, SSOT fork |
| After Tier 0 | B+ | 78/100 | Checksums pass, SSOT fixed, excel_calc resolved, parity fixed |
| After Tier 1 | A- | 88/100 | Dead banks cleared, priorities fixed |
| After Tier 2 | A | 93/100 | Content gaps filled, rules expanded |
| After Tier 3 | A+ | 97/100 | CI gates added, ops domain created, mirrors cleaned |

---

## Execution Order

```
Phase 1 (1 hour):    Fix 1 (checksums) → Fix 22 (delete mirrors) → Fix 23 (quarantine)
Phase 2 (4 hours):   Fix 2 (SSOT) → Fix 9 (delete dead class) → Fix 4 (parity)
Phase 3 (1-2 days):  Fix 3 (excel_calc) → Fix 5-8 (dead banks) → Fix 10 (priorities)
Phase 4 (2-3 days):  Fix 11-20 (content/quality)
Phase 5 (2-3 days):  Fix 21 (ops domain) → Fix 24-25 (CI/tests)
```

Total estimated effort: **5-8 working days** for all 25 fixes.
