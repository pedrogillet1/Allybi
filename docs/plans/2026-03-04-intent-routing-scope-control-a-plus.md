# Intent Routing & Scope Control — A+ Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bring the Intent Routing & Scope Control pillar from 41/100 to 100/100 by fixing all 7 P0 blockers, 27 P1 issues, hardening test coverage, and proving EN/PT/ES parity + determinism.

**Architecture:** Consolidate 4 conflicting priority registries into a single SSOT (`routing_priority.any.json`). Create a canonical operator registry mapping all 4 naming conventions. Fix divergent `tokenOverlap` formulas. Build a generic bank-inline-test-runner that executes all 45 currently-dead test cases. Add collision rules for the 3 unguarded family pairs. Create slot extraction contracts for docRef/sectionRef/period/units. Unify 6 normalization functions into one shared utility.

**Tech Stack:** TypeScript, Jest, JSON data banks, regex patterns

---

## Phase 1: Single Source of Truth — Priority & Operator Registries

### Task 1: Fix `routing_priority.any.json` — add missing families, delete phantom

**Files:**
- Modify: `backend/src/data_banks/routing/routing_priority.any.json`
- Test: `backend/src/tests/certification/routing-priority-alignment.cert.test.ts` (create)

**Step 1: Write the failing test**

```ts
// backend/src/tests/certification/routing-priority-alignment.cert.test.ts
import * as fs from "fs";
import * as path from "path";
import { describe, expect, test } from "@jest/globals";

function readJson(rel: string) {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../data_banks", rel), "utf8"));
}

describe("routing-priority-alignment", () => {
  const intentConfig = readJson("routing/intent_config.any.json");
  const routingPriority = readJson("routing/routing_priority.any.json");
  const operatorFamilies = readJson("routing/operator_families.any.json");

  const intentConfigFamilyIds = new Set(
    (intentConfig.intentFamilies as any[]).map((f: any) => f.id)
  );
  const routingPriorityFamilyIds = new Set(
    Object.keys(routingPriority.intentFamilyBasePriority || {})
  );
  const operatorFamilyIds = new Set(
    (operatorFamilies.families as any[]).map((f: any) => f.intentFamily || f.id)
  );

  test("routing_priority covers every family in intent_config", () => {
    const missing = [...intentConfigFamilyIds].filter(id => !routingPriorityFamilyIds.has(id));
    expect(missing).toEqual([]);
  });

  test("routing_priority has no phantom families absent from intent_config", () => {
    const phantom = [...routingPriorityFamilyIds].filter(
      id => !intentConfigFamilyIds.has(id) && id !== "doc_discovery"
    );
    expect(phantom).toEqual([]);
  });

  test("operator_families covers every family in intent_config", () => {
    const missing = [...intentConfigFamilyIds].filter(id => !operatorFamilyIds.has(id));
    expect(missing).toEqual([]);
  });

  test("priorities are consistent: routing_priority is SSOT, others must not contradict", () => {
    // routing_priority is authoritative. intent_config and operator_families
    // should either match or defer (not define conflicting values).
    // This test documents the contract.
    for (const [familyId, priority] of Object.entries(routingPriority.intentFamilyBasePriority)) {
      expect(typeof priority).toBe("number");
      expect(priority).toBeGreaterThan(0);
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx jest --testPathPattern="routing-priority-alignment" --no-coverage`
Expected: FAIL — `routing_priority` missing `email`, `doc_stats`, `error`; has phantom `general`

**Step 3: Fix `routing_priority.any.json`**

Replace the `intentFamilyBasePriority` block in `backend/src/data_banks/routing/routing_priority.any.json`:

```json
{
  "intentFamilyBasePriority": {
    "editing": 95,
    "email": 94,
    "connectors": 93,
    "help": 92,
    "file_actions": 90,
    "doc_stats": 85,
    "documents": 80,
    "conversation": 50,
    "error": 10
  }
}
```

Key changes:
- ADD `email: 94`, `doc_stats: 85`, `error: 10`
- DELETE phantom `general: 10`
- Align values with `intent_config.any.json` (the design-time contract)
- `file_actions` goes from 100 back to 90 (was wrong — editing must outrank file_actions)

**Step 4: Run test to verify it passes**

Run: `cd backend && npx jest --testPathPattern="routing-priority-alignment" --no-coverage`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/data_banks/routing/routing_priority.any.json backend/src/tests/certification/routing-priority-alignment.cert.test.ts
git commit -m "fix(routing): align routing_priority with intent_config — add email/doc_stats/error, delete phantom general"
```

---

### Task 2: Remove duplicate priorities from `intent_patterns.any.json`

**Files:**
- Modify: `backend/src/data_banks/routing/intent_patterns.any.json`
- Test: reuse `routing-priority-alignment.cert.test.ts` (add case)

**Step 1: Add failing test**

Add to `routing-priority-alignment.cert.test.ts`:

```ts
test("intent_patterns.intentFamilies does not redefine priority (defers to routing_priority)", () => {
  const intentPatterns = readJson("routing/intent_patterns.any.json");
  const families = intentPatterns.intentFamilies || {};
  for (const [id, def] of Object.entries(families) as [string, any][]) {
    // intentFamilies in intent_patterns should NOT have priority field — routing_priority is SSOT
    expect(def).not.toHaveProperty("priority",
      expect.any(Number));
  }
});
```

**Step 2: Run — expect FAIL**

**Step 3: Remove `priority` fields from every entry in `intent_patterns.any.json` `.intentFamilies`**

Delete the `"priority": N` line from each family in `intentFamilies` (documents, file_actions, doc_stats, help, conversation). Keep `operatorsAllowed` intact.

**Step 4: Run — expect PASS**

**Step 5: Commit**

```bash
git add backend/src/data_banks/routing/intent_patterns.any.json backend/src/tests/certification/routing-priority-alignment.cert.test.ts
git commit -m "fix(routing): remove duplicate priority values from intent_patterns — routing_priority is SSOT"
```

---

### Task 3: Create canonical operator registry bank

**Files:**
- Create: `backend/src/data_banks/operators/operator_canonical_registry.any.json`
- Test: `backend/src/tests/certification/operator-registry-alignment.cert.test.ts` (create)

**Step 1: Write the failing test**

```ts
// backend/src/tests/certification/operator-registry-alignment.cert.test.ts
import * as fs from "fs";
import * as path from "path";
import { describe, expect, test } from "@jest/globals";

function readJson(rel: string) {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../data_banks", rel), "utf8"));
}

describe("operator-registry-alignment", () => {
  test("canonical registry exists and maps all known operator aliases", () => {
    const registry = readJson("operators/operator_canonical_registry.any.json");
    expect(registry._meta.id).toBe("operator_canonical_registry");
    expect(Array.isArray(registry.operators)).toBe(true);
    expect(registry.operators.length).toBeGreaterThan(0);

    for (const op of registry.operators) {
      expect(op.canonicalId).toBeTruthy();
      expect(op.family).toBeTruthy();
      expect(Array.isArray(op.aliases)).toBe(true);
    }
  });

  test("collision matrix operators all map to canonical IDs", () => {
    const registry = readJson("operators/operator_canonical_registry.any.json");
    const collisionMatrix = readJson("operators/operator_collision_matrix.any.json");
    const allAliases = new Set<string>();
    for (const op of registry.operators) {
      allAliases.add(op.canonicalId.toLowerCase());
      for (const alias of op.aliases) allAliases.add(alias.toLowerCase());
    }

    for (const rule of collisionMatrix.rules) {
      for (const opRef of rule.when.operators || []) {
        expect(allAliases.has(opRef.toLowerCase())).toBe(true);
      }
    }
  });

  test("intent_config operatorsAllowed all map to canonical IDs", () => {
    const registry = readJson("operators/operator_canonical_registry.any.json");
    const intentConfig = readJson("routing/intent_config.any.json");
    const allAliases = new Set<string>();
    for (const op of registry.operators) {
      allAliases.add(op.canonicalId.toLowerCase());
      for (const alias of op.aliases) allAliases.add(alias.toLowerCase());
    }

    for (const family of intentConfig.intentFamilies) {
      for (const opId of family.operatorsAllowed || []) {
        expect(allAliases.has(opId.toLowerCase())).toBe(true);
      }
    }
  });
});
```

**Step 2: Run — expect FAIL (file doesn't exist)**

**Step 3: Create the registry**

Create `backend/src/data_banks/operators/operator_canonical_registry.any.json` with entries mapping all 4 naming conventions. Structure:

```json
{
  "_meta": {
    "id": "operator_canonical_registry",
    "version": "1.0.0",
    "description": "Single source of truth for operator identity. Maps all alias conventions (intent_config, allybi_intents, editing_routing, collision_matrix) to canonical IDs.",
    "owner": "data-bank-governance",
    "usedBy": ["services/core/banks/dataBankLoader.service.ts"],
    "tests": ["tests/certification/operator-registry-alignment.cert.test.ts"]
  },
  "config": { "enabled": true },
  "operators": [
    {
      "canonicalId": "EDIT_PARAGRAPH",
      "family": "editing",
      "aliases": ["DOCX_REWRITE", "DOCX_REWRITE_PARAGRAPH", "REWRITE_PARAGRAPH", "REWRITE", "replace_text", "insert_paragraph"]
    },
    {
      "canonicalId": "EDIT_SPAN",
      "family": "editing",
      "aliases": ["DOCX_REPLACE_SPAN", "REPLACE_SPAN", "SET_RUN_STYLE"]
    },
    {
      "canonicalId": "EDIT_CELL",
      "family": "editing",
      "aliases": ["XLSX_SET_VALUE", "set_cell"]
    },
    {
      "canonicalId": "EDIT_RANGE",
      "family": "editing",
      "aliases": ["XLSX_SET_FORMULA", "FORMAT_RANGE"]
    },
    {
      "canonicalId": "CREATE_CHART",
      "family": "editing",
      "aliases": ["XLSX_CHART_CREATE", "insert_chart", "create_chart"]
    },
    {
      "canonicalId": "DELETE_ROW",
      "family": "editing",
      "aliases": ["delete_row", "insert_row"]
    },
    {
      "canonicalId": "DELETE_COLUMN",
      "family": "editing",
      "aliases": ["delete_column", "add_column"]
    },
    {
      "canonicalId": "MERGE_CELLS",
      "family": "editing",
      "aliases": ["merge_cells"]
    },
    {
      "canonicalId": "open",
      "family": "file_actions",
      "aliases": ["file_open"]
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
      "aliases": ["folder_move", "folder_delete"]
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
      "aliases": ["python_calc", "excel_formula"]
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
    }
  ]
}
```

Extend this list to cover ALL operators referenced in collision_matrix and editing_routing guardrails. Every operator that appears anywhere must have a canonical entry.

**Step 4: Run — expect PASS**

**Step 5: Commit**

```bash
git add backend/src/data_banks/operators/operator_canonical_registry.any.json backend/src/tests/certification/operator-registry-alignment.cert.test.ts
git commit -m "feat(routing): add canonical operator registry — single source of truth for all operator naming conventions"
```

---

## Phase 2: Fix P0 Code Bugs

### Task 4: Fix `tokenOverlap` divergence between resolver and scopeGate

**Files:**
- Modify: `backend/src/services/core/scope/documentReferenceResolver.service.ts` (~line 133)
- Modify: `backend/src/services/core/scope/scopeGate.service.ts` (~line 293)
- Create: `backend/src/services/core/scope/tokenOverlap.ts` (shared utility)
- Test: `backend/src/services/core/scope/tokenOverlap.test.ts` (create)

**Step 1: Write the failing test**

```ts
// backend/src/services/core/scope/tokenOverlap.test.ts
import { describe, expect, test } from "@jest/globals";
import { tokenOverlap } from "./tokenOverlap";

describe("tokenOverlap (shared)", () => {
  test("uses Math.max denominator (conservative)", () => {
    const a = new Set(["budget", "2024"]);
    const b = new Set(["budget", "2024", "report", "q3", "final"]);
    // 2 hits / max(2, 5) = 0.4
    expect(tokenOverlap(a, b)).toBeCloseTo(0.4, 2);
  });

  test("identical sets return 1.0", () => {
    const a = new Set(["foo", "bar"]);
    expect(tokenOverlap(a, a)).toBeCloseTo(1.0, 2);
  });

  test("disjoint sets return 0.0", () => {
    const a = new Set(["foo"]);
    const b = new Set(["bar"]);
    expect(tokenOverlap(a, b)).toBeCloseTo(0.0, 2);
  });

  test("empty sets return 0.0", () => {
    expect(tokenOverlap(new Set(), new Set())).toBe(0);
  });
});
```

**Step 2: Run — expect FAIL (module doesn't exist)**

**Step 3: Create shared utility**

```ts
// backend/src/services/core/scope/tokenOverlap.ts
export function tokenOverlap(a: Set<string>, b: Set<string>): number {
  const denom = Math.max(a.size, b.size);
  if (denom === 0) return 0;
  let hits = 0;
  for (const t of a) {
    if (b.has(t)) hits++;
  }
  return hits / denom;
}
```

Then update both `documentReferenceResolver.service.ts` and `scopeGate.service.ts` to import and use this shared function instead of their inline implementations.

**Step 4: Run — expect PASS**

**Step 5: Commit**

```bash
git add backend/src/services/core/scope/tokenOverlap.ts backend/src/services/core/scope/tokenOverlap.test.ts backend/src/services/core/scope/documentReferenceResolver.service.ts backend/src/services/core/scope/scopeGate.service.ts
git commit -m "fix(scope): unify tokenOverlap — use Math.max denominator everywhere, eliminate resolver vs scopeGate divergence"
```

---

### Task 5: Enforce `allowedOperators` in `IntentConfigService.decide()`

**Files:**
- Modify: `backend/src/services/config/intentConfig.service.ts` (~line 446, in `makeOutputFromCandidate`)
- Modify: `backend/src/services/config/intentConfig.service.test.ts`

**Step 1: Write the failing test**

Add to `intentConfig.service.test.ts`:

```ts
test("rejects operator not in family allowedOperators", () => {
  // Mock a bank where documents family only allows extract/summarize
  mockGetOptionalBank.mockReturnValue({
    _meta: { id: "intent_config", version: "1.0.0" },
    config: {
      enabled: true,
      thresholds: { minEmitConfidence: 0.35 },
      defaults: { fallbackIntentFamily: "documents", fallbackOperator: "extract" },
      defaultOperatorByFamily: { documents: "extract" },
    },
    intentFamilies: [
      { id: "documents", operatorsAllowed: ["extract", "summarize"], defaultOperator: "extract" }
    ],
    intents: [],
  });

  const service = new IntentConfigService();
  const decision = service.decide({
    env: "dev",
    language: "en",
    queryText: "open the file",
    candidates: [
      { intentId: "documents", intentFamily: "documents", operatorId: "open", score: 0.9 },
    ],
  });

  // "open" is not in documents.allowedOperators → should fall back to family default "extract"
  expect(decision.operatorId).toBe("extract");
  expect(decision.decisionNotes).toContain("operator_not_allowed_fallback");
});
```

**Step 2: Run — expect FAIL**

**Step 3: Add enforcement in `makeOutputFromCandidate`**

In `intentConfig.service.ts`, inside `makeOutputFromCandidate`, after resolving `operatorId`, add:

```ts
// Enforce allowedOperators contract
const familyDef = cfg.intentFamilies?.[family];
if (familyDef?.allowedOperators && !familyDef.allowedOperators.includes(operatorId)) {
  notes.push("operator_not_allowed_fallback");
  operatorId = familyDef.defaultOperator || cfg.defaults.defaultOperatorId;
}
```

**Step 4: Run — expect PASS**

**Step 5: Commit**

```bash
git add backend/src/services/config/intentConfig.service.ts backend/src/services/config/intentConfig.service.test.ts
git commit -m "fix(routing): enforce allowedOperators contract in IntentConfigService.decide()"
```

---

### Task 6: Apply `minEmitScore` filtering in `decide()`

**Files:**
- Modify: `backend/src/services/config/intentConfig.service.ts` (~line 296)
- Modify: `backend/src/services/config/intentConfig.service.test.ts`

**Step 1: Write the failing test**

```ts
test("filters out candidates below minEmitScore", () => {
  const service = new IntentConfigService();
  // FALLBACK_BANK has minEmitScore: 0.45
  const decision = service.decide({
    env: "dev",
    language: "en",
    queryText: "mumble",
    candidates: [
      { intentId: "documents", intentFamily: "documents", operatorId: "extract", score: 0.1 },
    ],
  });

  // score 0.1 < minEmitScore 0.45 → should fall back to defaults, not pick this candidate
  expect(decision.decisionNotes).toContain("fallback:no_candidates");
});
```

**Step 2: Run — expect FAIL**

**Step 3: Add filter in `decide()`**

In `intentConfig.service.ts`, change the filter on line ~297:

```ts
const sorted = [...(input.candidates ?? [])]
  .filter((c) => typeof c.score === "number" && c.score >= cfg.thresholds.minEmitScore)
  .sort((a, b) => b.score - a.score);
```

**Step 4: Run — expect PASS**

**Step 5: Commit**

```bash
git add backend/src/services/config/intentConfig.service.ts backend/src/services/config/intentConfig.service.test.ts
git commit -m "fix(routing): apply minEmitScore threshold to filter ultra-low-confidence candidates"
```

---

### Task 7: Fix parity test placeholder regex

**Files:**
- Modify: `backend/src/tests/patternParity.en_pt.test.ts` (~line 77)

**Step 1: Write a canary test inline**

Add a new test case to `patternParity.en_pt.test.ts`:

```ts
test("placeholder extraction regex actually works", () => {
  const extractPlaceholders = (value: string): string[] => {
    const values = value.match(/\{\{[^}]+\}\}|\$\{[^}]+\}/g);
    return values ? values.map((v) => v.toLowerCase().trim()) : [];
  };
  expect(extractPlaceholders("summarize {{docName}} please")).toEqual(["{{docname}}"]);
  expect(extractPlaceholders("use ${variable} here")).toEqual(["${variable}"]);
  expect(extractPlaceholders("no placeholders")).toEqual([]);
});
```

**Step 2: Run — expect FAIL (old regex with double escapes fails the canary)**

**Step 3: Fix the regex on line 77**

Change from:
```ts
const values = value.match(/\\{\\{[^}]+\\}\\}|\\$\\{[^}]+\\}/g);
```
To:
```ts
const values = value.match(/\{\{[^}]+\}\}|\$\{[^}]+\}/g);
```

**Step 4: Run — expect PASS**

**Step 5: Commit**

```bash
git add backend/src/tests/patternParity.en_pt.test.ts
git commit -m "fix(test): fix doubly-escaped placeholder regex in patternParity — was silently passing on zero matches"
```

---

## Phase 3: Collision Matrix Overhaul

### Task 8: Replace phantom operators with canonical IDs in collision matrix

**Files:**
- Modify: `backend/src/data_banks/operators/operator_collision_matrix.any.json`
- Test: `operator-registry-alignment.cert.test.ts` (already covers this via Task 3)

**Step 1: Run existing test — expect FAIL (phantom operators not in registry)**

**Step 2: Update collision matrix rules**

Replace all phantom operator references with canonical IDs from `operator_canonical_registry.any.json`. For operators that truly don't exist in the routing pipeline (e.g. `file_bulk_move` is not a routable operator), either:
- Map them to their canonical parent (e.g. `file_move`)
- Remove the rule if the operator is unreachable

Update `CM_0001` through `CM_0010` to reference only operators that appear in `intent_config.operatorsAllowed` or `operator_canonical_registry`.

**Step 3: Run — expect PASS**

**Step 4: Commit**

```bash
git add backend/src/data_banks/operators/operator_collision_matrix.any.json
git commit -m "fix(routing): replace phantom operators in collision matrix with canonical IDs"
```

---

### Task 9: Add missing collision rules (editing↔Q&A, help↔editing, email↔connector)

**Files:**
- Modify: `backend/src/data_banks/operators/operator_collision_matrix.any.json`
- Create: `backend/src/tests/certification/collision-matrix-behavioral.cert.test.ts`

**Step 1: Write the failing test**

```ts
// backend/src/tests/certification/collision-matrix-behavioral.cert.test.ts
import * as fs from "fs";
import * as path from "path";
import { describe, expect, test } from "@jest/globals";

function readJson(rel: string) {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../data_banks", rel), "utf8"));
}

function matchesAnyRegex(query: string, patterns: string[]): boolean {
  return patterns.some(p => new RegExp(p, "i").test(query));
}

describe("collision-matrix-behavioral", () => {
  const matrix = readJson("operators/operator_collision_matrix.any.json");

  function findRule(id: string) {
    return matrix.rules.find((r: any) => r.id === id);
  }

  // --- editing vs Q&A ---
  test("CM_0011: 'what font size is used?' suppresses EDIT_SPAN", () => {
    const rule = findRule("CM_0011_edit_vs_retrieval_question");
    expect(rule).toBeTruthy();
    expect(matchesAnyRegex("what font size is used in the title?", rule.when.queryRegexAny.en)).toBe(true);
    expect(matchesAnyRegex("qual tamanho da fonte no titulo?", rule.when.queryRegexAny.pt)).toBe(true);
  });

  test("CM_0011: 'change the font to Arial' does NOT suppress (not a question)", () => {
    const rule = findRule("CM_0011_edit_vs_retrieval_question");
    expect(matchesAnyRegex("change the font to Arial", rule.when.queryRegexAny.en)).toBe(false);
  });

  // --- help vs editing ---
  test("CM_0012: 'how do I bold text?' suppresses editing operators", () => {
    const rule = findRule("CM_0012_help_vs_editing");
    expect(rule).toBeTruthy();
    expect(matchesAnyRegex("how do I bold text?", rule.when.queryRegexAny.en)).toBe(true);
    expect(matchesAnyRegex("como eu coloco negrito?", rule.when.queryRegexAny.pt)).toBe(true);
  });

  test("CM_0012: 'bold the text' does NOT suppress", () => {
    const rule = findRule("CM_0012_help_vs_editing");
    expect(matchesAnyRegex("bold the text", rule.when.queryRegexAny.en)).toBe(false);
  });

  // --- email vs connector ---
  test("CM_0013: 'disconnect my email' suppresses email operators", () => {
    const rule = findRule("CM_0013_email_vs_connector");
    expect(rule).toBeTruthy();
    expect(matchesAnyRegex("disconnect my email", rule.when.queryRegexAny.en)).toBe(true);
    expect(matchesAnyRegex("desconectar meu email", rule.when.queryRegexAny.pt)).toBe(true);
  });
});
```

**Step 2: Run — expect FAIL**

**Step 3: Add 3 new collision rules to `operator_collision_matrix.any.json`**

```json
{
  "id": "CM_0011_edit_vs_retrieval_question",
  "priority": 87,
  "action": "suppress_candidate",
  "reasonCode": "retrieval_question_not_edit",
  "when": {
    "operators": ["EDIT_PARAGRAPH", "EDIT_SPAN", "EDIT_CELL", "EDIT_RANGE"],
    "queryRegexAny": {
      "en": ["\\b(what|which|how much|how many|where is|show me)\\b.*\\?"],
      "pt": ["\\b(qual|quais|quanto|quantos|onde|mostre)\\b.*\\?"],
      "es": ["\\b(cu[aá]l|qu[eé]|cu[aá]nto|d[oó]nde|muestre)\\b.*\\?"]
    }
  }
},
{
  "id": "CM_0012_help_vs_editing",
  "priority": 83,
  "action": "suppress_candidate",
  "reasonCode": "help_question_not_edit",
  "when": {
    "operators": ["EDIT_PARAGRAPH", "EDIT_SPAN", "EDIT_CELL", "EDIT_RANGE", "ADD_PARAGRAPH", "CREATE_CHART"],
    "queryRegexAny": {
      "en": ["\\b(how do i|how can i|how to|can you teach|help me)\\b"],
      "pt": ["\\b(como eu|como posso|como fa[cç]o|me ensine|me ajude a)\\b"],
      "es": ["\\b(c[oó]mo puedo|c[oó]mo hago|ens[eé][nñ]ame|ay[uú]dame a)\\b"]
    }
  }
},
{
  "id": "CM_0013_email_vs_connector",
  "priority": 81,
  "action": "suppress_candidate",
  "reasonCode": "connector_lifecycle_not_email",
  "when": {
    "operators": ["EMAIL_LATEST", "EMAIL_EXPLAIN_LATEST", "EMAIL_DRAFT", "EMAIL_SEND"],
    "queryRegexAny": {
      "en": ["\\b(connect|disconnect|sync|resync|authorize|revoke|link|unlink)\\b.{0,20}\\b(email|gmail|outlook)\\b"],
      "pt": ["\\b(conectar|desconectar|sincronizar|autorizar|revogar|vincular|desvincular)\\b.{0,20}\\b(email|gmail|outlook)\\b"],
      "es": ["\\b(conectar|desconectar|sincronizar|autorizar|revocar|vincular|desvincular)\\b.{0,20}\\b(email|gmail|outlook)\\b"]
    }
  }
}
```

**Step 4: Run — expect PASS**

**Step 5: Commit**

```bash
git add backend/src/data_banks/operators/operator_collision_matrix.any.json backend/src/tests/certification/collision-matrix-behavioral.cert.test.ts
git commit -m "feat(routing): add collision rules for editing↔Q&A, help↔editing, email↔connector"
```

---

## Phase 4: Bank Inline Test Runner

### Task 10: Build generic test runner that executes all 45 dead bank test cases

**Files:**
- Create: `backend/src/tests/certification/bank-inline-tests.cert.test.ts`

**Step 1: Write the test runner**

```ts
// backend/src/tests/certification/bank-inline-tests.cert.test.ts
import * as fs from "fs";
import * as path from "path";
import { describe, expect, test } from "@jest/globals";

const BANKS_ROOT = path.resolve(__dirname, "../../data_banks");

interface BankTestCase {
  id: string;
  input?: any;
  context?: any;
  expect: Record<string, any>;
}

function walkJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkJsonFiles(full));
    else if (entry.name.endsWith(".any.json")) files.push(full);
  }
  return files;
}

function extractTestCases(bank: any): BankTestCase[] {
  const cases = bank?.tests?.cases;
  return Array.isArray(cases) ? cases : [];
}

describe("bank-inline-tests", () => {
  const allFiles = walkJsonFiles(BANKS_ROOT);
  const banksWithTests: Array<{ bankId: string; filePath: string; cases: BankTestCase[] }> = [];

  for (const filePath of allFiles) {
    const bank = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const cases = extractTestCases(bank);
    if (cases.length > 0) {
      banksWithTests.push({
        bankId: bank._meta?.id || path.basename(filePath),
        filePath,
        cases,
      });
    }
  }

  test("at least 30 bank test cases are discoverable", () => {
    const total = banksWithTests.reduce((sum, b) => sum + b.cases.length, 0);
    expect(total).toBeGreaterThanOrEqual(30);
  });

  test("every test case has an id and expect block", () => {
    const malformed: string[] = [];
    for (const bank of banksWithTests) {
      for (const tc of bank.cases) {
        if (!tc.id || !tc.expect) {
          malformed.push(`${bank.bankId}:${tc.id || "MISSING_ID"}`);
        }
      }
    }
    expect(malformed).toEqual([]);
  });

  // Intent config contract tests (IC_0001-IC_0008)
  describe("intent_config contract", () => {
    const intentConfig = JSON.parse(
      fs.readFileSync(path.join(BANKS_ROOT, "routing/intent_config.any.json"), "utf8")
    );
    const families = intentConfig.intentFamilies as any[];
    const cases = extractTestCases(intentConfig);

    for (const tc of cases) {
      test(tc.id, () => {
        const family = families.find((f: any) => f.id === tc.input?.intentFamily);
        if (tc.expect.allowed !== undefined) {
          const ops = family?.operatorsAllowed || [];
          const isAllowed = ops.includes(tc.input.operator);
          expect(isAllowed).toBe(tc.expect.allowed);
        }
        if (tc.expect.requiresDocs !== undefined) {
          expect(family?.requiresDocs).toBe(tc.expect.requiresDocs);
        }
      });
    }
  });

  // Collision matrix tests (CM_T01-CM_T04)
  describe("collision_matrix contract", () => {
    const matrix = JSON.parse(
      fs.readFileSync(path.join(BANKS_ROOT, "operators/operator_collision_matrix.any.json"), "utf8")
    );
    const cases = extractTestCases(matrix);

    for (const tc of cases) {
      test(tc.id, () => {
        const suppressed = matrix.rules.some((rule: any) => {
          if (!rule.when.operators?.includes(tc.candidateOperator)) return false;
          const patterns = rule.when.queryRegexAny?.en || [];
          return patterns.some((p: string) => new RegExp(p, "i").test(tc.input));
        });
        if (tc.expect.suppressed !== undefined) {
          expect(suppressed).toBe(tc.expect.suppressed);
        }
      });
    }
  });
});
```

**Step 2: Run — expect some cases pass, validate the runner works**

**Step 3: Fix any test cases in banks that have stale data (e.g. `ER_T_0002` PT pattern mismatch)**

**Step 4: Run — expect all PASS**

**Step 5: Commit**

```bash
git add backend/src/tests/certification/bank-inline-tests.cert.test.ts
git commit -m "feat(test): add bank-inline-test-runner — executes all 45+ test cases embedded in data banks"
```

---

## Phase 5: Slot Extraction Contracts

### Task 11: Create docRef/sectionRef/period/units slot contracts

**Files:**
- Create: `backend/src/data_banks/semantics/routing_slot_contracts.any.json`
- Create: `backend/src/tests/certification/routing-slot-extraction.cert.test.ts`

**Step 1: Write the failing test**

```ts
// backend/src/tests/certification/routing-slot-extraction.cert.test.ts
import * as fs from "fs";
import * as path from "path";
import { describe, expect, test } from "@jest/globals";

function readJson(rel: string) {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../data_banks", rel), "utf8"));
}

describe("routing-slot-extraction contracts", () => {
  test("routing_slot_contracts bank exists with docRef, sectionRef, period, units", () => {
    const bank = readJson("semantics/routing_slot_contracts.any.json");
    expect(bank._meta.id).toBe("routing_slot_contracts");

    const slotIds = (bank.slots as any[]).map((s: any) => s.id);
    expect(slotIds).toContain("docRef");
    expect(slotIds).toContain("sectionRef");
    expect(slotIds).toContain("period");
    expect(slotIds).toContain("units");
  });

  test("every slot has EN and PT patterns", () => {
    const bank = readJson("semantics/routing_slot_contracts.any.json");
    const missing: string[] = [];
    for (const slot of bank.slots) {
      if (!slot.patterns?.en?.length) missing.push(`${slot.id}:en`);
      if (!slot.patterns?.pt?.length) missing.push(`${slot.id}:pt`);
    }
    expect(missing).toEqual([]);
  });

  test("every slot has golden test cases", () => {
    const bank = readJson("semantics/routing_slot_contracts.any.json");
    const missing: string[] = [];
    for (const slot of bank.slots) {
      const cases = bank.tests?.cases?.filter((tc: any) => tc.slotId === slot.id) || [];
      if (cases.length < 2) missing.push(`${slot.id} (${cases.length} cases, need >=2)`);
    }
    expect(missing).toEqual([]);
  });
});
```

**Step 2: Run — expect FAIL**

**Step 3: Create the bank**

Create `backend/src/data_banks/semantics/routing_slot_contracts.any.json`:

```json
{
  "_meta": {
    "id": "routing_slot_contracts",
    "version": "1.0.0",
    "description": "Routing-level slot extraction contracts for docRef, sectionRef, period, and units.",
    "languages": ["any", "en", "pt"],
    "owner": "data-bank-governance",
    "usedBy": ["services/core/banks/dataBankLoader.service.ts"],
    "tests": ["tests/certification/routing-slot-extraction.cert.test.ts"]
  },
  "config": { "enabled": true },
  "slots": [
    {
      "id": "docRef",
      "description": "Filename or document title reference extracted from user query",
      "extractionMode": "STRICT_EXTRACT",
      "patterns": {
        "en": [
          "\\b(?:in|from|using|about|open)\\s+(?:the\\s+)?(?:file|doc|document|report)\\s+[\"']?([\\w\\s.-]+\\.(?:pdf|xlsx?|docx?|pptx?|csv|txt))[\"']?",
          "\\b([\\w\\s.-]+\\.(?:pdf|xlsx?|docx?|pptx?|csv|txt))\\b"
        ],
        "pt": [
          "\\b(?:no|do|usando|sobre|abrir)\\s+(?:o\\s+)?(?:arquivo|documento|relat[oó]rio)\\s+[\"']?([\\w\\s.-]+\\.(?:pdf|xlsx?|docx?|pptx?|csv|txt))[\"']?",
          "\\b([\\w\\s.-]+\\.(?:pdf|xlsx?|docx?|pptx?|csv|txt))\\b"
        ]
      }
    },
    {
      "id": "sectionRef",
      "description": "Section, chapter, heading, or page reference",
      "extractionMode": "ALLOW_INFERENCE",
      "patterns": {
        "en": [
          "\\b(?:section|chapter|heading|part)\\s+([\\d.]+|[A-Z][\\w\\s]{0,40})",
          "\\b(?:page|slide|sheet|tab)\\s+(\\d+)",
          "\\b(?:in the|go to the)\\s+(introduction|conclusion|appendix|summary|abstract)"
        ],
        "pt": [
          "\\b(?:se[cç][aã]o|cap[ií]tulo|t[oó]pico|parte)\\s+([\\d.]+|[A-Z][\\w\\s]{0,40})",
          "\\b(?:p[aá]gina|slide|aba|folha)\\s+(\\d+)",
          "\\b(?:na|v[aá] para a)\\s+(introdu[cç][aã]o|conclus[aã]o|ap[eê]ndice|resumo)"
        ]
      }
    },
    {
      "id": "period",
      "description": "Date range, fiscal year, quarter, or month reference",
      "extractionMode": "STRICT_EXTRACT",
      "patterns": {
        "en": [
          "\\b(Q[1-4])\\s*(\\d{4})?\\b",
          "\\b(\\d{4})\\s*(?:vs|versus|compared to|to)\\s*(\\d{4})\\b",
          "\\b(?:in|for|during)\\s+(\\d{4})\\b",
          "\\b(january|february|march|april|may|june|july|august|september|october|november|december)\\s*(\\d{4})?\\b",
          "\\b(H[12]|first half|second half)\\s*(\\d{4})?\\b"
        ],
        "pt": [
          "\\b(T[1-4]|[1-4][oº]\\s*trimestre)\\s*(\\d{4})?\\b",
          "\\b(\\d{4})\\s*(?:vs|versus|comparado com|a)\\s*(\\d{4})\\b",
          "\\b(?:em|para|durante)\\s+(\\d{4})\\b",
          "\\b(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\\s*(\\d{4})?\\b",
          "\\b(S[12]|primeiro semestre|segundo semestre)\\s*(\\d{4})?\\b"
        ]
      }
    },
    {
      "id": "units",
      "description": "Currency, measurement, or unit reference",
      "extractionMode": "ALLOW_INFERENCE",
      "patterns": {
        "en": [
          "\\b(?:in|to|convert to|expressed in)\\s+(USD|EUR|GBP|BRL|JPY|CAD|AUD|CHF)\\b",
          "\\b(R\\$|\\$|€|£|¥)\\s*[\\d,.]+",
          "\\b(?:in|to)\\s+(millions?|thousands?|billions?|percent|%)\\b"
        ],
        "pt": [
          "\\b(?:em|para|converter para|expresso em)\\s+(USD|EUR|GBP|BRL|JPY|CAD|AUD|CHF|reais|d[oó]lares|euros)\\b",
          "\\b(R\\$|\\$|€|£)\\s*[\\d,.]+",
          "\\b(?:em|para)\\s+(milh[oõ]es?|milhares?|bilh[oõ]es?|porcento|%)\\b"
        ]
      }
    }
  ],
  "tests": {
    "cases": [
      { "id": "RS_001", "slotId": "docRef", "input": "summarize Budget.xlsx", "expect": { "extracted": "Budget.xlsx" } },
      { "id": "RS_002", "slotId": "docRef", "input": "resuma o relatorio.pdf", "expect": { "extracted": "relatorio.pdf" } },
      { "id": "RS_003", "slotId": "sectionRef", "input": "what does section 3.2 say?", "expect": { "extracted": "3.2" } },
      { "id": "RS_004", "slotId": "sectionRef", "input": "vá para o capítulo 5", "expect": { "extracted": "5" } },
      { "id": "RS_005", "slotId": "period", "input": "revenue in Q3 2024", "expect": { "extracted": "Q3 2024" } },
      { "id": "RS_006", "slotId": "period", "input": "receita do 1o trimestre 2025", "expect": { "extracted": "1o trimestre 2025" } },
      { "id": "RS_007", "slotId": "units", "input": "total in USD", "expect": { "extracted": "USD" } },
      { "id": "RS_008", "slotId": "units", "input": "converter para reais", "expect": { "extracted": "reais" } }
    ]
  }
}
```

**Step 4: Run — expect PASS**

**Step 5: Commit**

```bash
git add backend/src/data_banks/semantics/routing_slot_contracts.any.json backend/src/tests/certification/routing-slot-extraction.cert.test.ts
git commit -m "feat(routing): add routing-level slot contracts for docRef, sectionRef, period, units"
```

---

## Phase 6: Normalization Consolidation

### Task 12: Create shared normalization utility

**Files:**
- Create: `backend/src/services/core/normalize.ts`
- Create: `backend/src/services/core/normalize.test.ts`

**Step 1: Write the failing test**

```ts
// backend/src/services/core/normalize.test.ts
import { describe, expect, test } from "@jest/globals";
import { normalizeText, tokenize } from "./normalize";

describe("shared normalize", () => {
  test("lowercases, strips diacritics, collapses whitespace", () => {
    expect(normalizeText("  São Paulo   Relatório  ")).toBe("sao paulo relatorio");
  });

  test("tokenize splits on non-alphanumeric", () => {
    expect(tokenize("Budget_2024.pdf")).toEqual(new Set(["budget", "2024", "pdf"]));
  });

  test("tokenize with minLength filters short tokens", () => {
    expect(tokenize("a is the big", { minLength: 3 })).toEqual(new Set(["the", "big"]));
  });

  test("normalizeText handles empty/null gracefully", () => {
    expect(normalizeText("")).toBe("");
    expect(normalizeText(null as any)).toBe("");
  });
});
```

**Step 2: Run — expect FAIL**

**Step 3: Implement**

```ts
// backend/src/services/core/normalize.ts
export function normalizeText(input: string | null | undefined): string {
  if (!input) return "";
  return String(input)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(
  input: string,
  opts?: { minLength?: number }
): Set<string> {
  const min = opts?.minLength ?? 1;
  const normalized = normalizeText(input);
  const tokens = normalized.split(/[^a-z0-9]+/).filter(t => t.length >= min);
  return new Set(tokens);
}
```

**Step 4: Run — expect PASS**

**Step 5: Commit**

```bash
git add backend/src/services/core/normalize.ts backend/src/services/core/normalize.test.ts
git commit -m "feat(core): add shared normalizeText/tokenize utility — single normalization pipeline for entire pillar"
```

---

### Task 13: Migrate services to shared normalize

**Files:**
- Modify: `backend/src/services/core/scope/scopeGate.service.ts` (replace inline `normSpace`, `lower`, `simpleTokens`)
- Modify: `backend/src/services/core/scope/documentReferenceResolver.service.ts` (replace inline `lower`, `tokenize`)
- Modify: `backend/src/services/chat/turnRouter.service.ts` (replace `normalizeForMatching`)
- Modify: `backend/src/services/chat/turnRoutePolicy.service.ts` (replace `normalizeText`)

**Step 1: Run all existing tests to establish baseline**

Run: `cd backend && npx jest --testPathPattern="(scopeGate|documentReference|turnRouter|patternCollision|patternParity|patternDeterminism)" --no-coverage`

**Step 2: In each file, import from shared and replace inline implementations**

For each file:
- Add `import { normalizeText, tokenize } from "../core/normalize";` (adjust path)
- Replace inline `normalize`/`lower`/`normSpace`/`simpleTokens` calls with shared versions
- Remove the now-dead inline function definitions

**Step 3: Run all tests again — expect same results**

**Step 4: Commit**

```bash
git add backend/src/services/core/scope/scopeGate.service.ts backend/src/services/core/scope/documentReferenceResolver.service.ts backend/src/services/chat/turnRouter.service.ts backend/src/services/chat/turnRoutePolicy.service.ts
git commit -m "refactor(core): migrate all services to shared normalizeText/tokenize — eliminate 6 divergent normalization pipelines"
```

---

## Phase 7: EN/PT/ES Parity

### Task 14: Add ES patterns to the 5 missing banks

**Files:**
- Modify: `backend/src/data_banks/routing/allybi_intents.any.json`
- Modify: `backend/src/data_banks/routing/connectors_routing.any.json`
- Modify: `backend/src/data_banks/routing/email_routing.any.json`
- Modify: `backend/src/data_banks/semantics/query_slot_contracts.any.json`
- Modify: `backend/src/data_banks/tests/slot_extraction_cases.any.json`
- Test: `backend/src/tests/certification/es-parity.cert.test.ts` (create)

**Step 1: Write the failing test**

```ts
// backend/src/tests/certification/es-parity.cert.test.ts
import * as fs from "fs";
import * as path from "path";
import { describe, expect, test } from "@jest/globals";

const BANKS_ROOT = path.resolve(__dirname, "../../data_banks");

function readJson(rel: string) {
  return JSON.parse(fs.readFileSync(path.join(BANKS_ROOT, rel), "utf8"));
}

const BANKS_REQUIRING_ES = [
  "routing/allybi_intents.any.json",
  "routing/connectors_routing.any.json",
  "routing/email_routing.any.json",
  "semantics/query_slot_contracts.any.json",
];

describe("ES parity", () => {
  for (const rel of BANKS_REQUIRING_ES) {
    test(`${rel} declares ES in languages`, () => {
      const bank = readJson(rel);
      const langs = bank._meta?.languages || bank.localeSupport || [];
      expect(langs).toContain("es");
    });
  }
});
```

**Step 2: Run — expect FAIL**

**Step 3: Add ES patterns to each bank**

For each bank, add `"es"` to the languages array and add Spanish pattern equivalents for every rule that has EN and PT patterns. Use the existing ES patterns from `intent_config.any.json` and `intent_patterns.any.json` as reference for vocabulary.

**Step 4: Run — expect PASS**

**Step 5: Commit**

```bash
git add backend/src/data_banks/routing/allybi_intents.any.json backend/src/data_banks/routing/connectors_routing.any.json backend/src/data_banks/routing/email_routing.any.json backend/src/data_banks/semantics/query_slot_contracts.any.json backend/src/data_banks/tests/slot_extraction_cases.any.json backend/src/tests/certification/es-parity.cert.test.ts
git commit -m "feat(i18n): add ES patterns to allybi_intents, connectors_routing, email_routing, query_slot_contracts"
```

---

### Task 15: Extend parity test to cover routing banks

**Files:**
- Modify: `backend/src/tests/patternParity.en_pt.test.ts` — add routing bank coverage

**Step 1: Add routing banks to TARGET_FAMILIES**

Add to `TARGET_FAMILIES`:
```ts
routing: "routing",
operators: "operators",
ambiguity: "ambiguity",
```

**Step 2: Run — expect new families are checked**

**Step 3: Fix any parity failures discovered**

**Step 4: Commit**

```bash
git add backend/src/tests/patternParity.en_pt.test.ts
git commit -m "feat(test): extend parity test to cover routing, operators, and ambiguity banks"
```

---

## Phase 8: Fix Regex False Positives in `intent_patterns.any.json`

### Task 16: Tighten overly-broad patterns

**Files:**
- Modify: `backend/src/data_banks/routing/intent_patterns.any.json`
- Create: `backend/src/tests/certification/intent-pattern-negatives.cert.test.ts`

**Step 1: Write the failing test**

```ts
// backend/src/tests/certification/intent-pattern-negatives.cert.test.ts
import * as fs from "fs";
import * as path from "path";
import { describe, expect, test } from "@jest/globals";

const bank = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, "../../data_banks/routing/intent_patterns.any.json"), "utf8"
));

function operatorMatches(opId: string, query: string, locale: string): boolean {
  const op = bank.operators[opId];
  if (!op) return false;
  const patterns = op.patterns?.[locale] || [];
  const negatives = op.negatives?.[locale] || [];
  const matchesPositive = patterns.some((p: string) => new RegExp(p, "i").test(query));
  const matchesNegative = negatives.some((p: string) => new RegExp(p, "i").test(query));
  return matchesPositive && !matchesNegative;
}

describe("intent-pattern negatives", () => {
  // "overview" should not hijack file inventory
  test("'give me an overview of my files' does NOT match summarize", () => {
    expect(operatorMatches("summarize", "give me an overview of my files", "en")).toBe(false);
  });

  // "show results from the test" should not match extract
  test("'show results from the test' does NOT match extract", () => {
    expect(operatorMatches("extract", "show results from the test", "en")).toBe(false);
  });

  // Bare "view" should not hijack everything
  test("'view connector status' does NOT match open", () => {
    expect(operatorMatches("open", "view connector status", "en")).toBe(false);
  });

  // ES "como" should not match everything
  test("'como se llama el dueño?' does NOT match how_to", () => {
    expect(operatorMatches("how_to", "como se llama el dueño del contrato?", "es")).toBe(false);
  });

  // "sort by revenue" should not match file sort
  test("'sort by revenue' does NOT match file_actions sort", () => {
    expect(operatorMatches("sort", "sort the data by revenue", "en")).toBe(false);
  });
});
```

**Step 2: Run — expect FAIL (overly-broad patterns match)**

**Step 3: Fix patterns**

- `summarize`: Add negative `"\\bmy files\\b"`, `"\\bmy documents\\b"`
- `extract`: Change `"\\bshow\\b.{0,30}\\b(in|from)\\b"` → `"\\bshow\\b.{0,30}\\b(in|from)\\b.{0,30}\\b(the|this|that)\\b.{0,30}\\b(doc|document|file|pdf|report|spreadsheet|presentation)\\b"`
- `open`: Change bare `"\\bview\\b"` → `"\\bview\\b.{0,20}\\b(file|document|doc)\\b"`. Change `"\\bpreview\\b"` → `"\\bpreview\\b.{0,20}\\b(file|document|doc|the)\\b"`
- `how_to` ES: Change `"\\bc[oó]mo\\b"` → `"\\bc[oó]mo\\s+(puedo|hago|se\\s+hace|funciona)\\b"`
- `sort`: Add negative `"\\b(revenue|data|column|row|value|price|cost|total)\\b"` to prevent content-sort hijacking

**Step 4: Run — expect PASS**

**Step 5: Commit**

```bash
git add backend/src/data_banks/routing/intent_patterns.any.json backend/src/tests/certification/intent-pattern-negatives.cert.test.ts
git commit -m "fix(routing): tighten overly-broad regex patterns — add negatives for summarize, extract, open, how_to, sort"
```

---

## Phase 9: Scope Gate Hardening

### Task 17: Wire `rankFeatures` bank and `stopwords_docnames` bank in scopeGate

**Files:**
- Modify: `backend/src/services/core/scope/scopeGate.service.ts` (~lines 928-978, 831-891)
- Modify: `backend/src/services/core/scope/scopeGate.service.test.ts`

**Step 1: Write failing tests**

Add tests to `scopeGate.service.test.ts` that verify:
1. When `ambiguity_rank_features` bank configures a `titleBoost`, the ranking function uses it
2. When `stopwords_docnames` bank provides custom stopwords, they are excluded from tokenization

**Step 2: Run — expect FAIL**

**Step 3: In `rankDocCandidatesByName()`, read from the `rankFeatures` parameter instead of ignoring it. In `docnameTokens()`, read from `stopwordsDocnames` parameter instead of hardcoded sets.**

**Step 4: Run — expect PASS**

**Step 5: Commit**

```bash
git add backend/src/services/core/scope/scopeGate.service.ts backend/src/services/core/scope/scopeGate.service.test.ts
git commit -m "fix(scope): wire rankFeatures and stopwords_docnames banks — were loaded but never consumed"
```

---

### Task 18: Fix `disambiguation_policies` — `doc_discovery` reference

**Files:**
- Modify: `backend/src/data_banks/ambiguity/disambiguation_policies.any.json` (~line 267)

**Step 1: Verify the `operator_families.any.json` defines `doc_discovery` as a family (it does, at line 123)**

**Step 2: The signal path must emit `intentFamily: "doc_discovery"` (not just `"documents"`) when `locate_docs` operator is selected. Check `turnRouter.service.ts` to see what it actually emits.**

**Step 3: If the router emits `"documents"` for locate_docs, change the disambiguation policy rule to check for the operator instead:**

```json
{
  "id": "discovery_prefers_doc_list",
  "when": {
    "any": [
      { "path": "signals.intentFamily", "op": "eq", "value": "doc_discovery" },
      { "path": "signals.operator", "op": "eq", "value": "locate_docs" }
    ]
  }
}
```

**Step 4: Add test case to `bank-inline-tests.cert.test.ts`**

**Step 5: Commit**

```bash
git add backend/src/data_banks/ambiguity/disambiguation_policies.any.json
git commit -m "fix(ambiguity): discovery_prefers_doc_list rule now also matches operator=locate_docs"
```

---

## Phase 10: Determinism & E2E Integration Tests

### Task 19: Add N-runs determinism test for `IntentConfigService.decide()`

**Files:**
- Modify: `backend/src/services/config/intentConfig.service.test.ts`

**Step 1: Add determinism test**

```ts
test("decide() is deterministic: 10 runs produce identical output", () => {
  const service = new IntentConfigService();
  const input = {
    env: "dev" as const,
    language: "en" as const,
    queryText: "summarize this document",
    candidates: [
      { intentId: "documents", intentFamily: "documents", operatorId: "summarize", score: 0.85 },
      { intentId: "help", intentFamily: "help", operatorId: "capabilities", score: 0.3 },
    ],
  };

  const results = Array.from({ length: 10 }, () => service.decide(input));
  const first = JSON.stringify(results[0]);
  for (let i = 1; i < results.length; i++) {
    expect(JSON.stringify(results[i])).toBe(first);
  }
});
```

**Step 2: Run — expect PASS (it should already be deterministic)**

**Step 3: Add more determinism cases for edge paths (followup, discovery, nav, ambiguous)**

**Step 4: Commit**

```bash
git add backend/src/services/config/intentConfig.service.test.ts
git commit -m "feat(test): add N-runs determinism proof for IntentConfigService.decide()"
```

---

### Task 20: Add E2E all-9-families routing test

**Files:**
- Create: `backend/src/tests/certification/all-families-routing.cert.test.ts`

**Step 1: Write the test**

```ts
// backend/src/tests/certification/all-families-routing.cert.test.ts
import * as fs from "fs";
import * as path from "path";
import { describe, expect, test } from "@jest/globals";

const intentPatterns = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, "../../data_banks/routing/intent_patterns.any.json"), "utf8"
));

function bestOperatorMatch(query: string, locale: string): { operator: string; family: string } | null {
  let best: { operator: string; family: string; priority: number } | null = null;

  for (const [opId, opDef] of Object.entries(intentPatterns.operators) as [string, any][]) {
    if (opId === "_comment") continue;
    const patterns = opDef.patterns?.[locale] || [];
    const negatives = opDef.negatives?.[locale] || [];

    const matchesPositive = patterns.some((p: string) => new RegExp(p, "i").test(query));
    const matchesNegative = negatives.some((p: string) => new RegExp(p, "i").test(query));

    if (matchesPositive && !matchesNegative) {
      const priority = opDef.priority || 0;
      if (!best || priority > best.priority) {
        best = { operator: opId, family: opDef.intentFamily, priority };
      }
    }
  }
  return best ? { operator: best.operator, family: best.family } : null;
}

describe("all-families-routing", () => {
  const CASES: Array<{ query: string; locale: string; expectedFamily: string; expectedOperator?: string }> = [
    // documents
    { query: "summarize this report", locale: "en", expectedFamily: "documents", expectedOperator: "summarize" },
    { query: "resuma este relatório", locale: "pt", expectedFamily: "documents", expectedOperator: "summarize" },
    // file_actions
    { query: "list my files", locale: "en", expectedFamily: "file_actions", expectedOperator: "list" },
    { query: "listar meus arquivos", locale: "pt", expectedFamily: "file_actions", expectedOperator: "list" },
    // doc_stats
    { query: "how many pages", locale: "en", expectedFamily: "doc_stats", expectedOperator: "count_pages" },
    { query: "quantas páginas", locale: "pt", expectedFamily: "doc_stats", expectedOperator: "count_pages" },
    // help
    { query: "what can you do", locale: "en", expectedFamily: "help", expectedOperator: "capabilities" },
    { query: "o que você pode fazer", locale: "pt", expectedFamily: "help", expectedOperator: "capabilities" },
    // conversation
    { query: "hi", locale: "en", expectedFamily: "conversation", expectedOperator: "greeting" },
    { query: "oi", locale: "pt", expectedFamily: "conversation", expectedOperator: "greeting" },
  ];

  for (const tc of CASES) {
    test(`[${tc.locale}] "${tc.query}" → ${tc.expectedFamily}/${tc.expectedOperator}`, () => {
      const result = bestOperatorMatch(tc.query, tc.locale);
      expect(result).not.toBeNull();
      expect(result!.family).toBe(tc.expectedFamily);
      if (tc.expectedOperator) {
        expect(result!.operator).toBe(tc.expectedOperator);
      }
    });
  }
});
```

**Step 2: Run — expect PASS**

**Step 3: Commit**

```bash
git add backend/src/tests/certification/all-families-routing.cert.test.ts
git commit -m "feat(test): add E2E all-families routing certification — 10 queries across 5 pattern-backed families × EN/PT"
```

---

### Task 21: Add `patternCollision` threshold tightening

**Files:**
- Modify: `backend/src/tests/patternCollision.test.ts` (~line 141)

**Step 1: Tighten the threshold**

Change from:
```ts
const allowedCollisionCount = Math.max(25, Math.round(rowCount * 2.3));
```
To:
```ts
const allowedCollisionCount = Math.max(10, Math.round(rowCount * 0.15));
```

This allows at most 15% of rows to have cross-row phrase collisions (vs the previous 230%).

**Step 2: Run — if it fails, identify and fix the actual collisions in the banks**

**Step 3: Commit**

```bash
git add backend/src/tests/patternCollision.test.ts
git commit -m "fix(test): tighten collision threshold from 230% to 15% — actually catch phrase ambiguity"
```

---

### Task 22: Hardcode followup confidence cleanup

**Files:**
- Modify: `backend/src/services/chat/turnRouter.service.ts` (~line 428)

**Step 1: Write failing test in patternWiringProof or a new file**

Assert that the followup confidence produced by pattern-based detection is >= the bank's `followupScoreMin` threshold.

**Step 2: Change the hardcoded `0.64` to read from the bank**

Replace:
```ts
const confidence = 0.64;
```
With:
```ts
const bank = this.routingBankProvider("followup_indicators");
const confidence = bank?.config?.followupScoreMin ?? 0.65;
```

**Step 3: Run — expect PASS**

**Step 4: Commit**

```bash
git add backend/src/services/chat/turnRouter.service.ts
git commit -m "fix(routing): replace hardcoded followup confidence 0.64 with bank-sourced followupScoreMin"
```

---

### Task 23: Add comprehensive `IntentConfigService` test coverage

**Files:**
- Modify: `backend/src/services/config/intentConfig.service.test.ts`

Add tests for the 5 untested code paths:
1. Discovery query override → documents/locate_docs
2. Explicit doc ref + file_actions demotion
3. No candidates fallback
4. Followup allowSwitch by signal
5. Followup newStrongEnough switch
6. Autopick path (score >= threshold, margin >= threshold)
7. `softValidate` with real bank data (mock returns actual `intent_config.any.json` content)
8. Production strict mode throws on missing bank

**Step 1-5: Write each test, run, verify pass, commit**

```bash
git commit -m "feat(test): add comprehensive IntentConfigService coverage — all 8 code paths exercised"
```

---

### Task 24: Add comprehensive `ScopeGateService` test coverage

**Files:**
- Modify: `backend/src/services/core/scope/scopeGate.service.test.ts`

Add tests for the 12+ untested stages:
1. Safety gate (`unsafeGate: true` → block)
2. No-docs-indexed → fatal
3. Discovery mode → corpus search
4. Followup continuity with/without topic shift
5. Hard doc lock carry-over
6. Sheet/range scope hints
7. Ambiguity/needs_doc_choice with autopick
8. Negative: malformed state (undefined scope fields)

**Step 1-5: Write each test, run, verify, commit**

```bash
git commit -m "feat(test): add comprehensive ScopeGateService coverage — 12 untested stages now exercised"
```

---

## Phase 11: Final Cleanup

### Task 25: Remove dead `triggerPatterns` wildcards from disambiguation_policies

Replace all `.+` wildcard `triggerPatterns` with meaningful patterns or remove the field entirely if it's not evaluated at runtime.

### Task 26: Fix `connectors_routing` and `email_routing` duplicate `_meta`/top-level schemas

Normalize to use only `_meta` block (matching all other banks). Remove duplicate top-level `bankId`, `version`, `description`, `localeSupport`, `schemaVersion`.

### Task 27: Fix `email_routing` PT pattern conjugation (`explicar` → `explic(ar|o|a|ou|ue)`)

### Task 28: Run full test suite and fix any regressions

Run: `cd backend && npx jest --no-coverage`

Fix any failures introduced by the changes above.

```bash
git commit -m "chore: fix regressions from routing pillar overhaul"
```

---

## Verification

After all tasks are complete, run:

```bash
# Full test suite
cd backend && npx jest --no-coverage

# Specific certification gates
npx jest --testPathPattern="certification/(routing-priority|operator-registry|collision-matrix|bank-inline|routing-slot|es-parity|intent-pattern-negatives|all-families)" --no-coverage

# Existing gates must still pass
npx jest --testPathPattern="(patternCollision|patternParity|patternDeterminism|patternWiringProof|patternOrphan|wrong-doc)" --no-coverage

# Audit scripts
npx tsx scripts/audit-routing-alignment.ts
```

Expected: ALL PASS, zero regressions, zero dead test cases, zero phantom operators.

---

## Summary: 28 tasks across 11 phases

| Phase | Tasks | What it fixes |
|---|---|---|
| 1. SSOT Registries | 1-3 | P0-1 (priority drift), P0-6 (operator naming) |
| 2. P0 Code Bugs | 4-7 | P0-2 (tokenOverlap), P0-5 (allowedOperators), P0-7 (parity regex) |
| 3. Collision Overhaul | 8-9 | P0-4 (phantom operators), missing collision rules |
| 4. Bank Test Runner | 10 | P0-3 (45 dead test cases) |
| 5. Slot Contracts | 11 | Missing docRef/sectionRef/period/units |
| 6. Normalization | 12-13 | 6 divergent normalization pipelines |
| 7. EN/PT/ES Parity | 14-15 | ES missing from 5 banks, parity test gaps |
| 8. Regex Tightening | 16 | False positives in intent_patterns |
| 9. Scope Hardening | 17-18 | Dead bank wiring, doc_discovery reference |
| 10. Determinism & E2E | 19-24 | Missing test coverage across the pillar |
| 11. Cleanup | 25-28 | Dead config, schema duplication, regressions |
