import { PrismaClient } from '@prisma/client';
import { publishExtractJobsBulk, type DocumentJobInfo } from '../src/services/jobs/pubsubPublisher.service';

const p = new PrismaClient();

async function main() {
  const docs = await p.document.findMany({
    where: { status: 'uploaded' },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: { id: true, userId: true, encryptedFilename: true, mimeType: true, filename: true },
  });

  console.log(`Found ${docs.length} stuck docs`);

  const items: DocumentJobInfo[] = docs.map((d) => ({
    documentId: d.id,
    userId: d.userId,
    storageKey: d.encryptedFilename || '',
    mimeType: d.mimeType || 'application/octet-stream',
    filename: d.filename || undefined,
  }));

  const results = await publishExtractJobsBulk(items);
  for (const [docId, msgId] of results) {
    const doc = docs.find((d) => d.id === docId);
    console.log(`  ${doc?.filename} -> ${msgId}`);
  }

  await p.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
