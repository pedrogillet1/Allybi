/**
 * Editing Suggestions Test (Heuristics)
 *
 * Run:
 *   cd backend && npx ts-node src/tests/editing-suggestions.test.ts
 */

import AdmZip = require("adm-zip");

import { DocxAnchorsService } from "../services/editing/docx/docxAnchors.service";
import { EditSuggestionsService } from "../services/editing/editSuggestions.service";

let passed = 0;
let failed = 0;

function pass(name: string): void {
  passed += 1;
  // eslint-disable-next-line no-console
  console.log(`✅ PASS  ${name}`);
}

function fail(name: string, reason: string): void {
  failed += 1;
  // eslint-disable-next-line no-console
  console.error(`❌ FAIL  ${name} — ${reason}`);
}

function assert(cond: boolean, name: string, reason: string): void {
  if (cond) pass(name);
  else fail(name, reason);
}

function buildTestDocx(): Buffer {
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
      <w:r><w:t>Executive Summary</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>This agreement outlines various services and deliverables, including but not limited to implementation, support, and reporting; timelines may vary; details to be confirmed soon.</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
      <w:r><w:t>Scope</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>The scope includes delivery of the platform, training, and documentation. Out of scope: custom integrations.</w:t></w:r>
    </w:p>
    <w:p>
      <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
      <w:r><w:t>Definitions</w:t></w:r>
    </w:p>
    <w:p>
      <w:r><w:t>The term "Effective Date" means February 7, 2026.</w:t></w:r>
    </w:p>
  </w:body>
</w:document>`;

  zip.addFile("word/document.xml", Buffer.from(docXml, "utf8"));
  zip.addFile(
    "[Content_Types].xml",
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
      "utf8",
    ),
  );
  return zip.toBuffer();
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log("\nLEVEL — Suggestions grounded to paragraphIds\n");

  const buffer = buildTestDocx();
  const anchors = new DocxAnchorsService();
  const paragraphs = await anchors.extractParagraphNodes(buffer);

  assert(
    paragraphs.length >= 4,
    "extract anchors",
    `expected >=4 paragraphs, got ${paragraphs.length}`,
  );

  const svc = new EditSuggestionsService();
  const suggestions = svc.suggestDocx({
    documentId: "00000000-0000-0000-0000-000000000000",
    paragraphs,
    count: 6,
    seed: "seed-1",
    language: "en",
  });

  assert(
    Array.isArray(suggestions) && suggestions.length > 0,
    "has suggestions",
    "no suggestions returned",
  );

  const ids = new Set(paragraphs.map((p) => p.paragraphId));
  const sugIds = new Set<string>();
  const sugLabels = new Set<string>();
  for (const s of suggestions) {
    assert(
      Boolean(s.paragraphId && ids.has(s.paragraphId)),
      "suggestion paragraphId exists",
      `missing paragraphId=${s.paragraphId}`,
    );
    assert(
      Boolean(s.label && s.label.length <= 60),
      "label sane",
      `label="${s.label}"`,
    );
    assert(
      Boolean(s.instruction && s.instruction.length <= 240),
      "instruction sane",
      `instruction len=${(s.instruction || "").length}`,
    );
    assert(
      !sugIds.has(s.paragraphId),
      "unique paragraphId",
      `duplicate paragraphId=${s.paragraphId}`,
    );
    assert(
      !sugLabels.has(s.label),
      "unique label",
      `duplicate label=${s.label}`,
    );
    sugIds.add(s.paragraphId);
    sugLabels.add(s.label);
  }

  // eslint-disable-next-line no-console
  console.log(`\nSuggestions returned: ${suggestions.length}`);
  for (const s of suggestions) {
    // eslint-disable-next-line no-console
    console.log(`  - ${s.label} -> ${s.paragraphId.slice(0, 16)}…`);
  }

  // eslint-disable-next-line no-console
  console.log(`\nRESULT — passed=${passed} failed=${failed}\n`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("Fatal:", e);
  process.exit(1);
});
