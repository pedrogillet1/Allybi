import prisma from './src/config/database';
import { addDocumentJob } from './src/queues/document.queue';

async function requeueStuck() {
  // Find test user
  const user = await prisma.user.findFirst({ where: { email: 'test@koda.com' } });
  if (!user) { console.log('User not found'); return; }

  // Find stuck documents (uploading or failed)
  const stuck = await prisma.document.findMany({
    where: {
      userId: user.id,
      status: { in: ['uploading', 'failed'] }
    },
    select: { id: true, userId: true, filename: true, mimeType: true, encryptedFilename: true, status: true }
  });

  console.log(`Found ${stuck.length} stuck documents for test@koda.com\n`);

  // First, update status to "uploaded" so they can be processed
  const ids = stuck.map(d => d.id);
  await prisma.document.updateMany({
    where: { id: { in: ids } },
    data: { status: 'uploaded', error: null }
  });
  console.log(`Updated ${ids.length} documents to "uploaded" status\n`);

  let queued = 0;
  let skipped = 0;

  for (const doc of stuck) {
    if (!doc.encryptedFilename) {
      console.log(`Skipping ${doc.filename} - no storage key (upload never completed)`);
      skipped++;
      continue;
    }
    console.log(`Queueing: ${doc.filename}`);
    await addDocumentJob({
      documentId: doc.id,
      userId: doc.userId,
      filename: doc.filename || 'unknown',
      mimeType: doc.mimeType || 'application/octet-stream',
      encryptedFilename: doc.encryptedFilename
    });
    queued++;
  }

  console.log(`\nDone: ${queued} queued, ${skipped} skipped (no S3 file)`);
  await prisma.$disconnect();
  process.exit(0);
}

requeueStuck();
