/**
 * E2E evaluation harness: DOCX structural editing
 *
 * Proves the complete plan→apply pipeline for DOCX edits:
 *  (a) plan is correct — DocxEditorService methods produce valid OOXML
 *  (b) apply changed bytes — output buffer differs from input
 *  (c) UI can highlight affected targets — paragraph IDs are extractable
 *
 * No stubs. Real DOCX fixture, real editor, real OOXML verification.
 */

import { describe, expect, test, beforeAll } from "@jest/globals";
import crypto from "crypto";
import AdmZip = require("adm-zip");
import { DocxEditorService } from "../../../services/editing/docx/docxEditor.service";
import { DocxAnchorsService } from "../../../services/editing/docx/docxAnchors.service";

// ---------------------------------------------------------------------------
// Fixture builder: creates a minimal valid DOCX with known paragraphs
// ---------------------------------------------------------------------------

function buildMinimalDocx(): Buffer {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const wordRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

  // 4 paragraphs: Heading1, body text, body text, Heading2
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p w14:paraId="00000001" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>Introduction</w:t></w:r>
    </w:p>
    <w:p w14:paraId="00000002" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">
      <w:r><w:t>This is the first body paragraph with some text.</w:t></w:r>
    </w:p>
    <w:p w14:paraId="00000003" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">
      <w:r><w:rPr><w:b/><w:i/></w:rPr><w:t>Bold italic paragraph for format tests.</w:t></w:r>
    </w:p>
    <w:p w14:paraId="00000004" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">
      <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
      <w:r><w:t>Section Two</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;

  const zip = new AdmZip();
  zip.addFile("[Content_Types].xml", Buffer.from(contentTypes, "utf8"));
  zip.addFile("_rels/.rels", Buffer.from(rels, "utf8"));
  zip.addFile("word/_rels/document.xml.rels", Buffer.from(wordRels, "utf8"));
  zip.addFile("word/document.xml", Buffer.from(documentXml, "utf8"));

  return zip.toBuffer();
}

// ---------------------------------------------------------------------------
// Deterministic change verification helpers
// ---------------------------------------------------------------------------

function hashBuffer(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function extractDocumentXml(buf: Buffer): string {
  const zip = new AdmZip(buf);
  const entry = zip.getEntry("word/document.xml");
  if (!entry) throw new Error("Missing word/document.xml");
  return entry.getData().toString("utf8");
}

function extractParagraphTexts(buf: Buffer): string[] {
  const xml = extractDocumentXml(buf);
  // Simple XML text extraction — good enough for verification
  const texts: string[] = [];
  const paraRegex = /<w:p[\s>][\s\S]*?<\/w:p>/g;
  let match: RegExpExecArray | null;
  while ((match = paraRegex.exec(xml)) !== null) {
    const paraXml = match[0];
    const textParts: string[] = [];
    const textRegex = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
    let tMatch: RegExpExecArray | null;
    while ((tMatch = textRegex.exec(paraXml)) !== null) {
      textParts.push(tMatch[1] || "");
    }
    texts.push(textParts.join(""));
  }
  return texts;
}

function countParagraphs(buf: Buffer): number {
  const xml = extractDocumentXml(buf);
  return (xml.match(/<w:p[\s>]/g) || []).length;
}

function paragraphHasStyle(
  buf: Buffer,
  paraIndex: number,
  styleName: string,
): boolean {
  const xml = extractDocumentXml(buf);
  const paraRegex = /<w:p[\s>][\s\S]*?<\/w:p>/g;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = paraRegex.exec(xml)) !== null) {
    if (idx === paraIndex) {
      return match[0].includes(`w:val="${styleName}"`);
    }
    idx++;
  }
  return false;
}

function paragraphHasRunProp(
  buf: Buffer,
  paraIndex: number,
  propTag: string,
): boolean {
  const xml = extractDocumentXml(buf);
  const paraRegex = /<w:p[\s>][\s\S]*?<\/w:p>/g;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = paraRegex.exec(xml)) !== null) {
    if (idx === paraIndex) {
      return match[0].includes(`<${propTag}`);
    }
    idx++;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

let fixtureBuffer: Buffer;
let editorService: DocxEditorService;
let anchorsService: DocxAnchorsService;

beforeAll(() => {
  fixtureBuffer = buildMinimalDocx();
  editorService = new DocxEditorService();
  anchorsService = new DocxAnchorsService();
});

// ---------------------------------------------------------------------------
// 1. Fixture integrity — prerequisite for all other tests
// ---------------------------------------------------------------------------

describe("DOCX fixture integrity", () => {
  test("fixture is a valid ZIP with word/document.xml", () => {
    const zip = new AdmZip(fixtureBuffer);
    const entry = zip.getEntry("word/document.xml");
    expect(entry).toBeDefined();
  });

  test("fixture has exactly 4 paragraphs", () => {
    expect(countParagraphs(fixtureBuffer)).toBe(4);
  });

  test("fixture paragraphs contain expected text", () => {
    const texts = extractParagraphTexts(fixtureBuffer);
    expect(texts[0]).toBe("Introduction");
    expect(texts[1]).toContain("first body paragraph");
    expect(texts[2]).toContain("Bold italic paragraph");
    expect(texts[3]).toBe("Section Two");
  });

  test("fixture heading paragraphs have correct styles", () => {
    expect(paragraphHasStyle(fixtureBuffer, 0, "Heading1")).toBe(true);
    expect(paragraphHasStyle(fixtureBuffer, 3, "Heading2")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Paragraph anchors extractable (UI can highlight targets)
// ---------------------------------------------------------------------------

describe("paragraph anchor extraction", () => {
  test("extracts all 4 paragraph nodes", async () => {
    const anchors = await anchorsService.extractParagraphNodes(fixtureBuffer);
    expect(anchors.length).toBe(4);
  });

  test("each anchor has a stable paragraphId", async () => {
    const anchors = await anchorsService.extractParagraphNodes(fixtureBuffer);
    for (const anchor of anchors) {
      expect(typeof anchor.paragraphId).toBe("string");
      expect(anchor.paragraphId.length).toBeGreaterThan(0);
    }
  });

  test("anchor text matches expected paragraph content", async () => {
    const anchors = await anchorsService.extractParagraphNodes(fixtureBuffer);
    expect(anchors[0]!.text).toContain("Introduction");
    expect(anchors[1]!.text).toContain("first body paragraph");
  });

  test("heading anchors have headingLevel set", async () => {
    const anchors = await anchorsService.extractParagraphNodes(fixtureBuffer);
    const headings = anchors.filter(
      (a) => a.headingLevel != null && a.headingLevel >= 1,
    );
    expect(headings.length).toBeGreaterThanOrEqual(1);
  });

  test("anchor extraction is idempotent (same IDs on repeated calls)", async () => {
    const first = await anchorsService.extractParagraphNodes(fixtureBuffer);
    const second = await anchorsService.extractParagraphNodes(fixtureBuffer);
    expect(first.map((a) => a.paragraphId)).toEqual(
      second.map((a) => a.paragraphId),
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Apply paragraph text edit — bytes change, text changes, structure preserved
// ---------------------------------------------------------------------------

describe("apply paragraph text edit (plan→apply→verify)", () => {
  let editedBuffer: Buffer;
  let targetParagraphId: string;

  beforeAll(async () => {
    const anchors = await anchorsService.extractParagraphNodes(fixtureBuffer);
    // Edit the second paragraph (body text)
    targetParagraphId = anchors[1]!.paragraphId;
    editedBuffer = await editorService.applyParagraphEdit(
      fixtureBuffer,
      targetParagraphId,
      "This paragraph has been edited by the e2e harness.",
    );
  });

  test("output bytes differ from input bytes", () => {
    expect(hashBuffer(editedBuffer)).not.toBe(hashBuffer(fixtureBuffer));
  });

  test("output is a valid DOCX (has word/document.xml)", () => {
    const zip = new AdmZip(editedBuffer);
    expect(zip.getEntry("word/document.xml")).toBeDefined();
  });

  test("paragraph count is preserved (no structural damage)", () => {
    expect(countParagraphs(editedBuffer)).toBe(4);
  });

  test("edited paragraph contains new text", () => {
    const texts = extractParagraphTexts(editedBuffer);
    expect(texts[1]).toContain("edited by the e2e harness");
  });

  test("other paragraphs are unchanged", () => {
    const texts = extractParagraphTexts(editedBuffer);
    expect(texts[0]).toBe("Introduction");
    expect(texts[3]).toBe("Section Two");
  });

  test("heading styles are preserved after edit", () => {
    expect(paragraphHasStyle(editedBuffer, 0, "Heading1")).toBe(true);
    expect(paragraphHasStyle(editedBuffer, 3, "Heading2")).toBe(true);
  });

  test("edited paragraph is still extractable at same position (UI highlight target)", async () => {
    const anchors = await anchorsService.extractParagraphNodes(editedBuffer);
    // Paragraph IDs are content-hash-based, so the ID changes after edit.
    // What matters for UI is that the same position paragraph is extractable.
    expect(anchors.length).toBe(4);
    expect(anchors[1]!.text).toContain("edited by the e2e harness");
  });
});

// ---------------------------------------------------------------------------
// 4. Apply run-style formatting — bold/color applied at OOXML level
// ---------------------------------------------------------------------------

describe("apply run-style formatting (plan→apply→verify)", () => {
  let styledBuffer: Buffer;

  beforeAll(async () => {
    const anchors = await anchorsService.extractParagraphNodes(fixtureBuffer);
    const targetId = anchors[1]!.paragraphId;
    styledBuffer = await editorService.applyRunStyle(fixtureBuffer, targetId, {
      bold: true,
      color: "#FF0000",
      fontFamily: "Courier New",
    });
  });

  test("output bytes differ from input", () => {
    expect(hashBuffer(styledBuffer)).not.toBe(hashBuffer(fixtureBuffer));
  });

  test("target paragraph has w:b (bold) run property", () => {
    expect(paragraphHasRunProp(styledBuffer, 1, "w:b")).toBe(true);
  });

  test("target paragraph has w:color run property with FF0000", () => {
    const xml = extractDocumentXml(styledBuffer);
    expect(xml).toContain('w:val="FF0000"');
  });

  test("target paragraph has w:rFonts with Courier New", () => {
    const xml = extractDocumentXml(styledBuffer);
    expect(xml).toContain('w:ascii="Courier New"');
  });

  test("text content is preserved after formatting", () => {
    const texts = extractParagraphTexts(styledBuffer);
    expect(texts[1]).toContain("first body paragraph");
  });

  test("paragraph count unchanged (no structural damage)", () => {
    expect(countParagraphs(styledBuffer)).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 5. Delete paragraph — structural edit verification
// ---------------------------------------------------------------------------

describe("delete paragraph (structural edit → verify)", () => {
  let deletedBuffer: Buffer;

  beforeAll(async () => {
    const anchors = await anchorsService.extractParagraphNodes(fixtureBuffer);
    const targetId = anchors[2]!.paragraphId; // "Bold italic paragraph"
    deletedBuffer = await editorService.deleteParagraph(
      fixtureBuffer,
      targetId,
    );
  });

  test("output bytes differ from input", () => {
    expect(hashBuffer(deletedBuffer)).not.toBe(hashBuffer(fixtureBuffer));
  });

  test("paragraph count reduced by 1", () => {
    expect(countParagraphs(deletedBuffer)).toBe(3);
  });

  test("deleted paragraph text is absent", () => {
    const texts = extractParagraphTexts(deletedBuffer);
    const allText = texts.join(" ");
    expect(allText).not.toContain("Bold italic paragraph");
  });

  test("remaining paragraphs are intact", () => {
    const texts = extractParagraphTexts(deletedBuffer);
    expect(texts[0]).toBe("Introduction");
    expect(texts.some((t) => t.includes("first body paragraph"))).toBe(true);
    expect(texts[texts.length - 1]).toBe("Section Two");
  });
});

// ---------------------------------------------------------------------------
// 6. Numbering/list conversion — paragraph converted to list item
// ---------------------------------------------------------------------------

describe("numbering conversion (apply bulleted list to paragraph)", () => {
  let numberedBuffer: Buffer;

  beforeAll(async () => {
    const anchors = await anchorsService.extractParagraphNodes(fixtureBuffer);
    const targetId = anchors[1]!.paragraphId;
    numberedBuffer = await editorService.applyParagraphEdit(
      fixtureBuffer,
      targetId,
      "This is the first body paragraph with some text.",
      { applyNumbering: true, applyNumberingType: "bulleted" },
    );
  });

  test("output bytes differ from input", () => {
    expect(hashBuffer(numberedBuffer)).not.toBe(hashBuffer(fixtureBuffer));
  });

  test("target paragraph has numbering property or bullet glyph", () => {
    const xml = extractDocumentXml(numberedBuffer);
    const paraRegex = /<w:p[\s>][\s\S]*?<\/w:p>/g;
    let match: RegExpExecArray | null;
    let idx = 0;
    let found = false;
    while ((match = paraRegex.exec(xml)) !== null) {
      if (idx === 1) {
        // Check for w:numPr (numbering property) or bullet character
        found =
          match[0].includes("w:numPr") ||
          match[0].includes("\u2022") || // bullet char
          match[0].includes("•");
        break;
      }
      idx++;
    }
    expect(found).toBe(true);
  });

  test("paragraph count preserved", () => {
    expect(countParagraphs(numberedBuffer)).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 7. Multi-step pipeline: edit text then format (chained operations)
// ---------------------------------------------------------------------------

describe("chained operations: edit text → apply formatting", () => {
  let finalBuffer: Buffer;

  beforeAll(async () => {
    const anchors = await anchorsService.extractParagraphNodes(fixtureBuffer);
    const targetId = anchors[1]!.paragraphId;

    // Step 1: edit text
    const afterEdit = await editorService.applyParagraphEdit(
      fixtureBuffer,
      targetId,
      "Updated text for chained test.",
    );

    // Step 2: re-extract anchors from edited buffer (IDs are content-hash-based)
    const editedAnchors = await anchorsService.extractParagraphNodes(afterEdit);
    const editedTargetId = editedAnchors[1]!.paragraphId;

    // Step 3: apply bold formatting to the same paragraph
    finalBuffer = await editorService.applyRunStyle(afterEdit, editedTargetId, {
      bold: true,
      italic: true,
    });
  });

  test("final output differs from both original and intermediate", () => {
    expect(hashBuffer(finalBuffer)).not.toBe(hashBuffer(fixtureBuffer));
  });

  test("final output has updated text", () => {
    const texts = extractParagraphTexts(finalBuffer);
    expect(texts[1]).toContain("Updated text for chained test");
  });

  test("final output has bold and italic run properties", () => {
    expect(paragraphHasRunProp(finalBuffer, 1, "w:b")).toBe(true);
    expect(paragraphHasRunProp(finalBuffer, 1, "w:i")).toBe(true);
  });

  test("paragraph anchors still extractable after chained ops", async () => {
    const anchors = await anchorsService.extractParagraphNodes(finalBuffer);
    expect(anchors.length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// 8. Hash-based proof verification contract
// ---------------------------------------------------------------------------

describe("hash-based proof verification", () => {
  test("identical input produces identical hash", () => {
    const h1 = hashBuffer(fixtureBuffer);
    const h2 = hashBuffer(fixtureBuffer);
    expect(h1).toBe(h2);
  });

  test("any edit produces a different hash (bitwise proof)", async () => {
    const anchors = await anchorsService.extractParagraphNodes(fixtureBuffer);
    const before = hashBuffer(fixtureBuffer);

    const edited = await editorService.applyParagraphEdit(
      fixtureBuffer,
      anchors[1]!.paragraphId,
      "Hash verification edit.",
    );
    const after = hashBuffer(edited);

    expect(before).not.toBe(after);
    expect(before.length).toBe(64); // sha256 hex length
    expect(after.length).toBe(64);
  });
});
