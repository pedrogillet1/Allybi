/**
 * Recalculate document statistics (chunksCount, pageCount)
 *
 * Run with: npx tsx scripts/recalculate-document-stats.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Recalculating document statistics...\n');

  // Get all documents
  const documents = await prisma.document.findMany({
    select: {
      id: true,
      filename: true,
      chunksCount: true,
      _count: { select: { chunks: true } },
    },
  });

  console.log(`Found ${documents.length} documents\n`);

  let chunksUpdated = 0;

  // Update chunksCount for each document
  for (const doc of documents) {
    const actualChunks = doc._count.chunks;

    if (doc.chunksCount !== actualChunks) {
      await prisma.document.update({
        where: { id: doc.id },
        data: { chunksCount: actualChunks },
      });

      console.log(`Updated ${doc.filename || doc.id}: chunksCount ${doc.chunksCount} -> ${actualChunks}`);
      chunksUpdated++;
    }
  }

  console.log(`\nUpdated chunksCount for ${chunksUpdated} documents`);

  // Now update pageCount from ingestion events where available
  console.log('\nUpdating pageCount from ingestion events...');

  const ingestionEvents = await prisma.ingestionEvent.findMany({
    where: { pages: { not: null } },
    select: { documentId: true, pages: true },
    distinct: ['documentId'],
  });

  let pagesUpdated = 0;

  for (const event of ingestionEvents) {
    if (!event.documentId || event.pages === null) continue;

    // Check if metadata exists
    const metadata = await prisma.documentMetadata.findUnique({
      where: { documentId: event.documentId },
    });

    if (metadata) {
      if (metadata.pageCount !== event.pages) {
        await prisma.documentMetadata.update({
          where: { documentId: event.documentId },
          data: { pageCount: event.pages },
        });
        console.log(`Updated pageCount for ${event.documentId}: ${metadata.pageCount} -> ${event.pages}`);
        pagesUpdated++;
      }
    } else {
      // Create metadata record with pageCount
      await prisma.documentMetadata.create({
        data: {
          documentId: event.documentId,
          pageCount: event.pages,
        },
      });
      console.log(`Created metadata for ${event.documentId} with pageCount=${event.pages}`);
      pagesUpdated++;
    }
  }

  console.log(`\nUpdated pageCount for ${pagesUpdated} documents`);

  // Summary
  console.log('\n--- Summary ---');
  console.log(`Chunks updated: ${chunksUpdated}`);
  console.log(`Pages updated: ${pagesUpdated}`);
  console.log('Done!');
}

main()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
