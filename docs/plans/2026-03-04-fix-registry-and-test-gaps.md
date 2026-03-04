# Fix Operator Registry & Strengthen Test Gaps — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the D-grade operator canonical registry (wrong alias mappings, case collisions, missing operators, false-green tests) and close the moderate test gaps found in Tasks 1-2 priority alignment.

**Architecture:** The registry maps 3 tiers of operator naming: (1) routing-level canonical IDs from `intent_config.operatorsAllowed`, (2) detection-level generic names from `collision_matrix.when.operators`, and (3) Allybi-level `DOCX_*/XLSX_*` implementation operators from the allybi banks. Alias mappings must agree with the runtime `runtimeFromAllybiCanonical()` in `editOperatorAliases.service.ts`. The `COMPUTE` (editing, uppercase) vs `compute` (documents, lowercase) distinction is real and case-sensitive — the test must use case-sensitive matching.

**Tech Stack:** TypeScript, Jest, JSON data banks

---

## Phase A: Rebuild Operator Registry

### Task 1: Rewrite cert test with uniqueness + case-sensitivity checks

**Files:**
- Modify: `backend/src/tests/certification/operator-registry-alignment.cert.test.ts`

**Step 1: Write the new test file**

Replace the entire file with:

```ts
// backend/src/tests/certification/operator-registry-alignment.cert.test.ts
import * as fs from "fs";
import * as path from "path";
import { describe, expect, test } from "@jest/globals";

function readJson(rel: string) {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../data_banks", rel), "utf8"));
}

describe("operator-registry-alignment", () => {
  const registry = readJson("operators/operator_canonical_registry.any.json");
  const collisionMatrix = readJson("operators/operator_collision_matrix.any.json");
  const intentConfig = readJson("routing/intent_config.any.json");

  // Build CASE-SENSITIVE lookup: id/alias → canonicalId
  const reverseMap = new Map<string, string>();
  for (const op of registry.operators) {
    reverseMap.set(op.canonicalId, op.canonicalId);
    for (const alias of op.aliases) {
      reverseMap.set(alias, op.canonicalId);
    }
  }

  test("registry exists with valid structure", () => {
    expect(registry._meta.id).toBe("operator_canonical_registry");
    expect(Array.isArray(registry.operators)).toBe(true);
    expect(registry.operators.length).toBeGreaterThan(0);
    for (const op of registry.operators) {
      expect(op.canonicalId).toBeTruthy();
      expect(op.family).toBeTruthy();
      expect(Array.isArray(op.aliases)).toBe(true);
    }
  });

  test("no duplicate canonicalIds (case-sensitive)", () => {
    const seen = new Map<string, number>();
    const dupes: string[] = [];
    for (const op of registry.operators) {
      const count = (seen.get(op.canonicalId) || 0) + 1;
      seen.set(op.canonicalId, count);
      if (count > 1) dupes.push(op.canonicalId);
    }
    expect(dupes).toEqual([]);
  });

  test("no alias appears under multiple canonicalIds", () => {
    const aliasOwner = new Map<string, string>();
    const conflicts: string[] = [];
    for (const op of registry.operators) {
      for (const alias of op.aliases) {
        const existing = aliasOwner.get(alias);
        if (existing && existing !== op.canonicalId) {
          conflicts.push(`"${alias}" claimed by both "${existing}" and "${op.canonicalId}"`);
        }
        aliasOwner.set(alias, op.canonicalId);
      }
    }
    expect(conflicts).toEqual([]);
  });

  test("no alias collides with a different canonicalId (case-sensitive)", () => {
    const canonicalIds = new Set(registry.operators.map((op: any) => op.canonicalId));
    const conflicts: string[] = [];
    for (const op of registry.operators) {
      for (const alias of op.aliases) {
        if (canonicalIds.has(alias) && alias !== op.canonicalId) {
          conflicts.push(`alias "${alias}" of "${op.canonicalId}" collides with canonicalId "${alias}"`);
        }
      }
    }
    expect(conflicts).toEqual([]);
  });

  test("collision matrix operators all resolve in registry (case-sensitive)", () => {
    const missing: string[] = [];
    for (const rule of collisionMatrix.rules) {
      for (const opRef of rule.when.operators || []) {
        if (!reverseMap.has(opRef)) {
          missing.push(`${rule.id}: "${opRef}"`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  test("intent_config operatorsAllowed all resolve in registry (case-sensitive)", () => {
    const missing: string[] = [];
    for (const family of intentConfig.intentFamilies) {
      for (const opId of family.operatorsAllowed || []) {
        if (!reverseMap.has(opId)) {
          missing.push(`${family.id}: "${opId}"`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  test("Allybi alias mappings agree with runtime runtimeFromAllybiCanonical()", () => {
    // These mappings come from editOperatorAliases.service.ts:runtimeFromAllybiCanonical()
    const RUNTIME_TRUTH: Record<string, string> = {
      "DOCX_REPLACE_SPAN": "EDIT_SPAN",
      "DOCX_REWRITE_PARAGRAPH": "EDIT_PARAGRAPH",
      "DOCX_INSERT_AFTER": "ADD_PARAGRAPH",
      "DOCX_INSERT_BEFORE": "ADD_PARAGRAPH",
      // All other DOCX_* → EDIT_DOCX_BUNDLE
      "DOCX_REWRITE_SECTION": "EDIT_DOCX_BUNDLE",
      "DOCX_DELETE_PARAGRAPH": "EDIT_DOCX_BUNDLE",
      "DOCX_SET_RUN_STYLE": "EDIT_DOCX_BUNDLE",
      "DOCX_MERGE_PARAGRAPHS": "EDIT_DOCX_BUNDLE",
      "DOCX_SPLIT_PARAGRAPH": "EDIT_DOCX_BUNDLE",
      "DOCX_FIND_REPLACE": "EDIT_DOCX_BUNDLE",
      "XLSX_SET_CELL_VALUE": "EDIT_CELL",
      "XLSX_SET_RANGE_VALUES": "EDIT_RANGE",
      "XLSX_CHART_CREATE": "CREATE_CHART",
      "XLSX_CHART_SET_SERIES": "CREATE_CHART",
      "XLSX_CHART_SET_TITLES": "CREATE_CHART",
      // All other XLSX_* → COMPUTE_BUNDLE
      "XLSX_SET_CELL_FORMULA": "COMPUTE_BUNDLE",
      "XLSX_FORMAT_RANGE": "COMPUTE_BUNDLE",
      "XLSX_MERGE_CELLS": "COMPUTE_BUNDLE",
    };
    const mismatches: string[] = [];
    for (const [alias, expectedCanonical] of Object.entries(RUNTIME_TRUTH)) {
      const actual = reverseMap.get(alias);
      if (actual !== expectedCanonical) {
        mismatches.push(`${alias}: expected → ${expectedCanonical}, registry says → ${actual || "MISSING"}`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx jest --testPathPatterns="operator-registry-alignment" --no-coverage`
Expected: FAIL — multiple failures:
- `DOCX_DELETE_PARAGRAPH` dual-alias conflict
- `DOCX_REWRITE_SECTION` mapped to `EDIT_PARAGRAPH` but runtime says `EDIT_DOCX_BUNDLE`
- `DOCX_SET_RUN_STYLE` mapped to `EDIT_SPAN` but runtime says `EDIT_DOCX_BUNDLE`
- `XLSX_SET_CELL_FORMULA`, `XLSX_FORMAT_RANGE` mapped to `EDIT_RANGE` but runtime says `COMPUTE_BUNDLE`
- `XLSX_CHART_SET_SERIES`, `XLSX_CHART_SET_TITLES` mapped to `chart_update` but runtime says `CREATE_CHART`
- `XLSX_MERGE_CELLS` mapped to `merge_cells` (editing) but runtime says `COMPUTE_BUNDLE`

**Step 3: (No implementation yet — test only. Commit.)**

```bash
git add backend/src/tests/certification/operator-registry-alignment.cert.test.ts
git commit -m "test(routing): rewrite operator registry cert test — add uniqueness, case-sensitivity, runtime agreement checks"
```

---

### Task 2: Rebuild operator_canonical_registry.any.json with correct mappings

**Files:**
- Modify: `backend/src/data_banks/operators/operator_canonical_registry.any.json`

**Step 1: Replace the entire operators array**

The canonical IDs are the routing-level operators from `intent_config.operatorsAllowed`. The aliases are:
- Detection-level generic names from `collision_matrix.when.operators`
- Allybi-level `DOCX_*/XLSX_*` names, mapped per `runtimeFromAllybiCanonical()` in `editOperatorAliases.service.ts`

Key rules for correct mapping:
- `DOCX_REPLACE_SPAN` → `EDIT_SPAN` (only this one)
- `DOCX_REWRITE_PARAGRAPH` → `EDIT_PARAGRAPH` (only this one)
- `DOCX_INSERT_AFTER`, `DOCX_INSERT_BEFORE` → `ADD_PARAGRAPH`
- ALL other `DOCX_*` → `EDIT_DOCX_BUNDLE` (including DOCX_REWRITE_SECTION, DOCX_DELETE_PARAGRAPH, DOCX_SET_RUN_STYLE)
- `XLSX_SET_CELL_VALUE` → `EDIT_CELL`
- `XLSX_SET_RANGE_VALUES` → `EDIT_RANGE`
- `XLSX_ADD_SHEET` → `ADD_SHEET`
- `XLSX_RENAME_SHEET` → `RENAME_SHEET`
- `XLSX_CHART_*` → `CREATE_CHART` (all chart ops)
- ALL other `XLSX_*` → `COMPUTE_BUNDLE`
- `COMPUTE` (uppercase) is editing family — NOT the same as `compute` (lowercase, documents family)
- Collision matrix generic names like `replace_text`, `insert_paragraph` → `EDIT_DOCX_BUNDLE` (per runtime token matching)
- Collision matrix generic names like `set_cell` → `EDIT_CELL`
- Collision matrix generic names like `insert_row`, `delete_row`, `add_column`, `delete_column`, `merge_cells` → `COMPUTE_BUNDLE` (per runtime: these are sheets operations)
- Collision matrix `insert_chart`, `create_chart` → `CREATE_CHART`
- Collision matrix `chart_update` → `CREATE_CHART`
- Collision matrix `python_calc`, `excel_formula` → `COMPUTE_BUNDLE` (per runtime token matching: "compute"/"sort"/"filter"/"format" tokens → COMPUTE_BUNDLE)
- Collision matrix `slide_insert` → `ADD_SLIDE`
- Collision matrix `slide_delete`, `slide_duplicate` → `REWRITE_SLIDE_TEXT` (fallback for slides domain)
- Collision matrix `delete_paragraph` → `EDIT_DOCX_BUNDLE` (per runtime: DOCX_DELETE_PARAGRAPH → EDIT_DOCX_BUNDLE)

Replace the full file content:

```json
{
  "_meta": {
    "id": "operator_canonical_registry",
    "version": "2.0.0",
    "description": "Single source of truth for operator identity. Maps detection-level names (collision_matrix, file_action_operators) and Allybi-level names (DOCX_*, XLSX_*) to routing-level canonical IDs (intent_config.operatorsAllowed). Allybi mappings must agree with editOperatorAliases.service.ts:runtimeFromAllybiCanonical().",
    "languages": ["any"],
    "lastUpdated": "2026-03-04",
    "owner": "data-bank-governance",
    "usedBy": ["services/core/banks/dataBankLoader.service.ts"],
    "tests": ["tests/certification/operator-registry-alignment.cert.test.ts"]
  },
  "config": { "enabled": true },
  "operators": [
    {
      "canonicalId": "EDIT_PARAGRAPH",
      "family": "editing",
      "aliases": ["DOCX_REWRITE_PARAGRAPH"]
    },
    {
      "canonicalId": "EDIT_SPAN",
      "family": "editing",
      "aliases": ["DOCX_REPLACE_SPAN"]
    },
    {
      "canonicalId": "ADD_PARAGRAPH",
      "family": "editing",
      "aliases": ["DOCX_INSERT_AFTER", "DOCX_INSERT_BEFORE"]
    },
    {
      "canonicalId": "EDIT_DOCX_BUNDLE",
      "family": "editing",
      "aliases": [
        "DOCX_REWRITE_SECTION", "DOCX_DELETE_PARAGRAPH", "DOCX_SET_RUN_STYLE",
        "DOCX_CLEAR_RUN_STYLE", "DOCX_MERGE_PARAGRAPHS", "DOCX_SPLIT_PARAGRAPH",
        "DOCX_SET_PARAGRAPH_STYLE", "DOCX_SET_ALIGNMENT", "DOCX_SET_INDENTATION",
        "DOCX_SET_LINE_SPACING", "DOCX_SET_PARAGRAPH_SPACING",
        "DOCX_LIST_APPLY_BULLETS", "DOCX_LIST_APPLY_NUMBERING", "DOCX_LIST_REMOVE",
        "DOCX_LIST_PROMOTE_DEMOTE", "DOCX_LIST_RESTART_NUMBERING", "DOCX_NUMBERING_REPAIR",
        "DOCX_TRANSLATE_SCOPE", "DOCX_FIND_REPLACE", "DOCX_UPDATE_TOC",
        "DOCX_CREATE_TABLE", "DOCX_ADD_TABLE_ROW", "DOCX_DELETE_TABLE_ROW",
        "DOCX_SET_TABLE_CELL", "DOCX_PAGE_BREAK", "DOCX_SECTION_BREAK",
        "DOCX_ENRICH_FROM_SOURCES", "DOCX_SET_HEADING_LEVEL", "DOCX_SET_TEXT_CASE",
        "DOCX_GET_TARGETS", "DOCX_LOCK_TARGETS", "DOCX_CLEAR_LOCK",
        "replace_text", "insert_paragraph", "delete_paragraph"
      ]
    },
    {
      "canonicalId": "EDIT_CELL",
      "family": "editing",
      "aliases": ["XLSX_SET_CELL_VALUE", "set_cell"]
    },
    {
      "canonicalId": "EDIT_RANGE",
      "family": "editing",
      "aliases": ["XLSX_SET_RANGE_VALUES", "XLSX_FILL_DOWN", "XLSX_FILL_RIGHT", "XLSX_FILL_SERIES",
        "XLSX_WRAP_TEXT", "XLSX_AUTO_FIT", "XLSX_COND_FORMAT_DATA_BARS",
        "XLSX_COND_FORMAT_COLOR_SCALE", "XLSX_COND_FORMAT_TOP_N",
        "XLSX_HIDE_ROWS_COLS", "XLSX_SHOW_ROWS_COLS"]
    },
    {
      "canonicalId": "ADD_SHEET",
      "family": "editing",
      "aliases": ["XLSX_ADD_SHEET"]
    },
    {
      "canonicalId": "RENAME_SHEET",
      "family": "editing",
      "aliases": ["XLSX_RENAME_SHEET"]
    },
    {
      "canonicalId": "DELETE_SHEET",
      "family": "editing",
      "aliases": []
    },
    {
      "canonicalId": "CREATE_CHART",
      "family": "editing",
      "aliases": ["XLSX_CHART_CREATE", "XLSX_CHART_SET_SERIES", "XLSX_CHART_SET_TITLES",
        "XLSX_CHART_SET_AXES", "XLSX_CHART_MOVE_RESIZE", "XLSX_CHART_DELETE",
        "insert_chart", "create_chart", "chart_update"]
    },
    {
      "canonicalId": "COMPUTE",
      "family": "editing",
      "aliases": ["XLSX_REMOVE_DUPLICATES", "XLSX_TRIM_WHITESPACE",
        "XLSX_NORMALIZE_VALUES", "XLSX_SET_PROTECTION", "XLSX_LOCK_CELLS"]
    },
    {
      "canonicalId": "COMPUTE_BUNDLE",
      "family": "editing",
      "aliases": ["XLSX_SET_CELL_FORMULA", "XLSX_SET_RANGE_FORMULAS", "XLSX_FORMAT_RANGE",
        "XLSX_SET_NUMBER_FORMAT", "XLSX_SORT_RANGE", "XLSX_FILTER_APPLY",
        "XLSX_FILTER_CLEAR", "XLSX_TABLE_CREATE", "XLSX_DATA_VALIDATION_SET",
        "XLSX_FREEZE_PANES", "XLSX_MERGE_CELLS",
        "python_calc", "excel_formula",
        "insert_row", "delete_row", "add_column", "delete_column", "merge_cells"]
    },
    {
      "canonicalId": "PY_COMPUTE",
      "family": "editing",
      "aliases": []
    },
    {
      "canonicalId": "PY_CHART",
      "family": "editing",
      "aliases": []
    },
    {
      "canonicalId": "PY_WRITEBACK",
      "family": "editing",
      "aliases": []
    },
    {
      "canonicalId": "ADD_SLIDE",
      "family": "editing",
      "aliases": ["slide_insert"]
    },
    {
      "canonicalId": "REWRITE_SLIDE_TEXT",
      "family": "editing",
      "aliases": ["slide_delete", "slide_duplicate"]
    },
    {
      "canonicalId": "REPLACE_SLIDE_IMAGE",
      "family": "editing",
      "aliases": []
    },
    {
      "canonicalId": "open",
      "family": "file_actions",
      "aliases": ["file_open"]
    },
    {
      "canonicalId": "list",
      "family": "file_actions",
      "aliases": []
    },
    {
      "canonicalId": "filter",
      "family": "file_actions",
      "aliases": []
    },
    {
      "canonicalId": "sort",
      "family": "file_actions",
      "aliases": []
    },
    {
      "canonicalId": "group",
      "family": "file_actions",
      "aliases": []
    },
    {
      "canonicalId": "locate_file",
      "family": "file_actions",
      "aliases": []
    },
    {
      "canonicalId": "count_files",
      "family": "file_actions",
      "aliases": []
    },
    {
      "canonicalId": "file_move",
      "family": "file_actions",
      "aliases": ["file_bulk_move", "file_multi_move"]
    },
    {
      "canonicalId": "file_delete",
      "family": "file_actions",
      "aliases": ["file_bulk_delete"]
    },
    {
      "canonicalId": "file_copy",
      "family": "file_actions",
      "aliases": ["file_bulk_copy"]
    },
    {
      "canonicalId": "file_rename",
      "family": "file_actions",
      "aliases": []
    },
    {
      "canonicalId": "folder_create",
      "family": "file_actions",
      "aliases": []
    },
    {
      "canonicalId": "folder_move",
      "family": "file_actions",
      "aliases": []
    },
    {
      "canonicalId": "folder_delete",
      "family": "file_actions",
      "aliases": []
    },
    {
      "canonicalId": "folder_rename",
      "family": "file_actions",
      "aliases": []
    },
    {
      "canonicalId": "undo",
      "family": "file_actions",
      "aliases": []
    },
    {
      "canonicalId": "summarize",
      "family": "documents",
      "aliases": []
    },
    {
      "canonicalId": "extract",
      "family": "documents",
      "aliases": []
    },
    {
      "canonicalId": "quote",
      "family": "documents",
      "aliases": []
    },
    {
      "canonicalId": "compare",
      "family": "documents",
      "aliases": []
    },
    {
      "canonicalId": "compute",
      "family": "documents",
      "aliases": []
    },
    {
      "canonicalId": "locate_content",
      "family": "documents",
      "aliases": []
    },
    {
      "canonicalId": "locate_docs",
      "family": "documents",
      "aliases": []
    },
    {
      "canonicalId": "set_active_doc",
      "family": "documents",
      "aliases": []
    },
    {
      "canonicalId": "CONNECT_START",
      "family": "connectors",
      "aliases": []
    },
    {
      "canonicalId": "CONNECTOR_SYNC",
      "family": "connectors",
      "aliases": []
    },
    {
      "canonicalId": "CONNECTOR_SEARCH",
      "family": "connectors",
      "aliases": []
    },
    {
      "canonicalId": "CONNECTOR_STATUS",
      "family": "connectors",
      "aliases": []
    },
    {
      "canonicalId": "CONNECTOR_DISCONNECT",
      "family": "connectors",
      "aliases": []
    },
    {
      "canonicalId": "EMAIL_LATEST",
      "family": "email",
      "aliases": []
    },
    {
      "canonicalId": "EMAIL_EXPLAIN_LATEST",
      "family": "email",
      "aliases": []
    },
    {
      "canonicalId": "EMAIL_SUMMARIZE_PREVIOUS",
      "family": "email",
      "aliases": []
    },
    {
      "canonicalId": "EMAIL_DRAFT",
      "family": "email",
      "aliases": []
    },
    {
      "canonicalId": "EMAIL_SEND",
      "family": "email",
      "aliases": []
    },
    {
      "canonicalId": "EMAIL_DOC_FUSION",
      "family": "email",
      "aliases": []
    },
    {
      "canonicalId": "count_pages",
      "family": "doc_stats",
      "aliases": []
    },
    {
      "canonicalId": "count_slides",
      "family": "doc_stats",
      "aliases": []
    },
    {
      "canonicalId": "count_sheets",
      "family": "doc_stats",
      "aliases": []
    },
    {
      "canonicalId": "capabilities",
      "family": "help",
      "aliases": []
    },
    {
      "canonicalId": "how_to",
      "family": "help",
      "aliases": []
    },
    {
      "canonicalId": "greeting",
      "family": "conversation",
      "aliases": []
    },
    {
      "canonicalId": "thanks",
      "family": "conversation",
      "aliases": []
    },
    {
      "canonicalId": "goodbye",
      "family": "conversation",
      "aliases": []
    },
    {
      "canonicalId": "ack",
      "family": "conversation",
      "aliases": []
    },
    {
      "canonicalId": "error",
      "family": "error",
      "aliases": []
    }
  ]
}
```

Key changes vs v1.0.0:
- **DOCX_REWRITE_SECTION** → moved from EDIT_PARAGRAPH to EDIT_DOCX_BUNDLE (matches runtime)
- **DOCX_DELETE_PARAGRAPH** → moved from ADD_PARAGRAPH to EDIT_DOCX_BUNDLE (matches runtime; removed dual-alias)
- **DOCX_SET_RUN_STYLE** → moved from EDIT_SPAN to EDIT_DOCX_BUNDLE (matches runtime)
- **XLSX_SET_CELL_FORMULA, XLSX_FORMAT_RANGE** → moved from EDIT_RANGE to COMPUTE_BUNDLE (matches runtime)
- **XLSX_CHART_SET_SERIES, XLSX_CHART_SET_TITLES** → moved from chart_update to CREATE_CHART (matches runtime)
- **XLSX_MERGE_CELLS** → moved from merge_cells to COMPUTE_BUNDLE (matches runtime)
- **Added 55+ missing DOCX_/XLSX_ operators** as aliases of their correct runtime canonical
- **Added missing detection-level operators**: undo, folder_rename
- **Removed phantom entries**: delete_paragraph (now alias of EDIT_DOCX_BUNDLE), chart_update (now alias of CREATE_CHART)
- **Collision matrix generic names remapped**: insert_row/delete_row/add_column/delete_column/merge_cells → COMPUTE_BUNDLE; replace_text/insert_paragraph/delete_paragraph → EDIT_DOCX_BUNDLE; python_calc/excel_formula → COMPUTE_BUNDLE; slide_delete/slide_duplicate → REWRITE_SLIDE_TEXT
- **`COMPUTE` (uppercase, editing)** has only XLSX_REMOVE_DUPLICATES etc. as aliases — NOT `python_calc`/`excel_formula` (those → COMPUTE_BUNDLE per runtime)
- **`compute` (lowercase, documents)** stays separate with no aliases — case-sensitive distinction preserved

**Step 2: Run test to verify it passes**

Run: `cd backend && npx jest --testPathPatterns="operator-registry-alignment" --no-coverage`
Expected: PASS — all 7 tests including uniqueness + runtime agreement

**Step 3: Run existing tests to check for regressions**

Run: `cd backend && npx jest --testPathPatterns="(patternWiringProof|patternCollision|routing-priority)" --no-coverage`
Expected: PASS

**Step 4: Commit**

```bash
git add backend/src/data_banks/operators/operator_canonical_registry.any.json
git commit -m "fix(routing): rebuild operator registry v2 — fix 16 issues: case collisions, wrong Allybi mappings, 55 missing operators"
```

---

## Phase B: Strengthen Priority Alignment Tests

### Task 3: Add numeric priority agreement test

**Files:**
- Modify: `backend/src/tests/certification/routing-priority-alignment.cert.test.ts`

**Step 1: Add the failing test**

Add after the existing tests:

```ts
test("numeric priority values match across routing_priority, intent_config, and operator_families", () => {
  const mismatches: string[] = [];
  for (const [familyId, rpPriority] of Object.entries(routingPriority.intentFamilyBasePriority) as [string, number][]) {
    // Check intent_config
    const icFamily = (intentConfig.intentFamilies as any[]).find((f: any) => f.id === familyId);
    if (icFamily && icFamily.priority !== rpPriority) {
      mismatches.push(`${familyId}: routing_priority=${rpPriority}, intent_config=${icFamily.priority}`);
    }
    // Check operator_families (map intentFamily back to family)
    const ofFamily = (operatorFamilies.families as any[]).find(
      (f: any) => (f.intentFamily || f.id) === familyId && f.id !== "doc_discovery"
    );
    if (ofFamily && ofFamily.priority !== rpPriority) {
      mismatches.push(`${familyId}: routing_priority=${rpPriority}, operator_families=${ofFamily.priority}`);
    }
  }
  expect(mismatches).toEqual([]);
});
```

**Step 2: Run test to verify it passes** (values are currently aligned)

Run: `cd backend && npx jest --testPathPatterns="routing-priority-alignment" --no-coverage`
Expected: PASS

**Step 3: Commit**

```bash
git add backend/src/tests/certification/routing-priority-alignment.cert.test.ts
git commit -m "test(routing): add numeric priority agreement check across all 3 config files"
```

---

### Task 4: Add operator-level priority guard for intent_patterns

**Files:**
- Modify: `backend/src/tests/certification/routing-priority-alignment.cert.test.ts`

**Step 1: Add the failing test**

Add after the existing tests:

```ts
test("intent_patterns operators all have numeric priority (guard against accidental removal)", () => {
  const intentPatterns = readJson("routing/intent_patterns.any.json");
  const operators = intentPatterns.operators || {};
  const missing: string[] = [];
  for (const [id, def] of Object.entries(operators) as [string, any][]) {
    if (id.startsWith("_")) continue;
    if (typeof def.priority !== "number") {
      missing.push(id);
    }
  }
  expect(missing).toEqual([]);
});
```

**Step 2: Run test to verify it passes**

Run: `cd backend && npx jest --testPathPatterns="routing-priority-alignment" --no-coverage`
Expected: PASS (all 24 operators currently have numeric priorities)

**Step 3: Commit**

```bash
git add backend/src/tests/certification/routing-priority-alignment.cert.test.ts
git commit -m "test(routing): add guard ensuring intent_patterns operator priorities are never accidentally removed"
```

---

## Verification

After all tasks complete, run:

```bash
# All new certification tests
cd backend && npx jest --testPathPatterns="(operator-registry-alignment|routing-priority-alignment)" --no-coverage

# Existing gates must still pass
npx jest --testPathPatterns="(patternWiringProof|patternCollision|patternParity|patternDeterminism)" --no-coverage
```

Expected: ALL PASS, zero regressions.

---

## Summary: 4 tasks across 2 phases

| Phase | Tasks | What it fixes |
|-------|-------|---------------|
| A. Rebuild Registry | 1-2 | All 16 audit issues: case collisions, wrong Allybi mappings, 55 missing operators, dual-alias conflicts, false-green tests |
| B. Priority Tests | 3-4 | 2 moderate test gaps: numeric agreement not enforced, operator priority removal not guarded |
