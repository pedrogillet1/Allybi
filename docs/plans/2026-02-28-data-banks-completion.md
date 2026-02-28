# Data Banks Completion Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire every operator in the catalog to be reachable end-to-end: intent patterns → classification → planning → execution.

**Architecture:** The editing pipeline has two operator namespaces: `XLSX_*` (canonical names used in classification/planning) and `PY_*` (catalog names used for slot metadata/UI). Both ultimately route to the `COMPUTE_BUNDLE` runtime operator. The `XLSX_COMPUTE_OPERATORS` set in `editing.constants.ts` is the authoritative list for classification routing, while the operator catalog provides metadata (slots, UI templates, conflicts). This plan bridges the gap so both systems agree.

**Key constraint:** The domain type is strictly `"excel" | "docx"` throughout the intent runtime. Python compute patterns must be merged into the excel loading path, not treated as a new domain.

**Tech Stack:** TypeScript, JSON data banks, vitest

---

## Current State (Ground Truth)

| Item | Status |
|------|--------|
| `editing.constants.ts` | EXISTS but DEAD CODE — zero imports anywhere |
| `python_calc.en.any.json` | DOES NOT EXIST |
| `python_calc.pt.any.json` | DOES NOT EXIST |
| `loaders.ts` PATTERN_BANK_IDS | `Record<string, string>` — single bank per key |
| `loadBanks.ts` python_calc fields | MISSING |
| `bank_registry.any.json` python_calc | NOT REGISTERED |
| 27 XLSX_COMPUTE_OPERATORS in catalog | MISSING — zero entries |
| `intentClassifier.ts` compute branch | MISSING — falls to XLSX_SET_VALUE |
| `operatorPlanner.ts` xlsx_compute class | MISSING — not in type union |
| `editOperatorAliases.service.ts` PY_ | MISSING — no PY_ handling |
| `planAssembler.ts` compute OP_ORDER | MISSING — all 27 absent |
| EN/PT parity | 1 gap: `docx.rewrite.informal` only in PT |
| DOCX table intent patterns | MISSING — 4 ops unreachable |
| XLSX eval test cases | ZERO |
| Priority collisions | 92 unresolved across 4 banks |
| 9 operators missing from OP_ORDER | XLSX_FILL_SERIES, etc. |

---

## Task 1: Wire `editing.constants.ts` Into the Pipeline

**Files:**
- Modify: `backend/src/services/editing/allybi/intentClassifier.ts:67` (before format branch)
- Modify: `backend/src/services/editing/allybi/operatorPlanner.ts:31-47` (type union) and `:135-225` (operatorClassFromCanonical)
- Modify: `backend/src/services/editing/editOperatorAliases.service.ts` (PY_ handling)

### Step 1: Add compute branch to intentClassifier

In `intentClassifier.ts`, import XLSX_COMPUTE_OPERATORS and add a branch BEFORE the format check (line 67):

```typescript
import { XLSX_COMPUTE_OPERATORS } from "../editing.constants";

// Insert before line 67 (the format check):
if (upperOps.some((op) => XLSX_COMPUTE_OPERATORS.has(op))) {
  return { intentId: "XLSX_COMPUTE" };
}
```

### Step 2: Add `xlsx_compute` to AllybiOperatorClass

In `operatorPlanner.ts` line 31-47, add `"xlsx_compute"` to the type union:

```typescript
export type AllybiOperatorClass =
  | "targeting"
  | "rewrite"
  // ... existing members ...
  | "xlsx_chart"
  | "xlsx_compute"  // ADD THIS
  | "unknown";
```

### Step 3: Add compute routing to operatorClassFromIntent

In `operatorPlanner.ts` line 114-129 (sheets branch of `operatorClassFromIntent`), add BEFORE the `FORMULA` check:

```typescript
if (key === "XLSX_COMPUTE") return "xlsx_compute";
```

This must come before `key.includes("COMPUTE")` on line 116 which currently routes to `xlsx_formula`.

### Step 4: Add SSOT compute routing to operatorClassFromCanonical

In `operatorPlanner.ts` line 194-221, add a XLSX_COMPUTE_OPERATORS set check BEFORE the FORMULA/COMPUTE includes check:

```typescript
import { XLSX_COMPUTE_OPERATORS } from "../editing.constants";

// Insert at line 195, BEFORE the existing checks:
if (XLSX_COMPUTE_OPERATORS.has(op)) return "xlsx_compute";
```

### Step 5: Add PY_ alias routing

In `editOperatorAliases.service.ts`, in `runtimeFromAllybiCanonical()`, add PY_ handling before the XLSX_ catch-all:

```typescript
if (op.startsWith("PY_CHART_")) return "CREATE_CHART";
if (op.startsWith("PY_")) return "COMPUTE_BUNDLE";
```

Also update `isAllybiCanonicalOperator()` to recognize PY_ prefix:

```typescript
if (op.startsWith("DOCX_") || op.startsWith("XLSX_") || op.startsWith("PY_")) return true;
```

### Step 6: Add xlsx_compute to blocksRewriteByClass

In `operatorPlanner.ts` line 227-239, add `"xlsx_compute"` since compute ops should not block rewrites:

Do NOT add it. Compute ops do not block rewrites. Leave `blocksRewriteByClass` unchanged.

### Step 7: Add xlsx_compute fallback operator

In `operatorPlanner.ts`, in `fallbackOperatorByClass()` (line 242+), in the sheets branch add:

```typescript
if (operatorClass === "xlsx_compute") return "XLSX_FORECAST";
```

### Step 8: Verify TypeScript compiles

```bash
cd /Users/pg/Desktop/koda-webapp/backend && npx tsc --noEmit 2>&1 | head -30
```

### Step 9: Commit

```bash
git add src/services/editing/allybi/intentClassifier.ts src/services/editing/allybi/operatorPlanner.ts src/services/editing/editOperatorAliases.service.ts
git commit -m "feat(editing): wire editing.constants.ts into classifier, planner, and alias system"
```

---

## Task 2: Add 27 XLSX_COMPUTE_OPERATORS to Operator Catalog

**Files:**
- Modify: `backend/src/data_banks/parsers/operator_catalog.any.json`

### Step 1: Read existing catalog structure

Read `operator_catalog.any.json` to understand the schema. Each operator entry needs:
```json
{
  "operator": "XLSX_FORECAST",
  "domain": "excel",
  "runtimeOperator": "COMPUTE_BUNDLE",
  "requiredSlots": ["rangeA1"],
  "optionalSlots": ["targetSheet"],
  "uiStepTemplate": {
    "en": "Running forecast on {{rangeA1}}...",
    "pt": "Executando previsão em {{rangeA1}}..."
  },
  "previewable": true,
  "undoable": true,
  "conflictsWith": []
}
```

### Step 2: Add all 27 entries

Add these 27 operators to the catalog with domain `"excel"` and runtimeOperator `"COMPUTE_BUNDLE"`:

| Operator | requiredSlots | uiStepTemplate (EN) |
|----------|--------------|---------------------|
| XLSX_FORECAST | rangeA1 | Forecasting values from {{rangeA1}}... |
| XLSX_CLEAN_DATA | rangeA1 | Cleaning data in {{rangeA1}}... |
| XLSX_DEDUPE | rangeA1 | Removing duplicates in {{rangeA1}}... |
| XLSX_ANOMALY_DETECT | rangeA1 | Detecting anomalies in {{rangeA1}}... |
| XLSX_RECONCILE | rangeA1 | Reconciling sheets... |
| XLSX_REGRESSION | rangeA1 | Running regression analysis on {{rangeA1}}... |
| XLSX_MONTE_CARLO | rangeA1 | Running Monte Carlo simulation... |
| XLSX_GOAL_SEEK | rangeA1 | Running goal seek... |
| XLSX_CLUSTERING | rangeA1 | Clustering data in {{rangeA1}}... |
| XLSX_GENERATE_CHART | rangeA1 | Generating chart from {{rangeA1}}... |
| XLSX_DERIVED_COLUMN | rangeA1 | Creating derived column from {{rangeA1}}... |
| XLSX_NORMALIZE | rangeA1 | Normalizing values in {{rangeA1}}... |
| XLSX_PIVOT | rangeA1 | Creating pivot table from {{rangeA1}}... |
| XLSX_ROLLING_WINDOW | rangeA1 | Applying rolling window to {{rangeA1}}... |
| XLSX_GROUP_BY | rangeA1 | Grouping data in {{rangeA1}}... |
| XLSX_COHORT_ANALYSIS | rangeA1 | Running cohort analysis on {{rangeA1}}... |
| XLSX_HYPOTHESIS_TEST | rangeA1 | Running hypothesis test on {{rangeA1}}... |
| XLSX_CONFIDENCE_INTERVAL | rangeA1 | Computing confidence interval for {{rangeA1}}... |
| XLSX_ANOVA | rangeA1 | Running ANOVA on {{rangeA1}}... |
| XLSX_CORRELATION_MATRIX | rangeA1 | Computing correlation matrix for {{rangeA1}}... |
| XLSX_SEASONALITY | rangeA1 | Analyzing seasonality in {{rangeA1}}... |
| XLSX_EXPLAIN_FORMULA | cellA1 | Explaining formula in {{cellA1}}... |
| XLSX_TRANSLATE_FORMULA | cellA1 | Translating formula in {{cellA1}}... |
| XLSX_SPLIT_COLUMN | rangeA1 | Splitting column {{rangeA1}}... |
| XLSX_DASHBOARD | rangeA1 | Creating dashboard from {{rangeA1}}... |
| XLSX_KPI_CARD | rangeA1 | Creating KPI card from {{rangeA1}}... |
| XLSX_MOVING_AVERAGE | rangeA1 | Computing moving average for {{rangeA1}}... |

All 27 must include bilingual `uiStepTemplate` (en + pt), `previewable: true`, `undoable: true`, `conflictsWith: []`.

### Step 3: Validate bank

```bash
cd /Users/pg/Desktop/koda-webapp/backend && node scripts/editing/validate-editing-banks.mjs
```

### Step 4: Commit

```bash
git add src/data_banks/parsers/operator_catalog.any.json
git commit -m "feat(editing): add 27 XLSX_COMPUTE_OPERATORS to operator catalog"
```

---

## Task 3: Create Python Calc Intent Pattern Banks

**Files:**
- Create: `backend/src/data_banks/intent_patterns/python_calc.en.any.json`
- Create: `backend/src/data_banks/intent_patterns/python_calc.pt.any.json`

### Step 1: Create EN bank

Create `python_calc.en.any.json` with this structure:

```json
{
  "_meta": {
    "id": "intent_patterns_python_calc_en",
    "version": "1.0.0",
    "description": "English intent patterns for Python compute operations (XLSX domain).",
    "domain": "excel",
    "lastUpdated": "2026-02-28",
    "languages": ["en"]
  },
  "config": { "enabled": true },
  "patterns": [ ... ]
}
```

**CRITICAL:** The `domain` MUST be `"excel"` (not `"python"`). Python compute operates on Excel workbooks.

Create patterns for all 27 XLSX_COMPUTE_OPERATORS. Each pattern needs:
- `id`: e.g. `"excel.compute.forecast"`
- `domain`: `"excel"`
- `lang`: `"en"`
- `priority`: 90 (higher than most excel patterns to win compute-related matches)
- `triggers.tokens_any`: action verbs (e.g., `["forecast", "predict", "project", "extrapolate"]`)
- `triggers.tokens_all`: [] (most compute ops don't need mandatory tokens)
- `triggers.tokens_none`: exclusion list to prevent collisions with existing excel patterns
- `triggers.regex_any`: optional regexes for precise matching
- `slotExtractors`: range extraction
- `scopeRules`: `{ "scopeType": "range" }`
- `planTemplate`: `{ "operator": "XLSX_FORECAST", "params": { "rangeA1": "$rangeA1" } }`
- `examples`: at least 4 positive, 2 negative

**Pattern groupings by operator:**

**Data transformation (7):**
- excel.compute.clean_data — "clean", "cleanse", "sanitize", "fix data"
- excel.compute.dedupe — "deduplicate", "dedupe", "remove duplicates", "find duplicates"
- excel.compute.normalize — "normalize", "standardize", "scale values"
- excel.compute.split_column — "split column", "separate column", "parse column"
- excel.compute.derived_column — "derive column", "calculated column", "add computed column"
- excel.compute.group_by — "group by", "aggregate by", "summarize by"
- excel.compute.pivot — "pivot", "pivot table", "cross-tabulate"

**Time-series (4):**
- excel.compute.forecast — "forecast", "predict", "project", "extrapolate"
- excel.compute.rolling_window — "rolling", "window function", "sliding window"
- excel.compute.moving_average — "moving average", "running average", "rolling mean"
- excel.compute.seasonality — "seasonality", "seasonal pattern", "cyclical"

**Statistical (5):**
- excel.compute.correlation — "correlation", "correlate", "relationship between"
- excel.compute.hypothesis_test — "hypothesis test", "t-test", "chi-square", "significance test"
- excel.compute.anova — "anova", "analysis of variance", "compare groups"
- excel.compute.confidence_interval — "confidence interval", "margin of error", "confidence level"
- excel.compute.cohort — "cohort analysis", "cohort", "retention analysis"

**ML & forecasting (5):**
- excel.compute.anomaly — "anomaly", "outlier", "unusual values", "detect anomalies"
- excel.compute.regression — "regression", "linear regression", "trend line", "best fit"
- excel.compute.monte_carlo — "monte carlo", "simulation", "random simulation"
- excel.compute.goal_seek — "goal seek", "what-if", "solve for", "target value"
- excel.compute.clustering — "cluster", "k-means", "segment data", "group similar"

**Reconciliation (1):**
- excel.compute.reconcile — "reconcile", "compare sheets", "match records", "cross-reference"

**Visualization (3):**
- excel.compute.generate_chart — "generate chart", "create chart", "make graph", "visualize"
- excel.compute.dashboard — "dashboard", "create dashboard", "summary view"
- excel.compute.kpi_card — "kpi", "kpi card", "key metric", "scorecard"

**Formula utilities (2):**
- excel.compute.explain_formula — "explain formula", "what does this formula", "break down formula"
- excel.compute.translate_formula — "translate formula", "convert formula", "formula in portuguese"

**Important:** Each pattern's `tokens_none` MUST include tokens from existing excel patterns that could collide. E.g., the forecast pattern should exclude "format", "font", "bold", "sort", "filter", "chart" (unless specifically about chart creation).

### Step 2: Create PT bank

Mirror all 27 patterns with Portuguese triggers:
- `id`: same as EN (e.g., `"excel.compute.forecast"`)
- `lang`: `"pt"`
- `triggers.tokens_any`: Portuguese equivalents (e.g., `["prever", "previsão", "projetar", "extrapolar"]`)

### Step 3: Validate both banks

```bash
cd /Users/pg/Desktop/koda-webapp/backend && node scripts/editing/validate-editing-banks.mjs
```

### Step 4: Commit

```bash
git add src/data_banks/intent_patterns/python_calc.en.any.json src/data_banks/intent_patterns/python_calc.pt.any.json
git commit -m "feat(editing): add 27 EN + 27 PT python compute intent patterns"
```

---

## Task 4: Wire Python Calc Banks Into Loaders

**Files:**
- Modify: `backend/src/services/editing/intentRuntime/loaders.ts:47-71`
- Modify: `backend/src/services/editing/allybi/loadBanks.ts:3-43,49-80`
- Modify: `backend/src/data_banks/manifest/bank_registry.any.json`

### Step 1: Register banks in registry

Add to `bank_registry.any.json`:
```json
{
  "id": "intent_patterns_python_calc_en",
  "path": "intent_patterns/python_calc.en.any.json",
  "requiredByEnv": { "production": true, "staging": true, "dev": true }
},
{
  "id": "intent_patterns_python_calc_pt",
  "path": "intent_patterns/python_calc.pt.any.json",
  "requiredByEnv": { "production": true, "staging": true, "dev": true }
}
```

### Step 2: Convert loaders.ts to multi-bank

Change `PATTERN_BANK_IDS` from `Record<string, string>` to `Record<string, string[]>`:

```typescript
const PATTERN_BANK_IDS: Record<string, string[]> = {
  "excel:en": ["intent_patterns_excel_en", "intent_patterns_python_calc_en"],
  "excel:pt": ["intent_patterns_excel_pt", "intent_patterns_python_calc_pt"],
  "docx:en": ["intent_patterns_docx_en"],
  "docx:pt": ["intent_patterns_docx_pt"],
};
```

Update `loadPatterns()` to iterate the array:

```typescript
export function loadPatterns(
  domain: "excel" | "docx",
  lang: "en" | "pt",
): IntentPattern[] {
  const key: CacheKey = `${domain}:${lang}`;
  if (patternCache.has(key)) return patternCache.get(key)!;

  const bankIds = PATTERN_BANK_IDS[key];
  if (!bankIds || bankIds.length === 0) {
    patternCache.set(key, []);
    return [];
  }

  const merged: IntentPattern[] = [];
  for (const bankId of bankIds) {
    const bank = safeBank<PatternBankFile>(bankId);
    if (bank?.patterns) {
      merged.push(...bank.patterns);
    }
  }
  patternCache.set(key, merged);
  return merged;
}
```

### Step 3: Add python_calc to loadBanks.ts

Add to `AllybiBanks` interface (after line 27):
```typescript
intentPatternsPythonCalcEn: any;
intentPatternsPythonCalcPt: any;
```

Add to `loadAllybiBanks()` return (after line 74):
```typescript
intentPatternsPythonCalcEn: safeBank("intent_patterns_python_calc_en"),
intentPatternsPythonCalcPt: safeBank("intent_patterns_python_calc_pt"),
```

### Step 4: Verify TypeScript compiles

```bash
cd /Users/pg/Desktop/koda-webapp/backend && npx tsc --noEmit 2>&1 | head -30
```

### Step 5: Commit

```bash
git add src/services/editing/intentRuntime/loaders.ts src/services/editing/allybi/loadBanks.ts src/data_banks/manifest/bank_registry.any.json
git commit -m "feat(editing): wire python_calc banks into loader pipeline"
```

---

## Task 5: Add Compute Operators to OP_ORDER

**Files:**
- Modify: `backend/src/services/editing/intentRuntime/planAssembler.ts:69-138`

### Step 1: Add all 27 compute operators + 9 missing standard operators

Insert after line 110 (after `XLSX_DELETE_SHEET: 99`):

```typescript
  // Compute — data transformation (run before analysis)
  XLSX_CLEAN_DATA: 100,
  XLSX_DEDUPE: 101,
  XLSX_NORMALIZE: 102,
  XLSX_SPLIT_COLUMN: 103,
  XLSX_DERIVED_COLUMN: 104,
  XLSX_GROUP_BY: 105,
  XLSX_PIVOT: 106,
  // Compute — time-series
  XLSX_ROLLING_WINDOW: 110,
  XLSX_MOVING_AVERAGE: 111,
  XLSX_SEASONALITY: 112,
  // Compute — statistical analysis
  XLSX_CORRELATION_MATRIX: 115,
  XLSX_HYPOTHESIS_TEST: 116,
  XLSX_ANOVA: 117,
  XLSX_CONFIDENCE_INTERVAL: 118,
  XLSX_COHORT_ANALYSIS: 119,
  // Compute — ML & forecasting
  XLSX_FORECAST: 120,
  XLSX_ANOMALY_DETECT: 121,
  XLSX_REGRESSION: 122,
  XLSX_MONTE_CARLO: 123,
  XLSX_GOAL_SEEK: 124,
  XLSX_CLUSTERING: 125,
  XLSX_RECONCILE: 126,
  // Compute — visualization
  XLSX_GENERATE_CHART: 130,
  XLSX_DASHBOARD: 131,
  XLSX_KPI_CARD: 132,
  // Compute — formula utilities
  XLSX_EXPLAIN_FORMULA: 140,
  XLSX_TRANSLATE_FORMULA: 141,
```

Also add the 9 missing standard operators in their correct sections:

```typescript
  // In the structural section (after XLSX_FREEZE_PANES: 60):
  XLSX_FILL_SERIES: 27,
  XLSX_FILTER_CLEAR: 51,
  XLSX_LOCK_CELLS: 62,
  XLSX_NORMALIZE_VALUES: 45,
  XLSX_REMOVE_DUPLICATES: 46,
  XLSX_SET_PROTECTION: 63,
  XLSX_TRIM_WHITESPACE: 44,
```

And DOCX structural operators:

```typescript
  // In the DOCX section (after existing DOCX entries):
  DOCX_PAGE_BREAK: 65,
  DOCX_SECTION_BREAK: 66,
```

### Step 2: Verify TypeScript compiles

```bash
cd /Users/pg/Desktop/koda-webapp/backend && npx tsc --noEmit 2>&1 | head -30
```

### Step 3: Commit

```bash
git add src/services/editing/intentRuntime/planAssembler.ts
git commit -m "feat(editing): add 27 compute + 9 missing operators to OP_ORDER"
```

---

## Task 6: Create DOCX Table Intent Patterns

**Files:**
- Modify: `backend/src/data_banks/intent_patterns/docx.en.any.json`
- Modify: `backend/src/data_banks/intent_patterns/docx.pt.any.json`

### Step 1: Add 4 EN table patterns

Append to the `patterns` array in `docx.en.any.json`:

```json
{
  "id": "docx.table.create",
  "domain": "docx",
  "lang": "en",
  "priority": 85,
  "triggers": {
    "tokens_any": ["create", "insert", "add", "make"],
    "tokens_all": ["table"],
    "tokens_none": ["contents", "toc", "row", "column", "cell", "chart", "delete", "remove"],
    "regex_any": ["\\b(?:create|insert|add|make)\\s+(?:a\\s+)?table\\b"]
  },
  "slotExtractors": { "rows": "number", "columns": "number" },
  "scopeRules": { "scopeType": "document" },
  "planTemplate": { "operator": "DOCX_CREATE_TABLE", "params": { "rows": "$rows", "columns": "$columns" } },
  "examples": {
    "positive": ["create a 3x4 table", "insert a table with 5 rows and 3 columns", "add a table here", "make a table"],
    "negative": ["create a table of contents", "update the table", "delete the table"]
  }
},
{
  "id": "docx.table.add_row",
  "domain": "docx",
  "lang": "en",
  "priority": 86,
  "triggers": {
    "tokens_any": ["add", "insert", "append"],
    "tokens_all": ["row"],
    "tokens_none": ["delete", "remove", "column", "cell", "create table", "spreadsheet"],
    "regex_any": ["\\b(?:add|insert|append)\\s+(?:a\\s+)?(?:new\\s+)?row\\b"]
  },
  "slotExtractors": { "tableIndex": "number", "position": "string" },
  "scopeRules": { "scopeType": "table" },
  "planTemplate": { "operator": "DOCX_ADD_TABLE_ROW", "params": { "tableIndex": "$tableIndex" } },
  "examples": {
    "positive": ["add a row to the table", "insert a new row", "append a row at the end"],
    "negative": ["add a column", "delete the row", "add a table"]
  }
},
{
  "id": "docx.table.delete_row",
  "domain": "docx",
  "lang": "en",
  "priority": 86,
  "triggers": {
    "tokens_any": ["delete", "remove"],
    "tokens_all": ["row"],
    "tokens_none": ["add", "insert", "column", "cell", "create", "paragraph"],
    "regex_any": ["\\b(?:delete|remove)\\s+(?:the\\s+)?(?:last\\s+|first\\s+)?row\\b"]
  },
  "slotExtractors": { "tableIndex": "number", "rowIndex": "number" },
  "scopeRules": { "scopeType": "table" },
  "planTemplate": { "operator": "DOCX_DELETE_TABLE_ROW", "params": { "tableIndex": "$tableIndex", "rowIndex": "$rowIndex" } },
  "examples": {
    "positive": ["delete the last row", "remove row 3", "delete the first row from the table"],
    "negative": ["delete the column", "delete the paragraph", "add a row"]
  }
},
{
  "id": "docx.table.set_cell",
  "domain": "docx",
  "lang": "en",
  "priority": 87,
  "triggers": {
    "tokens_any": ["set", "change", "update", "put", "write", "enter"],
    "tokens_all": ["cell"],
    "tokens_none": ["format", "style", "color", "bold", "font", "spreadsheet", "excel"],
    "regex_any": ["\\b(?:set|change|update|put|write)\\s+(?:the\\s+)?(?:table\\s+)?cell\\b"]
  },
  "slotExtractors": { "tableIndex": "number", "rowIndex": "number", "colIndex": "number", "value": "string" },
  "scopeRules": { "scopeType": "table" },
  "planTemplate": { "operator": "DOCX_SET_TABLE_CELL", "params": { "tableIndex": "$tableIndex", "rowIndex": "$rowIndex", "colIndex": "$colIndex", "value": "$value" } },
  "examples": {
    "positive": ["set cell 2,3 to 'Total'", "update the cell in row 1 column 2", "change the table cell value"],
    "negative": ["set the cell value in Excel", "format the cell", "change cell A1"]
  }
}
```

### Step 2: Add 4 PT table patterns

Mirror all 4 patterns with Portuguese triggers in `docx.pt.any.json`:
- `docx.table.create` — "criar", "inserir", "adicionar" + "tabela"
- `docx.table.add_row` — "adicionar", "inserir" + "linha"
- `docx.table.delete_row` — "excluir", "remover" + "linha"
- `docx.table.set_cell` — "definir", "alterar", "atualizar" + "célula"

### Step 3: Fix EN/PT parity — add missing `docx.rewrite.informal`

Add to `docx.en.any.json` (this pattern exists only in PT currently):

```json
{
  "id": "docx.rewrite.informal",
  "domain": "docx",
  "lang": "en",
  "priority": 81,
  "triggers": {
    "tokens_any": ["informal", "casual", "relaxed", "friendly", "conversational"],
    "tokens_none": ["formal", "professional", "academic"],
    "regex_any": ["\\b(?:make|rewrite|convert)\\s+(?:it|this|the text)\\s+(?:more\\s+)?(?:informal|casual|relaxed)\\b"]
  },
  "slotExtractors": {},
  "scopeRules": { "scopeType": "selection" },
  "planTemplate": { "operator": "DOCX_REWRITE_PARAGRAPH", "params": { "tone": "informal" } },
  "examples": {
    "positive": ["make it informal", "rewrite this casually", "make the text more conversational"],
    "negative": ["make it formal", "write professionally"]
  }
}
```

### Step 4: Validate banks

```bash
cd /Users/pg/Desktop/koda-webapp/backend && node scripts/editing/validate-editing-banks.mjs
```

### Step 5: Commit

```bash
git add src/data_banks/intent_patterns/docx.en.any.json src/data_banks/intent_patterns/docx.pt.any.json
git commit -m "feat(editing): add 4+4 DOCX table patterns + fix EN/PT informal parity"
```

---

## Task 7: Add DOCX Table Operators to OP_ORDER and Catalog

**Files:**
- Modify: `backend/src/services/editing/intentRuntime/planAssembler.ts`

### Step 1: Add table operators to OP_ORDER

In the DOCX section of OP_ORDER, add:

```typescript
  DOCX_CREATE_TABLE: 12,
  DOCX_ADD_TABLE_ROW: 13,
  DOCX_DELETE_TABLE_ROW: 14,
  DOCX_SET_TABLE_CELL: 16,
```

### Step 2: Verify and commit

```bash
cd /Users/pg/Desktop/koda-webapp/backend && npx tsc --noEmit 2>&1 | head -30
git add src/services/editing/intentRuntime/planAssembler.ts
git commit -m "feat(editing): add DOCX table operators to OP_ORDER"
```

---

## Task 8: Fix Priority Collisions in Existing Banks

**Files:**
- Modify: `backend/src/data_banks/intent_patterns/excel.en.any.json`
- Modify: `backend/src/data_banks/intent_patterns/excel.pt.any.json`
- Modify: `backend/src/data_banks/intent_patterns/docx.en.any.json`
- Modify: `backend/src/data_banks/intent_patterns/docx.pt.any.json`

### Step 1: Fix the worst Excel collision cluster (priority 76)

Differentiate `insert_rows` (76→77), `delete_rows` (76→78), `insert_columns` (76→77), `delete_columns` (76→78), `auto_fit` (76→75).

### Step 2: Fix the worst DOCX collision cluster (priority 84-85)

Differentiate list conversion patterns:
- `list.paragraph_to_bullets` → 84
- `list.bullets_to_paragraph` → 85
- `list.numbered_to_bullets` → 86
- `list.bullets_to_numbered` → 87

### Step 3: Fix the DOCX format/delete collision cluster (priority 78)

Differentiate:
- `format.clear` → 78
- `delete.paragraph` → 77
- `format.remove_bold` → 79
- `format.remove_italic` → 79
- `format.remove_underline` → 79

### Step 4: Apply same fixes to PT banks

Mirror all priority changes in the corresponding PT bank files.

### Step 5: Validate

```bash
cd /Users/pg/Desktop/koda-webapp/backend && node scripts/editing/validate-editing-banks.mjs
```

### Step 6: Commit

```bash
git add src/data_banks/intent_patterns/
git commit -m "fix(editing): resolve 47 worst priority collisions across 4 intent banks"
```

---

## Task 9: Create XLSX Eval Test Cases

**Files:**
- Create: `backend/src/data_banks/eval/xlsx_editing.qa.jsonl`
- Modify: `backend/src/tests/editing/xlsx-semantic.test.ts`

### Step 1: Create XLSX eval file

Create `xlsx_editing.qa.jsonl` with at least 60 test cases (30 EN, 30 PT):
- 10 value/formula operations
- 10 formatting operations
- 10 structural operations (sort, filter, table, insert/delete)
- 10 compute operations (forecast, regression, clustering, etc.)
- 10 chart operations
- 10 negative/edge cases

Each line:
```json
{"query": "forecast the next 6 months based on A1:A100", "expectedOperator": "XLSX_FORECAST", "domain": "excel", "lang": "en"}
```

### Step 2: Fix xlsx-semantic.test.ts

The existing test references banks that don't exist. Update to work with the new python_calc banks and the multi-bank loader.

### Step 3: Run tests

```bash
cd /Users/pg/Desktop/koda-webapp/backend && npx vitest run src/tests/editing/xlsx-semantic.test.ts
```

### Step 4: Commit

```bash
git add src/data_banks/eval/xlsx_editing.qa.jsonl src/tests/editing/xlsx-semantic.test.ts
git commit -m "feat(editing): add 60 XLSX eval test cases + fix semantic test"
```

---

## Task 10: Fix Stale MEMORY.md References

**Files:**
- Modify: `/Users/pg/.claude/projects/-Users-pg-Desktop-koda-webapp/memory/MEMORY.md`

### Step 1: Update MEMORY.md

Remove reference to non-existent "397 golden cases in `intent_cases.*.any.json`". Update with actual test fixture counts and locations.

### Step 2: Commit

Not applicable (memory file is outside repo).

---

## Verification Checklist

After all tasks complete, verify:

1. **TypeScript compiles**: `cd backend && npx tsc --noEmit` — 0 new errors
2. **Bank validation**: `node scripts/editing/validate-editing-banks.mjs` — 0 errors
3. **Pattern count**: `loadPatterns("excel", "en")` returns 56 + 27 = 83 patterns
4. **Compute classification**: `mapRuntimeOpsToLegacyIntent(["XLSX_REGRESSION"])` returns `{ intentId: "XLSX_COMPUTE" }` (NOT `XLSX_SET_VALUE`)
5. **Operator class**: `operatorClassFromCanonical("sheets", "XLSX_EXPLAIN_FORMULA")` returns `"xlsx_compute"` (NOT `"xlsx_formula"`)
6. **PY_ alias**: `runtimeFromAllybiCanonical("PY_STATS_REGRESSION")` returns `"COMPUTE_BUNDLE"`
7. **OP_ORDER**: All 27 compute ops + 9 standard ops have explicit priorities (not default 50)
8. **EN/PT parity**: Excel EN count = Excel PT count; DOCX EN count = DOCX PT count
9. **DOCX table patterns**: 4 new patterns in EN + 4 in PT
10. **XLSX eval**: At least 60 test cases in `xlsx_editing.qa.jsonl`

---

## Files Modified (Summary)

| # | File | Change |
|---|------|--------|
| 1 | `allybi/intentClassifier.ts` | Add compute branch using XLSX_COMPUTE_OPERATORS |
| 2 | `allybi/operatorPlanner.ts` | Add xlsx_compute class + SSOT routing |
| 3 | `editOperatorAliases.service.ts` | Add PY_ prefix handling |
| 4 | `parsers/operator_catalog.any.json` | Add 27 XLSX_COMPUTE_OPERATORS entries |
| 5 | `intent_patterns/python_calc.en.any.json` | NEW — 27 EN compute patterns |
| 6 | `intent_patterns/python_calc.pt.any.json` | NEW — 27 PT compute patterns |
| 7 | `intentRuntime/loaders.ts` | Multi-bank loading (string → string[]) |
| 8 | `allybi/loadBanks.ts` | Add python_calc bank fields |
| 9 | `manifest/bank_registry.any.json` | Register python_calc banks |
| 10 | `intentRuntime/planAssembler.ts` | Add 27+9 OP_ORDER entries |
| 11 | `intent_patterns/docx.en.any.json` | Add 4 table patterns + informal parity fix |
| 12 | `intent_patterns/docx.pt.any.json` | Add 4 table patterns |
| 13 | `intent_patterns/excel.en.any.json` | Fix priority collisions |
| 14 | `intent_patterns/excel.pt.any.json` | Fix priority collisions |
| 15 | `eval/xlsx_editing.qa.jsonl` | NEW — 60 XLSX eval test cases |
| 16 | `tests/editing/xlsx-semantic.test.ts` | Fix to work with new banks |
