import { describe, expect, test } from "@jest/globals";
import AdmZip = require("adm-zip");
import { DocxEditorService } from "../../services/editing/docx/docxEditor.service";

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

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:t>Intro paragraph</w:t></w:r>
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

function extractDocumentXml(buffer: Buffer): string {
  const zip = new AdmZip(buffer);
  const entry = zip.getEntry("word/document.xml");
  if (!entry) throw new Error("Missing word/document.xml");
  return entry.getData().toString("utf8");
}

function countMatches(text: string, needle: string): number {
  const rx = new RegExp(needle, "g");
  return (text.match(rx) || []).length;
}

describe("DocxEditorService table operations", () => {
  test("createTable appends a DOCX table with requested dimensions", async () => {
    const editor = new DocxEditorService();
    const input = buildMinimalDocx();
    const output = await editor.createTable(input, {
      rows: 2,
      cols: 3,
      headerRow: true,
    });

    const xml = extractDocumentXml(output);
    expect(xml).toContain("<w:tbl>");
    expect(countMatches(xml, "<w:tr>")).toBe(2);
    expect(countMatches(xml, "<w:tc>")).toBe(6);
    expect(xml).toContain("Header 1");
  });

  test("addTableRow and deleteTableRow mutate row count deterministically", async () => {
    const editor = new DocxEditorService();
    const input = buildMinimalDocx();
    const withTable = await editor.createTable(input, {
      rows: 2,
      cols: 2,
      headerRow: false,
    });
    const added = await editor.addTableRow(withTable, {
      tableIndex: 1,
      position: "end",
      cellTexts: ["A", "B"],
    });
    const addedXml = extractDocumentXml(added);
    expect(countMatches(addedXml, "<w:tr>")).toBe(3);
    expect(addedXml).toContain(">A<");
    expect(addedXml).toContain(">B<");

    const deleted = await editor.deleteTableRow(added, {
      tableIndex: 1,
      rowIndex: 3,
    });
    const deletedXml = extractDocumentXml(deleted);
    expect(countMatches(deletedXml, "<w:tr>")).toBe(2);
  });

  test("setTableCell writes the requested text into the selected cell", async () => {
    const editor = new DocxEditorService();
    const input = buildMinimalDocx();
    const withTable = await editor.createTable(input, {
      rows: 2,
      cols: 2,
      headerRow: false,
    });
    const updated = await editor.setTableCell(withTable, {
      tableIndex: 1,
      rowIndex: 2,
      colIndex: 2,
      text: "Revenue",
    });

    const xml = extractDocumentXml(updated);
    expect(xml).toContain(">Revenue<");
  });
});

