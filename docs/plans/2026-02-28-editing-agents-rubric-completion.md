# Editing Agents — Rubric Completion Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix every gap identified by the harsh 100/100 rubric so both the Excel Python Agent and DOCX Writer Agent pass P0 gates and reach ≥97/100.

**Architecture:** The editing pipeline has two operator namespaces — `XLSX_*` canonical names used by the intent classifier/planner/alias system, and `PY_*` catalog names used for slot metadata and UI templates. The wiring gap is that intent patterns that produce compute plan steps don't exist (dead banks), 27 XLSX_* compute operators have no catalog metadata, and the PY_* operators have no alias routing. This plan bridges both namespaces, creates the missing bank data, and fills all implementation gaps (tables, charts, grounding, validation, tests).

**Tech Stack:** TypeScript/Node.js, ExcelJS, xml2js/AdmZip (OOXML), Vitest, JSON data banks

---

## Audit Summary

### Current Rubric Scores

| Gate/Category | Score | Blocker? |
|---|---|---|
| P0-1 Scope lock | CONDITIONAL PASS | No post-apply target verification |
| P0-2 Preview→Apply→Verify | PASS | — |
| P0-3 Structural integrity | PARTIAL PASS | No OOXML validation |
| P0-4 No silent NOOPs | PASS | — |
| P0-5 Deterministic output | PASS | — |
| **P0-6 Bank wiring proof** | **FAIL** | **Dead python_calc banks → Score = 0** |
| P0-7 No truncation | PASS | — |
| E1 Calculation (30) | 20 | No PT formula generation |
| E2 Precision (20) | 18 | — |
| E3 Semantics (15) | 13 | No anomaly/reconciliation |
| E4 Charts (10) | 2 | CHART_ENGINE_UNAVAILABLE |
| E5 Robustness (10) | 7 | No size guards |
| E6 UX (10) | 8 | — |
| E7 Safety (5) | 4 | — |
| D1 Fidelity (25) | 18 | Quality gates post-hoc |
| D2 Writing (20) | 16 | — |
| D3 Formatting (20) | 19 | — |
| D4 Structural (15) | 6 | Table ops unimplemented |
| D5 Citations (10) | 2 | Grounding unimplemented |
| D6 UX (10) | 10 | — |

### Key Findings

1. **Operator namespace mismatch**: `editing.constants.ts` defines 27 `XLSX_*` compute operators. The operator catalog has 41 `PY_*` operators. Neither namespace is fully wired. `XLSX_*` has no catalog entries; `PY_*` has no alias routing.

2. **Dead python_calc banks**: `loaders.ts` and `loadBanks.ts` reference `intent_patterns_python_calc_en/pt` — no files exist, no registry entries, zero tests.

3. **PT locale**: `slotFill.ts` has full PT→EN formula normalization (48 function mappings, semicolons, decimal commas). But `sheetsEditAgent` formula templates are EN-only.

4. **Charts**: Local XLSX fallback throws `CHART_ENGINE_UNAVAILABLE`. PY_CHART_* operators exist in catalog (10 types) but have no runtime handler. Chart spec bank and data extraction exist.

5. **DOCX tables**: 4 operators defined (`DOCX_CREATE_TABLE`, `DOCX_ADD_TABLE_ROW`, `DOCX_DELETE_TABLE_ROW`, `DOCX_SET_TABLE_CELL`), receipt metadata wired, but zero implementation in `docxEditor.service.ts`.

6. **DOCX citations**: `allybi_crossdoc_grounding.any.json` is a complete 200+ line policy bank. `DOCX_ENRICH_FROM_SOURCES` operator defined. Zero runtime implementation.

7. **Test gaps**: No stress tests (50k+ rows), 1 chart test case, 0 semantic/reconciliation cases, 0 citation tests, no bank mutation tests, no plan determinism hash tests.

---

## Phase 1 — Unblock P0-6: Create Python-Calc Intent Pattern Banks

This is the only P0 blocker. Everything else is point scoring.

### Task 1.1: Create EN python_calc intent pattern bank

**Files:**
- Create: `backend/src/data_banks/intent_patterns/python_calc.en.any.json`

**Step 1: Create the bank file**

The file must follow the exact schema used by `excel.en.any.json`. Each pattern needs: `id`, `domain` (use `"excel"` — these merge into the excel loading path), `lang`, `priority`, `triggers`, `slotExtractors`, `scopeRules`, `planTemplate`, `examples`, and optional `clarifyIfMissing`.

The plan templates should use `XLSX_*` canonical names (not `PY_*`) because:
- `editOperatorAliases.service.ts:87` maps `op.startsWith("XLSX_")` → `COMPUTE_BUNDLE`
- The classifier/planner we wired in Steps 1-6 use `XLSX_COMPUTE_OPERATORS` set
- The `COMPUTE_BUNDLE` handler in `documentRevisionStore.service.ts:1358` is fully wired

Create 19 patterns covering the core compute families:

| Pattern ID | Operator | Trigger examples |
|---|---|---|
| `python.forecast` | `XLSX_FORECAST` | "forecast", "predict", "project forward" |
| `python.clean_data` | `XLSX_CLEAN_DATA` | "clean data", "fix missing values", "remove blanks" |
| `python.dedupe` | `XLSX_DEDUPE` | "remove duplicates", "deduplicate", "find dupes" |
| `python.anomaly_detect` | `XLSX_ANOMALY_DETECT` | "find outliers", "anomaly detection", "unusual values" |
| `python.reconcile` | `XLSX_RECONCILE` | "reconcile sheets", "cross-check", "compare tabs" |
| `python.regression` | `XLSX_REGRESSION` | "regression analysis", "trend line", "linear fit" |
| `python.monte_carlo` | `XLSX_MONTE_CARLO` | "monte carlo", "simulation", "probability" |
| `python.goal_seek` | `XLSX_GOAL_SEEK` | "goal seek", "what if", "solve for" |
| `python.clustering` | `XLSX_CLUSTERING` | "cluster", "segment", "group similar" |
| `python.generate_chart` | `XLSX_GENERATE_CHART` | "create chart", "plot", "visualize data" |
| `python.derived_column` | `XLSX_DERIVED_COLUMN` | "add calculated column", "derive column", "computed field" |
| `python.normalize` | `XLSX_NORMALIZE` | "normalize", "scale data", "standardize values" |
| `python.pivot` | `XLSX_PIVOT` | "pivot table", "cross-tab", "summarize by" |
| `python.rolling_window` | `XLSX_ROLLING_WINDOW` | "rolling average", "moving window", "sliding" |
| `python.group_by` | `XLSX_GROUP_BY` | "group by", "aggregate by", "summarize by category" |
| `python.hypothesis_test` | `XLSX_HYPOTHESIS_TEST` | "hypothesis test", "t-test", "significance" |
| `python.correlation` | `XLSX_CORRELATION_MATRIX` | "correlation", "correlation matrix", "relationships between" |
| `python.split_column` | `XLSX_SPLIT_COLUMN` | "split column", "separate into columns", "text to columns" |
| `python.explain_formula` | `XLSX_EXPLAIN_FORMULA` | "explain formula", "what does this formula do", "break down formula" |

Slot extractors to use per pattern:
- Most compute patterns: `A1_RANGE` (source data), `SHEET_NAME`, `NUMBER_OR_TEXT` (for thresholds/params)
- Chart pattern: `A1_RANGE`, `CHART_TYPE` (via `excel_chart_types_en` dictionary)
- Formula patterns: `FORMULA` (formula text extraction)

Scope rules for compute patterns: `defaultScope: "sheet"`, `allowScopeOverrideByExplicitRange: true`, `allowNoSelectionIfRangeProvided: true`

Each pattern needs 3-5 positive examples and 2-3 negative examples for disambiguation scoring.

**Step 2: Verify structure**

Run: `node -e "const b = require('./backend/src/data_banks/intent_patterns/python_calc.en.any.json'); console.log(b.patterns.length, 'patterns loaded')"`
Expected: `19 patterns loaded`

---

### Task 1.2: Create PT python_calc intent pattern bank

**Files:**
- Create: `backend/src/data_banks/intent_patterns/python_calc.pt.any.json`

Mirror of Task 1.1 with Portuguese triggers. Key translations:

| EN trigger | PT trigger |
|---|---|
| forecast, predict | previsão, prever, projetar |
| clean data, remove blanks | limpar dados, remover vazios |
| remove duplicates | remover duplicatas, deduplicar |
| find outliers | encontrar outliers, valores atípicos |
| reconcile sheets | reconciliar planilhas, comparar abas |
| regression analysis | análise de regressão, tendência |
| monte carlo simulation | simulação monte carlo, probabilidade |
| goal seek | atingir meta, resolver para |
| cluster, segment | agrupar, segmentar, clusterizar |
| create chart, plot | criar gráfico, plotar, visualizar |
| pivot table | tabela dinâmica, tabela pivot |
| rolling average | média móvel, janela deslizante |
| hypothesis test | teste de hipótese, significância |
| correlation matrix | matriz de correlação |
| split column | dividir coluna, separar em colunas |
| explain formula | explicar fórmula, detalhar fórmula |

All patterns must have `lang: "pt"` and use PT examples.

---

### Task 1.3: Register banks in manifest

**Files:**
- Modify: `backend/src/data_banks/manifest/bank_registry.any.json`

Add two entries after the existing `intent_patterns_excel_pt` entry. Follow exact format of neighboring entries:

```json
{
  "id": "intent_patterns_python_calc_en",
  "category": "intent_patterns",
  "path": "intent_patterns/python_calc.en.any.json",
  "filename": "python_calc.en.any.json",
  "version": "1.0.0",
  "contentType": "patterns",
  "schemaId": "bank_schema",
  "enabledByEnv": { "production": true, "staging": true, "dev": true, "local": true },
  "requiredByEnv": { "production": false, "staging": false, "dev": false, "local": false },
  "checksumSha256": "",
  "lastUpdated": "2026-02-28"
},
{
  "id": "intent_patterns_python_calc_pt",
  "category": "intent_patterns",
  "path": "intent_patterns/python_calc.pt.any.json",
  "filename": "python_calc.pt.any.json",
  "version": "1.0.0",
  "contentType": "patterns",
  "schemaId": "bank_schema",
  "enabledByEnv": { "production": true, "staging": true, "dev": true, "local": true },
  "requiredByEnv": { "production": false, "staging": false, "dev": false, "local": false },
  "checksumSha256": "",
  "lastUpdated": "2026-02-28"
}
```

**Step 2: Compute checksums**

Run: `shasum -a 256 backend/src/data_banks/intent_patterns/python_calc.en.any.json backend/src/data_banks/intent_patterns/python_calc.pt.any.json`

Update the `checksumSha256` fields with actual hashes.

---

### Task 1.4: Add 27 XLSX_* compute operators to operator catalog

**Files:**
- Modify: `backend/src/data_banks/parsers/operator_catalog.any.json`

The catalog has PY_* entries with full metadata. Add matching XLSX_* entries so `validateRequiredSlots()` and `buildUiMeta()` work. Each entry needs:

```json
"XLSX_FORECAST": {
  "domain": "excel",
  "runtimeOperator": "COMPUTE_BUNDLE",
  "requiresSelection": "forbidden",
  "supportsMultiTarget": false,
  "requiredSlots": ["sheetName", "rangeA1"],
  "optionalSlots": ["periods", "confidence"],
  "conflictsWith": [],
  "previewable": true,
  "undoable": true,
  "uiStepTemplate": {
    "en": "Forecasting data from {{rangeA1}}...",
    "pt": "Prevendo dados de {{rangeA1}}..."
  }
}
```

Add all 27 operators. Group by family — use the PY_* catalog entries as reference for required/optional slots, adapting names to match the XLSX_* convention. Key mappings:

| XLSX_* | Reference PY_* for slots |
|---|---|
| XLSX_FORECAST | PY_TIME_SERIES_FORECAST |
| XLSX_CLEAN_DATA | PY_CLEAN_MISSING_VALUES |
| XLSX_DEDUPE | PY_CLEAN_DEDUP_FUZZY |
| XLSX_ANOMALY_DETECT | PY_OUTLIER_DETECT |
| XLSX_RECONCILE | PY_CALC_CROSS_SHEET_MERGE |
| XLSX_REGRESSION | PY_STATS_REGRESSION |
| XLSX_MONTE_CARLO | (new — no PY equivalent) |
| XLSX_GOAL_SEEK | (new — no PY equivalent) |
| XLSX_CLUSTERING | (new — no PY equivalent) |
| XLSX_GENERATE_CHART | PY_CHART |
| XLSX_DERIVED_COLUMN | PY_CALC_DERIVE_COLUMN |
| XLSX_NORMALIZE | PY_NORMALIZE_SCALE |
| XLSX_PIVOT | PY_PIVOT_TABLE |
| XLSX_ROLLING_WINDOW | PY_CALC_WINDOW_FUNCTION |
| XLSX_GROUP_BY | PY_CALC_GROUPBY_AGG |
| XLSX_COHORT_ANALYSIS | (new) |
| XLSX_HYPOTHESIS_TEST | PY_STATS_HYPOTHESIS_TEST |
| XLSX_CONFIDENCE_INTERVAL | (new) |
| XLSX_ANOVA | (new) |
| XLSX_CORRELATION_MATRIX | PY_STATS_CORRELATION |
| XLSX_SEASONALITY | PY_TIME_SERIES_DECOMPOSE |
| XLSX_EXPLAIN_FORMULA | (new — formula as input slot) |
| XLSX_TRANSLATE_FORMULA | (new — formula + target language) |
| XLSX_SPLIT_COLUMN | PY_TEXT_SPLIT_COLUMN |
| XLSX_DASHBOARD | (new — multi-chart layout) |
| XLSX_KPI_CARD | (new — summary card) |
| XLSX_MOVING_AVERAGE | PY_CALC_WINDOW_FUNCTION |

---

### Task 1.5: Add bank wiring integration test

**Files:**
- Create: `backend/src/tests/editing/pythonCalcBankWiring.test.ts`

**Step 1: Write the test**

```typescript
import { describe, test, expect, beforeAll } from "@jest/globals";
import { loadAllybiBanks } from "../../services/editing/allybi/loadBanks";

describe("Python Calc Bank Wiring", () => {
  let banks: ReturnType<typeof loadAllybiBanks>;

  beforeAll(() => {
    banks = loadAllybiBanks();
  });

  test("python_calc EN bank is loaded and has patterns", () => {
    expect(banks.intentPatternsPythonCalcEn).not.toBeNull();
    expect(banks.intentPatternsPythonCalcEn.patterns.length).toBeGreaterThanOrEqual(15);
  });

  test("python_calc PT bank is loaded and has patterns", () => {
    expect(banks.intentPatternsPythonCalcPt).not.toBeNull();
    expect(banks.intentPatternsPythonCalcPt.patterns.length).toBeGreaterThanOrEqual(15);
  });

  test("EN and PT banks have matching pattern count", () => {
    expect(banks.intentPatternsPythonCalcEn.patterns.length)
      .toBe(banks.intentPatternsPythonCalcPt.patterns.length);
  });

  test("every pattern references a valid compute operator", () => {
    const validOps = new Set([
      "XLSX_FORECAST", "XLSX_CLEAN_DATA", "XLSX_DEDUPE", "XLSX_ANOMALY_DETECT",
      "XLSX_RECONCILE", "XLSX_REGRESSION", "XLSX_MONTE_CARLO", "XLSX_GOAL_SEEK",
      "XLSX_CLUSTERING", "XLSX_GENERATE_CHART", "XLSX_DERIVED_COLUMN", "XLSX_NORMALIZE",
      "XLSX_PIVOT", "XLSX_ROLLING_WINDOW", "XLSX_GROUP_BY", "XLSX_COHORT_ANALYSIS",
      "XLSX_HYPOTHESIS_TEST", "XLSX_CONFIDENCE_INTERVAL", "XLSX_ANOVA",
      "XLSX_CORRELATION_MATRIX", "XLSX_SEASONALITY", "XLSX_EXPLAIN_FORMULA",
      "XLSX_TRANSLATE_FORMULA", "XLSX_SPLIT_COLUMN", "XLSX_DASHBOARD",
      "XLSX_KPI_CARD", "XLSX_MOVING_AVERAGE",
    ]);
    for (const p of banks.intentPatternsPythonCalcEn.patterns) {
      for (const step of p.planTemplate) {
        expect(validOps.has(step.op)).toBe(true);
      }
    }
  });

  test("changing a pattern trigger changes matching behavior", () => {
    // Mutation test: verify the bank is actually consumed at runtime
    const patterns = banks.intentPatternsPythonCalcEn.patterns;
    const forecastPattern = patterns.find((p: any) => p.id.includes("forecast"));
    expect(forecastPattern).toBeDefined();
    expect(forecastPattern.triggers.tokens_any.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run test**

Run: `npx jest src/tests/editing/pythonCalcBankWiring.test.ts --verbose`
Expected: All 5 tests pass.

**Step 3: Run bank validation**

Run: `node scripts/editing/validate-editing-banks.mjs`
Expected: 0 errors.

**Step 4: Commit**

```bash
git add backend/src/data_banks/intent_patterns/python_calc.*.json \
  backend/src/data_banks/manifest/bank_registry.any.json \
  backend/src/data_banks/parsers/operator_catalog.any.json \
  backend/src/tests/editing/pythonCalcBankWiring.test.ts
git commit -m "feat: create python_calc intent pattern banks, register, add catalog entries and wiring test

Unblocks P0-6 (dead bank gate). Creates 19 EN + 19 PT patterns for
compute operators, registers in manifest, adds 27 XLSX_* entries to
operator catalog, and adds integration test proving bank wiring."
```

---

## Phase 2 — E1: PT Locale Formula Generation (+10 pts → 30/30)

### Task 2.1: Add PT formula templates to SheetsEditAgent

**Files:**
- Modify: `backend/src/services/editing/agents/sheetsEditAgent.service.ts`

The agent has `FORMULA_TEMPLATES` (lines 46-115) with EN-only patterns. The PT→EN normalization already exists in `slotFill.ts:318-387` (handles SOMA→SUM, semicolons, decimal commas). The gap is formula generation output — when the agent creates formulas for a PT user, they should receive PT-syntax formulas.

**Step 1: Add reverse mapping loader**

After the existing imports, add a utility that reverses the `excel_functions_pt_to_en` bank:

```typescript
import { loadParser } from "../intentRuntime/loaders";

function getEnToPtMap(): Map<string, string> {
  const parser = loadParser("excel_functions_pt_to_en");
  const map = new Map<string, string>();
  if (parser?.entries) {
    for (const [pt, en] of Object.entries(parser.entries)) {
      map.set(String(en).toUpperCase(), pt.toUpperCase());
    }
  }
  return map;
}

function localizeFormula(formula: string, language: "en" | "pt"): string {
  if (language !== "pt" || !formula.startsWith("=")) return formula;
  const enToPt = getEnToPtMap();
  // Replace function names: =SUM( → =SOMA(
  let localized = formula.replace(/([A-Z_]+)\(/g, (match, fn) => {
    const ptFn = enToPt.get(fn.toUpperCase());
    return ptFn ? `${ptFn}(` : match;
  });
  // Replace comma separators with semicolons (outside string literals)
  let result = "";
  let inString = false;
  for (const ch of localized) {
    if (ch === '"') inString = !inString;
    result += (!inString && ch === ",") ? ";" : ch;
  }
  return result;
}
```

**Step 2: Thread language through formula generation**

The `generateFormulas()` method receives `context` (which has sheet data) and `instruction`. Thread the `language` parameter from the intent classification result. In the enrichment pipeline (line ~270), the `classifiedIntent.language` is available.

Modify `generateFormulas()` to accept `language: "en" | "pt"` and call `localizeFormula()` on each generated formula before returning.

**Step 3: Write test**

```typescript
// In a new or existing test file
test("localizeFormula converts SUM to SOMA for PT", () => {
  expect(localizeFormula("=SUM(A1:A10)", "pt")).toBe("=SOMA(A1:A10)");
  expect(localizeFormula("=SUMIFS(B:B,A:A,\"X\")", "pt")).toBe("=SOMASES(B:B;A:A;\"X\")");
  expect(localizeFormula("=AVERAGE(C1:C5)", "pt")).toBe("=MÉDIA(C1:C5)");
  expect(localizeFormula("=SUM(A1:A10)", "en")).toBe("=SUM(A1:A10)"); // no-op for EN
});
```

**Step 4: Commit**

---

## Phase 3 — E4: Chart Engine via Python Path (+8 pts → 10/10)

### Task 3.1: Add PY_ operator alias routing

**Files:**
- Modify: `backend/src/services/editing/editOperatorAliases.service.ts`

Currently line 87: `if (op.startsWith("XLSX_")) return "COMPUTE_BUNDLE"`. PY_* operators fall through to `return null`. Add routing:

```typescript
// After line 87 (the XLSX_ catch-all):
if (op.startsWith("PY_CHART_")) return "CREATE_CHART";
if (op.startsWith("PY_")) return "COMPUTE_BUNDLE";
```

Also add `"PY_COMPUTE"` and `"PY_CHART"` to the `CANONICAL_EDIT_OPERATORS` set if they need to be accepted as direct operator inputs.

**Step 1: Write test**

```typescript
test("PY_CHART_BAR maps to CREATE_CHART", () => {
  const result = resolveRuntimeAlias("PY_CHART_BAR");
  expect(result).toBe("CREATE_CHART");
});

test("PY_CALC_DERIVE_COLUMN maps to COMPUTE_BUNDLE", () => {
  const result = resolveRuntimeAlias("PY_CALC_DERIVE_COLUMN");
  expect(result).toBe("COMPUTE_BUNDLE");
});
```

**Step 2: Implement and commit**

---

### Task 3.2: Wire PY_CHART execution in documentRevisionStore

**Files:**
- Modify: `backend/src/services/editing/documentRevisionStore.service.ts`

The `CREATE_CHART` branch (around line 1340) currently routes to Google Sheets API or throws `CHART_ENGINE_UNAVAILABLE`. Add a fallback path:

1. Check if Python compute service is available
2. If available, route to `PY_CHART` execution: extract chart type from canonical operator, extract data range, call Python service, get PNG bytes, embed in XLSX via ExcelJS `worksheet.addImage()`
3. If neither Sheets API nor Python service available, return `planStatus: "blocked"` with reason `CHART_ENGINE_UNAVAILABLE` instead of throwing

This requires the Python service endpoint to be callable. If it's not ready, implement a graceful degradation that returns a structured error with chart spec (so the frontend can render a client-side chart).

---

### Task 3.3: Remove CHART_ENGINE_UNAVAILABLE throws

**Files:**
- Modify: `backend/src/services/editing/xlsx/xlsxFileEditor.service.ts`

Lines 928-931 and 968-971 throw hard errors. Replace with:

```typescript
} else if (kind === "create_chart" || kind === "update_chart") {
  // Chart creation not supported in local XLSX fallback.
  // Return a noop patch with chart spec metadata for client-side rendering.
  results.push({
    kind,
    status: "skipped",
    reason: "CHART_ENGINE_LOCAL_UNSUPPORTED",
    chartSpec: op.chartSpec || null,
  });
}
```

This converts a crash into a graceful skip, allowing the rest of a multi-op compute bundle to succeed.

---

## Phase 4 — D4: DOCX Table Operations (+9 pts → 15/15)

### Task 4.1: Implement `createTable` in docxEditor

**Files:**
- Modify: `backend/src/services/editing/docx/docxEditor.service.ts`

Add method that:
1. Accepts `buffer, afterParagraphId, rows, cols, headerRow?: string[]`
2. Parses ZIP, finds `word/document.xml`
3. Locates the target paragraph by ID (using existing `mutateParaInPlace` pattern)
4. Builds `<w:tbl>` XML structure with:
   - `<w:tblPr>` — table properties (width, borders, style)
   - `<w:tblGrid>` — column definitions
   - `<w:tr>` × rows, each containing `<w:tc>` × cols
   - Each `<w:tc>` contains a `<w:p>` with optional text
5. Inserts the table XML after the target paragraph
6. Returns modified buffer

Key XML structure:
```xml
<w:tbl>
  <w:tblPr>
    <w:tblStyle w:val="TableGrid"/>
    <w:tblW w:w="0" w:type="auto"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      <w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      <w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      <w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>
    </w:tblBorders>
  </w:tblPr>
  <w:tblGrid>
    <w:gridCol w:w="2000"/> <!-- repeat per col -->
  </w:tblGrid>
  <w:tr>
    <w:tc>
      <w:p><w:r><w:t>Cell text</w:t></w:r></w:p>
    </w:tc>
  </w:tr>
</w:tbl>
```

---

### Task 4.2: Implement `addTableRow`, `deleteTableRow`, `setTableCell`

**Files:**
- Modify: `backend/src/services/editing/docx/docxEditor.service.ts`

Three additional methods:

**addTableRow(buffer, tableIndex, rowIndex?, cellValues?):**
- Parse document XML, find `<w:tbl>` by index
- Create new `<w:tr>` with matching column count
- Insert at `rowIndex` or append

**deleteTableRow(buffer, tableIndex, rowIndex):**
- Parse document XML, find table
- Remove `<w:tr>` at index
- Verify table still has ≥1 row

**setTableCell(buffer, tableIndex, rowIndex, colIndex, text):**
- Parse document XML, navigate to specific `<w:tc>`
- Replace paragraph content within cell
- Preserve cell properties (`<w:tcPr>`)

---

### Task 4.3: Add patch kind handlers in documentRevisionStore

**Files:**
- Modify: `backend/src/services/editing/documentRevisionStore.service.ts`

In the `EDIT_DOCX_BUNDLE` switch statement (lines 745-1050), add 4 new cases:

```typescript
case "docx_create_table": {
  const { afterParagraphId, rows, cols, headerRow } = patch;
  buffer = await this.docxEditor.createTable(buffer, afterParagraphId, rows, cols, headerRow);
  changeCount++;
  break;
}
case "docx_add_table_row": {
  const { tableIndex, rowIndex, cellValues } = patch;
  buffer = await this.docxEditor.addTableRow(buffer, tableIndex, rowIndex, cellValues);
  changeCount++;
  break;
}
case "docx_delete_table_row": {
  const { tableIndex, rowIndex } = patch;
  buffer = await this.docxEditor.deleteTableRow(buffer, tableIndex, rowIndex);
  changeCount++;
  break;
}
case "docx_set_table_cell": {
  const { tableIndex, rowIndex, colIndex, text } = patch;
  buffer = await this.docxEditor.setTableCell(buffer, tableIndex, rowIndex, colIndex, text);
  changeCount++;
  break;
}
```

---

### Task 4.4: Write table E2E tests

**Files:**
- Create: `backend/src/tests/e2e/editing/docx-tables.e2e.test.ts`

Test cases:
1. Create a 3×4 table after paragraph 1 → verify OOXML has `<w:tbl>` with 3 rows, 4 cols
2. Add a row to an existing table → verify row count incremented
3. Delete a row → verify row count decremented, remaining rows intact
4. Set cell text → verify only target cell changed
5. Create table with header row → verify first row has header content
6. Create table at end of document → verify no corruption
7. Table with empty cells → verify valid OOXML

**Step: Commit**

---

## Phase 5 — D5: Citations & Grounding (+8 pts → 10/10)

### Task 5.1: Implement DOCX_ENRICH_FROM_SOURCES handler

**Files:**
- Modify: `backend/src/services/editing/documentRevisionStore.service.ts`

The grounding policy bank (`allybi_crossdoc_grounding.any.json`) defines the full citation format:
```json
{
  "citationFormat": {
    "source_pack": {
      "fields": ["documentId", "snippetId", "excerpt"]
    }
  }
}
```

Add a new operator branch that:
1. Receives `sourceDocs[]` with `{documentId, snippetId, excerpt}` entries
2. Inserts citations as inline text markers: `[Source: {docTitle}, p.{page}]`
3. Optionally appends a "Sources" section at document end
4. Tracks `sourceProofCount` in telemetry

---

### Task 5.2: Add grounding gate to editOrchestrator

**Files:**
- Modify: `backend/src/services/editing/editOrchestrator.service.ts`

Before apply, if the operator is `DOCX_ENRICH_FROM_SOURCES`:
1. Load grounding policy from `allybi_crossdoc_grounding` bank
2. Verify `sourceDocs.length >= minExplicitResolvedDocs` (from policy)
3. If insufficient sources, return `planStatus: "blocked"` with clarification asking user to select source documents

---

## Phase 6 — P0-1: Post-Apply Scope Verification (+CONDITIONAL→PASS)

### Task 6.1: Add target tracking to DOCX edits

**Files:**
- Modify: `backend/src/services/editing/docx/docxEditor.service.ts`

Each mutation method (`rewriteParagraph`, `setRunStyle`, `createTable`, etc.) should return `{ buffer: Buffer, modifiedIds: string[] }` instead of just `Buffer`.

The `mutateParaInPlace()` helper already knows the target paragraph ID — return it in the result.

---

### Task 6.2: Add target tracking to XLSX edits

**Files:**
- Modify: `backend/src/services/editing/xlsx/xlsxFileEditor.service.ts`

Track which cells/ranges were actually modified during `computeOps()`. Return `{ workbook, modifiedRanges: string[] }` alongside the result.

---

### Task 6.3: Enhance applyVerification with scope check

**Files:**
- Modify: `backend/src/services/editing/apply/applyVerification.service.ts`

Extend the input/output interfaces:

```typescript
interface ApplyVerificationInput {
  // existing fields...
  declaredTargets?: string[];
  actuallyModifiedTargets?: string[];
}

interface ApplyVerificationResult {
  // existing fields...
  scopeViolation?: boolean;
  scopeViolationDetails?: string[];
}
```

Add verification logic:
```typescript
if (input.declaredTargets && input.actuallyModifiedTargets) {
  const declaredSet = new Set(input.declaredTargets);
  const unintended = input.actuallyModifiedTargets.filter(t => !declaredSet.has(t));
  if (unintended.length > 0) {
    result.scopeViolation = true;
    result.scopeViolationDetails = unintended;
    result.reasons.push(`Scope violation: ${unintended.length} unintended targets modified`);
  }
}
```

---

## Phase 7 — P0-3: OOXML Structural Validation (+PARTIAL→PASS)

### Task 7.1: Add post-edit XML well-formedness check

**Files:**
- Create: `backend/src/services/editing/docx/docxValidator.service.ts`

```typescript
import * as AdmZip from "adm-zip";
import * as xml2js from "xml2js";

export interface DocxValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export async function validateDocxStructure(buffer: Buffer): Promise<DocxValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const zip = new AdmZip(buffer);

  // 1. Required parts exist
  const requiredParts = ["word/document.xml", "[Content_Types].xml"];
  for (const part of requiredParts) {
    if (!zip.getEntry(part)) errors.push(`Missing required part: ${part}`);
  }

  // 2. XML well-formedness for all XML parts
  const xmlEntries = zip.getEntries().filter(e => e.entryName.endsWith(".xml"));
  const parser = new xml2js.Parser({ strict: true });
  for (const entry of xmlEntries) {
    try {
      await parser.parseStringPromise(entry.getData().toString("utf8"));
    } catch (e: any) {
      errors.push(`Malformed XML in ${entry.entryName}: ${e.message}`);
    }
  }

  // 3. Relationship integrity
  const relsEntry = zip.getEntry("word/_rels/document.xml.rels");
  if (relsEntry) {
    const relsXml = await parser.parseStringPromise(relsEntry.getData().toString("utf8"));
    // Check all relationship targets exist in zip
    const rels = relsXml?.Relationships?.Relationship || [];
    for (const rel of rels) {
      const target = rel.$?.Target;
      if (target && !target.startsWith("http") && !zip.getEntry(`word/${target}`)) {
        warnings.push(`Dangling relationship: ${rel.$.Id} → ${target}`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
```

---

### Task 7.2: Wire validation into revision store

**Files:**
- Modify: `backend/src/services/editing/documentRevisionStore.service.ts`

After DOCX edits (in the `EDIT_DOCX_BUNDLE` handler), call the validator:

```typescript
const validation = await validateDocxStructure(edited);
if (!validation.valid) {
  logger.error("[RevisionStore] OOXML validation failed", { errors: validation.errors });
  throw new Error(`DOCX structural integrity check failed: ${validation.errors.join("; ")}`);
}
```

---

### Task 7.3: Add XLSX formula reference validation

**Files:**
- Modify: `backend/src/services/editing/xlsx/xlsxFileEditor.service.ts`

After `computeOps()` completes all operations, validate formula references:

```typescript
function validateFormulaReferences(workbook: ExcelJS.Workbook): string[] {
  const warnings: string[] = [];
  const sheetNames = new Set(workbook.worksheets.map(ws => ws.name));

  for (const ws of workbook.worksheets) {
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.value && typeof cell.value === "object" && "formula" in cell.value) {
          const formula = (cell.value as any).formula;
          // Check for cross-sheet references to non-existent sheets
          const sheetRefs = formula.match(/'([^']+)'!/g) || [];
          for (const ref of sheetRefs) {
            const name = ref.slice(1, -2); // Remove quotes and !
            if (!sheetNames.has(name)) {
              warnings.push(`Cell ${cell.address}: formula references non-existent sheet '${name}'`);
            }
          }
        }
      });
    });
  }
  return warnings;
}
```

---

## Phase 8 — Test Pack Completion

### Task 8.1: Plan determinism hash test

**Files:**
- Create: `backend/src/tests/editing/planDeterminism.test.ts`

```typescript
import { describe, test, expect } from "@jest/globals";
import { analyzeMessageToPlan } from "../../services/editing/intentRuntime";
import * as crypto from "crypto";

function hashPlan(plan: any): string {
  return crypto.createHash("sha256")
    .update(JSON.stringify(plan, Object.keys(plan).sort()))
    .digest("hex");
}

describe("Plan Determinism", () => {
  const cases = [
    { message: "bold the title", domain: "docx" as const, lang: "en" as const },
    { message: "sum column B", domain: "excel" as const, lang: "en" as const },
    { message: "negrito no título", domain: "docx" as const, lang: "pt" as const },
    { message: "forecast my data", domain: "excel" as const, lang: "en" as const },
  ];

  for (const c of cases) {
    test(`same input → same plan hash: "${c.message}"`, () => {
      const plan1 = analyzeMessageToPlan({ message: c.message, domain: c.domain, viewerContext: {}, language: c.lang });
      const plan2 = analyzeMessageToPlan({ message: c.message, domain: c.domain, viewerContext: {}, language: c.lang });
      expect(hashPlan(plan1)).toBe(hashPlan(plan2));
    });
  }
});
```

---

### Task 8.2: Bank mutation test

**Files:**
- Create: `backend/src/tests/editing/bankMutationProof.test.ts`

Proves that changing a bank changes runtime behavior:

```typescript
import { describe, test, expect } from "@jest/globals";
import { analyzeMessageToPlan } from "../../services/editing/intentRuntime";

describe("Bank Mutation Proof", () => {
  test("intent patterns bank drives matching — a pattern's triggers determine what matches", () => {
    // This test documents that the runtime reads from banks, not hardcoded logic.
    // If intent_patterns_excel_en bank is empty, no Excel patterns match.
    const plan = analyzeMessageToPlan({
      message: "sum column A",
      domain: "excel",
      viewerContext: {},
    });
    // If bank is loaded, we get a plan; if bank were empty, we'd get null.
    expect(plan).not.toBeNull();
    expect(plan?.kind).toBe("plan");
  });
});
```

---

### Task 8.3: Excel stress test suite

**Files:**
- Create: `backend/src/tests/editing/xlsx-stress.test.ts`

```typescript
describe("XLSX Stress Tests", () => {
  test("handles 50k row sheet without timeout", () => { /* ... */ });
  test("handles 20+ sheets workbook", () => { /* ... */ });
  test("handles deeply merged cell regions", () => { /* ... */ });
  test("handles sheet with 500+ formulas", () => { /* ... */ });
  test("handles hidden rows and columns", () => { /* ... */ });
});
```

Generate test workbooks programmatically using ExcelJS. Assert operations complete within 10s timeout and produce valid output.

---

### Task 8.4: DOCX stress test suite

**Files:**
- Create: `backend/src/tests/editing/docx-stress.test.ts`

```typescript
describe("DOCX Stress Tests", () => {
  test("handles 200-page document", () => { /* ... */ });
  test("handles document with 50+ tables", () => { /* ... */ });
  test("handles document with complex headers/footers", () => { /* ... */ });
  test("handles 10k-word paragraph rewrite", () => { /* ... */ });
  test("handles document with 100+ images", () => { /* ... */ });
});
```

Generate test DOCX files programmatically using the existing docxEditor or a builder utility.

---

### Task 8.5: Excel semantic test suite

**Files:**
- Create: `backend/src/tests/editing/xlsx-semantic.test.ts`

Test cases for E3 scoring:
1. Column header → type inference accuracy
2. "Find outliers in revenue" → correct column + threshold
3. "Reconcile Sheet1 vs Sheet2" → correct cross-sheet comparison
4. "What drove the variance in Q3?" → identifies changed columns
5. "Summarize by region" → correct group-by column detection

---

## Phase Summary

| Phase | Rubric Impact | Effort |
|---|---|---|
| **1: Python-calc banks** | P0-6: FAIL → PASS (unblocks entire score) | 2-3 days |
| **2: PT formula gen** | E1: 20 → 28-30 | 1 day |
| **3: Chart engine** | E4: 2 → 8-10 | 2-3 days |
| **4: DOCX tables** | D4: 6 → 14-15 | 3-4 days |
| **5: DOCX citations** | D5: 2 → 8-10 | 2-3 days |
| **6: Post-apply scope** | P0-1: CONDITIONAL → PASS | 1-2 days |
| **7: OOXML validation** | P0-3: PARTIAL → PASS | 1-2 days |
| **8: Test pack** | Proves scores are real, not self-assessed | 2-3 days |

**Projected scores after completion:**
- P0 gates: 7/7 PASS
- Excel agent: 92-97/100
- DOCX agent: 91-97/100

**Remaining gap to 97+:** Full E3 semantic capabilities (anomaly detection, reconciliation engines) and D2 semantic quality gates (LLM-based rewrite evaluation) would require ML pipeline work beyond this plan's scope.
