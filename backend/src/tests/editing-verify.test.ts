/**
 * Editing Verification Test
 * Proves that DOCX editing works end-to-end and non-DOCX formats are rejected gracefully.
 *
 * Run:  cd backend && npx ts-node src/tests/editing-verify.test.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import AdmZip = require('adm-zip');

import { DocxAnchorsService } from '../services/editing/docx/docxAnchors.service';
import { DocxEditorService } from '../services/editing/docx/docxEditor.service';

// ─── helpers ────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function log(label: string, ...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.log(`  ${label}`, ...args);
}

function pass(name: string): void {
  passed++;
  // eslint-disable-next-line no-console
  console.log(`✅ PASS  ${name}`);
}

function fail(name: string, reason: string): void {
  failed++;
  // eslint-disable-next-line no-console
  console.error(`❌ FAIL  ${name} — ${reason}`);
}

function assert(condition: boolean, name: string, reason: string): void {
  if (condition) pass(name);
  else fail(name, reason);
}

// ─── build a minimal DOCX in-memory (same pattern as _generate-fixtures.cjs) ─

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

  zip.addFile('word/document.xml', Buffer.from(docXml, 'utf8'));
  zip.addFile(
    '[Content_Types].xml',
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
      'utf8',
    ),
  );

  return zip.toBuffer();
}

// ─── Level 1: DocxAnchorsService + DocxEditorService ────────────────────────

async function level1_extractAnchors(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('\n══════════════════════════════════════════════════════');
  // eslint-disable-next-line no-console
  console.log('LEVEL 1 — DocxAnchorsService: extract paragraph anchors');
  // eslint-disable-next-line no-console
  console.log('══════════════════════════════════════════════════════');

  const anchors = new DocxAnchorsService();
  const buffer = buildTestDocx();

  const nodes = await anchors.extractParagraphNodes(buffer);

  assert(nodes.length === 5, 'anchor count is 5', `got ${nodes.length}`);

  log('Paragraphs extracted:');
  for (const n of nodes) {
    log(`  [${n.paragraphId.slice(0, 16)}…]  section=${n.sectionPath.join(' > ')}  text="${n.text}"`);
  }

  const headings = nodes.filter((n) => n.sectionPath.length > 0);
  assert(headings.length > 0, 'has section paths', 'no section paths found');

  const definitionsBody = nodes.find((n) => n.text.includes('Effective Date'));
  assert(definitionsBody !== undefined, 'found "Effective Date" paragraph', 'missing Effective Date paragraph');
}

async function level1_editParagraph(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('\n══════════════════════════════════════════════════════');
  // eslint-disable-next-line no-console
  console.log('LEVEL 1 — DocxEditorService: edit a paragraph');
  // eslint-disable-next-line no-console
  console.log('══════════════════════════════════════════════════════');

  const anchors = new DocxAnchorsService();
  const editor = new DocxEditorService();
  const buffer = buildTestDocx();

  // 1. Extract anchors
  const nodesBefore = await anchors.extractParagraphNodes(buffer);
  const target = nodesBefore.find((n) => n.text.includes('Effective Date'));
  if (!target) {
    fail('edit paragraph', 'could not find target paragraph');
    return;
  }

  const beforeText = target.text;
  const newText = 'The term "Effective Date" means March 15, 2026.';

  log('BEFORE:', beforeText);
  log('NEW:   ', newText);

  // 2. Apply edit
  const editedBuffer = await editor.applyParagraphEdit(buffer, target.paragraphId, newText);
  assert(editedBuffer.length > 0, 'edited buffer is non-empty', 'buffer is empty');

  // 3. Verify by re-extracting
  const nodesAfter = await anchors.extractParagraphNodes(editedBuffer);
  const editedNode = nodesAfter.find((n) => n.text.includes('March 15, 2026'));
  const oldNodeGone = !nodesAfter.some((n) => n.text.includes('February 7, 2026'));

  assert(editedNode !== undefined, 'new text appears after edit', 'new text NOT found in edited doc');
  assert(oldNodeGone, 'old text removed after edit', 'old text still present');

  log('AFTER: ', editedNode?.text ?? '(not found)');

  // 4. Verify document integrity
  const verifyZip = new AdmZip(editedBuffer);
  const docEntry = verifyZip.getEntry('word/document.xml');
  assert(docEntry !== null, 'edited DOCX has word/document.xml', 'missing word/document.xml');

  // 5. Verify paragraph count preserved
  assert(nodesAfter.length === nodesBefore.length, 'paragraph count preserved', `before=${nodesBefore.length} after=${nodesAfter.length}`);

  log('Proof: before/after diff:');
  log(`  - "${beforeText}"`);
  log(`  + "${editedNode?.text ?? '(not found)'}"`);
}

async function level1_editParagraphRichHtml(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('\n══════════════════════════════════════════════════════');
  // eslint-disable-next-line no-console
  console.log('LEVEL 1 — DocxEditorService: edit a paragraph (rich HTML: b/i/u/font-size)');
  // eslint-disable-next-line no-console
  console.log('══════════════════════════════════════════════════════');

  const anchors = new DocxAnchorsService();
  const editor = new DocxEditorService();
  const buffer = buildTestDocx();

  const nodesBefore = await anchors.extractParagraphNodes(buffer);
  const target = nodesBefore.find((n) => n.text.includes('Effective Date'));
  if (!target) {
    fail('rich html edit', 'missing Effective Date paragraph');
    return;
  }

  const richHtml =
    '<b>Effective Date</b> means <i>March</i> <u>15</u>, <span style="font-size: 18px">2026</span>.';

  const editedBuffer = await editor.applyParagraphEdit(buffer, target.paragraphId, richHtml, { format: 'html' });
  const nodesAfter = await anchors.extractParagraphNodes(editedBuffer);
  const editedNode =
    nodesAfter.find((n) =>
      n.text.includes('Effective Date') &&
      n.text.includes('March') &&
      n.text.includes('15') &&
      n.text.includes('2026')
    ) || null;

  assert(editedNode !== null, 'rich html edit produced a paragraph', 'edited paragraph not found after edit');
  assert(
    Boolean(editedNode?.text.includes('Effective Date') && editedNode?.text.includes('March') && editedNode?.text.includes('2026')),
    'rich html plain text preserved',
    `unexpected extracted text: "${editedNode?.text ?? '(missing)'}"`,
  );

  // Check DOCX XML has the expected run properties.
  const verifyZip = new AdmZip(editedBuffer);
  const docEntry = verifyZip.getEntry('word/document.xml');
  if (!docEntry) {
    fail('rich html xml', 'missing word/document.xml');
    return;
  }

  const xml = docEntry.getData().toString('utf8');
  assert(/<w:b\b/.test(xml), 'bold run exists', 'missing <w:b> in document.xml');
  assert(/<w:i\b/.test(xml), 'italic run exists', 'missing <w:i> in document.xml');
  assert(/<w:u\b/.test(xml), 'underline run exists', 'missing <w:u> in document.xml');
  assert(/<w:sz\b[^>]*w:val="\d+"/.test(xml), 'font size run exists', 'missing <w:sz w:val="..."> in document.xml');

  log('Proof: rich runs found in XML');
}

async function level1_editFromFixture(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('\n══════════════════════════════════════════════════════');
  // eslint-disable-next-line no-console
  console.log('LEVEL 1 — DocxEditorService: edit fixture file (sample.docx)');
  // eslint-disable-next-line no-console
  console.log('══════════════════════════════════════════════════════');

  const fixturePath = path.join(__dirname, 'fixtures', 'sample.docx');
  if (!fs.existsSync(fixturePath)) {
    log('⚠️  sample.docx fixture not found — generating...');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('./fixtures/_generate-fixtures.cjs');
  }

  if (!fs.existsSync(fixturePath)) {
    fail('fixture file edit', 'sample.docx still missing after generation');
    return;
  }

  const anchors = new DocxAnchorsService();
  const editor = new DocxEditorService();
  const buffer = fs.readFileSync(fixturePath);

  const nodesBefore = await anchors.extractParagraphNodes(buffer);
  log(`Fixture has ${nodesBefore.length} paragraphs`);

  const scopeParagraph = nodesBefore.find((n) => n.text.includes('fixture testing only'));
  if (!scopeParagraph) {
    fail('fixture edit', 'could not find "fixture testing only" paragraph');
    return;
  }

  const newText = 'This document has been successfully edited by the verification test.';
  const editedBuffer = await editor.applyParagraphEdit(buffer, scopeParagraph.paragraphId, newText);

  const nodesAfter = await anchors.extractParagraphNodes(editedBuffer);
  const editedNode = nodesAfter.find((n) => n.text.includes('successfully edited'));
  assert(editedNode !== undefined, 'fixture file edit succeeded', 'edited text not found');
  log('Proof:', editedNode?.text ?? '(not found)');
}

// ─── Level 2: EditHandlerService (plan mode) ───────────────────────────────

async function level2_planMode(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('\n══════════════════════════════════════════════════════');
  // eslint-disable-next-line no-console
  console.log('LEVEL 2 — EditHandlerService: plan mode');
  // eslint-disable-next-line no-console
  console.log('══════════════════════════════════════════════════════');

  const { EditHandlerService } = await import('../services/core/handlers/editHandler.service');
  const handler = new EditHandlerService();

  const ctx = {
    userId: 'test-user-verify',
    conversationId: 'test-conv-verify',
    correlationId: 'test-corr-verify',
    clientMessageId: 'test-msg-verify',
  };

  const result = await handler.execute({
    mode: 'plan' as const,
    context: ctx,
    planRequest: {
      instruction: 'Change the effective date to March 15, 2026',
      operator: 'EDIT_PARAGRAPH' as const,
      domain: 'docx' as const,
      documentId: 'test-doc-001',
    },
  });

  log('Plan result:', JSON.stringify(result, null, 2));
  assert(result.ok === true, 'plan mode returns ok', `got ok=${result.ok}, error=${result.error}`);
  assert(result.mode === 'plan', 'plan mode label correct', `got mode=${result.mode}`);
}

async function level2_previewMode(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('\n══════════════════════════════════════════════════════');
  // eslint-disable-next-line no-console
  console.log('LEVEL 2 — EditHandlerService: preview mode with DOCX candidates');
  // eslint-disable-next-line no-console
  console.log('══════════════════════════════════════════════════════');

  const { EditHandlerService } = await import('../services/core/handlers/editHandler.service');
  const handler = new EditHandlerService();

  const anchors = new DocxAnchorsService();
  const buffer = buildTestDocx();
  const nodes = await anchors.extractParagraphNodes(buffer);

  const target = nodes.find((n) => n.text.includes('Effective Date'));
  if (!target) {
    fail('preview mode', 'could not find target paragraph');
    return;
  }

  const ctx = {
    userId: 'test-user-verify',
    conversationId: 'test-conv-verify',
    correlationId: 'test-corr-verify',
    clientMessageId: 'test-msg-verify',
  };

  const result = await handler.execute({
    mode: 'preview' as const,
    context: ctx,
    planRequest: {
      instruction: 'Change the effective date',
      operator: 'EDIT_PARAGRAPH' as const,
      domain: 'docx' as const,
      documentId: 'test-doc-001',
    },
    beforeText: target.text,
    proposedText: 'The term "Effective Date" means March 15, 2026.',
    docxCandidates: nodes.map((n) => ({
      paragraphId: n.paragraphId,
      text: n.text,
      sectionPath: n.sectionPath,
      styleFingerprint: n.styleFingerprint,
    })),
  });

  log('Preview result:', JSON.stringify(result, null, 2));
  assert(result.ok === true, 'preview mode returns ok', `got ok=${result.ok}, error=${result.error}`);
  assert(result.mode === 'preview', 'preview mode label correct', `got mode=${result.mode}`);
}

// ─── Non-DOCX format rejection ─────────────────────────────────────────────

async function testNonDocxRejection(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('\n══════════════════════════════════════════════════════');
  // eslint-disable-next-line no-console
  console.log('NON-DOCX — Verify graceful rejection');
  // eslint-disable-next-line no-console
  console.log('══════════════════════════════════════════════════════');

  const anchors = new DocxAnchorsService();

  // TXT file
  const txtBuffer = Buffer.from('This is a plain text file.');
  try {
    await anchors.extractParagraphNodes(txtBuffer);
    fail('TXT rejected', 'did not throw');
  } catch (err: any) {
    pass('TXT rejected gracefully');
    log('  Error:', err.message);
  }

  // CSV file
  const csvBuffer = Buffer.from('name,age\nAlice,30\nBob,25');
  try {
    await anchors.extractParagraphNodes(csvBuffer);
    fail('CSV rejected', 'did not throw');
  } catch (err: any) {
    pass('CSV rejected gracefully');
    log('  Error:', err.message);
  }

  // XLSX file (valid ZIP but not a DOCX)
  const xlsxPath = path.join(__dirname, 'fixtures', 'sample.xlsx');
  if (fs.existsSync(xlsxPath)) {
    const xlsxBuffer = fs.readFileSync(xlsxPath);
    try {
      await anchors.extractParagraphNodes(xlsxBuffer);
      fail('XLSX rejected', 'did not throw');
    } catch (err: any) {
      pass('XLSX rejected gracefully');
      log('  Error:', err.message);
    }
  } else {
    log('⚠️  sample.xlsx not found, skipping XLSX test');
  }

  // PPTX file (valid ZIP but not a DOCX)
  const pptxPath = path.join(__dirname, 'fixtures', 'sample.pptx');
  if (fs.existsSync(pptxPath)) {
    const pptxBuffer = fs.readFileSync(pptxPath);
    try {
      await anchors.extractParagraphNodes(pptxBuffer);
      fail('PPTX rejected', 'did not throw');
    } catch (err: any) {
      pass('PPTX rejected gracefully');
      log('  Error:', err.message);
    }
  } else {
    log('⚠️  sample.pptx not found, skipping PPTX test');
  }

  // PDF (random binary, not a valid ZIP)
  const pdfBuffer = Buffer.from('%PDF-1.4 fake pdf content');
  try {
    await anchors.extractParagraphNodes(pdfBuffer);
    fail('PDF rejected', 'did not throw');
  } catch (err: any) {
    pass('PDF rejected gracefully');
    log('  Error:', err.message);
  }
}

// ─── Runner ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('╔══════════════════════════════════════════════════════╗');
  // eslint-disable-next-line no-console
  console.log('║   KODA DOCUMENT EDITING VERIFICATION                ║');
  // eslint-disable-next-line no-console
  console.log('╚══════════════════════════════════════════════════════╝');

  // Level 1: Direct service tests
  await level1_extractAnchors();
  await level1_editParagraph();
  await level1_editParagraphRichHtml();
  await level1_editFromFixture();

  // Level 2: Handler service
  await level2_planMode();
  await level2_previewMode();

  // Non-DOCX rejection
  await testNonDocxRejection();

  // eslint-disable-next-line no-console
  console.log('\n══════════════════════════════════════════════════════');
  // eslint-disable-next-line no-console
  console.log(`RESULTS: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  // eslint-disable-next-line no-console
  console.log('══════════════════════════════════════════════════════');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error:', err);
  process.exit(2);
});
