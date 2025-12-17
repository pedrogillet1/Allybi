require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  // Get document stats
  const stats = await prisma.document.groupBy({
    by: ['status'],
    _count: true
  });
  console.log('=== Document Status Distribution ===');
  stats.forEach(s => console.log('  ' + s.status + ': ' + s._count));

  // Get chunk count
  const chunkCount = await prisma.documentChunk.count();
  console.log('\nTotal chunks:', chunkCount);

  // Get recent docs
  const recent = await prisma.document.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      filename: true,
      status: true,
      isEncrypted: true,
      encryptionSalt: true,
      error: true
    }
  });
  console.log('\n=== 5 Most Recent Documents ===');
  recent.forEach(d => {
    console.log('File:', d.filename);
    console.log('  Status:', d.status);
    console.log('  isEncrypted:', d.isEncrypted);
    console.log('  encryptionSalt:', d.encryptionSalt ? 'SET' : 'null');
    console.log('  Error:', (d.error || '-').substring(0, 80));
    console.log('');
  });

  await prisma.$disconnect();
}
check();
