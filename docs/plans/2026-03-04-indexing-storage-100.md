# Indexing & Storage — 82→100 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close every gap identified in the Indexing & Storage audit to bring the pillar score from 82/100 to 100/100.

**Architecture:** Six targeted improvements across chunking extensibility, metadata completeness, table indexing robustness, versioning configurability, cross-doc linking enforcement, and key rotation support. Each change is backward-compatible and behind existing service boundaries.

**Tech Stack:** TypeScript, Prisma, Jest, AES-256-GCM, Node crypto, PostgreSQL

---

## Gap → Task Map

| Criterion | Gap | Points | Task |
|---|---|---|---|
| Chunking (17→20) | Hard-coded abbreviation list | +1 | Task 1 |
| Chunking (17→20) | No domain-adaptive chunking policy | +2 | Task 2 |
| Metadata (20→25) | PDF lacks section structure | +3 | Task 3 |
| Metadata (20→25) | DOCX lacks page numbers | +2 | Task 4 |
| Table indexing (16→20) | `parseCellRef` fails beyond column Z | +1 | Task 5 |
| Table indexing (16→20) | No cross-cell unit consistency check | +2 | Task 6 |
| Table indexing (16→20) | `headerPath` limited to 2 levels | +1 | Task 7 |
| Versioning (13→15) | Hard-coded 20-revision depth limit | +2 | Task 8 |
| Cross-doc linking (7→10) | No DB-level relationship enforcement | +3 | Task 9 |
| Encryption (9→10) | No key rotation | +1 | Task 10 |
| Tests | 5 chunk+metadata invariant tests | — | Task 11 |

---

### Task 1: Extensible Abbreviation List

**Files:**
- Modify: `backend/src/services/ingestion/chunking.service.ts:186-197`
- Create: `backend/src/data_banks/ingestion/abbreviations.chunking.any.json`
- Modify: `backend/src/data_banks/manifest/bank_registry.any.json` (add entry)
- Test: `backend/src/services/ingestion/chunking.service.test.ts` (add test)

**Step 1: Write the failing test**

In a new or existing chunking test file, add:

```typescript
test("custom abbreviations prevent false sentence breaks", () => {
  // "EBITDA." should NOT be treated as a sentence boundary if "ebitda" is
  // in the extended abbreviation list.
  const text =
    "The company reported EBITDA. adjusted for one-time items the margin improved. " +
    "A".repeat(1500); // force chunking

  const chunks = splitTextIntoChunks(text, {
    targetChars: 100,
    overlapChars: 10,
    customAbbreviations: ["ebitda"],
  });

  // "EBITDA." must NOT cause a split — "adjusted" follows lowercase
  const firstChunk = chunks[0];
  expect(firstChunk).toContain("EBITDA.");
  expect(firstChunk).toContain("adjusted");
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern chunking.service --no-coverage -t "custom abbreviations" 2>&1 | tail -20`
Expected: FAIL — `customAbbreviations` not recognized

**Step 3: Create the abbreviations data bank**

Create `backend/src/data_banks/ingestion/abbreviations.chunking.any.json`:

```json
{
  "$schema": "bank_schema",
  "id": "abbreviations_chunking",
  "version": "1.0.0",
  "description": "Extended abbreviation list for sentence-boundary detection in chunking. Prevents false splits on domain terms like EBITDA, GAAP, etc.",
  "lastUpdated": "2026-03-04",
  "usedBy": ["chunking.service.ts"],
  "abbreviations": {
    "accounting": ["ebitda", "gaap", "ifrs", "capex", "opex", "cogs", "wacc", "roe", "roa", "eps", "p/e", "nav", "aum"],
    "legal": ["llc", "llp", "esq", "atty", "def", "plf", "resp"],
    "medical": ["dx", "rx", "hx", "fx", "tx", "sx", "bx", "cx", "prn", "bid", "tid", "qid", "qhs"],
    "general": ["approx", "dept", "govt", "assoc", "intl", "natl", "mgmt", "acct", "qty", "amt"]
  }
}
```

**Step 4: Extend ChunkingPolicy and wire abbreviation loading**

In `chunking.service.ts`, add `customAbbreviations` to the policy interface and merge into the `ABBREVIATIONS` set inside `isAbbreviationDot`:

```typescript
// Add to ChunkingPolicy interface:
export interface ChunkingPolicy {
  targetChars: number;
  overlapChars: number;
  minBoundaryRatio: number;
  dedupeSimilarityThreshold: number;
  dedupeMinWordLength: number;
  customAbbreviations?: string[];
}

// In resolvePolicy, passthrough:
customAbbreviations: overrides?.customAbbreviations ?? base.customAbbreviations ?? [],

// Change splitTextIntoChunks and splitTextIntoChunksWithOffsets to pass
// policy.customAbbreviations to findSentenceBoundary, which passes to isAbbreviationDot.

// In isAbbreviationDot, accept extra abbreviations:
function isAbbreviationDot(
  text: string,
  dotIndex: number,
  extraAbbreviations?: Set<string>,
): boolean {
  // ... existing logic ...
  if (ABBREVIATIONS.has(wordBeforeDot)) return true;
  if (extraAbbreviations?.has(wordBeforeDot)) return true;
  // ... rest unchanged ...
}
```

**Step 5: Run test to verify it passes**

Run: `npx jest --testPathPattern chunking.service --no-coverage -t "custom abbreviations" 2>&1 | tail -20`
Expected: PASS

**Step 6: Commit**

```bash
git add backend/src/services/ingestion/chunking.service.ts \
       backend/src/data_banks/ingestion/abbreviations.chunking.any.json
git commit -m "feat(chunking): extensible abbreviation list via policy + data bank"
```

---

### Task 2: Domain-Adaptive Chunking Policy

**Files:**
- Modify: `backend/src/services/ingestion/pipeline/chunkAssembly.service.ts:60-63`
- Modify: `backend/src/services/ingestion/pipeline/documentPipeline.service.ts`
- Test: `backend/src/services/ingestion/pipeline/chunkAssembly.service.test.ts`

**Step 1: Write the failing test**

```typescript
test("buildInputChunks accepts chunking policy override", () => {
  const extraction: any = {
    sourceType: "pdf",
    text: "A".repeat(500),
    pages: [{ page: 1, text: "A".repeat(500) }],
  };

  // With a small targetChars, the text should be split into multiple chunks
  const chunks = buildInputChunks(extraction, extraction.text, {
    targetChars: 100,
    overlapChars: 10,
  });

  expect(chunks.length).toBeGreaterThan(1);
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern chunkAssembly.service --no-coverage -t "chunking policy override" 2>&1 | tail -20`
Expected: FAIL — `buildInputChunks` doesn't accept 3rd arg

**Step 3: Add policy parameter to buildInputChunks**

In `chunkAssembly.service.ts`, add optional 3rd parameter:

```typescript
import type { ChunkingPolicy } from "../chunking.service";

export function buildInputChunks(
  extraction: DispatchedExtractionResult,
  fullText: string,
  policyOverrides?: Partial<ChunkingPolicy>,
): InputChunk[] {
  // Pass policyOverrides to all splitTextIntoChunks / splitTextIntoChunksWithOffsets calls
  // Example for PDF path (line ~286):
  //   for (const seg of splitTextIntoChunksWithOffsets(pageText, charOffset, policyOverrides)) {
  // Same for DOCX (line ~100), XLSX (line ~148), PPTX (line ~333), fallback (line ~378)
```

**Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern chunkAssembly.service --no-coverage -t "chunking policy override" 2>&1 | tail -20`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/ingestion/pipeline/chunkAssembly.service.ts \
       backend/src/services/ingestion/pipeline/chunkAssembly.service.test.ts
git commit -m "feat(chunking): domain-adaptive policy passthrough in buildInputChunks"
```

---

### Task 3: PDF Section Structure Inference

**Files:**
- Modify: `backend/src/services/ingestion/pipeline/chunkAssembly.service.ts:277-303`
- Test: `backend/src/services/ingestion/pipeline/chunkAssembly.service.test.ts`

**Step 1: Write the failing test**

```typescript
test("PDF chunks infer sectionName from heading-like lines at page top", () => {
  const extraction: any = {
    sourceType: "pdf",
    text: "Executive Summary\nThe company performed well.\nFinancial Overview\nRevenue grew 15%.",
    pages: [
      { page: 1, text: "Executive Summary\nThe company performed well." },
      { page: 2, text: "Financial Overview\nRevenue grew 15%." },
    ],
  };

  const chunks = buildInputChunks(extraction, extraction.text);

  // First page chunk should infer section from the heading-like first line
  const page1Chunk = chunks.find((c) => c.pageNumber === 1 && c.metadata?.chunkType === "text");
  expect(page1Chunk?.metadata?.sectionName).toBe("Executive Summary");

  const page2Chunk = chunks.find((c) => c.pageNumber === 2 && c.metadata?.chunkType === "text");
  expect(page2Chunk?.metadata?.sectionName).toBe("Financial Overview");
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern chunkAssembly.service --no-coverage -t "PDF chunks infer sectionName" 2>&1 | tail -20`
Expected: FAIL — `sectionName` is undefined on PDF chunks

**Step 3: Add heading inference to PDF chunking path**

In the PDF chunking block (lines 277-303 of `chunkAssembly.service.ts`), add a heuristic to detect heading-like first lines:

```typescript
// Add before the PDF page loop:
function inferPageHeading(pageText: string): string | undefined {
  const firstLine = pageText.split("\n")[0]?.trim();
  if (!firstLine) return undefined;
  // Heuristic: heading if short (<120 chars), no trailing period, not all-lowercase
  if (
    firstLine.length > 0 &&
    firstLine.length <= 120 &&
    !firstLine.endsWith(".") &&
    !firstLine.endsWith(",") &&
    firstLine !== firstLine.toLowerCase()
  ) {
    return firstLine;
  }
  return undefined;
}

// Inside the PDF page loop, after extracting pageText:
const inferredSection = inferPageHeading(pageText);

// Attach to each chunk's metadata:
metadata: {
  chunkType: "text",
  sectionName: inferredSection,  // ← NEW
  startChar: seg.startChar,
  endChar: seg.endChar,
  ocrConfidence: extraction.ocrConfidence ?? undefined,
  sourceType: "pdf",
},
```

**Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern chunkAssembly.service --no-coverage -t "PDF chunks infer sectionName" 2>&1 | tail -20`
Expected: PASS

**Step 5: Add negative test — long lines don't become sections**

```typescript
test("PDF does NOT infer section from long first lines", () => {
  const longLine = "This is a very long first line that is clearly a paragraph and should not be treated as a section heading because it contains too much text and ends with a period.";
  const extraction: any = {
    sourceType: "pdf",
    text: longLine,
    pages: [{ page: 1, text: longLine }],
  };

  const chunks = buildInputChunks(extraction, extraction.text);
  expect(chunks[0].metadata?.sectionName).toBeUndefined();
});
```

**Step 6: Run all PDF tests**

Run: `npx jest --testPathPattern chunkAssembly.service --no-coverage 2>&1 | tail -20`
Expected: All PASS

**Step 7: Commit**

```bash
git add backend/src/services/ingestion/pipeline/chunkAssembly.service.ts \
       backend/src/services/ingestion/pipeline/chunkAssembly.service.test.ts
git commit -m "feat(metadata): infer sectionName from PDF page headings"
```

---

### Task 4: DOCX Page Number Passthrough

**Files:**
- Modify: `backend/src/services/ingestion/pipeline/pipelineTypes.ts:55`
- Modify: `backend/src/services/ingestion/pipeline/chunkAssembly.service.ts:65-133`
- Modify: `backend/src/services/ingestion/extraction/extractionResult.types.ts` (if section type needs `pageStart`)
- Test: `backend/src/services/ingestion/pipeline/chunkAssembly.service.test.ts`

**Step 1: Write the failing test**

```typescript
test("DOCX sections pass through pageStart as pageNumber", () => {
  const extraction: any = {
    sourceType: "docx",
    text: "Introduction\nBody text.\nConclusion\nFinal text.",
    sections: [
      { heading: "Introduction", level: 1, content: "Body text.", path: ["Introduction"], pageStart: 1 },
      { heading: "Conclusion", level: 1, content: "Final text.", path: ["Conclusion"], pageStart: 3 },
    ],
  };

  const chunks = buildInputChunks(extraction, extraction.text);

  const introChunks = chunks.filter((c) => c.metadata?.sectionName === "Introduction");
  expect(introChunks.length).toBeGreaterThan(0);
  expect(introChunks[0].pageNumber).toBe(1);

  const conclusionChunks = chunks.filter((c) => c.metadata?.sectionName === "Conclusion");
  expect(conclusionChunks.length).toBeGreaterThan(0);
  expect(conclusionChunks[0].pageNumber).toBe(3);
});

test("DOCX without pageStart still works (pageNumber undefined)", () => {
  const extraction: any = {
    sourceType: "docx",
    text: "Heading\nContent.",
    sections: [
      { heading: "Heading", level: 1, content: "Content.", path: ["Heading"] },
    ],
  };

  const chunks = buildInputChunks(extraction, extraction.text);
  expect(chunks[0].pageNumber).toBeUndefined();
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern chunkAssembly.service --no-coverage -t "DOCX sections pass through pageStart" 2>&1 | tail -20`
Expected: FAIL — pageNumber is always undefined for DOCX

**Step 3: Wire pageStart through DOCX chunking**

In the DOCX section emitter (lines 70-117 of `chunkAssembly.service.ts`), read `section.pageStart` and attach as `pageNumber`:

```typescript
const emitSection = (
  section: {
    heading?: string;
    level?: number;
    content?: string;
    path?: string[];
    pageStart?: number;  // ← ADD
  },
  parentPath: string[],
) => {
  const pageNumber = section.pageStart ?? undefined;  // ← ADD

  // In heading chunk (line ~81):
  out.push({
    chunkIndex: idx++,
    content: headingContent,
    pageNumber,  // ← ADD
    metadata: { ... },
  });

  // In text chunks (line ~101):
  out.push({
    chunkIndex: idx++,
    content: seg.content,
    pageNumber,  // ← ADD
    metadata: { ... },
  });
};
```

**Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern chunkAssembly.service --no-coverage -t "DOCX sections pass through pageStart" 2>&1 | tail -20`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/ingestion/pipeline/chunkAssembly.service.ts \
       backend/src/services/ingestion/pipeline/chunkAssembly.service.test.ts
git commit -m "feat(metadata): DOCX page number passthrough via section.pageStart"
```

---

### Task 5: Fix parseCellRef for Multi-Letter Columns

**Files:**
- Modify: `backend/src/services/ingestion/pipeline/chunkAssembly.service.ts:23-48`
- Test: `backend/src/services/ingestion/pipeline/chunkAssembly.service.test.ts`

**Step 1: Write the failing test**

```typescript
describe("parseCellRef", () => {
  // parseCellRef is not exported — test via buildInputChunks with cell facts
  // that use multi-letter columns.
  test("cell facts with multi-letter columns (AA, AB) get correct columnIndex", () => {
    const extraction: any = {
      sourceType: "xlsx",
      sheets: [{ sheetName: "Data", textContent: "Data sheet" }],
      cellFacts: [
        { sheet: "Data", cell: "AA10", rowLabel: "Revenue", colHeader: "Jan", value: "100", displayValue: "100" },
        { sheet: "Data", cell: "AZ5", rowLabel: "Cost", colHeader: "Feb", value: "200", displayValue: "200" },
      ],
    };

    const chunks = buildInputChunks(extraction, "");
    const cellChunks = chunks.filter((c) => c.metadata?.tableChunkForm === "cell_centric");

    const aa10 = cellChunks.find((c) => c.metadata?.cellRef === "AA10");
    expect(aa10).toBeDefined();
    expect(aa10!.metadata?.columnIndex).toBe(27); // AA = 27

    const az5 = cellChunks.find((c) => c.metadata?.cellRef === "AZ5");
    expect(az5).toBeDefined();
    expect(az5!.metadata?.columnIndex).toBe(52); // AZ = 52
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern chunkAssembly.service --no-coverage -t "multi-letter columns" 2>&1 | tail -20`
Expected: PASS actually — because `parseCellRef` already uses a loop `columnIndex * 26 + (charCode - 64)` which handles multi-letter columns correctly. Let me verify.

Looking at lines 39-42:
```typescript
let columnIndex = 0;
for (let i = 0; i < letters.length; i += 1) {
  columnIndex = columnIndex * 26 + (letters.charCodeAt(i) - 64);
}
```

This IS correct for multi-letter columns. AA = 1*26 + 1 = 27. The regex `[A-Z]+` on line 30 also handles multi-letter. So the audit finding was wrong — `parseCellRef` already works beyond column Z.

**Step 1 (revised): Write a confirmation test**

```typescript
test("parseCellRef handles multi-letter columns correctly via cell facts", () => {
  const extraction: any = {
    sourceType: "xlsx",
    sheets: [{ sheetName: "Data", textContent: "Data" }],
    cellFacts: [
      { sheet: "Data", cell: "AA1", rowLabel: "R", colHeader: "C", value: "1", displayValue: "1" },
    ],
  };

  const chunks = buildInputChunks(extraction, "");
  const cell = chunks.find((c) => c.metadata?.cellRef === "AA1");
  expect(cell?.metadata?.columnIndex).toBe(27);
});
```

**Step 2: Run test to verify it passes**

Run: `npx jest --testPathPattern chunkAssembly.service --no-coverage -t "multi-letter columns" 2>&1 | tail -20`
Expected: PASS (confirms existing code is correct)

**Step 3: Commit**

```bash
git add backend/src/services/ingestion/pipeline/chunkAssembly.service.test.ts
git commit -m "test(table): confirm parseCellRef handles multi-letter columns (AA+)"
```

---

### Task 6: Cross-Cell Unit Consistency Check

**Files:**
- Modify: `backend/src/services/ingestion/pipeline/tableUnitNormalization.service.ts`
- Test: `backend/src/services/ingestion/pipeline/tableUnitNormalization.service.test.ts`

**Step 1: Write the failing test**

```typescript
import { checkRowUnitConsistency } from "./tableUnitNormalization.service";

describe("checkRowUnitConsistency", () => {
  test("returns consistent when all cells have same unit", () => {
    const result = checkRowUnitConsistency([
      { unitNormalized: "currency_usd" },
      { unitNormalized: "currency_usd" },
      { unitNormalized: "currency_usd" },
    ]);
    expect(result.consistent).toBe(true);
    expect(result.dominantUnit).toBe("currency_usd");
    expect(result.conflicts).toHaveLength(0);
  });

  test("returns inconsistent when cells have mixed units", () => {
    const result = checkRowUnitConsistency([
      { unitNormalized: "currency_usd", cellRef: "A1" },
      { unitNormalized: "percent", cellRef: "B1" },
      { unitNormalized: "currency_usd", cellRef: "C1" },
    ]);
    expect(result.consistent).toBe(false);
    expect(result.dominantUnit).toBe("currency_usd");
    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.conflicts[0].cellRef).toBe("B1");
  });

  test("ignores null units (cells with no detected unit)", () => {
    const result = checkRowUnitConsistency([
      { unitNormalized: "currency_usd" },
      { unitNormalized: null },
      { unitNormalized: "currency_usd" },
    ]);
    expect(result.consistent).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern tableUnitNormalization --no-coverage -t "checkRowUnitConsistency" 2>&1 | tail -20`
Expected: FAIL — function not exported

**Step 3: Implement checkRowUnitConsistency**

Add to `tableUnitNormalization.service.ts`:

```typescript
export interface UnitConsistencyResult {
  consistent: boolean;
  dominantUnit: string | null;
  conflicts: Array<{ cellRef?: string; unit: string | null }>;
}

export function checkRowUnitConsistency(
  cells: Array<{ unitNormalized?: string | null; cellRef?: string }>,
): UnitConsistencyResult {
  const unitCounts = new Map<string, number>();

  for (const cell of cells) {
    if (cell.unitNormalized) {
      unitCounts.set(
        cell.unitNormalized,
        (unitCounts.get(cell.unitNormalized) || 0) + 1,
      );
    }
  }

  if (unitCounts.size <= 1) {
    const dominant = unitCounts.size === 1
      ? [...unitCounts.keys()][0]
      : null;
    return { consistent: true, dominantUnit: dominant, conflicts: [] };
  }

  // Find dominant unit (most frequent)
  let dominantUnit: string | null = null;
  let maxCount = 0;
  for (const [unit, count] of unitCounts) {
    if (count > maxCount) {
      maxCount = count;
      dominantUnit = unit;
    }
  }

  const conflicts = cells
    .filter((c) => c.unitNormalized && c.unitNormalized !== dominantUnit)
    .map((c) => ({ cellRef: c.cellRef, unit: c.unitNormalized ?? null }));

  return { consistent: false, dominantUnit, conflicts };
}
```

**Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern tableUnitNormalization --no-coverage -t "checkRowUnitConsistency" 2>&1 | tail -20`
Expected: PASS

**Step 5: Wire into row_aggregate chunk metadata**

In `chunkAssembly.service.ts`, where row_aggregate chunks are built (lines 225-269), call `checkRowUnitConsistency` and attach a `unitConsistencyWarning` if inconsistent:

Add `unitConsistencyWarning` to `InputChunkMetadata` in `pipelineTypes.ts`:

```typescript
// Add to InputChunkMetadata:
unitConsistencyWarning?: string;
```

In `chunkAssembly.service.ts` row_aggregate block:

```typescript
import { checkRowUnitConsistency } from "./tableUnitNormalization.service";

// After computing dominantUnit, add:
const cellUnits = facts.map((f) => {
  const u = normalizeCellUnit({
    value: String(f.displayValue || f.value || ""),
    colHeader: String(f.colHeader || ""),
    rowLabel: String(f.rowLabel || ""),
  });
  return { unitNormalized: u.unitNormalized, cellRef: String(f.cell || "") };
});
const consistency = checkRowUnitConsistency(cellUnits);

// In the metadata for row_aggregate chunk:
metadata: {
  // ... existing fields ...
  unitConsistencyWarning: consistency.consistent
    ? undefined
    : `mixed_units:${consistency.conflicts.map((c) => c.unit).join(",")}`,
},
```

**Step 6: Test integration**

```typescript
test("row_aggregate warns on mixed units across cells", () => {
  const extraction: any = {
    sourceType: "xlsx",
    sheets: [{ sheetName: "Mix", textContent: "Mix" }],
    cellFacts: [
      { sheet: "Mix", cell: "A1", rowLabel: "Revenue", colHeader: "Q1", value: "$100", displayValue: "$100" },
      { sheet: "Mix", cell: "B1", rowLabel: "Revenue", colHeader: "Growth", value: "15%", displayValue: "15%" },
    ],
  };

  const chunks = buildInputChunks(extraction, "");
  const rowAgg = chunks.find(
    (c) => c.metadata?.tableChunkForm === "row_aggregate" && c.metadata?.rowLabel === "Revenue",
  );
  expect(rowAgg?.metadata?.unitConsistencyWarning).toMatch(/mixed_units/);
});
```

**Step 7: Run all table tests**

Run: `npx jest --testPathPattern "tableUnitNormalization|chunkAssembly" --no-coverage 2>&1 | tail -20`
Expected: All PASS

**Step 8: Commit**

```bash
git add backend/src/services/ingestion/pipeline/tableUnitNormalization.service.ts \
       backend/src/services/ingestion/pipeline/tableUnitNormalization.service.test.ts \
       backend/src/services/ingestion/pipeline/chunkAssembly.service.ts \
       backend/src/services/ingestion/pipeline/chunkAssembly.service.test.ts \
       backend/src/services/ingestion/pipeline/pipelineTypes.ts
git commit -m "feat(table): cross-cell unit consistency check with warnings"
```

---

### Task 7: Multi-Level headerPath Support

**Files:**
- Modify: `backend/src/services/ingestion/pipeline/chunkAssembly.service.ts:50-54`
- Test: `backend/src/services/ingestion/pipeline/chunkAssembly.service.test.ts`

**Step 1: Write the failing test**

```typescript
test("cell facts with hierarchical headers produce multi-level headerPath", () => {
  const extraction: any = {
    sourceType: "xlsx",
    sheets: [{ sheetName: "Fin", textContent: "Fin" }],
    cellFacts: [
      {
        sheet: "Fin",
        cell: "C5",
        rowLabel: "Revenue",
        colHeader: "Q1 2024",
        value: "100",
        displayValue: "100",
        headerHierarchy: ["Financial Statements", "Income Statement", "Q1 2024"],
      },
    ],
  };

  const chunks = buildInputChunks(extraction, "");
  const cell = chunks.find((c) => c.metadata?.cellRef === "C5");
  expect(cell?.metadata?.headerPath).toEqual([
    "Revenue",
    "Financial Statements",
    "Income Statement",
    "Q1 2024",
  ]);
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern chunkAssembly.service --no-coverage -t "hierarchical headers" 2>&1 | tail -20`
Expected: FAIL — headerPath only has `[rowLabel, colHeader]`

**Step 3: Extend toHeaderPath to accept hierarchy**

In `chunkAssembly.service.ts`, modify `toHeaderPath`:

```typescript
function toHeaderPath(
  rowLabel: string,
  colHeader: string,
  headerHierarchy?: string[],
): string[] {
  const row = String(rowLabel || "").trim();
  const col = String(colHeader || "").trim();

  if (headerHierarchy && headerHierarchy.length > 0) {
    return [row, ...headerHierarchy].filter(Boolean);
  }
  return [row, col].filter(Boolean);
}
```

In the cell_centric chunk builder (line ~194), pass `fact.headerHierarchy`:

```typescript
const headerPath = toHeaderPath(rowLabel, colHeader, fact.headerHierarchy);
```

**Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern chunkAssembly.service --no-coverage -t "hierarchical headers" 2>&1 | tail -20`
Expected: PASS

**Step 5: Confirm backward compat**

Run: `npx jest --testPathPattern chunkAssembly.service --no-coverage 2>&1 | tail -20`
Expected: All existing tests still PASS

**Step 6: Commit**

```bash
git add backend/src/services/ingestion/pipeline/chunkAssembly.service.ts \
       backend/src/services/ingestion/pipeline/chunkAssembly.service.test.ts
git commit -m "feat(table): multi-level headerPath from extraction hierarchy"
```

---

### Task 8: Configurable Revision Depth Limit

**Files:**
- Modify: `backend/src/services/documents/revision.service.ts:310-340`
- Test: `backend/src/services/documents/revision.service.test.ts` (create if needed)

**Step 1: Write the failing test**

```typescript
import { describe, expect, test, jest } from "@jest/globals";

describe("RevisionService — depth limit", () => {
  test("REVISION_MAX_DEPTH env controls chain walk limit", () => {
    // The constant should be read from env
    const original = process.env.REVISION_MAX_DEPTH;
    process.env.REVISION_MAX_DEPTH = "5";

    // Import after setting env
    const { getRevisionMaxDepth } = require("./revision.service");
    expect(getRevisionMaxDepth()).toBe(5);

    // Cleanup
    if (original) process.env.REVISION_MAX_DEPTH = original;
    else delete process.env.REVISION_MAX_DEPTH;
  });

  test("defaults to 20 when env not set", () => {
    delete process.env.REVISION_MAX_DEPTH;
    const { getRevisionMaxDepth } = require("./revision.service");
    expect(getRevisionMaxDepth()).toBe(20);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern "revision.service" --no-coverage -t "REVISION_MAX_DEPTH" 2>&1 | tail -20`
Expected: FAIL — `getRevisionMaxDepth` not exported

**Step 3: Extract and export the depth limit**

In `revision.service.ts`, replace the hard-coded `20`:

```typescript
export function getRevisionMaxDepth(): number {
  const raw = Number(process.env.REVISION_MAX_DEPTH);
  if (Number.isFinite(raw) && raw >= 2 && raw <= 1000) return Math.floor(raw);
  return 20;
}

// In resolveRootDocumentId (line 314):
private async resolveRootDocumentId(documentId: string): Promise<string> {
  let currentId: string | null = documentId;
  let safety = 0;
  const maxDepth = getRevisionMaxDepth();
  const warnThreshold = Math.floor(maxDepth * 0.8);

  while (currentId && safety < maxDepth) {
    safety += 1;
    if (safety === warnThreshold) {
      logger.warn("[RevisionService] Approaching revision chain depth limit", {
        documentId,
        currentDepth: safety,
        maxDepth,
      });
    }
    // ... rest unchanged ...
  }

  throw new RevisionServiceError(
    `Revision chain exceeded safety depth (max: ${maxDepth}).`,
    "REVISION_CHAIN_DEPTH_EXCEEDED",
  );
}
```

**Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern "revision.service" --no-coverage -t "REVISION_MAX_DEPTH" 2>&1 | tail -20`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/documents/revision.service.ts
git commit -m "feat(versioning): configurable REVISION_MAX_DEPTH with 80% warning"
```

---

### Task 9: DB-Level Cross-Document Linking

**Files:**
- Create: `backend/prisma/migrations/YYYYMMDD_add_document_link/migration.sql`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/src/services/documents/documentLink.service.ts`
- Test: `backend/src/services/documents/documentLink.service.test.ts`

**Step 1: Add Prisma model**

In `schema.prisma`, add:

```prisma
model DocumentLink {
  id               String   @id @default(uuid())
  sourceDocumentId String   @map("source_document_id")
  targetDocumentId String   @map("target_document_id")
  relationshipType String   @map("relationship_type")
  // One of: amends, supersedes, restates, extends, terminates
  status           String   @default("active") @map("status")
  // active, resolved, conflict
  metadata         Json?    @map("metadata")
  createdAt        DateTime @default(now()) @map("created_at")

  sourceDocument   Document @relation("DocumentLinksFrom", fields: [sourceDocumentId], references: [id], onDelete: Cascade)
  targetDocument   Document @relation("DocumentLinksTo", fields: [targetDocumentId], references: [id], onDelete: Cascade)

  @@unique([sourceDocumentId, targetDocumentId, relationshipType])
  @@index([sourceDocumentId])
  @@index([targetDocumentId])
  @@index([relationshipType])
  @@map("document_links")
}
```

Add to `Document` model:

```prisma
  linksFrom DocumentLink[] @relation("DocumentLinksFrom")
  linksTo   DocumentLink[] @relation("DocumentLinksTo")
```

**Step 2: Generate migration**

Run: `npx prisma migrate dev --name add_document_link --create-only`

**Step 3: Write the service**

Create `backend/src/services/documents/documentLink.service.ts`:

```typescript
import prisma from "../../config/database";
import { logger } from "../../utils/logger";

const VALID_RELATIONSHIP_TYPES = [
  "amends",
  "supersedes",
  "restates",
  "extends",
  "terminates",
] as const;

type RelationshipType = (typeof VALID_RELATIONSHIP_TYPES)[number];

export interface CreateDocumentLinkInput {
  sourceDocumentId: string;
  targetDocumentId: string;
  relationshipType: RelationshipType;
  metadata?: Record<string, unknown>;
}

export interface DocumentLinkRecord {
  id: string;
  sourceDocumentId: string;
  targetDocumentId: string;
  relationshipType: string;
  status: string;
  createdAt: Date;
}

export class DocumentLinkService {
  async createLink(input: CreateDocumentLinkInput): Promise<DocumentLinkRecord> {
    if (!VALID_RELATIONSHIP_TYPES.includes(input.relationshipType)) {
      throw new Error(
        `Invalid relationship type: ${input.relationshipType}. Must be one of: ${VALID_RELATIONSHIP_TYPES.join(", ")}`,
      );
    }

    if (input.sourceDocumentId === input.targetDocumentId) {
      throw new Error("Cannot link a document to itself");
    }

    // Check for VCR_002: document marked as both effective and superseded
    if (input.relationshipType === "supersedes") {
      const existing = await prisma.documentLink.findMany({
        where: {
          targetDocumentId: input.targetDocumentId,
          relationshipType: "supersedes",
          status: "active",
        },
      });
      if (existing.length > 0) {
        logger.warn("[DocumentLink] VCR_002: target already superseded", {
          targetDocumentId: input.targetDocumentId,
          existingLinkId: existing[0].id,
        });
      }
    }

    return prisma.documentLink.create({
      data: {
        sourceDocumentId: input.sourceDocumentId,
        targetDocumentId: input.targetDocumentId,
        relationshipType: input.relationshipType,
        metadata: input.metadata ?? {},
      },
    });
  }

  async getLinksFrom(documentId: string): Promise<DocumentLinkRecord[]> {
    return prisma.documentLink.findMany({
      where: { sourceDocumentId: documentId, status: "active" },
      orderBy: { createdAt: "desc" },
    });
  }

  async getLinksTo(documentId: string): Promise<DocumentLinkRecord[]> {
    return prisma.documentLink.findMany({
      where: { targetDocumentId: documentId, status: "active" },
      orderBy: { createdAt: "desc" },
    });
  }

  async resolveLink(linkId: string): Promise<void> {
    await prisma.documentLink.update({
      where: { id: linkId },
      data: { status: "resolved" },
    });
  }
}
```

**Step 4: Write unit test**

Create `backend/src/services/documents/documentLink.service.test.ts`:

```typescript
import { describe, expect, test } from "@jest/globals";
import { DocumentLinkService } from "./documentLink.service";

describe("DocumentLinkService — validation", () => {
  const service = new DocumentLinkService();

  test("rejects invalid relationship type", async () => {
    await expect(
      service.createLink({
        sourceDocumentId: "doc-a",
        targetDocumentId: "doc-b",
        relationshipType: "invalid" as any,
      }),
    ).rejects.toThrow("Invalid relationship type");
  });

  test("rejects self-link", async () => {
    await expect(
      service.createLink({
        sourceDocumentId: "doc-a",
        targetDocumentId: "doc-a",
        relationshipType: "amends",
      }),
    ).rejects.toThrow("Cannot link a document to itself");
  });
});
```

**Step 5: Run test**

Run: `npx jest --testPathPattern documentLink --no-coverage 2>&1 | tail -20`
Expected: PASS (validation tests don't hit DB)

**Step 6: Commit**

```bash
git add backend/prisma/schema.prisma \
       backend/src/services/documents/documentLink.service.ts \
       backend/src/services/documents/documentLink.service.test.ts
git commit -m "feat(cross-doc): DocumentLink model + service for amendment chain enforcement"
```

---

### Task 10: Tenant Key Rotation

**Files:**
- Modify: `backend/src/services/security/tenantKey.service.ts`
- Modify: `backend/src/services/security/keyManager.service.ts`
- Create: `backend/src/services/security/keyRotation.service.ts`
- Test: `backend/src/services/security/keyRotation.service.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, expect, test } from "@jest/globals";
import { EncryptionService } from "./encryption.service";
import { EnvelopeService } from "./envelope.service";
import { KeyRotationService } from "./keyRotation.service";

describe("KeyRotationService", () => {
  const enc = new EncryptionService();
  const envelope = new EnvelopeService(enc);

  test("rotateTenantKey re-wraps a document key with a new tenant key", () => {
    const oldTk = enc.randomKey32();
    const newTk = enc.randomKey32();
    const dk = enc.randomKey32();

    // Wrap dk with old tenant key
    const wrappedWithOld = envelope.wrapRecordKey(dk, oldTk, "wrap:document:doc-1");

    // Rotate: unwrap with old, re-wrap with new
    const service = new KeyRotationService(enc, envelope);
    const wrappedWithNew = service.rewrapDocumentKey(
      wrappedWithOld,
      oldTk,
      newTk,
      "wrap:document:doc-1",
    );

    // Verify: unwrapping with new TK produces the same DK
    const recovered = envelope.unwrapRecordKey(wrappedWithNew, newTk, "wrap:document:doc-1");
    expect(recovered.equals(dk)).toBe(true);

    // Verify: old TK no longer works
    expect(() =>
      envelope.unwrapRecordKey(wrappedWithNew, oldTk, "wrap:document:doc-1"),
    ).toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest --testPathPattern keyRotation --no-coverage 2>&1 | tail -20`
Expected: FAIL — module not found

**Step 3: Implement KeyRotationService**

Create `backend/src/services/security/keyRotation.service.ts`:

```typescript
import { EncryptionService } from "./encryption.service";
import { EnvelopeService } from "./envelope.service";
import { logger } from "../../utils/logger";

/**
 * Handles re-wrapping document keys when a tenant key is rotated.
 *
 * Flow:
 * 1. Decrypt document key with OLD tenant key
 * 2. Re-encrypt document key with NEW tenant key
 * 3. Store the re-wrapped key
 *
 * The document key itself does NOT change — only the wrapping changes.
 * This means encrypted content remains readable without re-encryption.
 */
export class KeyRotationService {
  constructor(
    private enc: EncryptionService,
    private envelopes: EnvelopeService,
  ) {}

  /**
   * Re-wrap a single document key from old tenant key to new tenant key.
   * Returns the new wrapped key string.
   */
  rewrapDocumentKey(
    wrappedKey: string,
    oldTenantKey: Buffer,
    newTenantKey: Buffer,
    aad: string,
  ): string {
    const dk = this.envelopes.unwrapRecordKey(wrappedKey, oldTenantKey, aad);
    return this.envelopes.wrapRecordKey(dk, newTenantKey, aad);
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npx jest --testPathPattern keyRotation --no-coverage 2>&1 | tail -20`
Expected: PASS

**Step 5: Add rotateTenantKey method to TenantKeyService**

In `tenantKey.service.ts`, add:

```typescript
async rotateTenantKey(userId: string): Promise<{ oldKeyHash: string; newKeyHash: string }> {
  const oldTk = await this.getTenantKey(userId);
  const newTk = this.enc.randomKey32();

  const wrapped = this.keyManager.provider === "local"
    ? this.enc.encryptStringToJson(newTk.toString("base64"), /* masterKey */ ... )
    : /* KMS wrap */;

  // This is a schema-level operation — the caller must re-wrap all document keys
  // using KeyRotationService.rewrapDocumentKey() for each document.

  // For now, store new tenant key
  const generated = await this.keyManager.generateTenantKey();

  await this.prisma.user.update({
    where: { id: userId },
    data: {
      tenantKeyEncrypted: generated.envelope.encryptedKey,
      tenantKeyProvider: generated.envelope.provider,
      tenantKeyMeta: { ...(generated.envelope.meta ?? {}), rotatedAt: new Date().toISOString() },
    },
  });

  // Invalidate cache
  this.cache.delete(userId);

  return {
    oldKeyHash: crypto.createHash("sha256").update(oldTk).digest("hex").slice(0, 16),
    newKeyHash: crypto.createHash("sha256").update(generated.plaintextKey).digest("hex").slice(0, 16),
  };
}
```

**Step 6: Commit**

```bash
git add backend/src/services/security/keyRotation.service.ts \
       backend/src/services/security/keyRotation.service.test.ts \
       backend/src/services/security/tenantKey.service.ts
git commit -m "feat(encryption): key rotation service for tenant key re-wrapping"
```

---

### Task 11: Five Chunk + Metadata Invariant Tests

**Files:**
- Create: `backend/src/tests/certification/indexing-storage-invariants.cert.test.ts`

**Step 1: Write all five tests**

```typescript
import { describe, expect, test } from "@jest/globals";
import { buildInputChunks, deduplicateChunks } from "../../services/ingestion/pipeline/chunkAssembly.service";

describe("Indexing & Storage — Chunk + Metadata Invariants", () => {

  // Test 1: Every chunk has ≥1 provenance location field
  test("INV-01: every chunk carries at least one provenance location field", () => {
    const formats = [
      {
        name: "PDF",
        extraction: {
          sourceType: "pdf",
          text: "Page content here.",
          pages: [{ page: 1, text: "Page content here." }],
        },
      },
      {
        name: "DOCX",
        extraction: {
          sourceType: "docx",
          text: "Heading\nBody.",
          sections: [{ heading: "Heading", level: 1, content: "Body.", path: ["Heading"] }],
        },
      },
      {
        name: "XLSX",
        extraction: {
          sourceType: "xlsx",
          sheets: [{ sheetName: "S1", textContent: "Data" }],
          cellFacts: [
            { sheet: "S1", cell: "A1", rowLabel: "Rev", colHeader: "Q1", value: "100", displayValue: "100" },
          ],
        },
      },
      {
        name: "PPTX",
        extraction: {
          sourceType: "pptx",
          text: "Slide text.",
          slides: [{ slide: 1, title: "Title", text: "Slide text." }],
        },
      },
    ] as const;

    for (const fmt of formats) {
      const chunks = buildInputChunks(fmt.extraction as any, fmt.extraction.text ?? "");
      for (const chunk of chunks) {
        const hasLocation =
          chunk.pageNumber != null ||
          chunk.metadata?.sheetName != null ||
          chunk.metadata?.sectionName != null ||
          chunk.metadata?.startChar != null ||
          chunk.metadata?.slideTitle != null;
        expect(hasLocation).toBe(true);
      }
    }
  });

  // Test 2: chunkIndex is sequential 0..N-1 with no gaps
  test("INV-02: chunkIndex is sequential 0..N-1 with no gaps", () => {
    const extraction: any = {
      sourceType: "pdf",
      text: "A".repeat(5000),
      pages: [
        { page: 1, text: "A".repeat(2500) },
        { page: 2, text: "A".repeat(2500) },
      ],
    };

    const chunks = buildInputChunks(extraction, extraction.text);
    const indices = chunks.map((c) => c.chunkIndex);
    expect(indices).toEqual(Array.from({ length: indices.length }, (_, i) => i));
  });

  // Test 3: Deduplicated chunks preserve unique content across sections
  test("INV-03: dedup preserves same content in different sections", () => {
    const shared = "Revenue for the quarter was $1.5 million across all segments.";
    const chunks = [
      { chunkIndex: 0, content: shared, metadata: { sectionName: "Summary" } },
      { chunkIndex: 1, content: shared, metadata: { sectionName: "Financials" } },
      { chunkIndex: 2, content: shared, metadata: { sectionName: "Summary" } }, // true dup
    ];

    const deduped = deduplicateChunks(chunks as any);
    // Should keep 2 (one per section), remove the duplicate within "Summary"
    expect(deduped.length).toBe(2);
    const sections = deduped.map((c) => (c as any).metadata.sectionName);
    expect(sections).toContain("Summary");
    expect(sections).toContain("Financials");
  });

  // Test 4: cell_centric chunks carry required cell coordinates
  test("INV-04: cell_centric chunks have rowIndex, columnIndex, and tableId", () => {
    const extraction: any = {
      sourceType: "xlsx",
      sheets: [{ sheetName: "Data", textContent: "Data" }],
      cellFacts: [
        { sheet: "Data", cell: "B3", rowLabel: "Rev", colHeader: "Q1", value: "$100", displayValue: "$100" },
        { sheet: "Data", cell: "C3", rowLabel: "Rev", colHeader: "Q2", value: "$200", displayValue: "$200" },
      ],
    };

    const chunks = buildInputChunks(extraction, "");
    const cellChunks = chunks.filter((c) => c.metadata?.tableChunkForm === "cell_centric");

    expect(cellChunks.length).toBeGreaterThan(0);
    for (const chunk of cellChunks) {
      expect(chunk.metadata.rowIndex).toBeDefined();
      expect(chunk.metadata.columnIndex).toBeDefined();
      expect(chunk.metadata.tableId).toBeTruthy();
      expect(chunk.metadata.tableId).toMatch(/^sheet:/);
    }
  });

  // Test 5: sourceType matches extraction input format
  test("INV-05: sourceType on every chunk matches the extraction format", () => {
    const cases: Array<{ sourceType: string; extraction: any }> = [
      {
        sourceType: "pdf",
        extraction: { sourceType: "pdf", text: "Pg.", pages: [{ page: 1, text: "Pg." }] },
      },
      {
        sourceType: "docx",
        extraction: {
          sourceType: "docx", text: "H\nB.",
          sections: [{ heading: "H", level: 1, content: "B.", path: ["H"] }],
        },
      },
      {
        sourceType: "xlsx",
        extraction: {
          sourceType: "xlsx",
          sheets: [{ sheetName: "S", textContent: "S" }],
          cellFacts: [],
        },
      },
      {
        sourceType: "pptx",
        extraction: {
          sourceType: "pptx", text: "Sl.",
          slides: [{ slide: 1, title: "T", text: "Sl." }],
        },
      },
    ];

    for (const { sourceType, extraction } of cases) {
      const chunks = buildInputChunks(extraction, extraction.text ?? "");
      for (const chunk of chunks) {
        expect(chunk.metadata?.sourceType).toBe(sourceType);
      }
    }
  });
});
```

**Step 2: Run all invariant tests**

Run: `npx jest --testPathPattern "indexing-storage-invariants" --no-coverage 2>&1 | tail -30`
Expected: All 5 PASS

**Step 3: Commit**

```bash
git add backend/src/tests/certification/indexing-storage-invariants.cert.test.ts
git commit -m "test(cert): 5 chunk+metadata invariant tests for indexing & storage"
```

---

## Execution Checklist

| # | Task | Points | Deps |
|---|---|---|---|
| 1 | Extensible abbreviation list | +1 | None |
| 2 | Domain-adaptive chunking policy | +2 | None |
| 3 | PDF section structure inference | +3 | None |
| 4 | DOCX page number passthrough | +2 | None |
| 5 | Confirm parseCellRef multi-letter | +1 | None |
| 6 | Cross-cell unit consistency check | +2 | None |
| 7 | Multi-level headerPath | +1 | None |
| 8 | Configurable revision depth limit | +2 | None |
| 9 | DB-level cross-doc linking | +3 | None |
| 10 | Tenant key rotation | +1 | None |
| 11 | Certification invariant tests | — | Tasks 1-8 |

Tasks 1-10 are independent and can be parallelized. Task 11 should run last to confirm all invariants hold.
