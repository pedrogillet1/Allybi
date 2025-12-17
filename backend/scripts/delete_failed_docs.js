require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function deleteFailed() {
  // Count failed docs
  const count = await prisma.document.count({
    where: { status: { in: ['failed', 'processing_failed'] } }
  });

  console.log(`Found ${count} failed documents`);

  if (count === 0) {
    console.log('No failed documents to delete');
    await prisma.$disconnect();
    return;
  }

  // Delete related records first (foreign key constraints)
  const failedDocs = await prisma.document.findMany({
    where: { status: { in: ['failed', 'processing_failed'] } },
    select: { id: true }
  });
  const failedIds = failedDocs.map(d => d.id);

  console.log('Deleting related records...');

  // Delete in order of dependencies
  await prisma.documentEmbedding.deleteMany({
    where: { documentId: { in: failedIds } }
  });
  console.log('  - Deleted embeddings');

  await prisma.documentChunk.deleteMany({
    where: { documentId: { in: failedIds } }
  });
  console.log('  - Deleted chunks');

  await prisma.documentMetadata.deleteMany({
    where: { documentId: { in: failedIds } }
  });
  console.log('  - Deleted metadata');

  // Delete the documents
  const deleted = await prisma.document.deleteMany({
    where: { status: { in: ['failed', 'processing_failed'] } }
  });

  console.log(`✅ Deleted ${deleted.count} failed documents`);

  // Show remaining stats
  const remaining = await prisma.document.groupBy({
    by: ['status'],
    _count: true
  });
  console.log('\nRemaining documents:');
  remaining.forEach(s => console.log(`  ${s.status}: ${s._count}`));

  await prisma.$disconnect();
}

deleteFailed();
