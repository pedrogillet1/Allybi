import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TEST_USER_ID = '9e9a66c3-3894-434d-93b0-8c5562a24d91';

async function investigate() {
  console.log('='.repeat(70));
  console.log('  INVESTIGATING DOCUMENT PROCESSING ISSUES');
  console.log('='.repeat(70));

  // 1. Check FAILED documents
  const failed = await prisma.document.findMany({
    where: { userId: TEST_USER_ID, status: 'failed' },
    select: { id: true, filename: true, error: true, mimeType: true, createdAt: true }
  });

  console.log('\n❌ FAILED DOCUMENTS (' + failed.length + '):\n');
  for (const doc of failed) {
    console.log('  📄', doc.filename);
    console.log('     Type:', doc.mimeType);
    console.log('     Error:', doc.error || 'No error message');
    console.log('     Created:', doc.createdAt);
    console.log('');
  }

  // 2. Check PROCESSING documents (stuck)
  const processing = await prisma.document.findMany({
    where: { userId: TEST_USER_ID, status: 'processing' },
    select: { id: true, filename: true, mimeType: true, createdAt: true, updatedAt: true }
  });

  console.log('\n⏳ STUCK IN PROCESSING (' + processing.length + '):\n');
  for (const doc of processing) {
    const age = Math.round((Date.now() - new Date(doc.createdAt).getTime()) / 1000 / 60);
    console.log('  📄', doc.filename);
    console.log('     Type:', doc.mimeType);
    console.log('     Age:', age, 'minutes');
    console.log('');
  }

  // 3. Check COMPLETED but NO chunks
  const completed = await prisma.document.findMany({
    where: { userId: TEST_USER_ID, status: 'completed', chunksCount: 0 },
    select: { id: true, filename: true, mimeType: true, error: true }
  });

  console.log('\n⚠️ COMPLETED BUT NO CHUNKS (' + completed.length + '):\n');
  for (const doc of completed) {
    console.log('  📄', doc.filename);
    console.log('     Type:', doc.mimeType);
    if (doc.error) console.log('     Error:', doc.error);
    console.log('');
  }

  // Summary by mime type
  const allProblematic = [...failed, ...processing, ...completed];
  const byType: Record<string, number> = {};
  for (const doc of allProblematic) {
    byType[doc.mimeType] = (byType[doc.mimeType] || 0) + 1;
  }

  console.log('\n📊 PROBLEMS BY FILE TYPE:');
  for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log('  ', type, ':', count);
  }

  await prisma.$disconnect();
}

investigate().catch(console.error);
