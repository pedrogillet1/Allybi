/* eslint-disable @typescript-eslint/no-var-requires */
// Generates minimal valid OOXML fixtures for integration tests.
// This script is intentionally dependency-light: uses adm-zip + xlsx which already exist in backend deps.

const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const XLSX = require("xlsx");

const outDir = __dirname;

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeFileIfMissing(filePath, buf) {
  if (fs.existsSync(filePath)) return;
  fs.writeFileSync(filePath, buf);
}

function buildDocx() {
  const zip = new AdmZip();
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
      <w:r><w:t>Sample Contract</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
      <w:r><w:t>Definitions</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>The term "Effective Date" means February 7, 2026.</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
      <w:r><w:t>Scope</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>This document is used for fixture testing only.</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;

  // Minimal parts for consumers that only read word/document.xml.
  zip.addFile("word/document.xml", Buffer.from(docXml, "utf8"));
  zip.addFile("[Content_Types].xml", Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`, "utf8"));

  return zip.toBuffer();
}

function buildPptx() {
  const zip = new AdmZip();
  const slide1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="1" name="Title 1"/>
          <p:cNvSpPr/>
          <p:nvPr><p:ph type="title"/></p:nvPr>
        </p:nvSpPr>
        <p:txBody>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p><a:r><a:t>Sample Deck Title</a:t></a:r></a:p>
        </p:txBody>
      </p:sp>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="2" name="Content 2"/>
          <p:cNvSpPr/>
          <p:nvPr/>
        </p:nvSpPr>
        <p:txBody>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p>
            <a:pPr><a:buChar char="•"/></a:pPr>
            <a:r><a:t>First bullet</a:t></a:r>
          </a:p>
          <a:p>
            <a:pPr><a:buChar char="•"/></a:pPr>
            <a:r><a:t>Second bullet</a:t></a:r>
          </a:p>
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;

  zip.addFile("ppt/slides/slide1.xml", Buffer.from(slide1, "utf8"));
  zip.addFile("[Content_Types].xml", Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`, "utf8"));

  return zip.toBuffer();
}

function buildXlsx() {
  const wb = XLSX.utils.book_new();
  const rows = [
    ["Metric", "Jan", "Feb", "Mar"],
    ["Revenue", 1200, 1400, 1600],
    ["Cost", 800, 900, 1000],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

function main() {
  ensureDir(outDir);
  writeFileIfMissing(path.join(outDir, "sample.docx"), buildDocx());
  writeFileIfMissing(path.join(outDir, "sample.pptx"), buildPptx());
  writeFileIfMissing(path.join(outDir, "sample.xlsx"), buildXlsx());
  // eslint-disable-next-line no-console
  console.log("Fixtures generated (if missing).");
}

main();
