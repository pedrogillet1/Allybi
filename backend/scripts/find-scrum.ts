import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({ where: { email: 'test@koda.com' } });
  if (!user) return;

  // Search chunks for scrum-related content
  console.log('=== SEARCHING CHUNKS FOR SCRUM ===');

  const scrumChunks = await prisma.documentChunk.findMany({
    where: {
      document: { userId: user.id },
      OR: [
        { text: { contains: 'scrum', mode: 'insensitive' } },
        { text: { contains: 'capitulo 8', mode: 'insensitive' } },
        { text: { contains: 'capítulo 8', mode: 'insensitive' } }
      ]
    },
    select: {
      documentId: true,
      chunkIndex: true,
      text: true,
      document: {
        select: {
          filename: true,
          displayTitle: true,
          fileSize: true,
          _count: { select: { chunks: true } }
        }
      }
    },
    take: 10
  });

  if (scrumChunks.length === 0) {
    console.log('No chunks found containing "scrum" or "capitulo 8"');
    console.log('\nThis might mean:');
    console.log('1. The PDF is scanned and OCR failed to extract text');
    console.log('2. The PDF was not uploaded successfully');
    console.log('3. The filename is different than expected');
  } else {
    const docIds = [...new Set(scrumChunks.map(c => c.documentId))];
    console.log('Found ' + scrumChunks.length + ' chunks in ' + docIds.length + ' document(s)');
    console.log('');

    docIds.forEach(docId => {
      const chunks = scrumChunks.filter(c => c.documentId === docId);
      const doc = chunks[0].document;
      console.log('Document: ' + (doc.filename || doc.displayTitle || docId.slice(0, 8)));
      console.log('  Total chunks: ' + doc._count.chunks);
      console.log('  Size: ' + (doc.fileSize / 1024).toFixed(1) + ' KB');
      console.log('  Sample content:');
      const preview = (chunks[0].text || '').slice(0, 200).replace(/\n/g, ' ');
      console.log('    "' + preview + '..."');
      console.log('');
    });
  }
}

main().then(() => prisma.$disconnect());
