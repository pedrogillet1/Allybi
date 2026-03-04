/**
 * Tests for PPTX table extraction (a:tbl support).
 *
 * Each test builds a minimal valid PPTX in-memory using AdmZip, then runs
 * extractPptxWithAnchors and asserts the table content appears as
 * pipe-separated markdown.
 */

import { extractPptxWithAnchors } from "../pptxExtractor.service";

// ---------------------------------------------------------------------------
// Helper: build a minimal PPTX buffer from slide XML body content
// ---------------------------------------------------------------------------

function buildPptx(slideBodyXml: string): Buffer {
  const AdmZip = require("adm-zip");
  const zip = new AdmZip();

  const slideXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
    '  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
    '  xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">',
    "  <p:cSld>",
    "    <p:spTree>",
    slideBodyXml,
    "    </p:spTree>",
    "  </p:cSld>",
    "</p:sld>",
  ].join("\n");

  const contentTypesXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '  <Default Extension="xml" ContentType="application/xml"/>',
    '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>',
    "</Types>",
  ].join("\n");

  const relsXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>',
    "</Relationships>",
  ].join("\n");

  zip.addFile("[Content_Types].xml", Buffer.from(contentTypesXml, "utf-8"));
  zip.addFile("_rels/.rels", Buffer.from(relsXml, "utf-8"));
  zip.addFile("ppt/slides/slide1.xml", Buffer.from(slideXml, "utf-8"));

  return zip.toBuffer();
}

// ---------------------------------------------------------------------------
// Helper: create a text shape (p:sp with p:txBody)
// ---------------------------------------------------------------------------

function makeTextShape(text: string): string {
  return `
    <p:sp>
      <p:txBody>
        <a:p><a:r><a:t>${text}</a:t></a:r></a:p>
      </p:txBody>
    </p:sp>
  `;
}

// ---------------------------------------------------------------------------
// Helper: create an a:tbl from a 2D array
// ---------------------------------------------------------------------------

function makeTbl(rows: string[][]): string {
  const trXml = rows
    .map((row) => {
      const tcXml = row
        .map(
          (cell) =>
            `<a:tc><a:txBody><a:p><a:r><a:t>${cell}</a:t></a:r></a:p></a:txBody></a:tc>`,
        )
        .join("");
      return `<a:tr>${tcXml}</a:tr>`;
    })
    .join("");
  return `
    <p:graphicFrame>
      <a:graphic>
        <a:graphicData>
          <a:tbl>${trXml}</a:tbl>
        </a:graphicData>
      </a:graphic>
    </p:graphicFrame>
  `;
}

// ===========================================================================
// Tests
// ===========================================================================

describe("PPTX table extraction (a:tbl support)", () => {
  it("extracts a 2x2 table as markdown with pipes", async () => {
    const body = makeTbl([
      ["Name", "Age"],
      ["Alice", "30"],
    ]);

    const result = await extractPptxWithAnchors(buildPptx(body));

    expect(result.text).toContain("Name");
    expect(result.text).toContain("Age");
    expect(result.text).toContain("Alice");
    expect(result.text).toContain("30");
    expect(result.text).toContain("|");
    expect(result.text).toContain("---");
  });

  it("extracts a 3x3 table with all cells", async () => {
    const body = makeTbl([
      ["Product", "Qty", "Price"],
      ["Widget", "10", "$5.00"],
      ["Gadget", "25", "$12.50"],
    ]);

    const result = await extractPptxWithAnchors(buildPptx(body));

    expect(result.text).toContain("Product");
    expect(result.text).toContain("Qty");
    expect(result.text).toContain("Widget");
    expect(result.text).toContain("$12.50");
  });

  it("handles empty cells in table", async () => {
    const body = `
      <p:graphicFrame>
        <a:graphic>
          <a:graphicData>
            <a:tbl>
              <a:tr>
                <a:tc><a:txBody><a:p><a:r><a:t>Filled</a:t></a:r></a:p></a:txBody></a:tc>
                <a:tc><a:txBody><a:p></a:p></a:txBody></a:tc>
              </a:tr>
              <a:tr>
                <a:tc><a:txBody><a:p></a:p></a:txBody></a:tc>
                <a:tc><a:txBody><a:p><a:r><a:t>Also filled</a:t></a:r></a:p></a:txBody></a:tc>
              </a:tr>
            </a:tbl>
          </a:graphicData>
        </a:graphic>
      </p:graphicFrame>
    `;

    const result = await extractPptxWithAnchors(buildPptx(body));

    expect(result.text).toContain("Filled");
    expect(result.text).toContain("Also filled");
    expect(result.text).toContain("|");
  });

  it("handles multiple tables on one slide", async () => {
    const body = [
      makeTbl([
        ["A", "B"],
        ["1", "2"],
      ]),
      makeTbl([
        ["X", "Y"],
        ["9", "8"],
      ]),
    ].join("\n");

    const result = await extractPptxWithAnchors(buildPptx(body));

    expect(result.text).toContain("A");
    expect(result.text).toContain("B");
    expect(result.text).toContain("X");
    expect(result.text).toContain("Y");
  });

  it("interleaves text shapes and tables correctly", async () => {
    const body = [
      makeTextShape("Before the table"),
      makeTbl([
        ["H1", "H2"],
        ["D1", "D2"],
      ]),
      makeTextShape("After the table"),
    ].join("\n");

    const result = await extractPptxWithAnchors(buildPptx(body));

    expect(result.text).toContain("Before the table");
    expect(result.text).toContain("H1");
    expect(result.text).toContain("D1");
    expect(result.text).toContain("After the table");

    // Check order
    const beforeIdx = result.text.indexOf("Before the table");
    const h1Idx = result.text.indexOf("H1");
    const afterIdx = result.text.indexOf("After the table");
    expect(beforeIdx).toBeLessThan(h1Idx);
    expect(h1Idx).toBeLessThan(afterIdx);
  });

  it("formats table with header separator line", async () => {
    const body = makeTbl([
      ["Col A", "Col B"],
      ["Val 1", "Val 2"],
    ]);

    const result = await extractPptxWithAnchors(buildPptx(body));

    const lines = result.text.split("\n");
    const headerIdx = lines.findIndex(
      (l) => l.includes("Col A") && l.includes("Col B"),
    );
    expect(headerIdx).toBeGreaterThanOrEqual(0);

    // Separator line follows header
    const separator = lines[headerIdx + 1];
    expect(separator).toMatch(/^\|[\s-|]+\|$/);

    // Data row
    const dataRow = lines[headerIdx + 2];
    expect(dataRow).toContain("Val 1");
    expect(dataRow).toContain("Val 2");
  });

  it("does NOT duplicate cell text from recursive traversal", async () => {
    // This verifies the fix: table cells should NOT be recursed into
    // as standalone p:txBody elements (which would duplicate text)
    const body = makeTbl([
      ["Unique Cell A", "Unique Cell B"],
      ["Unique Cell C", "Unique Cell D"],
    ]);

    const result = await extractPptxWithAnchors(buildPptx(body));

    // Each cell text should appear exactly once
    const countOccurrences = (text: string, sub: string) =>
      text.split(sub).length - 1;

    expect(countOccurrences(result.text, "Unique Cell A")).toBe(1);
    expect(countOccurrences(result.text, "Unique Cell B")).toBe(1);
    expect(countOccurrences(result.text, "Unique Cell C")).toBe(1);
    expect(countOccurrences(result.text, "Unique Cell D")).toBe(1);
  });
});
