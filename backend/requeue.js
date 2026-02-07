const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Find stuck uploaded documents
  const stuck = await prisma.document.findMany({
    where: { status: 'uploaded' },
    select: { id: true, userId: true, filename: true, mimeType: true, encryptedFilename: true }
  });

  console.log('Found ' + stuck.length + ' stuck documents');

  // Import queue and add jobs
  const { addDocumentJob } = require('./src/queues/document.queue');

  for (const doc of stuck) {
    console.log('Requeueing: ' + (doc.filename || doc.id.slice(0,8)));
    await addDocumentJob({
      documentId: doc.id,
      userId: doc.userId,
      filename: doc.filename || 'unknown',
      mimeType: doc.mimeType || 'application/octet-stream',
      encryptedFilename: doc.encryptedFilename || undefined,
    });
  }

  console.log('Done - ' + stuck.length + ' jobs added');
}

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();
main().catch(console.error).finally(() => prisma.$disconnect());
