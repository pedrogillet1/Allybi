import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { processDocumentAsync } from '../services/document.service';

const prisma = new PrismaClient();
const TEST_USER_ID = '9e9a66c3-3894-434d-93b0-8c5562a24d91';

async function processPptxDirect() {
  console.log('='.repeat(70));
  console.log('  PROCESSING PPTX DOCUMENT DIRECTLY');
  console.log('='.repeat(70));

  // Find the PPTX document
  const doc = await prisma.document.findFirst({
    where: {
      userId: TEST_USER_ID,
      filename: { endsWith: '.pptx' },
    },
    include: { metadata: true }
  });

  if (!doc) {
    console.log('❌ No PPTX document found');
    await prisma.$disconnect();
    return;
  }

  console.log('\n📄 Processing:', doc.filename);
  console.log('   ID:', doc.id);
  console.log('   MIME Type:', doc.mimeType);
  console.log('   Status:', doc.status);

  // Reset status to pending
  await prisma.document.update({
    where: { id: doc.id },
    data: {
      status: 'processing',
      error: null,
    }
  });

  try {
    console.log('\n🚀 Starting processing...');

    await processDocumentAsync(
      doc.id,
      doc.encryptedFilename,
      doc.filename,
      doc.mimeType,
      doc.userId,
      doc.metadata?.thumbnailUrl || null
    );

    console.log('\n✅ Processing completed!');

    // Check final status
    const updatedDoc = await prisma.document.findUnique({
      where: { id: doc.id },
      select: { status: true, chunksCount: true, error: true }
    });

    console.log('\n📊 Final Status:');
    console.log('   Status:', updatedDoc?.status);
    console.log('   Chunks:', updatedDoc?.chunksCount);
    console.log('   Error:', updatedDoc?.error || 'none');

  } catch (error: any) {
    console.error('\n❌ Processing failed:', error.message);
    console.error('   Stack:', error.stack?.split('\n').slice(0, 5).join('\n'));
  }

  await prisma.$disconnect();
}

processPptxDirect().catch(console.error);
