const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkStuck() {
  try {
    // Check documents by status
    const statusCounts = await prisma.document.groupBy({
      by: ['status'],
      _count: { status: true }
    });

    console.log('=== Document Status Counts ===');
    statusCounts.forEach(s => {
      console.log(`${s.status}: ${s._count.status}`);
    });

    // Check recent documents
    const recent = await prisma.document.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        filename: true,
        status: true,
        isEncrypted: true,
        error: true,
        createdAt: true,
        updatedAt: true
      }
    });

    console.log('\n=== Most Recent Documents ===');
    recent.forEach(d => {
      console.log(`\n${d.filename}`);
      console.log(`  Status: ${d.status}`);
      console.log(`  isEncrypted: ${d.isEncrypted}`);
      console.log(`  Created: ${d.createdAt}`);
      console.log(`  Updated: ${d.updatedAt}`);
      if (d.error) console.log(`  Error: ${d.error}`);
    });

  } catch (e) {
    console.error('Error:', e);
  } finally {
    await prisma.$disconnect();
  }
}

checkStuck();
