require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function deleteAll() {
  // Get all docs
  const docs = await prisma.document.findMany({ select: { id: true } });
  const ids = docs.map(d => d.id);

  console.log(`Found ${ids.length} documents to delete`);

  if (ids.length === 0) {
    await prisma.$disconnect();
    return;
  }

  // Delete related records first
  await prisma.documentEmbedding.deleteMany({ where: { documentId: { in: ids } } });
  await prisma.documentChunk.deleteMany({ where: { documentId: { in: ids } } });
  await prisma.documentMetadata.deleteMany({ where: { documentId: { in: ids } } });

  // Delete documents
  const deleted = await prisma.document.deleteMany({});
  console.log(`✅ Deleted ${deleted.count} documents`);

  await prisma.$disconnect();
}

deleteAll();
