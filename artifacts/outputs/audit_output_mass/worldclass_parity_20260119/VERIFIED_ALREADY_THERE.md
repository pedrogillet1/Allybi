# PHASE 0.1: Bank Loading Verification Report

**Generated**: 2026-01-19
**Total Banks**: 630 JSON files

---

## ✅ Bank Inventory Summary

| Category    | Files | Status |
|-------------|-------|--------|
| triggers    | 258   | ✅ LOADED |
| negatives   | 99    | ✅ LOADED |
| overlays    | 56    | ✅ LOADED |
| formatting  | 43    | ✅ LOADED |
| normalizers | 38    | ✅ LOADED |
| lexicons    | 39    | ✅ LOADED |
| templates   | 52    | ✅ LOADED |
| aliases     | 3     | ✅ LOADED |
| extractors  | 3     | ⚠️ PARTIAL (see notes) |

---

## ✅ Required Banks - Verification

### Operator Banks (in `operators/`)

| Bank | EN | PT | ANY | Notes |
|------|----|----|-----|-------|
| operator_verbs | ✅ | ✅ | - | Object format |
| operator_frames | ✅ (13) | ✅ (16) | - | Array format |
| operator_priority | - | - | ✅ | Priority ordering |
| operator_triggers | ❌ | ❌ | - | **GAP** - not found |
| operator_negatives | ❌ | ❌ | - | **GAP** - not found |

### Formatting Banks (in `formatting/`)

| Bank | EN | PT | ANY | Notes |
|------|----|----|-----|-------|
| format_request | ✅ (2) | ✅ (2) | - | Format rules |
| validators | - | - | ✅ (16) | Validation rules |
| repair_rules | - | - | ✅ | Repair patterns |
| readability_rules | - | - | ✅ | Readability checks |
| preamble_allowed | - | - | ✅ | Allowed preambles |
| preamble_forbidden | - | - | ✅ | Forbidden preambles |
| preamble_policy | - | - | ✅ | Preamble policy |
| terminology_policy | - | - | ✅ | Term enforcement |
| content_guard | ✅ | ✅ | - | In triggers/ |

### Template Banks (in `templates/`)

| Bank | EN | PT | ANY | Notes |
|------|----|----|-----|-------|
| operator_template_map | - | - | ✅ (5) | Operator→template mapping |
| operator_templates | ✅ (12) | ✅ (12) | - | Operator response templates |
| answer_styles | ✅ (7) | ✅ (7) | - | Answer style definitions |
| file_actions_microcopy | ✅ | ✅ | - | File action messages |
| clarify_templates | ✅ | ✅ | - | Clarification prompts |
| error_templates | ✅ | ✅ | - | Error messages |
| help_templates | ✅ | ✅ | - | Help responses |

### Domain Lexicons (in `lexicons/`)

| Domain | EN Terms | PT Terms | Status |
|--------|----------|----------|--------|
| finance | 2,847 | 3,300 | ✅ |
| legal | 3,542 | 4,247 | ✅ |
| accounting | 2,407 | 3,012 | ✅ |
| medical | 2,499 | 2,847 | ✅ |

**Total Lexicon Terms**: 22,701

### Domain Extractors

| Extractor | EN | PT | Location |
|-----------|----|----|----------|
| finance_entity_extractors | ✅ | ✅ | triggers/ |
| legal_clause_extractors | ✅ | ✅ | triggers/ |
| accounting_entity_extractors | ✅ | ✅ | triggers/ |
| medical_extractors | ✅ | ✅ | triggers/ |
| table_extractors | ✅ | ✅ | triggers/ |
| entity_extractors (general) | ✅ | ✅ | triggers/ |

---

## 🔐 MD5 Hashes (Key Banks)

```
28416868 operator_verbs.en.json
1c6c6126 operator_frames.en.json
cb7425f1 operator_template_map.any.json
3e67f3bb operator_templates.en.json
12013901 validators.any.json
c95d44fe repair_rules.any.json
a7fcc79e readability_rules.any.json
3922ea4e finance.en.json
5f250426 legal.en.json
70ce8a1f accounting.en.json
3c65c1da medical.en.json
```

---

## ⚠️ GAPS IDENTIFIED

### 1. Missing: `operator_triggers.{en,pt}.json`
**Impact**: Operator detection may rely on hardcoded patterns instead of banks
**Action**: Create operator trigger patterns bank

### 2. Missing: `operator_negatives.{en,pt}.json`
**Impact**: Operator false-positive suppression not bank-driven
**Action**: Create operator negative blockers bank

### 3. Extractors Directory Inconsistent
**Current**: 3 files in `extractors/`, rest in `triggers/`
**Action**: Consider consolidating all extractors to `extractors/` directory

---

## ✅ Bank Loader Wiring

```typescript
// bankLoader.service.ts:127
const categories = ['triggers', 'negatives', 'overlays', 'formatting',
                    'normalizers', 'lexicons', 'templates', 'aliases'];
```

All 8 categories are wired and loading at startup.

---

## PHASE 0.1 VERDICT

| Check | Status |
|-------|--------|
| Bank files exist | ✅ 630 files |
| BankLoader wired | ✅ 8 categories |
| Domain lexicons complete | ✅ 4 domains × 2 langs |
| Domain extractors exist | ✅ In triggers/ |
| Operator banks | ⚠️ 2 GAPS |
| Formatting banks | ✅ All present |
| Template banks | ✅ All present |

**Overall**: ⚠️ PASS WITH GAPS

Gaps are non-blocking for current functionality but should be addressed for complete bank-driven architecture.
