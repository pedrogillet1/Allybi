/**
 * Tests for DOCX table extraction (w:tbl support).
 *
 * Each test builds a minimal valid DOCX in-memory using AdmZip, then runs
 * extractDocxWithAnchors / extractTextFromWord and asserts the table
 * content appears in the output.
 */

import { extractDocxWithAnchors, extractTextFromWord } from "../docxExtractor.service";

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
// Helper: create a w:p element with text
// ---------------------------------------------------------------------------

function makeP(text: string, style?: string): string {
  const stylePart = style
    ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>`
    : "";
  return `<w:p>${stylePart}<w:r><w:t>${text}</w:t></w:r></w:p>`;
}

// ---------------------------------------------------------------------------
// Helper: create a w:tbl element from a 2D array of cell strings
// ---------------------------------------------------------------------------

function makeTbl(rows: string[][]): string {
  const trXml = rows
    .map((row) => {
      const tcXml = row
        .map((cell) => `<w:tc><w:p><w:r><w:t>${cell}</w:t></w:r></w:p></w:tc>`)
        .join("");
      return `<w:tr>${tcXml}</w:tr>`;
    })
    .join("");
  return `<w:tbl>${trXml}</w:tbl>`;
}

// ===========================================================================
// Tests
// ===========================================================================

describe("DOCX table extraction (w:tbl support)", () => {
  // -------------------------------------------------------------------------
  // Basic table extraction
  // -------------------------------------------------------------------------

  it("extracts a simple 2x2 table as markdown", async () => {
    const body = makeTbl([
      ["Name", "Age"],
      ["Alice", "30"],
    ]);

    const buf = buildDocx(body);
    const result = await extractDocxWithAnchors(buf);

    // The output should contain the cell text
    expect(result.text).toContain("Name");
    expect(result.text).toContain("Age");
    expect(result.text).toContain("Alice");
    expect(result.text).toContain("30");

    // Should be formatted as a markdown table with pipes
    expect(result.text).toContain("|");
    expect(result.text).toContain("---");
  });

  it("extracts a 3x3 table with all cells", async () => {
    const body = makeTbl([
      ["Product", "Qty", "Price"],
      ["Widget", "10", "$5.00"],
      ["Gadget", "25", "$12.50"],
    ]);

    const buf = buildDocx(body);
    const result = await extractDocxWithAnchors(buf);

    expect(result.text).toContain("Product");
    expect(result.text).toContain("Qty");
    expect(result.text).toContain("Price");
    expect(result.text).toContain("Widget");
    expect(result.text).toContain("10");
    expect(result.text).toContain("$5.00");
    expect(result.text).toContain("Gadget");
    expect(result.text).toContain("25");
    expect(result.text).toContain("$12.50");
  });

  // -------------------------------------------------------------------------
  // Markdown table format verification
  // -------------------------------------------------------------------------

  it("formats table as proper markdown with header separator", async () => {
    const body = makeTbl([
      ["Col A", "Col B"],
      ["Val 1", "Val 2"],
    ]);

    const buf = buildDocx(body);
    const result = await extractDocxWithAnchors(buf);

    const lines = result.text.split("\n");

    // Find the header line
    const headerIdx = lines.findIndex(
      (l) => l.includes("Col A") && l.includes("Col B"),
    );
    expect(headerIdx).toBeGreaterThanOrEqual(0);

    // Next line should be the separator
    const separator = lines[headerIdx + 1];
    expect(separator).toMatch(/^\|[\s-|]+\|$/);

    // Data row follows
    const dataRow = lines[headerIdx + 2];
    expect(dataRow).toContain("Val 1");
    expect(dataRow).toContain("Val 2");
  });

  // -------------------------------------------------------------------------
  // Interleaved paragraphs and tables
  // -------------------------------------------------------------------------

  it("preserves document order for interleaved paragraphs and tables", async () => {
    const body = [
      makeP("Before the table"),
      makeTbl([
        ["H1", "H2"],
        ["D1", "D2"],
      ]),
      makeP("After the table"),
    ].join("\n");

    const buf = buildDocx(body);
    const result = await extractDocxWithAnchors(buf);

    // All content should be present
    expect(result.text).toContain("Before the table");
    expect(result.text).toContain("H1");
    expect(result.text).toContain("D1");
    expect(result.text).toContain("After the table");

    // Check ordering: "Before" before table content, table content before "After"
    const beforeIdx = result.text.indexOf("Before the table");
    const h1Idx = result.text.indexOf("H1");
    const afterIdx = result.text.indexOf("After the table");

    expect(beforeIdx).toBeLessThan(h1Idx);
    expect(h1Idx).toBeLessThan(afterIdx);
  });

  // -------------------------------------------------------------------------
  // Table under a heading
  // -------------------------------------------------------------------------

  it("includes table content under its heading section", async () => {
    const body = [
      makeP("Financial Data", "Heading1"),
      makeP("See the table below:"),
      makeTbl([
        ["Quarter", "Revenue"],
        ["Q1", "$1M"],
        ["Q2", "$2M"],
      ]),
    ].join("\n");

    const buf = buildDocx(body);
    const result = await extractDocxWithAnchors(buf);

    // The heading should exist
    expect(result.headings.length).toBeGreaterThanOrEqual(1);
    expect(result.headings[0].text).toBe("Financial Data");

    // Table data should be in the output text
    expect(result.text).toContain("Quarter");
    expect(result.text).toContain("Revenue");
    expect(result.text).toContain("Q1");
    expect(result.text).toContain("$1M");
    expect(result.text).toContain("Q2");
    expect(result.text).toContain("$2M");
  });

  // -------------------------------------------------------------------------
  // Multiple tables
  // -------------------------------------------------------------------------

  it("extracts multiple tables from the same document", async () => {
    const body = [
      makeP("Table 1 follows:"),
      makeTbl([
        ["A", "B"],
        ["1", "2"],
      ]),
      makeP("Table 2 follows:"),
      makeTbl([
        ["X", "Y"],
        ["9", "8"],
      ]),
    ].join("\n");

    const buf = buildDocx(body);
    const result = await extractDocxWithAnchors(buf);

    // Both tables should appear in output
    expect(result.text).toContain("A");
    expect(result.text).toContain("B");
    expect(result.text).toContain("1");
    expect(result.text).toContain("2");
    expect(result.text).toContain("X");
    expect(result.text).toContain("Y");
    expect(result.text).toContain("9");
    expect(result.text).toContain("8");
  });

  // -------------------------------------------------------------------------
  // Single-row table (header only, no data rows)
  // -------------------------------------------------------------------------

  it("handles a single-row table (header only)", async () => {
    const body = makeTbl([["Only", "Row"]]);

    const buf = buildDocx(body);
    const result = await extractDocxWithAnchors(buf);

    expect(result.text).toContain("Only");
    expect(result.text).toContain("Row");
    expect(result.text).toContain("|");
    // Should still have separator line
    expect(result.text).toContain("---");
  });

  // -------------------------------------------------------------------------
  // Legacy extractTextFromWord also returns table content
  // -------------------------------------------------------------------------

  it("extractTextFromWord includes table content", async () => {
    const body = [
      makeP("Intro text"),
      makeTbl([
        ["Key", "Value"],
        ["foo", "bar"],
      ]),
    ].join("\n");

    const buf = buildDocx(body);
    const result = await extractTextFromWord(buf);

    expect(result.text).toContain("Key");
    expect(result.text).toContain("Value");
    expect(result.text).toContain("foo");
    expect(result.text).toContain("bar");
  });

  // -------------------------------------------------------------------------
  // Table with empty cells
  // -------------------------------------------------------------------------

  it("handles table cells with empty content", async () => {
    // Build a table where one cell has no w:r / w:t (empty paragraph)
    const body = `
      <w:tbl>
        <w:tr>
          <w:tc><w:p><w:r><w:t>Filled</w:t></w:r></w:p></w:tc>
          <w:tc><w:p></w:p></w:tc>
        </w:tr>
        <w:tr>
          <w:tc><w:p></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>Also filled</w:t></w:r></w:p></w:tc>
        </w:tr>
      </w:tbl>
    `;

    const buf = buildDocx(body);
    const result = await extractDocxWithAnchors(buf);

    expect(result.text).toContain("Filled");
    expect(result.text).toContain("Also filled");
    // Should still produce a valid markdown table (with pipe characters)
    expect(result.text).toContain("|");
  });

  // -------------------------------------------------------------------------
  // Merged cells (gridSpan)
  // -------------------------------------------------------------------------

  it("handles gridSpan — cell spanning 2 columns", async () => {
    // Row 1: a cell spanning 2 columns + a normal cell = 3 logical columns
    // Row 2: 3 normal cells
    const body = `
      <w:tbl>
        <w:tr>
          <w:tc>
            <w:tcPr><w:gridSpan w:val="2"/></w:tcPr>
            <w:p><w:r><w:t>Merged Header</w:t></w:r></w:p>
          </w:tc>
          <w:tc><w:p><w:r><w:t>Col 3</w:t></w:r></w:p></w:tc>
        </w:tr>
        <w:tr>
          <w:tc><w:p><w:r><w:t>A1</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>B1</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>C1</w:t></w:r></w:p></w:tc>
        </w:tr>
      </w:tbl>
    `;

    const buf = buildDocx(body);
    const result = await extractDocxWithAnchors(buf);

    // All content should be present
    expect(result.text).toContain("Merged Header");
    expect(result.text).toContain("Col 3");
    expect(result.text).toContain("A1");
    expect(result.text).toContain("B1");
    expect(result.text).toContain("C1");

    // Without gridSpan: row 1 = ["Merged Header", "Col 3"] → padded to ["Merged Header", "Col 3", ""]
    // With gridSpan:    row 1 = ["Merged Header", "", "Col 3"]
    // The key difference: "Col 3" must be in the THIRD column, aligned with "C1"
    const lines = result.text.split("\n");
    const headerLine = lines.find((l) => l.includes("Merged Header"));
    const dataLine = lines.find((l) => l.includes("A1"));
    expect(headerLine).toBeTruthy();
    expect(dataLine).toBeTruthy();

    // Split both lines by | to check column alignment
    const headerCols = headerLine!.split("|").map((c) => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);
    const dataCols = dataLine!.split("|").map((c) => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);

    // Both rows should have 3 columns
    expect(headerCols.length).toBe(3);
    expect(dataCols.length).toBe(3);

    // "Col 3" should be in the SAME column index as "C1" (column 3)
    const col3Idx = headerCols.findIndex((c) => c === "Col 3");
    const c1Idx = dataCols.findIndex((c) => c === "C1");
    expect(col3Idx).toBe(c1Idx);
  });

  // -------------------------------------------------------------------------
  // paragraphCount includes table pseudo-paragraphs
  // -------------------------------------------------------------------------

  it("paragraphCount includes table entries", async () => {
    const body = [
      makeP("Para 1"),
      makeTbl([
        ["A", "B"],
        ["C", "D"],
      ]),
      makeP("Para 2"),
    ].join("\n");

    const buf = buildDocx(body);
    const result = await extractDocxWithAnchors(buf);

    // 2 real paragraphs + 1 table pseudo-paragraph = 3
    expect(result.paragraphCount).toBeGreaterThanOrEqual(3);
  });

  // -------------------------------------------------------------------------
  // Vertical merge (vMerge) — cell spanning 2 rows
  // -------------------------------------------------------------------------

  it("handles vMerge — cell spanning 2 rows vertically", async () => {
    // Row 1: "Category" (vMerge restart) | "Q1"
    // Row 2: (vMerge continue = empty)   | "Q2"
    // Visually "Category" spans both rows, but markdown emits it only in row 1
    const body = `
      <w:tbl>
        <w:tr>
          <w:tc>
            <w:tcPr><w:vMerge w:val="restart"/></w:tcPr>
            <w:p><w:r><w:t>Category</w:t></w:r></w:p>
          </w:tc>
          <w:tc><w:p><w:r><w:t>Q1</w:t></w:r></w:p></w:tc>
        </w:tr>
        <w:tr>
          <w:tc>
            <w:tcPr><w:vMerge/></w:tcPr>
            <w:p><w:r><w:t>ignored</w:t></w:r></w:p>
          </w:tc>
          <w:tc><w:p><w:r><w:t>Q2</w:t></w:r></w:p></w:tc>
        </w:tr>
      </w:tbl>
    `;

    const buf = buildDocx(body);
    const result = await extractDocxWithAnchors(buf);

    // "Category" should appear in the first row
    expect(result.text).toContain("Category");
    // "Q1" and "Q2" should both be present
    expect(result.text).toContain("Q1");
    expect(result.text).toContain("Q2");
    // The continuation cell text ("ignored") should NOT appear — it's merged
    expect(result.text).not.toContain("ignored");

    // Check row structure: row 2 should have empty first column
    const lines = result.text.split("\n");
    const row1 = lines.find((l) => l.includes("Category"));
    const row2 = lines.find((l) => l.includes("Q2"));
    expect(row1).toBeTruthy();
    expect(row2).toBeTruthy();

    // Parse columns for row2: first column should be empty (space placeholder)
    const row2Cols = row2!.split("|").map((c) => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);
    expect(row2Cols.length).toBe(2);
    // First column of the continuation row should be empty (rendered as space in markdown)
    expect(row2Cols[0]).toBe("");
  });

  // -------------------------------------------------------------------------
  // Combined gridSpan + vMerge — cell spanning both directions
  // -------------------------------------------------------------------------

  it("handles combined gridSpan + vMerge — cell spanning columns and rows", async () => {
    // 3 columns x 2 rows
    // Row 1: "Title" (gridSpan=2, vMerge restart) | "Col3"
    // Row 2: (gridSpan=2, vMerge continue)        | "Data3"
    const body = `
      <w:tbl>
        <w:tr>
          <w:tc>
            <w:tcPr>
              <w:gridSpan w:val="2"/>
              <w:vMerge w:val="restart"/>
            </w:tcPr>
            <w:p><w:r><w:t>Title</w:t></w:r></w:p>
          </w:tc>
          <w:tc><w:p><w:r><w:t>Col3</w:t></w:r></w:p></w:tc>
        </w:tr>
        <w:tr>
          <w:tc>
            <w:tcPr>
              <w:gridSpan w:val="2"/>
              <w:vMerge/>
            </w:tcPr>
            <w:p><w:r><w:t>hidden</w:t></w:r></w:p>
          </w:tc>
          <w:tc><w:p><w:r><w:t>Data3</w:t></w:r></w:p></w:tc>
        </w:tr>
      </w:tbl>
    `;

    const buf = buildDocx(body);
    const result = await extractDocxWithAnchors(buf);

    // "Title" should appear (it's the restart cell)
    expect(result.text).toContain("Title");
    expect(result.text).toContain("Col3");
    expect(result.text).toContain("Data3");
    // The continuation cell text ("hidden") should NOT appear
    expect(result.text).not.toContain("hidden");

    // Check column structure
    const lines = result.text.split("\n");
    const row1 = lines.find((l) => l.includes("Title"));
    const row2 = lines.find((l) => l.includes("Data3"));
    expect(row1).toBeTruthy();
    expect(row2).toBeTruthy();

    // Both rows should have 3 columns (gridSpan=2 + 1 normal = 3)
    const row1Cols = row1!.split("|").map((c) => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);
    const row2Cols = row2!.split("|").map((c) => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);

    expect(row1Cols.length).toBe(3);
    expect(row2Cols.length).toBe(3);

    // Row 1: ["Title", "", "Col3"] — gridSpan pads column 2
    expect(row1Cols[0]).toBe("Title");
    expect(row1Cols[2]).toBe("Col3");

    // Row 2: ["", "", "Data3"] — vMerge continue + gridSpan padding
    expect(row2Cols[0]).toBe("");
    expect(row2Cols[1]).toBe("");
    expect(row2Cols[2]).toBe("Data3");
  });
});
