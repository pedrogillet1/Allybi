/**
 * Check Test User Documents
 * Verifies if localhost@koda.com has documents for testing
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkTestUserDocs() {
  console.log('🔍 Checking test user documents...\n');

  try {
    // Find the test user
    const user = await prisma.user.findUnique({
      where: { email: 'localhost@koda.com' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      }
    });

    if (!user) {
      console.log('❌ User localhost@koda.com not found!');
      console.log('   Run: npx ts-node src/scripts/createLocalhostUser.ts');
      process.exit(1);
    }

    console.log('✅ User found:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Name: ${user.firstName || ''} ${user.lastName || ''}`);

    // Count documents
    const docCount = await prisma.document.count({
      where: { userId: user.id }
    });

    console.log(`\n📄 Documents: ${docCount}`);

    if (docCount === 0) {
      console.log('\n⚠️  No documents found for this user!');
      console.log('   The RAG test will not have any documents to reference.');
      console.log('   Please upload some documents first via the UI or API.');
      process.exit(1);
    }

    // List documents
    const documents = await prisma.document.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        fileSize: true,
        status: true,
        createdAt: true,
        embeddingsGenerated: true,
        chunksCount: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    console.log('\n📚 Recent documents:');
    documents.forEach((doc, i) => {
      const size = doc.fileSize ? `${(Number(doc.fileSize) / 1024).toFixed(1)} KB` : 'unknown size';
      const embeddings = doc.embeddingsGenerated ? '✅' : '❌';
      console.log(`   [${i + 1}] ${doc.filename} (${size}) - ${doc.status} [embeddings: ${embeddings}, chunks: ${doc.chunksCount || 0}]`);
      console.log(`       ID: ${doc.id}`);
    });

    // Check for embeddings
    const embeddingsCount = await prisma.documentChunk.count({
      where: {
        document: { userId: user.id }
      }
    });

    console.log(`\n🔢 Document chunks with embeddings: ${embeddingsCount}`);

    if (embeddingsCount === 0) {
      console.log('\n⚠️  No embeddings found!');
      console.log('   Documents exist but may not be processed yet.');
      console.log('   RAG queries may not return relevant results.');
    } else {
      console.log('\n✅ Ready for RAG testing!');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkTestUserDocs();
