import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const AdmZip = require('adm-zip');
const xml2js = require('xml2js');

const prisma = new PrismaClient();

// Copy of extractTextFromSlideXml with debug logging
function extractTextFromSlideXmlDebug(slideXml: any, slideNumber: number): string {
  const textParts: string[] = [];
  let recursionCount = 0;

  function findTextBodies(node: any, depth: number = 0): void {
    recursionCount++;
    const indent = '  '.repeat(depth);

    if (!node || typeof node !== 'object') {
      return;
    }

    if (Array.isArray(node)) {
      console.log(`${indent}[Array with ${node.length} items]`);
      for (const item of node) {
        findTextBodies(item, depth + 1);
      }
      return;
    }

    const keys = Object.keys(node);
    console.log(`${indent}[Object with keys: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? '...' : ''}]`);

    // Found a text body container - extract text from it
    if (node['p:txBody']) {
      console.log(`${indent}>>> FOUND p:txBody!`);
      const bodyText = extractTextFromBody(node['p:txBody']);
      console.log(`${indent}>>> Extracted: "${bodyText.substring(0, 100)}"`);
      if (bodyText.trim()) {
        textParts.push(bodyText.trim());
      }
    }

    // Also check for standalone paragraphs at shape level
    if (node['a:p'] && !node['p:txBody']) {
      console.log(`${indent}>>> FOUND standalone a:p`);
      const paragraphText = extractTextFromParagraphs(node['a:p']);
      if (paragraphText.trim()) {
        textParts.push(paragraphText.trim());
      }
    }

    // Recurse into known container elements only
    const containerKeys = [
      'p:sld', 'p:cSld', 'p:spTree', 'p:sp', 'p:grpSp', 'p:graphicFrame',
      'a:graphic', 'a:graphicData', 'a:tbl', 'a:tr', 'a:tc'
    ];
    for (const key of containerKeys) {
      if (node[key]) {
        console.log(`${indent}Recursing into ${key}`);
        findTextBodies(node[key], depth + 1);
      }
    }
  }

  function extractTextFromBody(txBody: any): string {
    if (!txBody) return '';

    // Handle array wrapper from xml2js
    const body = Array.isArray(txBody) ? txBody[0] : txBody;
    console.log('    extractTextFromBody - body keys:', Object.keys(body || {}));

    const paragraphs = body?.['a:p'];
    console.log('    extractTextFromBody - paragraphs:', paragraphs ? 'found' : 'not found');
    return extractTextFromParagraphs(paragraphs);
  }

  function extractTextFromParagraphs(paragraphs: any): string {
    if (!paragraphs) return '';

    const paragraphArray = Array.isArray(paragraphs) ? paragraphs : [paragraphs];
    console.log('      extractTextFromParagraphs - count:', paragraphArray.length);
    const lines: string[] = [];

    for (const p of paragraphArray) {
      const lineText = extractTextFromRuns(p['a:r']);
      if (lineText.trim()) {
        lines.push(lineText.trim());
      }
    }

    return lines.join('\n');
  }

  function extractTextFromRuns(runs: any): string {
    if (!runs) return '';

    const runArray = Array.isArray(runs) ? runs : [runs];
    console.log('        extractTextFromRuns - count:', runArray.length);
    const textFragments: string[] = [];

    for (const run of runArray) {
      if (run && run['a:t']) {
        const textContent = run['a:t'];
        console.log('          a:t value:', JSON.stringify(textContent).substring(0, 100));

        if (Array.isArray(textContent)) {
          for (const t of textContent) {
            if (typeof t === 'string') {
              textFragments.push(t);
            } else if (t && typeof t === 'object' && t['_']) {
              textFragments.push(t['_']);
            }
          }
        } else if (typeof textContent === 'string') {
          textFragments.push(textContent);
        } else if (textContent && typeof textContent === 'object' && textContent['_']) {
          textFragments.push(textContent['_']);
        }
      }
    }

    console.log('        textFragments:', textFragments);
    return textFragments.join('');
  }

  // Start extraction from root
  findTextBodies(slideXml, 0);

  console.log(`\nTotal recursions: ${recursionCount}`);
  console.log(`Total text parts found: ${textParts.length}`);

  // Join all text parts with line breaks
  const text = textParts.join('\n\n');
  return text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

async function debugExtraction() {
  const doc = await prisma.document.findFirst({
    where: { filename: 'Real-Estate-Empreendimento-Parque-Global.pptx' }
  });

  if (!doc) {
    console.log('Document not found');
    return;
  }

  const { downloadFile } = await import('../services/s3Storage.service');
  const result = await downloadFile(doc.encryptedFilename);
  const fileBuffer = Array.isArray(result) ? result[0] : result;

  console.log('='.repeat(70));
  console.log('  DEBUGGING TEXT EXTRACTION');
  console.log('='.repeat(70));

  const zip = new AdmZip(fileBuffer);
  const entries = zip.getEntries();

  // Get first slide
  const slide1Entry = entries.find((e: any) => e.entryName === 'ppt/slides/slide1.xml');
  if (!slide1Entry) {
    console.log('No slide1.xml found');
    return;
  }

  const slideXml = slide1Entry.getData().toString('utf8');
  const parser = new xml2js.Parser();
  const parsed = await parser.parseStringPromise(slideXml);

  console.log('\n=== Starting extraction ===\n');
  const extractedText = extractTextFromSlideXmlDebug(parsed, 1);

  console.log('\n=== RESULT ===');
  console.log('Extracted text:', extractedText || '(empty)');
  console.log('Length:', extractedText.length);

  await prisma.$disconnect();
}

debugExtraction().catch(console.error);
