# Ingestion & Normalization Pipeline: A+ Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix every bug, remove all dead code, consolidate type systems, and harden the ingestion pipeline from audit score 45/100 to 100/100.

**Architecture:** The pipeline follows download -> extract -> chunk -> embed -> encrypt. Each format (PDF, DOCX, XLSX, PPTX, image, text) has a dedicated extractor that returns a typed `DispatchedExtractionResult`. Chunks are assembled per-format, deduplicated, embedded, and encrypted. All state transitions use `DocumentStateManager` with CAS.

**Tech Stack:** TypeScript, Node.js, pdf-parse v2, AdmZip, xml2js, xlsx, Google Cloud Vision OCR, BullMQ, Prisma, GCS

**Audit Baseline:** 45/100 (F). P0 blockers: PDF table extraction dead code, DOCX tables invisible.

---

## Phase 0: P0 Critical Bugs (Score Impact: 45 -> 65)

These two bugs make table data invisible to retrieval. They must be fixed first.

---

### Task 1: Fix PDF postProcessText Destroying Table Layout

The `postProcessText` function at `pdfExtractor.service.ts:60` replaces ALL whitespace with single spaces (`/\s+/g` -> `" "`). This runs BEFORE `extractPDFWithTables` at line 582, which needs `\s{3,}` patterns to detect table columns. The table extractor (373 lines in `pdfTableExtractor.ts`) is effectively dead code.

**Files:**
- Modify: `backend/src/services/extraction/pdfExtractor.service.ts:52-68`
- Test: `backend/src/services/extraction/__tests__/pdfExtractor.postProcess.test.ts`

**Step 1: Write the failing test**

```typescript
// backend/src/services/extraction/__tests__/pdfExtractor.postProcess.test.ts
import { describe, it, expect } from "vitest";

// We need to extract and test postProcessText directly.
// Since it's not exported, we test via the public API behavior.
// But first, let's create a unit test for the fixed function.

describe("postProcessText (layout-preserving)", () => {
  // Import after the fix makes it testable
  it("preserves newlines between paragraphs", () => {
    const { postProcessText } = require("../pdfExtractor.service");
    const input = "Paragraph one.\n\nParagraph two.";
    const result = postProcessText(input);
    expect(result).toContain("\n");
    expect(result).toMatch(/Paragraph one\.\s+Paragraph two\./);
  });

  it("preserves multi-space column gaps for table detection", () => {
    const { postProcessText } = require("../pdfExtractor.service");
    const input = "Revenue     100,000     120,000\nCOGS        50,000      60,000";
    const result = postProcessText(input);
    // Must preserve 3+ spaces between columns
    expect(result).toMatch(/\s{3,}/);
    expect(result).toContain("Revenue");
    expect(result).toContain("100,000");
  });

  it("collapses runs of 3+ blank lines to 2", () => {
    const { postProcessText } = require("../pdfExtractor.service");
    const input = "A\n\n\n\n\nB";
    const result = postProcessText(input);
    expect(result).toBe("A\n\nB");
  });

  it("fixes punctuation spacing without destroying layout", () => {
    const { postProcessText } = require("../pdfExtractor.service");
    const input = "Hello .World";
    const result = postProcessText(input);
    expect(result).toBe("Hello. World");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/services/extraction/__tests__/pdfExtractor.postProcess.test.ts`
Expected: FAIL - postProcessText not exported or tests fail because whitespace is destroyed

**Step 3: Fix postProcessText to preserve layout**

Replace lines 52-68 of `pdfExtractor.service.ts`:

```typescript
/**
 * Clean up extracted text while PRESERVING layout structure.
 *
 * CRITICAL: Do NOT collapse all whitespace to single spaces.
 * The table extractor (pdfTableExtractor.ts) relies on multi-space
 * column gaps (\s{3,}) and newlines to detect table rows.
 */
export function postProcessText(text: string): string {
  if (!text || text.trim().length === 0) {
    return text;
  }

  let cleaned = text;

  // Collapse runs of spaces/tabs on the SAME LINE (preserve newlines!)
  // Only collapse runs of spaces within a line, not across lines
  cleaned = cleaned.replace(/[^\S\n]{2,}/g, (match) => {
    // Preserve multi-space gaps (3+ spaces) for table column detection
    if (match.length >= 3) return match;
    return " ";
  });

  // Collapse 3+ consecutive blank lines to 2
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

  // Fix punctuation spacing
  cleaned = cleaned.replace(/ +([.,!?;:])/g, "$1");
  cleaned = cleaned.replace(/([.,!?;:])(\S)/g, "$1 $2");

  return cleaned.trim();
}
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/services/extraction/__tests__/pdfExtractor.postProcess.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/extraction/pdfExtractor.service.ts backend/src/services/extraction/__tests__/pdfExtractor.postProcess.test.ts
git commit -m "fix(pdf): preserve whitespace layout in postProcessText for table detection

postProcessText was replacing ALL whitespace with single spaces,
making pdfTableExtractor dead code. Now preserves multi-space
column gaps and newlines."
```

---

### Task 2: Add DOCX Table Extraction (w:tbl support)

The DOCX extractor at `docxExtractor.service.ts:177` only walks `w:p` (paragraphs). It completely ignores `w:tbl` (tables), making all DOCX tables invisible. The `w:body` can contain both `w:p` and `w:tbl` elements interleaved.

**Files:**
- Modify: `backend/src/services/extraction/docxExtractor.service.ts:157-197`
- Test: `backend/src/services/extraction/__tests__/docxExtractor.tables.test.ts`

**Step 1: Write the failing test**

```typescript
// backend/src/services/extraction/__tests__/docxExtractor.tables.test.ts
import { describe, it, expect } from "vitest";
import { extractDocxWithAnchors } from "../docxExtractor.service";
import AdmZip from "adm-zip";

// Helper to create a minimal DOCX with a table
function createDocxWithTable(tableRows: string[][]): Buffer {
  const rows = tableRows
    .map(
      (cells) =>
        `<w:tr>${cells.map((c) => `<w:tc><w:p><w:r><w:t>${c}</w:t></w:r></w:p></w:tc>`).join("")}</w:tr>`,
    )
    .join("");

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Financial Summary</w:t></w:r></w:p>
    <w:p><w:r><w:t>Below is the quarterly data:</w:t></w:r></w:p>
    <w:tbl>${rows}</w:tbl>
    <w:p><w:r><w:t>End of report.</w:t></w:r></w:p>
  </w:body>
</w:document>`;

  const zip = new AdmZip();
  zip.addFile("word/document.xml", Buffer.from(documentXml, "utf-8"));
  zip.addFile(
    "[Content_Types].xml",
    Buffer.from(
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    ),
  );
  return zip.toBuffer();
}

describe("DOCX table extraction", () => {
  it("extracts text from w:tbl elements", async () => {
    const buffer = createDocxWithTable([
      ["Quarter", "Revenue", "Profit"],
      ["Q1 2025", "1,200,000", "340,000"],
      ["Q2 2025", "1,350,000", "390,000"],
    ]);

    const result = await extractDocxWithAnchors(buffer);

    expect(result.text).toContain("Revenue");
    expect(result.text).toContain("1,200,000");
    expect(result.text).toContain("Q2 2025");
    expect(result.text).toContain("390,000");
  });

  it("preserves table structure as markdown in section content", async () => {
    const buffer = createDocxWithTable([
      ["Metric", "Value"],
      ["Users", "10,000"],
    ]);

    const result = await extractDocxWithAnchors(buffer);

    // Table should be formatted, not just concatenated
    expect(result.text).toContain("Metric");
    expect(result.text).toContain("10,000");
  });

  it("handles interleaved paragraphs and tables", async () => {
    const buffer = createDocxWithTable([
      ["A", "B"],
      ["1", "2"],
    ]);

    const result = await extractDocxWithAnchors(buffer);

    expect(result.text).toContain("Financial Summary");
    expect(result.text).toContain("Below is the quarterly data");
    expect(result.text).toContain("End of report");
    // Table content must also be present
    expect(result.text).toMatch(/[AB12]/);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/services/extraction/__tests__/docxExtractor.tables.test.ts`
Expected: FAIL - table text not found in output

**Step 3: Add w:tbl parsing to docxExtractor**

Modify `parseParagraphs` in `docxExtractor.service.ts` to handle interleaved `w:p` and `w:tbl` elements. The key insight: `w:body` children are ordered, and we need to iterate them in document order, not just grab `w:p`.

Replace lines 157-197:

```typescript
/**
 * Extract text from a table node (w:tbl).
 * Returns markdown-formatted table text.
 */
function extractTableText(tblNode: any): string {
  const rows: string[][] = [];

  const trNodes = tblNode["w:tr"];
  if (!trNodes) return "";
  const trArray = Array.isArray(trNodes) ? trNodes : [trNodes];

  for (const tr of trArray) {
    const tcNodes = tr["w:tc"];
    if (!tcNodes) continue;
    const tcArray = Array.isArray(tcNodes) ? tcNodes : [tcNodes];

    const cells: string[] = [];
    for (const tc of tcArray) {
      // Each cell can contain multiple paragraphs
      const pNodes = tc["w:p"];
      if (!pNodes) {
        cells.push("");
        continue;
      }
      const pArray = Array.isArray(pNodes) ? pNodes : [pNodes];
      const cellText = pArray.map((p: any) => extractParagraphText(p)).join(" ");
      cells.push(cellText.trim());
    }
    rows.push(cells);
  }

  if (rows.length === 0) return "";

  // Format as markdown table
  const colCount = Math.max(...rows.map((r) => r.length));
  const normalized = rows.map((row) => {
    const padded = [...row];
    while (padded.length < colCount) padded.push("");
    return padded;
  });

  const header = "| " + normalized[0].join(" | ") + " |";
  const separator = "| " + normalized[0].map(() => "---").join(" | ") + " |";
  const body = normalized
    .slice(1)
    .map((row) => "| " + row.join(" | ") + " |")
    .join("\n");

  return [header, separator, body].filter(Boolean).join("\n");
}

/**
 * Parse all body elements from document.xml in document order.
 * Handles both w:p (paragraphs) and w:tbl (tables).
 */
async function parseParagraphs(
  documentXml: string,
): Promise<ParsedParagraph[]> {
  const xml2js = require("xml2js");
  const parser = new xml2js.Parser({
    explicitChildren: true,
    preserveChildrenOrder: true,
    charsAsChildren: false,
  });

  const result = await parser.parseStringPromise(documentXml);
  const paragraphs: ParsedParagraph[] = [];

  const document = result["w:document"];
  if (!document) return paragraphs;

  const body = document["w:body"];
  if (!body) return paragraphs;

  const bodyContent = Array.isArray(body) ? body[0] : body;
  if (!bodyContent) return paragraphs;

  // Use $$  (ordered children) if available from preserveChildrenOrder
  const children = bodyContent["$$"] || [];
  let paragraphIndex = 0;

  for (const child of children) {
    const tagName = child["#name"];

    if (tagName === "w:p") {
      const text = extractParagraphText(child);
      const styleName = getParagraphStyle(child);
      const headingLevel = detectHeadingLevel(styleName);

      paragraphs.push({
        text,
        styleName,
        headingLevel,
        index: paragraphIndex++,
      });
    } else if (tagName === "w:tbl") {
      // Extract table and add as a virtual paragraph
      const tableMarkdown = extractTableText(child);
      if (tableMarkdown) {
        paragraphs.push({
          text: tableMarkdown,
          styleName: undefined,
          headingLevel: null,
          index: paragraphIndex++,
        });
      }
    }
  }

  // Fallback: if $$ is empty (parser didn't use preserveChildrenOrder),
  // use the original w:p approach plus w:tbl
  if (paragraphs.length === 0) {
    const pNodes = bodyContent["w:p"] || [];
    const pArray = Array.isArray(pNodes) ? pNodes : [pNodes];

    for (let i = 0; i < pArray.length; i++) {
      const pNode = pArray[i];
      if (!pNode) continue;
      const text = extractParagraphText(pNode);
      const styleName = getParagraphStyle(pNode);
      const headingLevel = detectHeadingLevel(styleName);
      paragraphs.push({ text, styleName, headingLevel, index: i });
    }

    // Also extract tables
    const tblNodes = bodyContent["w:tbl"] || [];
    const tblArray = Array.isArray(tblNodes) ? tblNodes : [tblNodes];
    for (const tbl of tblArray) {
      if (!tbl) continue;
      const tableMarkdown = extractTableText(tbl);
      if (tableMarkdown) {
        paragraphs.push({
          text: tableMarkdown,
          styleName: undefined,
          headingLevel: null,
          index: paragraphIndex++,
        });
      }
    }
  }

  return paragraphs;
}
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/services/extraction/__tests__/docxExtractor.tables.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/extraction/docxExtractor.service.ts backend/src/services/extraction/__tests__/docxExtractor.tables.test.ts
git commit -m "fix(docx): extract w:tbl table elements from DOCX documents

DOCX extractor only walked w:p paragraphs. Now parses w:tbl elements
in document order and formats them as markdown tables."
```

---

### Task 3: Fix Pre-Heading Text Drop in DOCX

`buildSectionTree` at `docxExtractor.service.ts:262` only appends text to the current section when `stack.length > 0`. Any text before the first heading is silently dropped.

**Files:**
- Modify: `backend/src/services/extraction/docxExtractor.service.ts:206-275`
- Test: `backend/src/services/extraction/__tests__/docxExtractor.preamble.test.ts`

**Step 1: Write the failing test**

```typescript
// backend/src/services/extraction/__tests__/docxExtractor.preamble.test.ts
import { describe, it, expect } from "vitest";
import { extractDocxWithAnchors } from "../docxExtractor.service";
import AdmZip from "adm-zip";

function createDocxWithPreamble(): Buffer {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>This is important preamble text before any heading.</w:t></w:r></w:p>
    <w:p><w:r><w:t>It contains critical context.</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chapter 1</w:t></w:r></w:p>
    <w:p><w:r><w:t>Chapter content here.</w:t></w:r></w:p>
  </w:body>
</w:document>`;

  const zip = new AdmZip();
  zip.addFile("word/document.xml", Buffer.from(documentXml, "utf-8"));
  zip.addFile("[Content_Types].xml", Buffer.from('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'));
  return zip.toBuffer();
}

describe("DOCX preamble text", () => {
  it("preserves text before the first heading", async () => {
    const result = await extractDocxWithAnchors(createDocxWithPreamble());
    expect(result.text).toContain("important preamble text");
    expect(result.text).toContain("critical context");
    expect(result.text).toContain("Chapter 1");
    expect(result.text).toContain("Chapter content");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/services/extraction/__tests__/docxExtractor.preamble.test.ts`
Expected: FAIL - preamble text not in output

**Step 3: Fix buildSectionTree to capture preamble**

In `buildSectionTree`, add a synthetic "preamble" section for text before the first heading. Modify the `else if` branch at line 262:

```typescript
function buildSectionTree(paragraphs: ParsedParagraph[]): {
  sections: DocxSection[];
  headings: { text: string; level: number; path: string[] }[];
} {
  const sections: DocxSection[] = [];
  const headings: { text: string; level: number; path: string[] }[] = [];
  const stack: DocxSection[] = [];
  let currentPath: string[] = [];

  // Collect preamble text (before first heading)
  let preambleText = "";

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const text = para.text.trim();
    if (!text) continue;

    if (para.headingLevel !== null) {
      // Flush preamble as a section before the first heading
      if (preambleText && sections.length === 0 && stack.length === 0) {
        sections.push({
          heading: undefined,
          level: 0,
          path: [],
          content: preambleText.trim(),
          children: [],
          paragraphStart: 0,
          paragraphEnd: paragraphs[i - 1]?.index ?? 0,
        });
      }

      const level = para.headingLevel;
      while (stack.length > 0 && stack[stack.length - 1]!.level! >= level) {
        stack.pop();
      }
      currentPath = stack.map((s) => s.heading!).filter(Boolean) as string[];
      currentPath.push(text);

      const section: DocxSection = {
        heading: text,
        level,
        path: [...currentPath],
        content: "",
        children: [],
        paragraphStart: para.index,
        paragraphEnd: para.index,
      };

      headings.push({ text, level, path: [...currentPath] });

      if (stack.length === 0) {
        sections.push(section);
      } else {
        const parent = stack[stack.length - 1];
        if (!parent.children) parent.children = [];
        parent.children.push(section);
      }
      stack.push(section);
    } else if (stack.length > 0) {
      const currentSection = stack[stack.length - 1];
      if (currentSection.content) {
        currentSection.content += "\n\n" + text;
      } else {
        currentSection.content = text;
      }
      currentSection.paragraphEnd = para.index;
    } else {
      // Pre-heading text: accumulate as preamble
      preambleText += (preambleText ? "\n\n" : "") + text;
    }
  }

  // If document has NO headings at all, preambleText is handled by
  // the fallback in extractDocxWithAnchors (line 371)

  // If we have accumulated preamble but no headings were found after it
  if (preambleText && sections.length === 0) {
    sections.push({
      heading: undefined,
      level: 0,
      path: [],
      content: preambleText.trim(),
      children: [],
      paragraphStart: 0,
      paragraphEnd: paragraphs[paragraphs.length - 1]?.index ?? 0,
    });
  }

  return { sections, headings };
}
```

Also update `appendSection` in `extractDocxWithAnchors` to handle sections without headings:

```typescript
const appendSection = (section: DocxSection, depth: number = 0): void => {
  if (section.heading) {
    const prefix = "#".repeat(section.level ?? 1) + " ";
    fullText += prefix + section.heading + "\n\n";
  }
  if (section.content) {
    fullText += section.content + "\n\n";
  }
  if (section.children) {
    for (const child of section.children) {
      appendSection(child, depth + 1);
    }
  }
};
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/services/extraction/__tests__/docxExtractor.preamble.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/extraction/docxExtractor.service.ts backend/src/services/extraction/__tests__/docxExtractor.preamble.test.ts
git commit -m "fix(docx): preserve preamble text before first heading"
```

---

## Phase 1: P1 Bugs & Safety (Score Impact: 65 -> 78)

---

### Task 4: Fix File Size Limit Mismatch (50MB vs 500MB)

`fileValidator.service.ts:179` enforces 50MB but `upload.config.ts` allows 500MB. The validator should use the centralized config.

**Files:**
- Modify: `backend/src/services/ingestion/fileValidator.service.ts:1-2,179`
- Test: `backend/src/services/ingestion/__tests__/fileValidator.sizeLimit.test.ts`

**Step 1: Write the failing test**

```typescript
// backend/src/services/ingestion/__tests__/fileValidator.sizeLimit.test.ts
import { describe, it, expect } from "vitest";
import fileValidator from "../fileValidator.service";

describe("fileValidator size limit", () => {
  it("accepts files up to the configured max size", () => {
    // A 100MB file should be accepted (under 500MB config limit)
    const result = fileValidator.validateClientSide({
      type: "application/pdf",
      size: 100 * 1024 * 1024,
      name: "large.pdf",
    });
    expect(result.isValid).toBe(true);
  });

  it("rejects files over the configured max size", () => {
    const result = fileValidator.validateClientSide({
      type: "application/pdf",
      size: 600 * 1024 * 1024,
      name: "huge.pdf",
    });
    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe("FILE_TOO_LARGE");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/services/ingestion/__tests__/fileValidator.sizeLimit.test.ts`
Expected: FAIL - 100MB file rejected because limit is 50MB

**Step 3: Import centralized config and use it**

At the top of `fileValidator.service.ts`, add:

```typescript
import { UPLOAD_CONFIG } from "../../config/upload.config";
```

Replace line 179:
```typescript
// OLD: private maxFileSize = 50 * 1024 * 1024;
private maxFileSize = UPLOAD_CONFIG.MAX_FILE_SIZE_BYTES;
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/services/ingestion/__tests__/fileValidator.sizeLimit.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/ingestion/fileValidator.service.ts backend/src/services/ingestion/__tests__/fileValidator.sizeLimit.test.ts
git commit -m "fix: align file validator size limit with centralized upload config"
```

---

### Task 5: Fix Image Confidence Reported as 1.0 for Skipped/Empty Images

In `extractionDispatch.service.ts`, skipped images return `confidence: 1.0` (lines 133, 173) which is wrong -- no text was extracted.

**Files:**
- Modify: `backend/src/services/ingestion/extraction/extractionDispatch.service.ts:129-137,167-175`
- Test: `backend/src/services/ingestion/extraction/__tests__/extractionDispatch.imageConfidence.test.ts`

**Step 1: Write the failing test**

```typescript
// backend/src/services/ingestion/extraction/__tests__/extractionDispatch.imageConfidence.test.ts
import { describe, it, expect } from "vitest";
import { extractText, shouldSkipImageOcr } from "../extractionDispatch.service";

describe("image extraction confidence", () => {
  it("returns confidence 0 for skipped images, not 1.0", async () => {
    // A tiny image (< 10KB) should be skipped with confidence 0
    const tinyBuffer = Buffer.alloc(1024); // 1KB
    const result = await extractText(tinyBuffer, "image/png", "tiny.png");
    expect(result.sourceType).toBe("image");
    expect(result.confidence).toBe(0);
  });

  it("returns confidence 0 for pattern-skipped images", async () => {
    const buffer = Buffer.alloc(50 * 1024); // 50KB, large enough
    const result = await extractText(buffer, "image/png", "company-logo.png");
    expect(result.sourceType).toBe("image");
    expect(result.confidence).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/services/ingestion/extraction/__tests__/extractionDispatch.imageConfidence.test.ts`
Expected: FAIL - confidence is 1.0

**Step 3: Fix confidence values**

In `extractionDispatch.service.ts`, change `confidence: 1.0` to `confidence: 0` in the two skip return blocks (lines ~133 and ~173):

```typescript
// Line ~133: filename pattern skip
return {
  sourceType: "image",
  text: "",
  wordCount: 0,
  confidence: 0,  // was 1.0
  skipped: true,
  skipReason: `Image saved as visual-only (${skipCheck.reason})`,
};

// Line ~173: OCR produced no text
return {
  sourceType: "image",
  text: "",
  wordCount: 0,
  confidence: 0,  // was 1.0
  skipped: true,
  skipReason: "Image contains no text (visual-only)",
};
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/services/ingestion/extraction/__tests__/extractionDispatch.imageConfidence.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/ingestion/extraction/extractionDispatch.service.ts backend/src/services/ingestion/extraction/__tests__/extractionDispatch.imageConfidence.test.ts
git commit -m "fix: report confidence 0 for skipped/empty images instead of 1.0"
```

---

### Task 6: Fix Unit Detection False Positives (/\bg\b/ and /\bm\b/)

In `tableUnitNormalization.service.ts`, patterns `/\bg\b/` and `/\bm\b/` match standalone letters "g" and "m" in any context (e.g., "g" in "g force" or "m" as abbreviation for million).

**Files:**
- Modify: `backend/src/services/ingestion/pipeline/tableUnitNormalization.service.ts:49-51,61-63`
- Test: `backend/src/services/ingestion/pipeline/__tests__/tableUnitNormalization.test.ts`

**Step 1: Write the failing test**

```typescript
// backend/src/services/ingestion/pipeline/__tests__/tableUnitNormalization.test.ts
import { describe, it, expect } from "vitest";
import { normalizeCellUnit } from "../tableUnitNormalization.service";

describe("tableUnitNormalization", () => {
  it("does NOT detect standalone 'g' as grams in non-measurement context", () => {
    const result = normalizeCellUnit({ value: "Grade: g", colHeader: "Rating" });
    expect(result.unitNormalized).toBeNull();
  });

  it("does NOT detect standalone 'm' as meters in non-measurement context", () => {
    const result = normalizeCellUnit({ value: "100m", colHeader: "Revenue" });
    // "100m" likely means 100 million, not 100 meters
    // Without additional context, unit should be null
    expect(result.unitNormalized).not.toBe("length_m");
  });

  it("detects 'kg' correctly", () => {
    const result = normalizeCellUnit({ value: "50 kg", colHeader: "Weight" });
    expect(result.unitNormalized).toBe("mass_kg");
    expect(result.numericValue).toBe(50);
  });

  it("detects R$ correctly", () => {
    const result = normalizeCellUnit({ value: "R$ 1.234,56", colHeader: "Total" });
    expect(result.unitNormalized).toBe("currency_brl");
    expect(result.numericValue).toBeCloseTo(1234.56);
  });

  it("detects percentage correctly", () => {
    const result = normalizeCellUnit({ value: "15.5%", colHeader: "Growth" });
    expect(result.unitNormalized).toBe("percent");
    expect(result.numericValue).toBeCloseTo(15.5);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/services/ingestion/pipeline/__tests__/tableUnitNormalization.test.ts`
Expected: FAIL - standalone "g" detected as mass_g

**Step 3: Fix patterns to require numeric context**

In `tableUnitNormalization.service.ts`, replace the overly broad patterns:

```typescript
// mass_g: require digit before 'g' to avoid false positives
{
  normalized: "mass_g",
  patterns: [/\d\s*g\b/i, /\bgrams?\b/i],
},

// length_m: require digit before 'm' to avoid "million" false positives
{
  normalized: "length_m",
  patterns: [/\d\s*m\b(?!\w)/, /\bmeters?\b/i, /\bmetros?\b/i],
},

// duration_s: require digit before 's'
{
  normalized: "duration_s",
  patterns: [/\bsec\b/i, /\bseconds?\b/i, /\d\s*s\b/],
},

// duration_h: require digit before 'h'
{
  normalized: "duration_h",
  patterns: [/\bhr\b/i, /\bhours?\b/i, /\d\s*h\b/i],
},
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/services/ingestion/pipeline/__tests__/tableUnitNormalization.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/ingestion/pipeline/tableUnitNormalization.service.ts backend/src/services/ingestion/pipeline/__tests__/tableUnitNormalization.test.ts
git commit -m "fix: eliminate unit detection false positives for standalone g/m/s/h"
```

---

### Task 7: Add Per-Extraction Timeout

`documentPipeline.service.ts` has no timeout on `extractText()` or `storeDocumentEmbeddings()`. A corrupted PDF or slow OCR can hang the pipeline forever.

**Files:**
- Modify: `backend/src/services/ingestion/pipeline/documentPipeline.service.ts:89,187-190`
- Test: `backend/src/services/ingestion/pipeline/__tests__/pipelineTimeout.test.ts`

**Step 1: Write the failing test**

```typescript
// backend/src/services/ingestion/pipeline/__tests__/pipelineTimeout.test.ts
import { describe, it, expect } from "vitest";

describe("pipeline timeout utility", () => {
  it("rejects with TimeoutError when function exceeds limit", async () => {
    const { withTimeout } = await import("../documentPipeline.service");
    const slow = () => new Promise((resolve) => setTimeout(resolve, 5000));
    await expect(withTimeout(slow(), 100, "test")).rejects.toThrow("timed out");
  });

  it("resolves normally when function completes in time", async () => {
    const { withTimeout } = await import("../documentPipeline.service");
    const fast = () => Promise.resolve(42);
    const result = await withTimeout(fast(), 1000, "test");
    expect(result).toBe(42);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/services/ingestion/pipeline/__tests__/pipelineTimeout.test.ts`
Expected: FAIL - withTimeout not exported

**Step 3: Add withTimeout and apply it**

Add to `documentPipeline.service.ts`:

```typescript
const EXTRACTION_TIMEOUT_MS = parseInt(process.env.EXTRACTION_TIMEOUT_MS || "300000", 10); // 5 min
const EMBEDDING_TIMEOUT_MS = parseInt(process.env.EMBEDDING_TIMEOUT_MS || "600000", 10);   // 10 min

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (val) => { clearTimeout(timer); resolve(val); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}
```

Wrap the extraction call (line ~89):
```typescript
const extraction: DispatchedExtractionResult = await withTimeout(
  extractText(fileBuffer, mimeType, filename),
  EXTRACTION_TIMEOUT_MS,
  "Text extraction",
);
```

Wrap the embedding call (line ~187-190):
```typescript
await withTimeout(
  vectorEmbeddingService.storeDocumentEmbeddings(documentId, inputChunks),
  EMBEDDING_TIMEOUT_MS,
  "Embedding storage",
);
```

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/services/ingestion/pipeline/__tests__/pipelineTimeout.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/ingestion/pipeline/documentPipeline.service.ts backend/src/services/ingestion/pipeline/__tests__/pipelineTimeout.test.ts
git commit -m "feat: add configurable timeouts for extraction and embedding steps"
```

---

### Task 8: Fix Hardcoded embeddingProvider in Telemetry

`documentIngestionPipeline.service.ts:324` hardcodes `embeddingProvider: "openai"`.

**Files:**
- Modify: `backend/src/queues/workers/documentIngestionPipeline.service.ts:324`

**Step 1: Fix the hardcoded value**

```typescript
// Replace line 324:
// OLD: embeddingProvider: "openai",
embeddingProvider: process.env.EMBEDDING_PROVIDER || "openai",
```

**Step 2: Commit**

```bash
git add backend/src/queues/workers/documentIngestionPipeline.service.ts
git commit -m "fix: derive embeddingProvider from env instead of hardcoding openai"
```

---

### Task 9: Add CSV Extractor

Upload middleware accepts `text/csv` and `application/csv` but `extractionDispatch.service.ts` has no CSV handler. CSVs fall through to `text/` plain-text handler, losing column structure.

**Files:**
- Create: `backend/src/services/extraction/csvExtractor.service.ts`
- Modify: `backend/src/services/ingestion/extraction/extractionDispatch.service.ts`
- Modify: `backend/src/services/ingestion/extraction/extractionResult.types.ts`
- Test: `backend/src/services/extraction/__tests__/csvExtractor.test.ts`

**Step 1: Write the failing test**

```typescript
// backend/src/services/extraction/__tests__/csvExtractor.test.ts
import { describe, it, expect } from "vitest";
import { extractCsvWithAnchors } from "../csvExtractor.service";

describe("csvExtractor", () => {
  it("extracts CSV with headers and rows", () => {
    const csv = "Name,Age,City\nAlice,30,NYC\nBob,25,LA";
    const buffer = Buffer.from(csv, "utf-8");
    const result = extractCsvWithAnchors(buffer);

    expect(result.sourceType).toBe("csv");
    expect(result.text).toContain("Alice");
    expect(result.text).toContain("30");
    expect(result.headers).toEqual(["Name", "Age", "City"]);
    expect(result.rowCount).toBe(2);
  });

  it("handles semicolon-delimited CSV (common in PT-BR)", () => {
    const csv = "Nome;Valor\nReceita;1.234,56\nCusto;789,00";
    const buffer = Buffer.from(csv, "utf-8");
    const result = extractCsvWithAnchors(buffer);

    expect(result.text).toContain("Receita");
    expect(result.text).toContain("1.234,56");
    expect(result.rowCount).toBe(2);
  });

  it("returns markdown table format", () => {
    const csv = "A,B\n1,2";
    const buffer = Buffer.from(csv, "utf-8");
    const result = extractCsvWithAnchors(buffer);

    expect(result.text).toContain("|");
    expect(result.text).toContain("---");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/services/extraction/__tests__/csvExtractor.test.ts`
Expected: FAIL - module not found

**Step 3: Create CSV extractor**

```typescript
// backend/src/services/extraction/csvExtractor.service.ts
/**
 * CSV Extractor
 *
 * Parses CSV/TSV files and returns structured text with markdown tables.
 * Handles comma, semicolon, and tab delimiters (auto-detected).
 */

interface CsvExtractionResult {
  sourceType: "csv";
  text: string;
  wordCount: number;
  confidence: number;
  headers: string[];
  rowCount: number;
  delimiter: string;
}

function detectDelimiter(firstLine: string): string {
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
  for (const char of firstLine) {
    if (char in counts) counts[char]++;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted[0][1] > 0 ? sorted[0][0] : ",";
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function extractCsvWithAnchors(buffer: Buffer): CsvExtractionResult {
  const raw = buffer.toString("utf-8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    return {
      sourceType: "csv",
      text: "",
      wordCount: 0,
      confidence: 1.0,
      headers: [],
      rowCount: 0,
      delimiter: ",",
    };
  }

  const delimiter = detectDelimiter(lines[0]);
  const rows = lines.map((l) => parseCsvLine(l, delimiter));
  const headers = rows[0] || [];
  const dataRows = rows.slice(1);

  // Build markdown table
  const colCount = Math.max(...rows.map((r) => r.length));
  const normalize = (row: string[]) => {
    const padded = [...row];
    while (padded.length < colCount) padded.push("");
    return padded;
  };

  let markdown = "";
  const normalizedHeaders = normalize(headers);
  markdown += "| " + normalizedHeaders.join(" | ") + " |\n";
  markdown += "| " + normalizedHeaders.map(() => "---").join(" | ") + " |\n";
  for (const row of dataRows) {
    markdown += "| " + normalize(row).join(" | ") + " |\n";
  }

  const wordCount = raw.split(/\s+/).filter((w) => w.length > 0).length;

  return {
    sourceType: "csv",
    text: markdown.trim(),
    wordCount,
    confidence: 1.0,
    headers,
    rowCount: dataRows.length,
    delimiter,
  };
}
```

**Step 4: Wire CSV into dispatch**

In `extractionDispatch.service.ts`, add CSV MIME constants and handler:

```typescript
export const CSV_MIMES = ["text/csv", "application/csv"];
```

Add before the `text/` fallback (line ~110):

```typescript
if (CSV_MIMES.includes(mimeType)) {
  const { extractCsvWithAnchors } = require("../../extraction/csvExtractor.service");
  const result = extractCsvWithAnchors(buffer);
  return result as unknown as DispatchedExtractionResult;
}
```

Add `CsvExtractionResult` to `extractionResult.types.ts`:

```typescript
export interface CsvExtractionResult extends BaseExtractionResult {
  sourceType: "csv";
  headers: string[];
  rowCount: number;
  delimiter: string;
}
```

Add to `DispatchedExtractionResult` union:

```typescript
export type DispatchedExtractionResult =
  | PdfExtractionResult
  | DocxExtractionResult
  | XlsxExtractionResult
  | PptxExtractionResult
  | PlainTextExtractionResult
  | CsvExtractionResult  // NEW
  | ImageSkippedResult
  | ImageOcrResult;
```

**Step 5: Run test to verify it passes**

Run: `cd backend && npx vitest run src/services/extraction/__tests__/csvExtractor.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add backend/src/services/extraction/csvExtractor.service.ts backend/src/services/ingestion/extraction/extractionDispatch.service.ts backend/src/services/ingestion/extraction/extractionResult.types.ts backend/src/services/extraction/__tests__/csvExtractor.test.ts
git commit -m "feat: add CSV extractor with auto-delimiter detection and markdown output"
```

---

### Task 10: Guard Legacy .doc/.ppt/.xls from Crashing

`extractionDispatch.service.ts` routes `application/msword` to the DOCX extractor (AdmZip), which crashes because `.doc` files are OLE binary, not ZIP. Same for `.ppt` and `.xls`.

**Files:**
- Modify: `backend/src/services/ingestion/extraction/extractionDispatch.service.ts`
- Test: `backend/src/services/ingestion/extraction/__tests__/extractionDispatch.legacy.test.ts`

**Step 1: Write the failing test**

```typescript
// backend/src/services/ingestion/extraction/__tests__/extractionDispatch.legacy.test.ts
import { describe, it, expect } from "vitest";
import { extractText } from "../extractionDispatch.service";

describe("legacy Office format handling", () => {
  it("returns graceful error for .doc files instead of crash", async () => {
    // OLE magic bytes (not ZIP)
    const oleHeader = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    const buffer = Buffer.concat([oleHeader, Buffer.alloc(1024)]);

    await expect(
      extractText(buffer, "application/msword", "document.doc"),
    ).rejects.toThrow(/legacy|unsupported|convert/i);
  });

  it("returns graceful error for .ppt files", async () => {
    const oleHeader = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    const buffer = Buffer.concat([oleHeader, Buffer.alloc(1024)]);

    await expect(
      extractText(buffer, "application/vnd.ms-powerpoint", "slides.ppt"),
    ).rejects.toThrow(/legacy|unsupported|convert/i);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/services/ingestion/extraction/__tests__/extractionDispatch.legacy.test.ts`
Expected: FAIL - crashes with AdmZip error

**Step 3: Add OLE detection guard**

Add to `extractionDispatch.service.ts`:

```typescript
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0];

function isOleBinary(buffer: Buffer): boolean {
  if (buffer.length < 4) return false;
  return OLE_MAGIC.every((byte, i) => buffer[i] === byte);
}
```

In the DOCX handler, add a guard:

```typescript
if (DOCX_MIMES.includes(mimeType)) {
  if (isOleBinary(buffer)) {
    throw new Error(
      "Legacy .doc format is not supported. Please convert to .docx (File > Save As > .docx) and re-upload.",
    );
  }
  const result = await extractDocxWithAnchors(buffer);
  return { sourceType: "docx", sections: [], ...result } as unknown as DispatchedExtractionResult;
}
```

Similarly for PPTX and XLSX handlers.

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/services/ingestion/extraction/__tests__/extractionDispatch.legacy.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/ingestion/extraction/extractionDispatch.service.ts backend/src/services/ingestion/extraction/__tests__/extractionDispatch.legacy.test.ts
git commit -m "fix: detect legacy OLE .doc/.ppt/.xls and return clear conversion error"
```

---

## Phase 2: Data Quality & Extraction Completeness (Score Impact: 78 -> 88)

---

### Task 11: XLSX Cell Facts for All Sheets (Not Just Financial/Temporal)

`xlsxExtractor.service.ts` only emits `cellFacts` for sheets marked `financial || temporal`. Non-financial tables with structured data are downgraded to prose.

**Files:**
- Modify: `backend/src/services/extraction/xlsxExtractor.service.ts` (the cell facts emission block)
- Test: `backend/src/services/extraction/__tests__/xlsxExtractor.allSheets.test.ts`

**Step 1: Write the failing test**

```typescript
// backend/src/services/extraction/__tests__/xlsxExtractor.allSheets.test.ts
import { describe, it, expect } from "vitest";
import { extractXlsxWithAnchors } from "../xlsxExtractor.service";
import * as XLSX from "xlsx";

function createXlsx(sheetData: Record<string, any[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, data] of Object.entries(sheetData)) {
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

describe("XLSX cell facts for non-financial sheets", () => {
  it("emits cell facts for sheets that are NOT financial", async () => {
    const buffer = createXlsx({
      Inventory: [
        ["Product", "SKU", "Quantity"],
        ["Widget A", "W-001", 150],
        ["Widget B", "W-002", 75],
      ],
    });

    const result = await extractXlsxWithAnchors(buffer);
    // Cell facts should exist even for non-financial sheets
    expect(result.cellFacts).toBeDefined();
    expect(result.cellFacts!.length).toBeGreaterThan(0);
    expect(result.cellFacts!.some((f) => f.value === "150" || f.displayValue === "150")).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/services/extraction/__tests__/xlsxExtractor.allSheets.test.ts`
Expected: FAIL - cellFacts empty for non-financial sheet

**Step 3: Remove the financial/temporal gate from cell facts emission**

In `xlsxExtractor.service.ts`, find the block that conditionally emits cell facts (look for the `if (isFinancial || hasTemporalColumns)` guard around cell fact generation) and remove the guard, or change it to always emit cell facts for sheets with structured data (headers detected, row count > 0).

The key change: always generate cell facts when headers are detected, regardless of `isFinancial` or `hasTemporalColumns`.

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/services/extraction/__tests__/xlsxExtractor.allSheets.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/extraction/xlsxExtractor.service.ts backend/src/services/extraction/__tests__/xlsxExtractor.allSheets.test.ts
git commit -m "feat(xlsx): emit cell facts for all structured sheets, not just financial"
```

---

### Task 12: PPTX Table Extraction as Markdown

PPTX tables (`a:tbl/a:tr/a:tc`) are currently flattened into body text. They should be formatted as markdown tables.

**Files:**
- Modify: `backend/src/services/extraction/pptxExtractor.service.ts`
- Test: `backend/src/services/extraction/__tests__/pptxExtractor.tables.test.ts`

**Step 1: Write the failing test**

```typescript
// backend/src/services/extraction/__tests__/pptxExtractor.tables.test.ts
import { describe, it, expect } from "vitest";
import { extractPptxWithAnchors } from "../pptxExtractor.service";
import AdmZip from "adm-zip";

function createPptxWithTable(): Buffer {
  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:txBody>
          <a:p><a:r><a:t>Slide Title</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
      <p:graphicFrame>
        <a:graphic>
          <a:graphicData>
            <a:tbl>
              <a:tr>
                <a:tc><a:txBody><a:p><a:r><a:t>Quarter</a:t></a:r></a:p></a:txBody></a:tc>
                <a:tc><a:txBody><a:p><a:r><a:t>Revenue</a:t></a:r></a:p></a:txBody></a:tc>
              </a:tr>
              <a:tr>
                <a:tc><a:txBody><a:p><a:r><a:t>Q1</a:t></a:r></a:p></a:txBody></a:tc>
                <a:tc><a:txBody><a:p><a:r><a:t>1,200</a:t></a:r></a:p></a:txBody></a:tc>
              </a:tr>
            </a:tbl>
          </a:graphicData>
        </a:graphic>
      </p:graphicFrame>
    </p:spTree>
  </p:cSld>
</p:sld>`;

  const contentTypes = `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/></Types>`;
  const presentationXml = `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst></p:presentation>`;
  const presRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`;

  const zip = new AdmZip();
  zip.addFile("[Content_Types].xml", Buffer.from(contentTypes));
  zip.addFile("ppt/presentation.xml", Buffer.from(presentationXml));
  zip.addFile("ppt/_rels/presentation.xml.rels", Buffer.from(presRels));
  zip.addFile("ppt/slides/slide1.xml", Buffer.from(slideXml));
  return zip.toBuffer();
}

describe("PPTX table extraction", () => {
  it("extracts table content as structured markdown", async () => {
    const buffer = createPptxWithTable();
    const result = await extractPptxWithAnchors(buffer);

    const slideText = result.slides[0]?.text || "";
    expect(slideText).toContain("Quarter");
    expect(slideText).toContain("Revenue");
    expect(slideText).toContain("Q1");
    expect(slideText).toContain("1,200");
    // Should be formatted as table, not flat text
    expect(slideText).toContain("|");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/services/extraction/__tests__/pptxExtractor.tables.test.ts`
Expected: FAIL - no pipe characters in output

**Step 3: Add table-aware extraction to PPTX**

In `pptxExtractor.service.ts`, add a function to detect and format `a:tbl` elements:

```typescript
function extractTableAsMarkdown(tblNode: any): string {
  const rows: string[][] = [];
  const trNodes = tblNode["a:tr"];
  if (!trNodes) return "";
  const trArray = Array.isArray(trNodes) ? trNodes : [trNodes];

  for (const tr of trArray) {
    const tcNodes = tr["a:tc"];
    if (!tcNodes) continue;
    const tcArray = Array.isArray(tcNodes) ? tcNodes : [tcNodes];
    const cells = tcArray.map((tc: any) => {
      // Extract text from cell's txBody
      return extractTextFromBody(tc["a:txBody"]).trim();
    });
    rows.push(cells);
  }

  if (rows.length < 1) return "";

  const colCount = Math.max(...rows.map((r) => r.length));
  const norm = (row: string[]) => {
    const p = [...row];
    while (p.length < colCount) p.push("");
    return p;
  };

  const header = "| " + norm(rows[0]).join(" | ") + " |";
  const sep = "| " + norm(rows[0]).map(() => "---").join(" | ") + " |";
  const body = rows.slice(1).map((r) => "| " + norm(r).join(" | ") + " |").join("\n");

  return [header, sep, body].filter(Boolean).join("\n");
}
```

Then modify the slide text extraction to check for `a:tbl` within graphic frames and append formatted tables to the slide text.

**Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/services/extraction/__tests__/pptxExtractor.tables.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/src/services/extraction/pptxExtractor.service.ts backend/src/services/extraction/__tests__/pptxExtractor.tables.test.ts
git commit -m "feat(pptx): extract tables as markdown instead of flat text"
```

---

### Task 13: Eliminate Type Safety Erosion (`as unknown as` Casts)

`extractionDispatch.service.ts` casts every extractor return with `as unknown as DispatchedExtractionResult`. Each extractor should return the correct type directly.

**Files:**
- Modify: `backend/src/services/ingestion/extraction/extractionDispatch.service.ts:91,96,101,106`
- Modify: Each extractor's return type to match `DispatchedExtractionResult` variants

**Step 1: Fix PDF extractor return type**

In `pdfExtractor.service.ts`, the `extractPdfWithAnchors` function already returns a `PdfExtractionResult` from `extraction.types.ts`. But `extractionResult.types.ts` has its own `PdfExtractionResult`. Align them:

Ensure `pdfExtractor.service.ts` imports from `extractionResult.types.ts` and returns exactly that type. Then in `extractionDispatch.service.ts`:

```typescript
// OLD:
const result = await extractPdfWithAnchors(buffer);
return { sourceType: "pdf", ...result } as unknown as DispatchedExtractionResult;

// NEW:
return await extractPdfWithAnchors(buffer);
```

This requires making each extractor's return type exactly match the discriminated union variant. The `sourceType` field must be set by the extractor itself (which it already is in most cases).

**Step 2: Repeat for DOCX, XLSX, PPTX**

Each extractor already sets `sourceType` in its return. Remove the spread+cast pattern:

```typescript
// DOCX
if (DOCX_MIMES.includes(mimeType)) {
  if (isOleBinary(buffer)) { /* ... */ }
  return await extractDocxWithAnchors(buffer);
}

// XLSX
if (XLSX_MIMES.includes(mimeType)) {
  return await extractXlsxWithAnchors(buffer);
}

// PPTX
if (PPTX_MIMES.includes(mimeType)) {
  return await extractPptxWithAnchors(buffer);
}
```

**Step 3: Update imports**

Ensure each extractor function signature returns the correct variant type from `extractionResult.types.ts` (not from the aspirational `extraction.types.ts`).

**Step 4: Verify TypeScript compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: No type errors

**Step 5: Commit**

```bash
git add backend/src/services/ingestion/extraction/extractionDispatch.service.ts backend/src/services/extraction/pdfExtractor.service.ts backend/src/services/extraction/docxExtractor.service.ts backend/src/services/extraction/xlsxExtractor.service.ts backend/src/services/extraction/pptxExtractor.service.ts
git commit -m "refactor: eliminate 'as unknown as' casts in extraction dispatch

Each extractor now returns its exact DispatchedExtractionResult variant."
```

---

### Task 14: Fix Page Count Overestimation

`pdfExtractor.service.ts:116-135` takes `Math.max` of parser page count, form-feed splits, and page markers -- whichever is highest wins. This overestimates when form-feeds are injected by OCR processing. The parser's page count from `getInfo()` is the authoritative source.

**Files:**
- Modify: `backend/src/services/extraction/pdfExtractor.service.ts:116-135`
- Test: `backend/src/services/extraction/__tests__/pdfExtractor.pageCount.test.ts`

**Step 1: Write the failing test**

```typescript
// backend/src/services/extraction/__tests__/pdfExtractor.pageCount.test.ts
import { describe, it, expect } from "vitest";

// Test the estimatePageCount function
describe("estimatePageCount", () => {
  it("prefers parser page count over inflated form-feed count", () => {
    const { estimatePageCount } = require("../pdfExtractor.service");
    // Parser says 5 pages, but text has 20 form feeds (OCR artifact)
    const text = "Page 1\f".repeat(20);
    const result = estimatePageCount(text, 5);
    // Should NOT return 20; parser says 5
    expect(result).toBeLessThanOrEqual(10); // allow some tolerance
  });
});
```

**Step 2: Fix estimatePageCount**

```typescript
export function estimatePageCount(rawText: string, parserPageCount: number): number {
  // Parser page count is authoritative. Other signals are only used
  // when the parser reports 0 or 1 (indicates parsing failure).
  if (parserPageCount > 1) return parserPageCount;

  // Fallback estimation for when parser can't determine page count
  let estimated = Math.max(1, parserPageCount || 1);

  const formFeedPages = rawText.split(FORM_FEED).length;
  if (formFeedPages > estimated) estimated = formFeedPages;

  const explicitPageMarkers =
    rawText.match(/---\s*Page\s*\d+\s*---/gi)?.length ?? 0;
  if (explicitPageMarkers > estimated) estimated = explicitPageMarkers;

  return Math.max(1, estimated);
}
```

**Step 3: Run test, commit**

```bash
git add backend/src/services/extraction/pdfExtractor.service.ts backend/src/services/extraction/__tests__/pdfExtractor.pageCount.test.ts
git commit -m "fix(pdf): prefer parser page count over inflated form-feed estimates"
```

---

## Phase 3: Dead Code Removal & Consolidation (Score Impact: 88 -> 93)

---

### Task 15: Delete Orphaned markdownConversion.service.ts

This 400+ line file is never imported by the pipeline. It has a PPTX stub, fake PDF page splitting, and uses mammoth (different from the main DOCX extractor). It's an old parallel pipeline.

**Files:**
- Delete: `backend/src/services/ingestion/markdownConversion.service.ts`

**Step 1: Verify no imports**

Run: `cd backend && grep -r "markdownConversion" src/ --include="*.ts" -l`
Expected: Only the file itself (no importers)

**Step 2: Delete the file**

```bash
rm backend/src/services/ingestion/markdownConversion.service.ts
```

**Step 3: Commit**

```bash
git add -u backend/src/services/ingestion/markdownConversion.service.ts
git commit -m "chore: remove orphaned markdownConversion.service.ts (dead code)

400+ line file never imported by the pipeline. Had stub PPTX converter,
fake PDF page splitting, and used mammoth instead of AdmZip for DOCX."
```

---

### Task 16: Delete Aspirational extraction.types.ts

`backend/src/types/extraction.types.ts` is 420 lines of aspirational types that no extractor implements. The real types are in `extractionResult.types.ts`. This dual type system causes confusion.

**Files:**
- Check: `backend/src/types/extraction.types.ts` for any actually-used exports
- Create migration for any types that ARE used
- Delete: `backend/src/types/extraction.types.ts`

**Step 1: Find all imports of this file**

Run: `cd backend && grep -r "extraction.types" src/ --include="*.ts" -l`

Document which types are actually imported. The pdfExtractor and docxExtractor import anchor types and `BaseExtractionResult` from here. These need to be migrated to `extractionResult.types.ts` or to their respective extractor files.

**Step 2: Move actually-used types**

Move `PdfPageAnchor`, `DocxHeadingAnchor`, `DocxParagraphAnchor`, `createPdfPageAnchor`, `createDocxHeadingAnchor`, and `DocxSection` into `extractionResult.types.ts` (if not already there) or into the extractor files that use them.

Move `BaseExtractionResult` - this is already defined in `extractionResult.types.ts`.

**Step 3: Update all imports**

Update `pdfExtractor.service.ts`, `docxExtractor.service.ts`, and any other files that import from `extraction.types.ts` to import from the new locations.

**Step 4: Delete the file**

```bash
rm backend/src/types/extraction.types.ts
```

**Step 5: Verify TypeScript compiles**

Run: `cd backend && npx tsc --noEmit`

**Step 6: Commit**

```bash
git add -u backend/src/types/extraction.types.ts
git add backend/src/services/ingestion/extraction/extractionResult.types.ts backend/src/services/extraction/pdfExtractor.service.ts backend/src/services/extraction/docxExtractor.service.ts
git commit -m "chore: consolidate type systems — delete aspirational extraction.types.ts

Migrated actually-used types (anchors, DocxSection) to their respective
modules. Eliminates the parallel type system that caused confusion."
```

---

### Task 17: Unify Duplicate clamp01 Functions

`clamp01` is defined in 3 places:
- `textQuality.service.ts:9`
- `ocrSignals.service.ts` (similar function)
- `normalization.ts` (document_understanding)

**Files:**
- Create: `backend/src/services/ingestion/pipeline/mathUtils.ts` (if needed, or just re-export from textQuality)
- Modify: All files that define their own `clamp01`

**Step 1: Pick one canonical location**

`textQuality.service.ts` already exports `clamp01`. Make other files import from there.

**Step 2: Update ocrSignals.service.ts**

Replace its local `clamp01` with an import from `textQuality.service.ts`.

**Step 3: Verify TypeScript compiles**

Run: `cd backend && npx tsc --noEmit`

**Step 4: Commit**

```bash
git add backend/src/services/extraction/ocrSignals.service.ts
git commit -m "refactor: deduplicate clamp01 — single source in textQuality.service"
```

---

### Task 18: Replace console.log/warn/error with logger

The extractors use raw `console.log` with emoji prefixes. The pipeline uses the structured `logger`. This causes split logging in production.

**Files:**
- Modify: `backend/src/services/extraction/pdfExtractor.service.ts`
- Modify: `backend/src/services/extraction/docxExtractor.service.ts`
- Modify: `backend/src/services/extraction/xlsxExtractor.service.ts`
- Modify: `backend/src/services/extraction/pptxExtractor.service.ts`

**Step 1: Global find and replace in each file**

For each extractor file:
1. Add `import { logger } from "../../utils/logger";` if not present
2. Replace `console.log(...)` with `logger.info(...)`
3. Replace `console.warn(...)` with `logger.warn(...)`
4. Replace `console.error(...)` with `logger.error(...)`
5. Remove emoji prefixes from log messages

**Step 2: Verify TypeScript compiles**

Run: `cd backend && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add backend/src/services/extraction/pdfExtractor.service.ts backend/src/services/extraction/docxExtractor.service.ts backend/src/services/extraction/xlsxExtractor.service.ts backend/src/services/extraction/pptxExtractor.service.ts
git commit -m "refactor: replace console.log with structured logger in all extractors"
```

---

## Phase 4: XLSX and Validator Hardening (Score Impact: 93 -> 96)

---

### Task 19: XLSX Merged Cell Handling

`xlsxExtractor.service.ts` never checks `sheet['!merges']`. Merged cells are common in financial reports (e.g., "Q1 2025" spanning 3 columns).

**Files:**
- Modify: `backend/src/services/extraction/xlsxExtractor.service.ts`
- Test: `backend/src/services/extraction/__tests__/xlsxExtractor.mergedCells.test.ts`

**Step 1: Write the failing test**

```typescript
// backend/src/services/extraction/__tests__/xlsxExtractor.mergedCells.test.ts
import { describe, it, expect } from "vitest";
import { extractXlsxWithAnchors } from "../xlsxExtractor.service";
import * as XLSX from "xlsx";

describe("XLSX merged cell handling", () => {
  it("reads merged cell values correctly", async () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ["Category", "Q1 2025", "", "Q2 2025", ""],
      ["", "Revenue", "Profit", "Revenue", "Profit"],
      ["Product A", 100, 20, 150, 35],
    ]);
    // Merge "Q1 2025" across B1:C1 and "Q2 2025" across D1:E1
    ws["!merges"] = [
      { s: { r: 0, c: 1 }, e: { r: 0, c: 2 } },
      { s: { r: 0, c: 3 }, e: { r: 0, c: 4 } },
    ];
    XLSX.utils.book_append_sheet(wb, ws, "Financial");
    const buffer = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

    const result = await extractXlsxWithAnchors(buffer);
    // The merged header "Q1 2025" should be propagated to child columns
    expect(result.text).toContain("Q1 2025");
    expect(result.text).toContain("Revenue");
  });
});
```

**Step 2: Implement merged cell propagation**

In `xlsxExtractor.service.ts`, after reading the worksheet, propagate merged cell values:

```typescript
function propagateMergedCells(ws: XLSX.WorkSheet): void {
  const merges = ws["!merges"];
  if (!merges || merges.length === 0) return;

  for (const merge of merges) {
    const originCell = XLSX.utils.encode_cell(merge.s);
    const originValue = ws[originCell];
    if (!originValue) continue;

    for (let r = merge.s.r; r <= merge.e.r; r++) {
      for (let c = merge.s.c; c <= merge.e.c; c++) {
        if (r === merge.s.r && c === merge.s.c) continue;
        const targetCell = XLSX.utils.encode_cell({ r, c });
        if (!ws[targetCell]) {
          ws[targetCell] = { ...originValue };
        }
      }
    }
  }
}
```

Call this function early in `extractXlsxWithAnchors`, right after reading each sheet.

**Step 3: Run test, commit**

```bash
git add backend/src/services/extraction/xlsxExtractor.service.ts backend/src/services/extraction/__tests__/xlsxExtractor.mergedCells.test.ts
git commit -m "feat(xlsx): propagate merged cell values for accurate header detection"
```

---

### Task 20: XLSX Row Limit — Remove 100-Row Truncation

`xlsxExtractor.service.ts` truncates sheet text at 100 rows (line ~386). For spreadsheets with 500+ rows, most data is invisible.

**Files:**
- Modify: `backend/src/services/extraction/xlsxExtractor.service.ts`

**Step 1: Find the truncation**

Look for the 100-row limit and either remove it or make it configurable (e.g., 10,000 rows with an env var).

**Step 2: Replace with configurable limit**

```typescript
const MAX_ROWS_PER_SHEET = parseInt(process.env.XLSX_MAX_ROWS || "10000", 10);
```

**Step 3: Commit**

```bash
git add backend/src/services/extraction/xlsxExtractor.service.ts
git commit -m "feat(xlsx): raise row extraction limit from 100 to 10,000 (configurable)"
```

---

### Task 21: Validator DOCX Integrity — Use AdmZip (Match Extractor)

`fileValidator.service.ts:383-384` uses `mammoth` for DOCX integrity checks, but the actual extractor uses `AdmZip`. A file can pass mammoth validation but crash AdmZip extraction.

**Files:**
- Modify: `backend/src/services/ingestion/fileValidator.service.ts:369-396`

**Step 1: Replace mammoth with AdmZip for DOCX validation**

```typescript
} else if (mimeType.includes("wordprocessingml")) {
  // Validate with AdmZip (same library as extractor)
  const AdmZip = require("adm-zip");
  const zip = new AdmZip(buffer);
  const entry = zip.getEntry("word/document.xml");
  if (!entry) throw new Error("Invalid DOCX: missing word/document.xml");
}
```

**Step 2: Remove mammoth import if no longer used**

Check if `mammoth` is used elsewhere in the file (it's used in `validateContentExtraction`). If so, keep the import. Otherwise, remove it.

**Step 3: Commit**

```bash
git add backend/src/services/ingestion/fileValidator.service.ts
git commit -m "fix: use AdmZip for DOCX integrity validation (matches extractor)"
```

---

### Task 22: Add Password Detection for XLSX/DOCX/PPTX

`fileValidator.service.ts:401-429` only detects PDF passwords. Encrypted Office files crash silently.

**Files:**
- Modify: `backend/src/services/ingestion/fileValidator.service.ts:401-429`

**Step 1: Add Office format password detection**

```typescript
private async checkPasswordProtection(
  buffer: Buffer,
  mimeType: string,
): Promise<ValidationResult> {
  try {
    if (mimeType === "application/pdf") {
      const pdfString = buffer.toString("latin1");
      if (pdfString.includes("/Encrypt")) {
        return {
          isValid: false,
          error: "PDF is password-protected",
          errorCode: ValidationErrorCode.PASSWORD_PROTECTED,
          suggestion: "Please remove the password protection and try again.",
        };
      }
    }

    // Office files: encrypted OOXML has EncryptedPackage in OLE container
    if (
      mimeType.includes("wordprocessingml") ||
      mimeType.includes("spreadsheetml") ||
      mimeType.includes("presentationml")
    ) {
      // Check if it's actually an OLE container (encrypted OOXML)
      const isOle =
        buffer.length >= 8 &&
        buffer[0] === 0xd0 &&
        buffer[1] === 0xcf &&
        buffer[2] === 0x11 &&
        buffer[3] === 0xe0;

      if (isOle) {
        return {
          isValid: false,
          error: "Document is password-protected",
          errorCode: ValidationErrorCode.PASSWORD_PROTECTED,
          suggestion:
            "Please remove the password protection and re-save as .docx/.xlsx/.pptx.",
        };
      }
    }

    return { isValid: true };
  } catch {
    return { isValid: true };
  }
}
```

**Step 2: Commit**

```bash
git add backend/src/services/ingestion/fileValidator.service.ts
git commit -m "feat: detect password-protected DOCX/XLSX/PPTX via OLE header check"
```

---

## Phase 5: Observability & Telemetry (Score Impact: 96 -> 98)

---

### Task 23: Add Trace ID Propagation

Currently there's no way to trace a document through the pipeline from upload to ready. Add a `traceId` that flows through all log calls.

**Files:**
- Modify: `backend/src/services/ingestion/pipeline/documentPipeline.service.ts`
- Modify: `backend/src/queues/workers/documentIngestionPipeline.service.ts`

**Step 1: Generate traceId at pipeline entry**

In `runDocumentIngestionPipeline`:

```typescript
import { randomUUID } from "crypto";

// At the top of the function:
const traceId = randomUUID().substring(0, 8);
logger.info("[IngestionPipeline] Enriching document", {
  filename,
  documentId: documentId.substring(0, 8),
  traceId,
  dbHost,
});
```

**Step 2: Pass traceId to processDocumentAsync**

Add `traceId` as a parameter and include it in all `logger.*` calls within the pipeline.

**Step 3: Commit**

```bash
git add backend/src/services/ingestion/pipeline/documentPipeline.service.ts backend/src/queues/workers/documentIngestionPipeline.service.ts
git commit -m "feat: add traceId for end-to-end pipeline log correlation"
```

---

### Task 24: Add Pipeline Duration Histogram Buckets

Add telemetry for extraction duration by format, to identify slow extractors.

**Files:**
- Modify: `backend/src/queues/workers/documentIngestionPipeline.service.ts:309-342`

**Step 1: Add format-specific duration to telemetry meta**

In the `ingestionEvent.create` call, add:

```typescript
meta: {
  ocrMode: timings.ocrMode,
  ocrPageCount: timings.ocrPageCount,
  textQuality: timings.textQuality,
  textQualityScore: timings.textQualityScore,
  extractionWarnings: timings.extractionWarnings.slice(0, 20),
  // NEW: format-specific timings for performance analysis
  storageDownloadMs: timings.storageDownloadMs,
  extractionMs: timings.extractionMs,
  embeddingMs: timings.embeddingMs,
  rawChunkCount: timings.rawChunkCount,
  textLength: timings.textLength,
},
```

**Step 2: Commit**

```bash
git add backend/src/queues/workers/documentIngestionPipeline.service.ts
git commit -m "feat: add per-step timing breakdown to ingestion telemetry"
```

---

## Phase 6: Final Polish (Score Impact: 98 -> 100)

---

### Task 25: Export postProcessText and estimatePageCount for Testing

These functions are currently private. Making them exported (they're pure functions) allows thorough unit testing.

**Files:**
- Modify: `backend/src/services/extraction/pdfExtractor.service.ts`

**Step 1: Add `export` keyword to both functions**

```typescript
export function postProcessText(text: string): string { ... }
export function estimatePageCount(rawText: string, parserPageCount: number): number { ... }
```

**Step 2: Commit**

```bash
git add backend/src/services/extraction/pdfExtractor.service.ts
git commit -m "refactor: export postProcessText and estimatePageCount for unit testing"
```

---

### Task 26: Remove `(extraction as any)` Casts in ocrSignals.service.ts

`ocrSignals.service.ts` has ~15 `(extraction as any)` casts. Now that we have proper typed `DispatchedExtractionResult`, these should use type guards.

**Files:**
- Modify: `backend/src/services/extraction/ocrSignals.service.ts`

**Step 1: Replace `as any` with type-safe access**

Import type guards from `extractionResult.types.ts` and use them:

```typescript
import { isSkipped, hasPagesArray } from "../ingestion/extraction/extractionResult.types";
import type { DispatchedExtractionResult } from "../ingestion/extraction/extractionResult.types";

// Instead of (extraction as any).ocrPageCount, use:
extraction.ocrPageCount  // BaseExtractionResult already has this field
```

Most fields (`ocrApplied`, `ocrConfidence`, `ocrPageCount`, `ocrMode`) are on `BaseExtractionResult`, so they're accessible without casts.

**Step 2: Verify TypeScript compiles**

Run: `cd backend && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add backend/src/services/extraction/ocrSignals.service.ts
git commit -m "refactor: eliminate (extraction as any) casts using proper type guards"
```

---

### Task 27: End-to-End Pipeline Integration Test

Write a single integration test that processes a real PDF, DOCX, XLSX, and CSV through the full pipeline and verifies the output.

**Files:**
- Create: `backend/src/services/ingestion/__tests__/pipeline.integration.test.ts`

**Step 1: Write the integration test**

```typescript
// backend/src/services/ingestion/__tests__/pipeline.integration.test.ts
import { describe, it, expect } from "vitest";
import { extractText } from "../extraction/extractionDispatch.service";
import { buildInputChunks, deduplicateChunks } from "../pipeline/chunkAssembly.service";

describe("pipeline integration", () => {
  it("processes plain text through extract -> chunk -> dedup", async () => {
    const text = "A".repeat(3000) + "\n\n" + "B".repeat(3000);
    const buffer = Buffer.from(text, "utf-8");

    const extraction = await extractText(buffer, "text/plain", "test.txt");
    expect(extraction.sourceType).toBe("text");
    expect(extraction.text.length).toBeGreaterThan(0);

    const chunks = buildInputChunks(extraction, extraction.text);
    expect(chunks.length).toBeGreaterThan(1);

    const deduped = deduplicateChunks(chunks);
    expect(deduped.length).toBeGreaterThan(0);
    expect(deduped.length).toBeLessThanOrEqual(chunks.length);
  });

  it("processes CSV through extract -> chunk", async () => {
    const csv = "Name,Score\nAlice,95\nBob,87\nCharlie,92";
    const buffer = Buffer.from(csv, "utf-8");

    const extraction = await extractText(buffer, "text/csv", "scores.csv");
    expect(extraction.text).toContain("|");
    expect(extraction.text).toContain("Alice");

    const chunks = buildInputChunks(extraction, extraction.text);
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("postProcessText preserves column gaps for table detection", async () => {
    const { postProcessText } = await import("../../extraction/pdfExtractor.service");
    const tableText = "Revenue     100,000     120,000\nCOGS        50,000      60,000";
    const processed = postProcessText(tableText);
    // Multi-space gaps must survive for pdfTableExtractor
    expect(processed).toMatch(/\s{3,}/);
  });
});
```

**Step 2: Run tests**

Run: `cd backend && npx vitest run src/services/ingestion/__tests__/pipeline.integration.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add backend/src/services/ingestion/__tests__/pipeline.integration.test.ts
git commit -m "test: add end-to-end pipeline integration tests"
```

---

## Summary of Score Impact

| Phase | Tasks | Score Before | Score After | Description |
|-------|-------|-------------|-------------|-------------|
| 0 | 1-3 | 45 | 65 | P0: PDF tables, DOCX tables, preamble |
| 1 | 4-10 | 65 | 78 | P1: Size limits, confidence, units, timeouts, CSV, legacy guards |
| 2 | 11-14 | 78 | 88 | XLSX all-sheet facts, PPTX tables, type safety, page count |
| 3 | 15-18 | 88 | 93 | Dead code removal, type consolidation, logging |
| 4 | 19-22 | 93 | 96 | XLSX merged cells/row limits, validator hardening |
| 5 | 23-24 | 96 | 98 | Trace IDs, telemetry |
| 6 | 25-27 | 98 | 100 | Testing, final type safety polish |

**Total: 27 tasks across 6 phases.**

## Verification Checklist

After all tasks are complete:

- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] `npx vitest run` passes all tests
- [ ] No `as unknown as` casts remain in extraction dispatch
- [ ] No `(extraction as any)` casts remain in ocrSignals
- [ ] No `console.log` in extractor files (only `logger`)
- [ ] `extraction.types.ts` deleted
- [ ] `markdownConversion.service.ts` deleted
- [ ] File validator size limit matches upload config
- [ ] PDF postProcessText preserves multi-space gaps
- [ ] DOCX tables appear in extracted text
- [ ] CSV files extract as markdown tables
- [ ] Legacy .doc/.ppt/.xls return clear error messages
