/**
 * Tests for DOCX preamble text handling (pre-heading text).
 *
 * Verifies that text appearing before the first heading in a DOCX document
 * is preserved in a synthetic preamble section (heading: undefined, level: 0)
 * rather than being silently dropped.
 */

import {
  extractDocxWithAnchors,
  extractTextFromWord,
} from "../docxExtractor.service";

// ---------------------------------------------------------------------------
// Helper: build a minimal DOCX buffer from a document.xml body string
// ---------------------------------------------------------------------------

function buildDocx(bodyInnerXml: string): Buffer {
  const AdmZip = require("adm-zip");
  const zip = new AdmZip();

  const documentXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"',
    '  xmlns:mo="http://schemas.microsoft.com/office/mac/office/2008/main"',
    '  xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"',
    '  xmlns:mv="urn:schemas-microsoft-com:mac:vml"',
    '  xmlns:o="urn:schemas-microsoft-com:office:office"',
    '  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
    '  xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"',
    '  xmlns:v="urn:schemas-microsoft-com:vml"',
    '  xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"',
    '  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
    '  xmlns:w10="urn:schemas-microsoft-com:office:word"',
    '  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
    '  xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"',
    '  xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"',
    '  xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk"',
    '  xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml"',
    '  xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape">',
    "  <w:body>",
    bodyInnerXml,
    "    <w:sectPr/>",
    "  </w:body>",
    "</w:document>",
  ].join("\n");

  const contentTypesXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '  <Default Extension="xml" ContentType="application/xml"/>',
    '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
    "</Types>",
  ].join("\n");

  const relsXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>',
    "</Relationships>",
  ].join("\n");

  zip.addFile("[Content_Types].xml", Buffer.from(contentTypesXml, "utf-8"));
  zip.addFile("_rels/.rels", Buffer.from(relsXml, "utf-8"));
  zip.addFile("word/document.xml", Buffer.from(documentXml, "utf-8"));

  return zip.toBuffer();
}

// ---------------------------------------------------------------------------
// Helper: create a w:p element with text and optional heading style
// ---------------------------------------------------------------------------

function makeP(text: string, style?: string): string {
  const stylePart = style
    ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>`
    : "";
  return `<w:p>${stylePart}<w:r><w:t>${text}</w:t></w:r></w:p>`;
}

// ===========================================================================
// Tests
// ===========================================================================

describe("DOCX preamble text handling (pre-heading text)", () => {
  // -------------------------------------------------------------------------
  // Basic preamble capture
  // -------------------------------------------------------------------------

  it("preserves text that appears before the first heading", async () => {
    const body = [
      makeP("This is preamble text."),
      makeP("Introduction", "Heading1"),
      makeP("Body under introduction."),
    ].join("\n");

    const buf = buildDocx(body);
    const result = await extractDocxWithAnchors(buf);

    expect(result.text).toContain("This is preamble text.");
    expect(result.text).toContain("Introduction");
    expect(result.text).toContain("Body under introduction.");
  });

  // -------------------------------------------------------------------------
  // Preamble section structure
  // -------------------------------------------------------------------------

  it("creates a preamble section with heading undefined and level 0", async () => {
    const body = [
      makeP("Preamble paragraph one."),
      makeP("Preamble paragraph two."),
      makeP("Chapter 1", "Heading1"),
      makeP("Chapter content."),
    ].join("\n");

    const buf = buildDocx(body);
    const result = await extractDocxWithAnchors(buf);

    // The first section should be the preamble
    expect(result.sections.length).toBeGreaterThanOrEqual(2);
    const preamble = result.sections[0];
    expect(preamble.heading).toBeUndefined();
    expect(preamble.level).toBe(0);
    expect(preamble.content).toContain("Preamble paragraph one.");
    expect(preamble.content).toContain("Preamble paragraph two.");

    // The second section should be the real heading
    const chapter = result.sections[1];
    expect(chapter.heading).toBe("Chapter 1");
    expect(chapter.level).toBe(1);
  });

  // -------------------------------------------------------------------------
  // No "# undefined" in output
  // -------------------------------------------------------------------------

  it("does not output '# undefined' in full text for preamble sections", async () => {
    const body = [
      makeP("Some leading text."),
      makeP("Main Section", "Heading1"),
      makeP("Section body."),
    ].join("\n");

    const buf = buildDocx(body);
    const result = await extractDocxWithAnchors(buf);

    expect(result.text).not.toContain("# undefined");
    expect(result.text).not.toContain("undefined");
    expect(result.text).toContain("Some leading text.");
    expect(result.text).toContain("# Main Section");
  });

  // -------------------------------------------------------------------------
  // Document with only body text (no headings)
  // -------------------------------------------------------------------------

  it("handles a document with no headings at all", async () => {
    const body = [
      makeP("First paragraph."),
      makeP("Second paragraph."),
      makeP("Third paragraph."),
    ].join("\n");

    const buf = buildDocx(body);
    const result = await extractDocxWithAnchors(buf);

    // All text should be preserved
    expect(result.text).toContain("First paragraph.");
    expect(result.text).toContain("Second paragraph.");
    expect(result.text).toContain("Third paragraph.");

    // Should have exactly one preamble section
    expect(result.sections.length).toBe(1);
    expect(result.sections[0].heading).toBeUndefined();
    expect(result.sections[0].level).toBe(0);

    // No headings recorded
    expect(result.headings.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Multiple preamble paragraphs joined correctly
  // -------------------------------------------------------------------------

  it("joins multiple preamble paragraphs with double newlines", async () => {
    const body = [
      makeP("Line A"),
      makeP("Line B"),
      makeP("Line C"),
      makeP("Title", "Heading1"),
    ].join("\n");

    const buf = buildDocx(body);
    const result = await extractDocxWithAnchors(buf);

    const preamble = result.sections[0];
    expect(preamble.heading).toBeUndefined();
    expect(preamble.content).toBe("Line A\n\nLine B\n\nLine C");
  });

  // -------------------------------------------------------------------------
  // Preamble section has correct path (empty array)
  // -------------------------------------------------------------------------

  it("preamble section has an empty path array", async () => {
    const body = [
      makeP("Preamble text."),
      makeP("Heading", "Heading1"),
    ].join("\n");

    const buf = buildDocx(body);
    const result = await extractDocxWithAnchors(buf);

    const preamble = result.sections[0];
    expect(preamble.path).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Preamble + multiple heading levels coexist
  // -------------------------------------------------------------------------

  it("preamble coexists with multiple heading levels", async () => {
    const body = [
      makeP("Document preamble."),
      makeP("Chapter 1", "Heading1"),
      makeP("Chapter 1 content."),
      makeP("Section 1.1", "Heading2"),
      makeP("Section 1.1 content."),
      makeP("Chapter 2", "Heading1"),
      makeP("Chapter 2 content."),
    ].join("\n");

    const buf = buildDocx(body);
    const result = await extractDocxWithAnchors(buf);

    // Preamble + 2 top-level heading sections
    expect(result.sections.length).toBe(3);

    // Preamble
    expect(result.sections[0].heading).toBeUndefined();
    expect(result.sections[0].content).toContain("Document preamble.");

    // Chapter 1 with nested Section 1.1
    expect(result.sections[1].heading).toBe("Chapter 1");
    expect(result.sections[1].children!.length).toBe(1);
    expect(result.sections[1].children![0].heading).toBe("Section 1.1");

    // Chapter 2
    expect(result.sections[2].heading).toBe("Chapter 2");
  });

  // -------------------------------------------------------------------------
  // Order in full text output
  // -------------------------------------------------------------------------

  it("preamble text appears before heading sections in full text", async () => {
    const body = [
      makeP("Preamble comes first."),
      makeP("Section A", "Heading1"),
      makeP("Section A body."),
    ].join("\n");

    const buf = buildDocx(body);
    const result = await extractDocxWithAnchors(buf);

    const preambleIdx = result.text.indexOf("Preamble comes first.");
    const headingIdx = result.text.indexOf("Section A");
    expect(preambleIdx).toBeLessThan(headingIdx);
  });

  // -------------------------------------------------------------------------
  // Legacy extractTextFromWord also returns preamble
  // -------------------------------------------------------------------------

  it("extractTextFromWord preserves preamble text", async () => {
    const body = [
      makeP("Legacy preamble text."),
      makeP("Title", "Heading1"),
      makeP("Body text."),
    ].join("\n");

    const buf = buildDocx(body);
    const result = await extractTextFromWord(buf);

    expect(result.text).toContain("Legacy preamble text.");
    expect(result.text).toContain("Body text.");
  });

  // -------------------------------------------------------------------------
  // Empty paragraphs before heading are skipped (not accumulated)
  // -------------------------------------------------------------------------

  it("skips empty paragraphs before the first heading", async () => {
    // An empty w:p with no w:r/w:t produces empty text
    const body = [
      "<w:p></w:p>",
      makeP("Real preamble."),
      makeP("Heading", "Heading1"),
    ].join("\n");

    const buf = buildDocx(body);
    const result = await extractDocxWithAnchors(buf);

    const preamble = result.sections[0];
    expect(preamble.heading).toBeUndefined();
    expect(preamble.content).toBe("Real preamble.");
  });
});
