const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  // Get non-Excel completed docs
  const docs = await prisma.document.findMany({
    where: {
      userId: '271a9282-463b-42bd-ac2c-4034ce9d9524',
      status: 'completed',
      NOT: { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
    },
    select: { id: true, filename: true, mimeType: true }
  });

  for (const d of docs) {
    console.log('\n=== ' + d.filename + ' ===');
    console.log('MIME: ' + d.mimeType);

    // Get sample chunks
    const chunks = await prisma.documentChunk.findMany({
      where: { documentId: d.id },
      select: { text: true, chunkIndex: true },
      take: 2
    });

    chunks.forEach(c => {
      const preview = (c.text || '').substring(0, 300).replace(/\n/g, ' ');
      console.log('\nChunk ' + c.chunkIndex + ':\n"' + preview + '..."');
    });
  }

  await prisma.$disconnect();
}
check();
