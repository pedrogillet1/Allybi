require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function reprocess() {
  // Get a failed document
  const failedDoc = await prisma.document.findFirst({
    where: {
      status: 'failed',
      isEncrypted: true,
      encryptionSalt: null // Server-side encrypted, not zero-knowledge
    },
    select: {
      id: true,
      filename: true,
      encryptedFilename: true,
      mimeType: true,
      userId: true,
      error: true
    },
    orderBy: { createdAt: 'desc' }
  });

  if (!failedDoc) {
    console.log('No failed server-side encrypted documents found');
    await prisma.$disconnect();
    return;
  }

  console.log('=== Reprocessing Failed Document ===');
  console.log('Document:', failedDoc.filename);
  console.log('ID:', failedDoc.id);
  console.log('Previous Error:', failedDoc.error);
  console.log('');

  // Reset status to 'processing'
  await prisma.document.update({
    where: { id: failedDoc.id },
    data: {
      status: 'processing',
      error: null
    }
  });
  console.log('✅ Reset status to "processing"');

  // Import and call processDocumentAsync
  try {
    // Use dynamic import for ES modules
    const documentService = require('../dist/services/document.service');

    console.log('Starting reprocessing...');

    await documentService.processDocumentAsync(
      failedDoc.id,
      failedDoc.encryptedFilename,
      failedDoc.filename,
      failedDoc.mimeType,
      failedDoc.userId,
      null // thumbnailUrl
    );

    // Check final status
    const result = await prisma.document.findUnique({
      where: { id: failedDoc.id },
      select: {
        status: true,
        error: true,
        _count: { select: { chunks: true } }
      }
    });

    console.log('');
    console.log('=== RESULT ===');
    console.log('Status:', result.status);
    console.log('Error:', result.error || '(none)');
    console.log('Chunks:', result._count.chunks);

  } catch (err) {
    console.error('Reprocessing error:', err.message);

    // Check final status
    const result = await prisma.document.findUnique({
      where: { id: failedDoc.id },
      select: { status: true, error: true }
    });
    console.log('Final status:', result.status);
    console.log('Final error:', result.error);
  }

  await prisma.$disconnect();
}

reprocess();
