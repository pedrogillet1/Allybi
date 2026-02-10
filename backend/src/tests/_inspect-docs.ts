import { DocxAnchorsService } from '../services/editing/docx/docxAnchors.service';
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();

const DOCX_ID = 'fe23d143-ac11-47e3-a711-8bb02fe87620'; // template.docx
const XLSX_ID = '0095387c-435c-41e4-b623-462f67cabc1c'; // Lone Mountain Ranch P&L 2024.xlsx

async function inspectDocx() {
  console.log('\n═══ DOCX: template.docx ═══');
  const doc = await prisma.document.findUnique({ where: { id: DOCX_ID }, select: { rawText: true, previewText: true, extractedTextEncrypted: true } });
  if (!doc) { console.log('Not found'); return; }

  // Show extracted text
  const text = doc.rawText || doc.previewText || '(no text extracted)';
  console.log('Extracted text (first 2000 chars):');
  console.log(text.slice(0, 2000));
  console.log('...');

  // Try to get file from storage and extract anchors
  // Check if we can get the buffer from storage
  const meta = await prisma.documentMetadata.findUnique({ where: { documentId: DOCX_ID }, select: { storageKey: true, storageBucket: true } });
  console.log('\nStorage:', meta?.storageKey || '(no storage key)');
}

async function inspectXlsx() {
  console.log('\n═══ XLSX: Lone Mountain Ranch P&L 2024.xlsx ═══');
  const doc = await prisma.document.findUnique({ where: { id: XLSX_ID }, select: { rawText: true, previewText: true } });
  if (!doc) { console.log('Not found'); return; }

  const text = doc.rawText || doc.previewText || '(no text extracted)';
  console.log('Extracted text (first 2000 chars):');
  console.log(text.slice(0, 2000));
  console.log('...');

  const meta = await prisma.documentMetadata.findUnique({ where: { documentId: XLSX_ID }, select: { storageKey: true, storageBucket: true } });
  console.log('\nStorage:', meta?.storageKey || '(no storage key)');
}

async function main() {
  await inspectDocx();
  await inspectXlsx();
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); prisma.$disconnect(); });
