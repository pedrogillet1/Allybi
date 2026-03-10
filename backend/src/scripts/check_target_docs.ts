import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const targets = [
    ['27fa8bbd-dbe2-4ab0-8fa5-c445cb356c66', 'BCB Reserve Requirements'],
    ['75edf961-122b-45ae-a646-7bebbbbf6655', 'Trade Act of 1974'],
    ['8d46ada3-e57e-4032-b3f4-d204860a0180', 'INPI Fee Schedule'],
    ['17079e4e-5c47-4b0a-912c-70816ba7028a', 'CARES Act'],
  ];

  for (const [docId, label] of targets) {
    const doc = await prisma.document.findUnique({
      where: { id: docId },
      select: {
        id: true,
        filename: true,
        chunksCount: true,
        embeddingsGenerated: true,
        indexingState: true,
        indexingError: true,
        status: true,
        fileSize: true,
      },
    });

    const chunkCount = await prisma.documentChunk.count({
      where: { documentId: docId },
    });

    const embeddingCount = await prisma.documentEmbedding.count({
      where: { documentId: docId },
    });

    const chunksWithText = await prisma.documentChunk.count({
      where: { documentId: docId, text: { not: null } },
    });

    const chunksWithEncText = await prisma.documentChunk.count({
      where: { documentId: docId, textEncrypted: { not: null } },
    });

    const sampleChunk = await prisma.documentChunk.findFirst({
      where: { documentId: docId },
      orderBy: { chunkIndex: 'asc' },
      select: {
        chunkIndex: true,
        text: true,
        textEncrypted: true,
        page: true,
        sectionName: true,
      },
    });

    console.log(`=== ${label} (${doc?.filename || docId}) ===`);
    console.log(`  status: ${doc?.status}`);
    console.log(`  indexingState: ${doc?.indexingState}`);
    console.log(`  indexingError: ${doc?.indexingError || 'none'}`);
    console.log(`  chunksCount (cached): ${doc?.chunksCount}`);
    console.log(`  actual chunks in DB: ${chunkCount}`);
    console.log(`  chunks with plaintext: ${chunksWithText}`);
    console.log(`  chunks with encrypted text: ${chunksWithEncText}`);
    console.log(`  embeddingsGenerated flag: ${doc?.embeddingsGenerated}`);
    console.log(`  actual embeddings in DB: ${embeddingCount}`);
    console.log(`  fileSize: ${doc?.fileSize}`);

    if (sampleChunk) {
      const hasText = !!sampleChunk.text;
      const hasEnc = !!sampleChunk.textEncrypted;
      console.log(`  sample chunk[0]: idx=${sampleChunk.chunkIndex} page=${sampleChunk.page} hasText=${hasText} hasEnc=${hasEnc}`);
      if (sampleChunk.text) {
        console.log(`  textPreview: ${sampleChunk.text.substring(0, 200)}`);
      }
    } else {
      console.log('  NO CHUNKS FOUND');
    }
    console.log();
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
