# Wiring Proof Report

**Generated:** 2026-01-18 16:45:00
**Auditor:** Claude Phase 1

---

## Executive Summary

| Component | Status | Issue |
|-----------|--------|-------|
| banks.manifest.json | EXISTS | **NOT WIRED** - No service reads it |
| BankLoaderService | EXISTS | Scans directories, ignores manifest |
| DataBankLoaderService | EXISTS | Used for content-location only |
| BrainDataLoaderService | EXISTS | **LEGACY** - Reads from /data/ folder |
| pattern_bank.runtime.json | EXISTS | **LEGACY** - 30,783 lines, NOT used |

**VERDICT:** The manifest is a well-designed specification that **no loader actually uses**. All loaders scan directories independently.

---

## Loader Services Analysis

### 1. BrainDataLoaderService (LEGACY)

**File:** `src/services/core/brainDataLoader.service.ts`
**Status:** LEGACY - Should be deprecated

**What it loads:**
- `intent_patterns.json` (from `/data/`, NOT `/data_banks/`)
- `doc_query_synonyms.json`
- `fallbacks.json`
- `validation_policies.json`
- `answer_styles.json`
- Domain vocabulary from `FINANCE.json`, `LEGAL.json`, etc.

**Problem:**
- Reads from **wrong directory** (`src/data/` instead of `src/data_banks/`)
- Does NOT use the manifest
- Loads legacy monolithic files instead of structured banks

### 2. BankLoaderService (PARTIAL)

**File:** `src/services/core/bankLoader.service.ts`
**Status:** Functional but manifest-unaware

**What it loads:**
```
Categories: triggers, negatives, overlays, formatting, normalizers, lexicons, templates, aliases
```

**How it loads:**
```typescript
// Line 137: Scans directory, loads all .json files
const files = fs.readdirSync(categoryDir).filter(f => f.endsWith('.json'));
```

**Problem:**
- Does NOT read `banks.manifest.json`
- Cannot validate bank completeness against targets
- Cannot enforce gates (parity, dedupe, collision)

### 3. DataBankLoaderService (SPECIALIZED)

**File:** `src/services/core/dataBankLoader.service.ts`
**Status:** Functional for content-location routing

**Used by:**
- `routingPriority.service.ts` (line 1: `import { dataBankLoader }`)

**What it loads:**
- `content_location.{en|pt|es}.json`
- `not_file_actions_content_location.{en|pt|es}.json`
- `keep_file_actions_storage.{en|pt|es}.json`

**Problem:**
- Only loads 3 specific bank families
- Does NOT use the manifest

---

## Legacy Files to Remove/Deprecate

### 1. pattern_bank.runtime.json

**File:** `src/data_banks/pattern_bank.runtime.json`
**Size:** 943KB (30,783 lines)
**Stats from file:**
```json
{
  "totalPatterns": 3807,
  "triggerPatterns": 3148,
  "signalPatterns": 510,
  "negativePatterns": 149,
  "intents": 29,
  "signals": 5,
  "blockers": 7
}
```

**Problem:**
- This is a **built artifact** from `build_pattern_bank.ts`
- Contains OLD pattern format (different from structured banks)
- No loader references this file
- Should be removed after confirming no runtime usage

### 2. signals/ Directory

**Path:** `src/data_banks/signals/` (7 files)
**Status:** UNCLEAR - Check if loaded

Files:
- followup_memory_expanded.json
- formatting_overlay_expanded.json
- (other signal files)

**Problem:**
- Not listed in manifest
- May be legacy artifacts

### 3. rules/ Directory

**Path:** `src/data_banks/rules/` (5 files)
**Status:** PARTIAL

Files:
- formatting_triggers.json
- tone_banned_phrases.json
- typo_normalization.json

**Problem:**
- Overlaps with `formatting/` and `normalizers/` categories
- Should consolidate

---

## Manifest Analysis

**File:** `src/data_banks/manifests/banks.manifest.json`
**Status:** Well-structured but UNWIRED

### Manifest Coverage

| Category | Manifest Lists | Loader Reads |
|----------|---------------|--------------|
| triggers | 13 banks | ✅ All via directory scan |
| negatives | 9 banks | ✅ All via directory scan |
| overlays | 6 banks | ✅ All via directory scan |
| formatting | 4 banks | ✅ All via directory scan |
| normalizers | 13 banks | ✅ All via directory scan |
| lexicons | 9 banks | ⚠️ Partial (74% wired per WIRING_REPORT) |
| templates | 4 banks | ✅ All via directory scan |

### Manifest Gates (NOT ENFORCED)

```json
"gates": {
  "parity": { "enabled": true, "tolerance": 0.05 },
  "dedupe": { "enabled": true, "scope": "per_bank" },
  "collision_scan": { "enabled": true, "max_overlap": 0.15 }
}
```

**Problem:** These gates are **never checked** because no service reads the manifest.

---

## Service Usage Map

| Service | Uses BrainDataLoader | Uses BankLoader | Uses DataBankLoader |
|---------|---------------------|-----------------|---------------------|
| KodaIntentEngineV3 | NO | NO | NO |
| KodaOrchestratorV3 | NO | NO | NO |
| RoutingPriorityService | NO | NO | YES |
| KodaFormattingPipelineV3 | NO | NO | NO |
| KodaAnswerEngineV3 | NO | NO | NO |
| KodaRetrievalEngineV3 | NO | NO | NO |

**CRITICAL:** The main services (IntentEngine, Orchestrator, Formatting) do NOT use the BankLoader at all!

---

## Recommendations

### IMMEDIATE (PHASE 1 Fix)

1. **Wire BankLoaderService into main services:**
   - KodaIntentEngineV3 should use `getBankLoader().getTriggers()`
   - KodaOrchestratorV3 should use bank-loaded patterns
   - KodaFormattingPipelineV3 should use bank-loaded formatting rules

2. **Update BankLoader to read manifest:**
   ```typescript
   // Load manifest first
   const manifest = require('../data_banks/manifests/banks.manifest.json');
   // Use it to validate loaded banks against targets
   ```

3. **Remove legacy files:**
   - `pattern_bank.runtime.json` (943KB)
   - `build_pattern_bank.ts`
   - `signals/` directory (if unused)

4. **Deprecate BrainDataLoaderService:**
   - Move any still-needed files from `/data/` to `/data_banks/`
   - Remove exports from `index.ts`

### DEFERRED (After bank regeneration)

5. **Implement gate enforcement:**
   - Add startup validation for parity
   - Add startup validation for dedupe
   - Add startup validation for collision

---

## Load Proof (Current State)

### What SHOULD Be Loaded (per manifest)

| Category | Target Files | Target Patterns |
|----------|-------------|-----------------|
| triggers | 39 (13 banks × 3 langs) | ~10,650/lang |
| negatives | 27 (9 banks × 3 langs) | ~2,600 |
| overlays | 18 (6 banks × 3 langs) | ~3,020 |
| formatting | 12 (4 banks × 3 langs) | ~1,200 |
| normalizers | 13 (shared) | ~4,850 |
| lexicons | 27 (9 banks × 3 langs) | ~18,100/lang |
| templates | 12 (4 banks × 3 langs) | ~1,180/lang |

### What IS Loaded (actual directory scan)

```
$ ls data_banks/
triggers/     229 files
negatives/     70 files
overlays/      37 files
formatting/    25 files
normalizers/   23 files
lexicons/      40 files
templates/     34 files
```

**Gap:** More files exist than manifest defines because:
- Format-specific banks (pdf_*, pptx_*, docx_*, excel_*)
- Expanded variants (followup_inherit_continuation, etc.)
- Navigation banks (not in manifest)

---

## Conclusion

**PHASE 1 BLOCKERS:**

1. ❌ Manifest is NOT wired - loaders ignore it
2. ❌ BrainDataLoaderService reads from wrong directory
3. ❌ pattern_bank.runtime.json is legacy cruft (943KB)
4. ❌ No startup bank count validation
5. ❌ Gates (parity, dedupe, collision) never enforced

**NEXT STEPS:**

1. Wire BankLoader to read manifest
2. Add startup bank load logging with sha256
3. Deprecate BrainDataLoader
4. Remove pattern_bank.runtime.json
5. Then proceed to PHASE 2 (Answer Composer audit)
