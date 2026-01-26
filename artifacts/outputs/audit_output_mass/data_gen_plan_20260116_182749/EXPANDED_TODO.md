# Koda Data Generation Track - EXPANDED TODO

Generated: 2026-01-16T18:27:49

## Overview

This document tracks the complete data generation effort to achieve EN/PT parity
and ensure Koda can route and answer all 500 reference queries (250 EN + 250 PT).

---

## Phase A: Critical Routing (Priority: CRITICAL)

### A.1 Analytics/Metrics Intent [GAP-1]
- [ ] Generate `analytics_metrics.en.json` (120 patterns)
- [ ] Generate `analytics_metrics.pt.json` (120 patterns)
- [ ] Add intent to `routingPriority.service.ts`
- [ ] Add detection patterns to orchestrator
- [ ] Verify routing for Q29, Q48, Q60, Q62, Q143, Q149, Q186, Q199, Q210, Q247

### A.2 Negative Blockers [GAP-7]
- [ ] Generate `block_file_list_when_content.en.json` (180 patterns)
- [ ] Generate `block_file_list_when_content.pt.json` (180 patterns)
- [ ] Generate `block_help_when_content.en.json` (160 patterns)
- [ ] Generate `block_help_when_content.pt.json` (160 patterns)
- [ ] Generate `block_finance_when_no_terms.en.json` (120 patterns)
- [ ] Generate `block_finance_when_no_terms.pt.json` (120 patterns)
- [ ] Generate `block_doc_count_when_stats.en.json` (80 patterns)
- [ ] Generate `block_doc_count_when_stats.pt.json` (80 patterns)
- [ ] Generate `block_analytics_when_content.en.json` (80 patterns)
- [ ] Generate `block_analytics_when_content.pt.json` (80 patterns)
- [ ] Generate `block_exact_filename_fuzzy.en.json` (60 patterns)
- [ ] Generate `block_exact_filename_fuzzy.pt.json` (60 patterns)
- [ ] Generate `block_generic_empty_sources.en.json` (80 patterns)
- [ ] Generate `block_generic_empty_sources.pt.json` (80 patterns)
- [ ] Integrate negatives into routing priority scoring

### A.3 Folder Operations [GAP-2]
- [ ] Generate `file_folder_ops.en.json` (120 patterns)
- [ ] Generate `file_folder_ops.pt.json` (120 patterns)
- [ ] Distinguish from `file_open_preview` patterns
- [ ] Verify routing for Q16, Q27, Q95, Q106, Q119, Q126, Q173, Q181, Q203, Q219, Q223, Q231, Q243, Q245

---

## Phase B: Normalizers (Priority: HIGH)

### B.1 Time Windows [GAP-3]
- [ ] Generate `time_windows.json` with EN/PT variants (240 entries)
- [ ] Implement `parseTimeWindow()` in orchestrator
- [ ] Support: "last 24 hours", "this week", "last sprint", "this quarter"
- [ ] Verify Q48, Q143, Q149, Q193

### B.2 Status/Tags [GAP-4]
- [ ] Generate `doc_status.json` (120 entries)
- [ ] Generate `doc_tags.json` (120 entries)
- [ ] Add `tags` field to Document model (if not exists)
- [ ] Implement status filter in file search
- [ ] Verify Q30, Q86, Q174, Q206, Q242

### B.3 Typo/Diacritics [GAP-5]
- [ ] Generate `typos.json` (200 entries)
- [ ] Generate `diacritics.json` (120 entries)
- [ ] Implement typo correction in query preprocessing
- [ ] Verify Q150 ("insperability" typo)

---

## Phase C: Quality Enhancement (Priority: MEDIUM)

### C.1 Formatting Validators [GAP-8]
- [ ] Generate `exact_count.en.json` (140 patterns)
- [ ] Generate `exact_count.pt.json` (140 patterns)
- [ ] Generate `bullets.en.json` (100 patterns)
- [ ] Generate `bullets.pt.json` (100 patterns)
- [ ] Generate `numbered_steps.en.json` (90 patterns)
- [ ] Generate `numbered_steps.pt.json` (90 patterns)
- [ ] Generate `table.en.json` (120 patterns)
- [ ] Generate `table.pt.json` (120 patterns)
- [ ] Implement format enforcement in answer engine
- [ ] Add output validators (count check, table check, etc.)

### C.2 Domain Lexicons [GAP-9]
- [ ] Generate `agile_project_mgmt.json` (350 terms)
- [ ] Generate `marketing_service_quality.json` (450 terms)
- [ ] Generate `finance_accounting.json` (550 terms)
- [ ] Generate `compliance_security.json` (450 terms)
- [ ] Generate `analytics_telemetry.json` (300 terms)
- [ ] Generate `navigation_ui.json` (250 terms)
- [ ] Integrate lexicons into retrieval boost

### C.3 Compare Patterns [GAP-10]
- [ ] Generate `compare.en.json` (160 patterns)
- [ ] Generate `compare.pt.json` (160 patterns)
- [ ] Ensure table output enforcement for compare queries
- [ ] Verify Q5, Q13, Q46, Q114, Q148, Q167, Q172, Q202, Q209

### C.4 Anchor Patterns [GAP-6]
- [ ] Generate `doc_anchors.en.json` (80 patterns)
- [ ] Generate `doc_anchors.pt.json` (80 patterns)
- [ ] Support slide/page/sheet/column references
- [ ] Verify Q38, Q55, Q69, Q75, Q80, Q97

---

## Phase D: Infrastructure (Parallel Track)

### D.1 Document Model Extensions
- [ ] Add `tags: string[]` field to Document
- [ ] Add `lastEditedAt: Date` field
- [ ] Create migration for new fields
- [ ] Update document service to populate fields

### D.2 Edit History Tracking [GAP-11]
- [ ] Create `DocumentEditLog` table
- [ ] Track edit events (content, metadata, move, rename)
- [ ] Implement "edited in last 24 hours" query
- [ ] Verify Q149, Q193

### D.3 Query Metrics Logging
- [ ] Add `QueryMetrics` logging (tokens, model, feature)
- [ ] Implement "tokens per model" query
- [ ] Implement "most used documents" query
- [ ] Verify Q60, Q186, Q199, Q210, Q247

---

## Runtime Integration

### Registry Updates
- [ ] Create `dataBankRegistry.ts` or update existing
- [ ] Load all banks from `src/data_banks/`
- [ ] Expose getters for each bank type
- [ ] Add hot-reload support for development

### Service Integration
- [ ] Update `routingPriority.service.ts` to use trigger banks
- [ ] Update `routingPriority.service.ts` to use negative banks
- [ ] Update `kodaFormattingPipelineV3.service.ts` to use format constraints
- [ ] Update `fileSearch.service.ts` to use normalizers
- [ ] Update retrieval to use domain lexicons

---

## Parity Verification

### Static Checks
- [ ] Run `parity_lint.ts` after each generation batch
- [ ] Ensure all EN counts == PT counts
- [ ] Ensure PT alias coverage >= 85% for lexicons
- [ ] Fix any parity failures before proceeding

### Coverage Checks
- [ ] Map each of 500 queries to its required banks
- [ ] Verify all required banks are generated
- [ ] Verify all required infrastructure is in place

---

## Acceptance Criteria (Static Only - No Tests)

1. **Bank Completeness**: All target counts met for EN and PT
2. **Parity Score**: >= 95% parity across all banks
3. **File Structure**: All banks in `src/data_banks/` with correct naming
4. **Registry Integration**: All banks loadable via registry
5. **Documentation**: QUERY_TAXONOMY.md, GAPS.md, PARITY_REPORT.md complete

---

## Generation Commands

```bash
# Generate all banks
ANTHROPIC_API_KEY=sk-... npx ts-node tools/data_bank_generator_v2/generate.ts --all

# Generate specific bank types
ANTHROPIC_API_KEY=sk-... npx ts-node tools/data_bank_generator_v2/generate.ts --triggers
ANTHROPIC_API_KEY=sk-... npx ts-node tools/data_bank_generator_v2/generate.ts --negatives
ANTHROPIC_API_KEY=sk-... npx ts-node tools/data_bank_generator_v2/generate.ts --formatting
ANTHROPIC_API_KEY=sk-... npx ts-node tools/data_bank_generator_v2/generate.ts --normalizers
ANTHROPIC_API_KEY=sk-... npx ts-node tools/data_bank_generator_v2/generate.ts --lexicons

# Run parity check
npx ts-node tools/data_bank_generator_v2/parity_lint.ts --report

# Dry run (show what would be generated)
npx ts-node tools/data_bank_generator_v2/generate.ts --dry-run
```

---

## File Inventory

### Generated Banks (Target Counts)

| Directory | Files | Total Patterns |
|-----------|-------|----------------|
| `triggers/` | 26 (13 intents × 2 langs) | 3,560 |
| `negatives/` | 14 (7 categories × 2 langs) | 1,520 |
| `formatting/` | 16 (8 types × 2 langs) | 1,460 |
| `normalizers/` | 9 (shared) | 1,940 |
| `lexicons/` | 6 (shared with EN/PT) | 2,350 |
| **Total** | **71 files** | **10,830 patterns** |

### Report Files

- `QUERY_TAXONOMY.md` - 500 query classification
- `GAPS.md` - 12 identified gaps
- `generation_plan.json` - Target counts and config
- `PARITY_REPORT.md` - EN/PT parity verification
- `EXPANDED_TODO.md` - This file

---

## Status Legend

- [ ] Not started
- [~] In progress
- [x] Complete
- [!] Blocked

Last updated: 2026-01-16T18:27:49
