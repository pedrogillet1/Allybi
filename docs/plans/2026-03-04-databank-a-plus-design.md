# Data Bank A+ Remediation Design

> Date: 2026-03-04 | Current: F (38/100) | Target: A+ (97/100) | Approach: Fix gates first, content second

## Context

The data bank system audit revealed 4 failing P0 hard gates:
1. Checksum gate: 1,480 mismatches
2. Decorative JSON: 55 dead banks (21 excel_calc entirely unreachable)
3. SSOT: domain ontology fork with incompatible domain ID sets
4. EN/PT locale content gaps (94 missing translations)

## Decisions

- **Excel calc agent**: Wire into runtime (create ExcelCalcAgentService)
- **Other dead banks**: Deprecate clearly useless, wire viable ones case-by-case
- **Ops domain**: Create fully (~39 new files)

## Phase Structure

| Phase | Name | P0 Gates Fixed | Grade After | Effort |
|-------|------|---------------|-------------|--------|
| 1 | Checksums + Cleanup | Checksum | ~B+ (78) | 1 hour |
| 2 | SSOT + Dead Bank Triage | SSOT, Decorative (partial) | ~A- (85) | 4-6 hours |
| 3 | Excel Calc Agent Wiring | Decorative (complete) | ~A- (88) | 1-2 days |
| 4 | Locale Parity + Content | Locale parity | ~A (93) | 1 day |
| 5 | Ops Domain + CI + Polish | All remaining | A+ (97) | 2-3 days |

## Phase 1: Checksums + Cleanup

1. Delete 29 canonical mirror files (25 legal, 4 medical)
2. Delete 11 quarantine files from `_quarantine/2026-02-memory-audit/`
3. Delete dead `DataBankRegistry` class (1,365 lines)
4. Run `npm run banks:integrity:generate`
5. Verify: `npm run banks:integrity:check` passes

## Phase 2: SSOT + Dead Bank Triage

**SSOT:**
- Add `dependsOn: ["domain_ontology"]` to `di_domain_ontology`
- Add `_meta.ssotRole` markers to both ontologies
- Add cross-validation in `documentIntelligenceIntegrity.service.ts`
- Delete 5 duplicate table header ontology files from DI location

**Deprecate:** conversation_messages, nav_microcopy, file_actions_microcopy, ui_intro_neutral, ui_next_step_suggestion, ui_soft_close, compose_answer_prompt, system_prompt, mode_editing_docx, mode_editing_sheets, agg_stats_terms_en/pt, format_semantics, spreadsheet_semantics, excel_number_formats_structure, locale_numeric_date_rules, month_normalization, range_resolution_rules, numeric_integrity_rules (quality)

**Wire:** excel_functions_en/pt, refusal_phrases, lab_result_patterns, telecom_usage_patterns, followup_suggestions

## Phase 3: Excel Calc Agent Wiring

- New: `services/agents/excelCalcAgent.service.ts` — loads all 21 banks, typed accessors, intent resolution
- Edit: `services/editing/allybi/loadBanks.ts` — add calc bank IDs
- Edit: `bootstrap/container.ts` — register service
- New: `services/agents/excelCalcAgent.service.test.ts` — verify all 21 banks load

## Phase 4: Locale Parity + Content

**Locale:** 6 files with content gaps (61+18+6+5+3+1 = 94 translations)
**Content:** hallucination_guards 2→7, privacy_minimal_rules 2→7, doc_grounding_checks 2→5, collision_matrix 3→10, fallback_extraction_recovery 2→7, 4 formatting stubs, 7 prompt test suites, intent pattern fixes
**New test:** dictionaryParity.en_pt.test.ts

## Phase 5: Ops Domain + CI + Polish

- Create ~39 files under `document_intelligence/domains/ops/`
- Register 166 DI entity schemas in bank_registry
- Add 4 test files to CI workflow
- Final `npm run banks:integrity:generate`
