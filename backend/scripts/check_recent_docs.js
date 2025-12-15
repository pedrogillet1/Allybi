require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  // Get recent documents grouped by status
  const docs = await prisma.document.findMany({
    where: {
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
    },
    select: {
      filename: true,
      status: true,
      createdAt: true,
      mimeType: true,
      isEncrypted: true
    },
    orderBy: { createdAt: 'desc' },
    take: 20
  });

  console.log('=== Recent Documents ===');
  docs.forEach(d => {
    const status = d.status.padEnd(12);
    const enc = d.isEncrypted ? 'ENC' : '   ';
    const date = d.createdAt.toISOString().substring(0, 19);
    const mime = (d.mimeType || 'N/A').substring(0, 30).padEnd(30);
    const name = d.filename.substring(0, 40);
    console.log(`${status} | ${enc} | ${date} | ${mime} | ${name}`);
  });

  // Count by status
  const counts = await prisma.document.groupBy({
    by: ['status'],
    _count: { status: true }
  });

  console.log('\n=== Status Counts ===');
  counts.forEach(c => console.log(`${c.status}: ${c._count.status}`));

  await prisma.$disconnect();
}
check();
