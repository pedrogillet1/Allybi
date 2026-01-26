import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
  const statuses = await prisma.document.groupBy({
    by: ['status'],
    _count: { status: true }
  });
  console.log('Document statuses:', JSON.stringify(statuses, null, 2));

  const chunks = await prisma.$queryRaw<any[]>`SELECT COUNT(*)::int as count FROM document_chunks`;
  console.log('Chunks:', chunks[0].count);

  await prisma.$disconnect();
}
check();
