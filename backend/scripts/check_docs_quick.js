require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const docs = await prisma.document.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { _count: { select: { embeddings: true } } }
  });

  console.log('=== ALL RECENT DOCUMENTS ===\n');
  for (const d of docs) {
    const icon = d._count.embeddings > 0 ? 'OK  ' : 'FAIL';
    console.log(`${icon} | ${d.filename} | ${d._count.embeddings} emb | ${d.status}`);
  }

  await prisma.$disconnect();
}
check();
