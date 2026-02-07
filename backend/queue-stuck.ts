import prisma from './src/config/database';
import { addDocumentJob } from './src/queues/document.queue';

async function main() {
  const doc = await prisma.document.findUnique({
    where: { id: '7477cff1-b8d2-4620-a00f-85473b8ab823' },
    select: { id: true, userId: true, filename: true, mimeType: true, encryptedFilename: true, status: true }
  });

  if (!doc) {
    console.log('Document not found');
    return;
  }

  console.log('Document:', doc);

  if (doc.status === 'uploaded' && doc.encryptedFilename) {
    console.log('Queueing document for processing...');
    await addDocumentJob({
      documentId: doc.id,
      userId: doc.userId,
      filename: doc.filename || 'unknown',
      mimeType: doc.mimeType || 'application/octet-stream',
      encryptedFilename: doc.encryptedFilename
    });
    console.log('Document queued!');
  } else {
    console.log('Document not in uploadable state or missing storage key');
  }

  await prisma.$disconnect();
  process.exit(0);
}

main().catch(console.error);
