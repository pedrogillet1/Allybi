# Phase 2: Chunking, Metadata & Table Indexing — Indexing & Storage A+ Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all chunking defects — broken charOffset tracking, abbreviation-aware sentence splitting, dedup dropping valid data, missing pageNumber on DOCX, false-positive unit detection, missing scale/magnitude detection — and add comprehensive tests.

**Architecture:** Bottom-up fixes: (1) fix core `chunking.service.ts` primitives, (2) fix `tableUnitNormalization.service.ts`, (3) fix `chunkAssembly.service.ts` offset tracking and metadata, (4) fix `textQuality.service.ts`, (5) add comprehensive test suites for all four files.

**Tech Stack:** TypeScript, Jest (ts-jest), `@jest/globals`

**Depends on:** Phase 1 (schema changes) must be complete.

---

### Task 1: Fix Abbreviation-Aware Sentence Boundary Detection

**Files:**
- Modify: `backend/src/services/ingestion/chunking.service.ts:113-126`
- Test: `backend/src/services/ingestion/chunking.service.test.ts`

**Step 1: Write the failing test**

Add to `chunking.service.test.ts`:

```typescript
describe("abbreviation-aware sentence splitting", () => {
  test("does not split on Dr. or U.S. or e.g.", () => {
    const text = "Dr. Smith works for U.S. Corp. He is e.g. a consultant. " +
      "This is important. ".repeat(100); // Force multiple chunks
    const chunks = splitTextIntoChunks(text, { targetChars: 200, overlapChars: 20 });
    // No chunk should start with "Smith works" or "Corp." or "a consultant"
    for (const chunk of chunks) {
      expect(chunk).not.toMatch(/^Smith works/);
      expect(chunk).not.toMatch(/^Corp\./);
      expect(chunk).not.toMatch(/^a consultant/);
    }
  });

  test("still splits on real sentence boundaries after abbreviations", () => {
    const text = "Dr. Smith arrived. The meeting started. ".repeat(50);
    const chunks = splitTextIntoChunks(text, { targetChars: 200, overlapChars: 20 });
    expect(chunks.length).toBeGreaterThan(1);
    // Chunks should end at real sentence boundaries
    for (let i = 0; i < chunks.length - 1; i++) {
      expect(chunks[i]).toMatch(/[.!?]\s*$/);
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx jest chunking.service.test.ts --verbose 2>&1 | tail -20`
Expected: FAIL — splits on abbreviation periods

**Step 3: Implement abbreviation-aware `findSentenceBoundary`**

Replace `findSentenceBoundary` in `chunking.service.ts` (lines 113-126):

```typescript
const ABBREVIATIONS = new Set([
  "dr", "mr", "mrs", "ms", "prof", "sr", "jr", "st", "ave", "blvd",
  "inc", "corp", "ltd", "co", "dept", "univ", "govt", "approx",
  "vs", "etc", "al", "fig", "vol", "no", "op", "ed", "rev",
  "gen", "gov", "sgt", "cpl", "pvt", "capt", "col", "maj", "lt",
]);

const ABBREVIATION_PATTERNS = [
  /^[A-Z]\.$/,          // Single letter: "U." "S." "A."
  /^[A-Z]\.[A-Z]\.$/,   // Multi-letter: "U.S." "E.U."
  /^e\.g$/i, /^i\.e$/i, /^a\.m$/i, /^p\.m$/i, /^vs$/i,
];

function isAbbreviationDot(text: string, dotIndex: number): boolean {
  // Find the word before this dot
  let wordStart = dotIndex - 1;
  while (wordStart >= 0 && /[a-zA-Z.]/.test(text[wordStart])) {
    wordStart--;
  }
  wordStart++;
  const wordBeforeDot = text.slice(wordStart, dotIndex).toLowerCase();

  if (ABBREVIATIONS.has(wordBeforeDot)) return true;

  // Check patterns (single-letter initials, multi-letter like U.S.)
  const wordWithDot = text.slice(wordStart, dotIndex + 1);
  for (const pat of ABBREVIATION_PATTERNS) {
    if (pat.test(wordWithDot)) return true;
  }

  // If the character after the dot+space is lowercase, likely not a sentence end
  const afterDot = text[dotIndex + 1];
  const twoAfterDot = text[dotIndex + 2];
  if (afterDot === " " && twoAfterDot && /[a-z]/.test(twoAfterDot)) return true;

  return false;
}

function findSentenceBoundary(
  text: string,
  endOffset: number,
  minBoundaryOffset: number,
): number {
  const end = Math.min(endOffset, text.length - 1);
  for (let i = end; i > minBoundaryOffset; i -= 1) {
    const current = text[i];
    if (!/[.!?;:。！？；]/.test(current)) continue;

    // Skip abbreviation dots
    if (current === "." && isAbbreviationDot(text, i)) continue;

    const next = text[i + 1];
    if (!next || /\s/.test(next)) return i + 1;
  }
  return -1;
}
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npx jest chunking.service.test.ts --verbose 2>&1 | tail -20`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/ingestion/chunking.service.ts backend/src/services/ingestion/chunking.service.test.ts
git commit -m "fix: abbreviation-aware sentence boundary detection in chunking"
```

---

### Task 2: Fix Dedup — Preserve Numeric Content, Add Logging, Guard overlap >= target

**Files:**
- Modify: `backend/src/services/ingestion/chunking.service.ts`
- Test: `backend/src/services/ingestion/chunking.service.test.ts`

**Step 1: Write the failing tests**

```typescript
describe("dedup preserves chunks with different numbers", () => {
  test("keeps chunks with same headers but different numeric values", () => {
    const records = [
      { content: "Revenue Q1: 100,000", metadata: { sheetName: "Sheet1" } },
      { content: "Revenue Q2: 200,000", metadata: { sheetName: "Sheet1" } },
      { content: "Revenue Q3: 300,000", metadata: { sheetName: "Sheet1" } },
    ];
    const result = deduplicateChunkRecords(records);
    expect(result).toHaveLength(3); // All should survive — different numbers
  });
});

describe("overlapChars >= targetChars safety", () => {
  test("does not drop trailing text when overlapChars equals targetChars", () => {
    const text = "A".repeat(100) + " " + "B".repeat(100);
    const chunks = splitTextIntoChunks(text, { targetChars: 100, overlapChars: 100 });
    const joined = chunks.join("");
    expect(joined).toContain("A");
    expect(joined).toContain("B");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx jest chunking.service.test.ts -t "dedup preserves" --verbose`
Expected: FAIL — numbers stripped by minWordLength, chunks appear identical

**Step 3: Fix `tokenizeForDedupe` — include numeric tokens regardless of length**

In `chunking.service.ts`, replace `tokenizeForDedupe` (line 128-138):

```typescript
function tokenizeForDedupe(text: string, minWordLength: number): Set<string> {
  const normalized = String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const words = normalized
    .replace(/[^\p{L}\p{N}\s.,]+/gu, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  const tokens = new Set<string>();
  for (const word of words) {
    // Always include numeric tokens (even short ones like "100", "5")
    if (/\d/.test(word)) {
      tokens.add(word);
      continue;
    }
    // Apply length filter only to non-numeric words
    if (word.length >= minWordLength) {
      tokens.add(word);
    }
  }
  return tokens;
}
```

Fix `resolvePolicy` to enforce `overlapChars < targetChars`:

```typescript
function resolvePolicy(
  overrides: Partial<ChunkingPolicy> | undefined,
): ChunkingPolicy {
  const base = { /* ...existing... */ };
  if (!overrides) return base;

  const resolved = { /* ...existing... */ };

  // Safety: overlapChars must be < targetChars to avoid infinite loops
  if (resolved.overlapChars >= resolved.targetChars) {
    resolved.overlapChars = Math.floor(resolved.targetChars * 0.1);
  }

  return resolved;
}
```

**Step 4: Run tests**

Run: `cd backend && npx jest chunking.service.test.ts --verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/ingestion/chunking.service.ts backend/src/services/ingestion/chunking.service.test.ts
git commit -m "fix: dedup preserves numeric-differing chunks, guard overlap >= target"
```

---

### Task 3: Fix Table Unit Normalization — False Positives + Scale Detection

**Files:**
- Modify: `backend/src/services/ingestion/pipeline/tableUnitNormalization.service.ts`
- Create: `backend/src/services/ingestion/pipeline/tableUnitNormalization.service.test.ts`

**Step 1: Write the test file (TDD)**

```typescript
import { describe, expect, test } from "@jest/globals";
import { normalizeCellUnit } from "./tableUnitNormalization.service";

describe("normalizeCellUnit", () => {
  // Currency detection
  test("detects USD from dollar sign", () => {
    const r = normalizeCellUnit({ value: "$1,500" });
    expect(r.unitNormalized).toBe("currency_usd");
    expect(r.numericValue).toBe(1500);
  });

  test("detects USD with space after $", () => {
    const r = normalizeCellUnit({ value: "$ 1,500" });
    expect(r.unitNormalized).toBe("currency_usd");
  });

  test("detects BRL from R$", () => {
    const r = normalizeCellUnit({ value: "R$ 100" });
    expect(r.unitNormalized).toBe("currency_brl");
  });

  // Scale/magnitude detection
  test("detects millions multiplier from header", () => {
    const r = normalizeCellUnit({ value: "1.5", colHeader: "Revenue (USD millions)" });
    expect(r.unitNormalized).toBe("currency_usd");
    expect(r.numericValue).toBe(1500000);
    expect(r.scaleRaw).toBe("millions");
  });

  test("detects 'mn' shorthand", () => {
    const r = normalizeCellUnit({ value: "2.3", colHeader: "Revenue (USD mn)" });
    expect(r.numericValue).toBe(2300000);
  });

  test("detects billions", () => {
    const r = normalizeCellUnit({ value: "1.2", colHeader: "Assets ($bn)" });
    expect(r.numericValue).toBe(1200000000);
  });

  test("detects thousands from '000", () => {
    const r = normalizeCellUnit({ value: "150", colHeader: "Revenue ('000)" });
    expect(r.numericValue).toBe(150000);
  });

  test("detects 'in thousands' from header", () => {
    const r = normalizeCellUnit({ value: "500", colHeader: "Revenue (in thousands)" });
    expect(r.numericValue).toBe(500000);
  });

  // False positive prevention
  test("does NOT detect mass_g from '5g network'", () => {
    const r = normalizeCellUnit({ value: "5G Network" });
    expect(r.unitNormalized).not.toBe("mass_g");
  });

  test("does NOT detect length_m from 'size: M'", () => {
    const r = normalizeCellUnit({ value: "M", colHeader: "T-Shirt Size" });
    expect(r.unitNormalized).toBeNull();
  });

  test("does NOT detect seconds from standalone 's'", () => {
    const r = normalizeCellUnit({ value: "item(s)" });
    expect(r.unitNormalized).toBeNull();
  });

  test("does NOT detect hours from 'Step H'", () => {
    const r = normalizeCellUnit({ value: "Step H" });
    expect(r.unitNormalized).toBeNull();
  });

  // Accounting negatives
  test("parses parenthesized negative: (1,500)", () => {
    const r = normalizeCellUnit({ value: "(1,500)", colHeader: "Net Income (USD)" });
    expect(r.numericValue).toBe(-1500);
  });

  // Percentage as display value
  test("percentage numericValue is display value", () => {
    const r = normalizeCellUnit({ value: "45%" });
    expect(r.unitNormalized).toBe("percent");
    expect(r.numericValue).toBe(45);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tableUnitNormalization.service.test.ts --verbose`
Expected: FAIL — false positives, no scale detection, no parenthesized negatives

**Step 3: Rewrite `tableUnitNormalization.service.ts`**

Key changes:
1. Replace single-letter patterns with context-aware multi-word patterns
2. Add `SCALE_PATTERNS` for millions/billions/thousands detection
3. Add `scaleRaw` and `scaleMultiplier` to `NormalizedCellUnit` interface
4. Add parenthesized negative parsing to `parseLocaleNumber`
5. Apply scale multiplier to `numericValue`

```typescript
export interface NormalizedCellUnit {
  unitRaw: string | null;
  unitNormalized: string | null;
  numericValue: number | null;
  scaleRaw: string | null;
  scaleMultiplier: number | null;
}
```

Updated `UNIT_PATTERNS` — remove all single-letter patterns, replace with safer multi-word patterns:

```typescript
// REMOVE these dangerous patterns:
//   /\bg\b/, /\bm\b/, /\bs\b/, /\bh\b/
// REPLACE with context-requiring patterns:
{
  normalized: "mass_kg",
  patterns: [/\bkg\b/i, /\bkgs\b/i, /\bkilograms?\b/i],
},
{
  normalized: "mass_g",
  patterns: [/\bgrams?\b/i, /\b\d+\s*g\b/i],  // Require digit before "g"
},
{
  normalized: "length_m",
  patterns: [/\bmeters?\b/i, /\b\d+\s*m\b/i],  // Require digit before "m"
},
{
  normalized: "duration_s",
  patterns: [/\bseconds?\b/i, /\bsecs?\b/i, /\b\d+\s*s\b/i],
},
{
  normalized: "duration_h",
  patterns: [/\bhours?\b/i, /\bhrs?\b/i, /\b\d+\s*h\b/i],
},
```

Add scale detection:

```typescript
const SCALE_PATTERNS: { pattern: RegExp; multiplier: number; raw: string }[] = [
  { pattern: /\bbillions?\b/i, multiplier: 1e9, raw: "billions" },
  { pattern: /\bbn\b/i, multiplier: 1e9, raw: "bn" },
  { pattern: /\bmillions?\b/i, multiplier: 1e6, raw: "millions" },
  { pattern: /\bmn\b/i, multiplier: 1e6, raw: "mn" },
  { pattern: /\bmm\b/i, multiplier: 1e6, raw: "mm" },
  { pattern: /\bthousands?\b/i, multiplier: 1e3, raw: "thousands" },
  { pattern: /'\s*000\b/, multiplier: 1e3, raw: "'000" },
  { pattern: /\bk\b/i, multiplier: 1e3, raw: "k" },
];

function detectScale(text: string): { raw: string; multiplier: number } | null {
  const source = clean(text).toLowerCase();
  for (const entry of SCALE_PATTERNS) {
    if (entry.pattern.test(source)) {
      return { raw: entry.raw, multiplier: entry.multiplier };
    }
  }
  return null;
}
```

Add parenthesized negative to `parseLocaleNumber`:

```typescript
function parseLocaleNumber(raw: string): number | null {
  let value = clean(raw);
  if (!value) return null;

  // Accounting negative: (1,500) → -1500
  const parenMatch = value.match(/^\((.+)\)$/);
  if (parenMatch) {
    value = "-" + parenMatch[1];
  }
  // ... rest of existing logic
}
```

Update `normalizeCellUnit` to apply scale:

```typescript
export function normalizeCellUnit(params: { ... }): NormalizedCellUnit {
  // ...existing unit detection...

  const scaleFromHeader = detectScale(colHeader);
  const scaleFromRow = detectScale(rowLabel);
  const scale = scaleFromHeader || scaleFromRow;

  let numericValue = parseLocaleNumber(value);
  if (numericValue !== null && scale) {
    numericValue = numericValue * scale.multiplier;
  }

  return {
    unitRaw: winner?.raw ?? null,
    unitNormalized: winner?.normalized ?? null,
    numericValue,
    scaleRaw: scale?.raw ?? null,
    scaleMultiplier: scale?.multiplier ?? null,
  };
}
```

**Step 4: Run tests**

Run: `cd backend && npx jest tableUnitNormalization.service.test.ts --verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/ingestion/pipeline/tableUnitNormalization.service.ts backend/src/services/ingestion/pipeline/tableUnitNormalization.service.test.ts
git commit -m "fix: context-aware unit detection, scale/magnitude support, parenthesized negatives"
```

---

### Task 4: Fix chunkAssembly charOffset Tracking

**Files:**
- Modify: `backend/src/services/ingestion/pipeline/chunkAssembly.service.ts`
- Modify: `backend/src/services/ingestion/pipeline/pipelineTypes.ts`
- Test: `backend/src/services/ingestion/pipeline/chunkAssembly.service.test.ts`

**Step 1: Write failing tests for offset correctness**

Add to `chunkAssembly.service.test.ts`:

```typescript
describe("charOffset correctness", () => {
  test("PDF chunk offsets are consistent with fullText positions", () => {
    const pageText = "This is page content. ".repeat(100);
    const extraction = {
      sourceType: "pdf",
      text: pageText + pageText,
      pages: [
        { page: 1, text: pageText },
        { page: 2, text: pageText },
      ],
    } as any;
    const chunks = buildInputChunks(extraction, extraction.text);

    for (const chunk of chunks) {
      const { startChar, endChar } = chunk.metadata!;
      expect(startChar).toBeDefined();
      expect(endChar).toBeDefined();
      expect(endChar).toBeGreaterThan(startChar!);
      // Verify the content at those offsets matches
      // (Note: overlap means chunks share content, but startChar should be unique)
    }

    // Verify no gaps: each chunk's startChar should be <= previous chunk's endChar
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1].metadata!;
      const curr = chunks[i].metadata!;
      expect(curr.startChar).toBeLessThanOrEqual(prev.endChar!);
    }
  });

  test("PPTX chunks have startChar and endChar", () => {
    const extraction = {
      sourceType: "pptx",
      text: "Title\nSlide body text",
      slides: [
        { slide: 1, title: "Title", text: "Slide body text" },
      ],
    } as any;
    const chunks = buildInputChunks(extraction, extraction.text);
    for (const chunk of chunks) {
      expect(chunk.metadata?.startChar).toBeDefined();
      expect(chunk.metadata?.endChar).toBeDefined();
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx jest chunkAssembly.service.test.ts -t "charOffset" --verbose`
Expected: FAIL

**Step 3: Fix charOffset tracking in all paths**

Key changes to `chunkAssembly.service.ts`:

**A. Modify `splitTextIntoChunks` to return offset info** — Add a new function `splitTextIntoChunksWithOffsets` in `chunking.service.ts`:

```typescript
export interface ChunkWithOffset {
  content: string;
  startChar: number;
  endChar: number;
}

export function splitTextIntoChunksWithOffsets(
  text: string,
  baseOffset: number = 0,
  overrides?: Partial<ChunkingPolicy>,
): ChunkWithOffset[] {
  const clean = String(text || "").trim();
  if (!clean) return [];

  const policy = resolvePolicy(overrides);
  if (clean.length <= policy.targetChars) {
    return [{ content: clean, startChar: baseOffset, endChar: baseOffset + clean.length }];
  }

  const chunks: ChunkWithOffset[] = [];
  let offset = 0;

  while (offset < clean.length) {
    let end = Math.min(offset + policy.targetChars, clean.length);

    if (end < clean.length) {
      const minBoundaryOffset = offset + policy.targetChars * policy.minBoundaryRatio;
      const paragraphBreak = clean.lastIndexOf("\n\n", end);
      if (paragraphBreak > minBoundaryOffset) {
        end = paragraphBreak;
      } else {
        const sentenceBreak = findSentenceBoundary(clean, end, minBoundaryOffset);
        if (sentenceBreak > minBoundaryOffset) {
          end = sentenceBreak;
        }
      }
    }

    const chunk = clean.slice(offset, end).trim();
    if (chunk) {
      chunks.push({
        content: chunk,
        startChar: baseOffset + offset,
        endChar: baseOffset + end,
      });
    }
    if (end >= clean.length) break;

    const nextOffset = end - policy.overlapChars;
    if (nextOffset <= offset) break;
    offset = nextOffset;
  }

  return chunks.filter((c) => c.content.length > 0);
}
```

**B. Update all paths in `chunkAssembly.service.ts`** to use `splitTextIntoChunksWithOffsets`:

- **PDF path**: Use page text position within fullText to compute `baseOffset`
- **DOCX path**: Use section content position within fullText to compute `baseOffset`
- **PPTX path**: Add charOffset tracking (currently missing)
- **XLSX path**: No charOffset needed (cell-based, not position-based)

**Step 4: Run tests**

Run: `cd backend && npx jest chunkAssembly.service.test.ts --verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/ingestion/chunking.service.ts backend/src/services/ingestion/pipeline/chunkAssembly.service.ts backend/src/services/ingestion/pipeline/chunkAssembly.service.test.ts
git commit -m "fix: correct charOffset tracking with overlap, add PPTX offsets"
```

---

### Task 5: Fix XLSX Row-Aggregate Unit Normalization + isFinancial Consistency

**Files:**
- Modify: `backend/src/services/ingestion/pipeline/chunkAssembly.service.ts:218-241`
- Test: `backend/src/services/ingestion/pipeline/chunkAssembly.service.test.ts`

**Step 1: Write failing test**

```typescript
test("XLSX row-aggregate chunks include unit metadata", () => {
  const extraction = {
    sourceType: "xlsx",
    text: "data",
    sheets: [{ sheetName: "Revenue", textContent: "data", isFinancial: true }],
    cellFacts: [
      { sheet: "Revenue", cell: "B2", rowLabel: "Q1", colHeader: "Revenue (USD)", value: "1500000", displayValue: "$1.5M" },
      { sheet: "Revenue", cell: "C2", rowLabel: "Q1", colHeader: "Growth", value: "15%", displayValue: "15%" },
    ],
    isFinancial: false,
  } as any;
  const chunks = buildInputChunks(extraction, extraction.text);
  const rowAgg = chunks.find(c => c.metadata?.tableChunkForm === "row_aggregate");
  expect(rowAgg).toBeDefined();
  // isFinancial should come from per-sheet, not extraction-level
  const cellChunk = chunks.find(c => c.metadata?.tableChunkForm === "cell_centric");
  expect(cellChunk?.metadata?.isFinancial).toBe(true); // from sheet, not extraction
});
```

**Step 2: Run test, verify failure**

**Step 3: Fix**

In `chunkAssembly.service.ts`:

1. **Cell-centric path (line 207)**: Change `extraction.isFinancial ?? false` to `sheet.isFinancial ?? extraction.isFinancial ?? false` — requires passing `sheetName` to look up the sheet.

2. **Row-aggregate path (lines 218-241)**: Add per-row unit aggregation. Pick the dominant unit from the row's cell facts and add it to the row-aggregate metadata.

3. **isFinancial consistency**: Build a `Map<string, boolean>` of sheet → isFinancial before the cellFacts loop, look up per-fact.

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git commit -m "fix: XLSX row-aggregate unit normalization, per-sheet isFinancial consistency"
```

---

### Task 6: Fix textQuality Substring Matching

**Files:**
- Modify: `backend/src/services/ingestion/pipeline/textQuality.service.ts`
- Create: `backend/src/services/ingestion/pipeline/textQuality.service.test.ts`

**Step 1: Write tests**

```typescript
import { describe, expect, test } from "@jest/globals";
import { deriveTextQuality } from "./textQuality.service";

describe("deriveTextQuality", () => {
  test("rejects 'highjacked' as high quality", () => {
    const result = deriveTextQuality({ textQuality: "highjacked" } as any, "text");
    expect(result.label).not.toBe("high");
  });

  test("maps exact 'high' correctly", () => {
    const result = deriveTextQuality({ textQuality: "high" } as any, "text");
    expect(result.label).toBe("high");
  });

  test("falls back to score when label unknown", () => {
    const result = deriveTextQuality({ textQualityScore: 0.9 } as any, "text");
    expect(result.label).toBe("high");
  });

  test("garbage text of sufficient length is NOT rated high", () => {
    const garbage = "asdf".repeat(1000);
    const result = deriveTextQuality({} as any, garbage);
    // Without a quality signal, long garbage should not be "high"
    // It should rely on score, not length alone
    expect(result.score).toBeNull();
  });
});
```

**Step 2: Run test, verify failure**

**Step 3: Fix — use exact matching instead of substring includes**

```typescript
const VALID_LABELS = new Set(["high", "medium", "low", "none", "weak"]);

// Replace .includes() with exact set lookup
const normalized = String(extraction.textQuality || "").trim().toLowerCase();
if (VALID_LABELS.has(normalized)) {
  // map exact label
}
```

Remove the length-only fallback — if no quality signal exists, return `{ label: "medium", score: null }` as a conservative default rather than using text length.

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git commit -m "fix: exact-match text quality labels, remove length-only fallback"
```

---

### Task 7: Make InputChunkMetadata Required + Set Version Fields

**Files:**
- Modify: `backend/src/services/ingestion/pipeline/pipelineTypes.ts:88-93`
- Modify: `backend/src/services/ingestion/pipeline/chunkAssembly.service.ts` (all output paths)

**Step 1: Change `InputChunk.metadata` from optional to required**

In `pipelineTypes.ts`:

```typescript
export interface InputChunk {
  chunkIndex: number;
  content: string;
  pageNumber?: number;
  metadata: InputChunkMetadata;  // REQUIRED — no longer optional
}
```

**Step 2: Update all chunk creation sites** in `chunkAssembly.service.ts` to always provide metadata:

- Fallback path (lines 338-343): Add `{ chunkType: "text", sourceType: "text" }` metadata
- DOCX fallback (lines 125-131): Add minimal metadata

**Step 3: Update `NormalizedCellUnit` interface** — add `scaleRaw` and `scaleMultiplier` to `InputChunkMetadata`:

```typescript
scaleRaw?: string;
scaleMultiplier?: number;
```

**Step 4: Run all tests**

Run: `cd backend && npx jest --testPathPattern="ingestion" --verbose`
Expected: PASS (fix any TypeScript errors from the required metadata change)

**Step 5: Commit**

```bash
git commit -m "fix: make InputChunk.metadata required, add scale fields to metadata type"
```

---

### Task 8: Comprehensive Test Suite for chunkAssembly

**Files:**
- Modify: `backend/src/services/ingestion/pipeline/chunkAssembly.service.test.ts`

**Step 1: Add missing test scenarios**

```typescript
// Remove all `as any` casts — use proper typed test data

describe("edge cases", () => {
  test("DOCX sections with empty content and no heading produce nothing", () => { ... });
  test("XLSX cellFacts with missing cell/rowLabel/colHeader use fallbacks", () => { ... });
  test("XLSX empty cellFact values are skipped", () => { ... });
  test("PPTX slides with notes but no title", () => { ... });
  test("PPTX empty title string produces no heading chunk", () => { ... });
  test("plain-text fallback with empty text returns empty array", () => { ... });
  test("deduplicateChunks integration: output of buildInputChunks through dedup", () => { ... });
  test("XLSX sheets with name but no sheetName property", () => { ... });
});
```

**Step 2: Run all tests**

Run: `cd backend && npx jest chunkAssembly.service.test.ts --verbose`
Expected: PASS

**Step 3: Commit**

```bash
git commit -m "test: comprehensive chunkAssembly edge case coverage"
```

---

## Acceptance Criteria

- [ ] Sentence splitting respects abbreviations (Dr., U.S., e.g., Inc.)
- [ ] Dedup preserves chunks with different numeric values
- [ ] `overlapChars >= targetChars` is clamped safely
- [ ] `startChar`/`endChar` correctly account for overlap in PDF and DOCX paths
- [ ] PPTX chunks have `startChar`/`endChar`
- [ ] Single-letter unit patterns replaced with context-aware patterns
- [ ] Scale/magnitude detection works for millions, billions, thousands, 'mn', 'bn', "'000"
- [ ] Parenthesized negatives parsed correctly
- [ ] `$[space]100` matches USD
- [ ] Row-aggregate chunks have unit metadata
- [ ] Per-sheet `isFinancial` used for cell-centric chunks
- [ ] `textQuality` uses exact matching, no length-only fallback
- [ ] `InputChunk.metadata` is required (not optional)
- [ ] Test files exist for `tableUnitNormalization` and `textQuality`
- [ ] All existing tests still pass
