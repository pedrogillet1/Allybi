const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkEmbeddings() {
  try {
    // Find recent documents
    const docs = await prisma.document.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        filename: true,
        status: true,
        createdAt: true,
        error: true,
        isEncrypted: true,
        encryptionIV: true,
        encryptionAuthTag: true
      }
    });

    console.log('=== Recent Documents ===\n');
    for (const doc of docs) {
      console.log(`📄 ${doc.filename}`);
      console.log(`   Status: ${doc.status}`);
      console.log(`   isEncrypted: ${doc.isEncrypted}`);
      console.log(`   hasEncryptionKeys: IV=${!!doc.encryptionIV}, AuthTag=${!!doc.encryptionAuthTag}`);
      console.log(`   Created: ${doc.createdAt}`);
      if (doc.error) console.log(`   Error: ${doc.error}`);

      // Check chunks
      const chunks = await prisma.documentChunk.findMany({
        where: { documentId: doc.id },
        select: {
          id: true,
          chunkIndex: true,
          text: true,
          embedding: true
        }
      });

      console.log(`   Chunks: ${chunks.length}`);
      const withEmbeddings = chunks.filter(c => c.embedding && c.embedding.length > 0).length;
      console.log(`   With embeddings: ${withEmbeddings}`);
      if (chunks.length > 0) {
        console.log(`   First chunk preview: "${chunks[0].text?.substring(0, 100) || 'N/A'}..."`);
      }
      console.log('');
    }

  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkEmbeddings();
