import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { PrismaClient } from '@prisma/client';
import { addDocumentJob } from './src/queues/document.queue';

const prisma = new PrismaClient();

async function requeue() {
  const user = await prisma.user.findFirst({ where: { email: 'test@koda.com' } });
  if (!user) { console.log('User not found'); return; }

  // Find docs with 0 chunks
  const docs = await prisma.document.findMany({
    where: { userId: user.id, chunksCount: 0 },
    select: { id: true, userId: true, filename: true, mimeType: true, encryptedFilename: true },
  });

  console.log('Found', docs.length, 'documents with 0 chunks\n');

  // Reset status to uploaded
  await prisma.document.updateMany({
    where: { id: { in: docs.map(d => d.id) } },
    data: { status: 'uploaded', error: null }
  });

  let queued = 0;
  for (const doc of docs) {
    if (!doc.encryptedFilename) {
      console.log('Skipping (no storage key):', doc.filename);
      continue;
    }

    const parts = doc.encryptedFilename.split('/');
    const fname = decodeURIComponent(parts[parts.length - 1] || 'unknown');
    console.log('Queueing:', fname);

    await addDocumentJob({
      documentId: doc.id,
      userId: doc.userId,
      filename: doc.filename || fname,
      mimeType: doc.mimeType || 'application/octet-stream',
      encryptedFilename: doc.encryptedFilename
    });
    queued++;
  }

  console.log('\nQueued', queued, 'documents for reprocessing');
}

requeue()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
