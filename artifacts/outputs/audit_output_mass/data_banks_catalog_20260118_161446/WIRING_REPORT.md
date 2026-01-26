# Data Banks - Runtime Wiring Report

**Generated:** 2026-01-18 16:14:46

---

## Overview

This report analyzes which data banks are loaded into runtime and how they're used by the Koda system.

---

## Loading Mechanism

Data banks are loaded by `BrainDataLoaderService` (src/services/brainDataLoader.service.ts) which:
1. Reads the manifest (`banks.manifest.json`)
2. Loads banks based on detected language (EN/PT/ES)
3. Falls back to shared banks when language-specific not available
4. Compiles regex patterns on load

---

## Wired Categories

### 1. TRIGGERS (32,076 patterns) - FULLY WIRED

**Used by:** `KodaIntentEngineV3Service`

| Bank Type | Purpose | Runtime Role |
|-----------|---------|--------------|
| primary_intents | Top-level intent detection | Classifies query into family |
| documents_subintents | Document operation detection | Determines doc action type |
| file_actions_subintents | File management detection | Routes file operations |
| excel_subintents | Spreadsheet operations | Routes Excel queries |
| finance_subintents | Finance term detection | Boosts finance intent |
| legal_subintents | Legal term detection | Boosts legal intent |
| medical_subintents | Medical term detection | Boosts medical intent |
| accounting_subintents | Accounting detection | Boosts accounting intent |
| navigation_operators | Navigation command detection | Routes navigation queries |
| content_location | In-doc location queries | Routes to location handler |
| *_content_location | Format-specific location | Routes by file type |
| *_extraction | Format-specific extraction | Routes extraction queries |

### 2. NEGATIVES (5,162 patterns) - FULLY WIRED

**Used by:** `KodaIntentEngineV3Service.applyNegatives()`

| Bank Type | Purpose | Dampens |
|-----------|---------|---------|
| not_file_actions | Block content verbs | file_actions |
| not_help | Block doc-oriented | help |
| not_conversation | Block doc references | conversation |
| not_reasoning | Block factual lookups | reasoning |
| not_excel_finance | Block missing operators | excel, finance |
| not_navigation_content | Block content queries | navigation |
| block_* | Conditional blockers | Various |
| force_clarify | Force clarification | - |
| force_disambiguate | Force disambiguation | - |

### 3. OVERLAYS (2,173 patterns) - FULLY WIRED

**Used by:** `KodaIntentEngineV3Service.detectOverlays()`

| Bank Type | Purpose | Effect |
|-----------|---------|--------|
| followup_inherit | Pronoun detection | Inherits previous context |
| followup_file_actions | File follow-ups | Links to previous file |
| format_request | Format detection | Extracts constraints |
| clarify_required | Ambiguity detection | Triggers clarification |
| navigation_followups | Nav follow-ups | Suggests next actions |
| drift_detectors | Hallucination check | Quality gate |
| scope_rules | Single/multi doc | Determines retrieval scope |

### 4. FORMATTING (1,687 rules) - PARTIALLY WIRED

**Used by:** `KodaFormattingPipelineV3Service`

| Bank Type | Wired | Purpose |
|-----------|-------|---------|
| constraints.json | YES | Format constraint patterns |
| validators.json | YES | Output validation rules |
| repair_rules.json | YES | Near-miss fixing |
| readability_rules.json | YES | Wall-of-text avoidance |
| bullets.*.json | YES | Bullet format rules |
| table.*.json | YES | Table format rules |
| exact_count.*.json | YES | Count enforcement |
| *_limit.*.json | YES | Limit enforcement |
| excel_validators.json | YES | Excel-specific validation |

### 5. NORMALIZERS (1,511 rules) - FULLY WIRED

**Used by:** `QueryNormalizerService`

| Bank Type | Wired | Purpose |
|-----------|-------|---------|
| language_indicators.json | YES | Language detection |
| filename.json | YES | Filename normalization |
| filetypes.json | YES | Filetype mapping |
| months.json | YES | Month name normalization |
| quarters.json | YES | Quarter normalization |
| time_windows.json | YES | Time expression parsing |
| numbers_currency.json | YES | Number/currency parsing |
| typos.json | YES | Typo correction |
| diacritics*.json | YES | Accent normalization |
| abbreviations*.json | YES | Abbreviation expansion |
| folder_path.json | YES | Path expression parsing |
| periods.*.json | YES | Time period parsing |

### 6. LEXICONS (4,729 terms) - PARTIALLY WIRED

**Used by:** `DomainDetectorService`, `KodaRetrievalEngineV3Service`

| Bank Type | Wired | Purpose |
|-----------|-------|---------|
| finance.*.json | YES | Finance term matching |
| accounting.*.json | YES | Accounting terms |
| legal.*.json | YES | Legal terms |
| medical.*.json | YES | Medical terms |
| excel.*.json | YES | Excel terms |
| navigation.*.json | YES | Navigation vocabulary |
| finance_accounting.json | PARTIAL | Extended finance lexicon |
| agile_project_mgmt.json | NO | Not yet wired |
| analytics_telemetry*.json | NO | Not yet wired |
| compliance_security*.json | NO | Not yet wired |
| computation_lexicon.json | NO | Not yet wired |
| marketing_service_quality.json | NO | Not yet wired |
| navigation_lexicon.json | PARTIAL | Supplementary nav terms |
| navigation_ui*.json | NO | Not yet wired |

### 7. TEMPLATES (767 templates) - FULLY WIRED

**Used by:** `KodaAnswerEngineV3Service`

| Bank Type | Wired | Purpose |
|-----------|-------|---------|
| answer_styles.*.json | YES | Answer format templates |
| clarify_templates.*.json | YES | Clarification messages |
| error_templates.*.json | YES | Error messages |
| file_actions_microcopy.*.json | YES | File action responses |
| navigation_answers.*.json | YES | Navigation responses |
| pdf_answers.*.json | YES | PDF-specific templates |
| pptx_answers.*.json | YES | PPTX-specific templates |
| docx_answers.*.json | YES | DOCX-specific templates |
| excel_answers.*.json | YES | Excel-specific templates |
| shared_answers.*.json | YES | Cross-format templates |
| followup_policy.json | YES | Follow-up suggestion rules |

---

## Potentially Unused Banks

### 1. ROOT (3,388 patterns) - LEGACY

| Bank | Status | Notes |
|------|--------|-------|
| pattern_bank.runtime.json | **REVIEW** | Legacy monolithic bank - may overlap with structured banks |

**Recommendation:** Audit for duplicates with triggers/ banks. May be safe to deprecate.

### 2. SIGNALS (510 patterns) - UNCLEAR

| Bank | Status | Notes |
|------|--------|-------|
| followup_memory_expanded.json | UNCLEAR | May be superseded by overlays |
| formatting_overlay_expanded.json | UNCLEAR | May be superseded by formatting |
| *(3 other signal files)* | UNCLEAR | Purpose needs verification |

**Recommendation:** Check if loaded by any service. May be safe to deprecate.

### 3. RULES (384 rules) - PARTIALLY WIRED

| Bank | Status | Notes |
|------|--------|-------|
| formatting_triggers.json | PARTIAL | May overlap with formatting/ |
| tone_banned_phrases.json | YES | Used by output sanitizer |
| typo_normalization.json | PARTIAL | May overlap with normalizers/ |

### 4. ALIASES (179 entries) - PARTIALLY WIRED

| Bank | Status | Notes |
|------|--------|-------|
| document_type_aliases.json | YES | Used by file type resolution |
| finance_aliases.json | PARTIAL | May be redundant with lexicons |
| time_period_aliases.json | YES | Used by time normalization |

---

## Wiring Summary

| Category | Total Patterns | Wired | % Wired |
|----------|----------------|-------|---------|
| triggers | 32,076 | 32,076 | 100% |
| negatives | 5,162 | 5,162 | 100% |
| overlays | 2,173 | 2,173 | 100% |
| formatting | 1,687 | 1,687 | 100% |
| normalizers | 1,511 | 1,511 | 100% |
| templates | 767 | 767 | 100% |
| lexicons | 4,729 | ~3,500 | 74% |
| aliases | 179 | ~155 | 87% |
| rules | 384 | ~286 | 74% |
| signals | 510 | ~0 | 0% |
| root | 3,388 | UNKNOWN | ? |
| **TOTAL** | **52,817** | **~48,000** | **91%** |

---

## Services that Load Banks

| Service | Banks Loaded |
|---------|--------------|
| BrainDataLoaderService | All (orchestrates loading) |
| KodaIntentEngineV3Service | triggers, negatives, overlays |
| KodaOrchestratorV3Service | Indirect via IntentEngine |
| KodaFormattingPipelineV3Service | formatting |
| KodaAnswerEngineV3Service | templates |
| KodaRetrievalEngineV3Service | lexicons (partial) |
| QueryNormalizerService | normalizers |
| DomainDetectorService | lexicons |

---

## Loading Sequence

1. **Startup:** BrainDataLoaderService reads manifest
2. **Per-request:** Detect language from query
3. **Load:** Language-specific banks loaded (e.g., triggers/primary_intents.en.json)
4. **Fallback:** If language-specific missing, load shared bank
5. **Compile:** Regex patterns compiled and cached
6. **Execute:** Services use loaded patterns for matching

---

## Recommendations

1. **Audit root/pattern_bank.runtime.json** - Compare with triggers/ for duplicates
2. **Review signals/** - Determine if these are actively used or deprecated
3. **Wire remaining lexicons** - agile_project_mgmt, analytics_telemetry, etc.
4. **Consolidate rules/** - May overlap with formatting/ and normalizers/
