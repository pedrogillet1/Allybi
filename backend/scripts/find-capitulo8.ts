import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({ where: { email: 'test@koda.com' } });
  if (!user) return;

  // Search by filename
  console.log('=== SEARCH BY FILENAME ===');
  const byName = await prisma.document.findMany({
    where: {
      userId: user.id,
      OR: [
        { filename: { contains: 'cap', mode: 'insensitive' } },
        { filename: { contains: 'scrum', mode: 'insensitive' } },
        { filename: { contains: 'framework', mode: 'insensitive' } },
      ]
    },
    select: {
      id: true, filename: true, displayTitle: true, status: true, fileSize: true, mimeType: true,
      _count: { select: { chunks: true, embeddings: true } }
    }
  });

  if (byName.length === 0) {
    console.log('No docs found with cap/scrum/framework in filename');
  } else {
    byName.forEach(d => {
      console.log('Found: ' + (d.filename || d.displayTitle || d.id));
      console.log('  Status: ' + d.status + ', Type: ' + d.mimeType);
      console.log('  Size: ' + (d.fileSize / 1024).toFixed(1) + ' KB');
      console.log('  Chunks: ' + d._count.chunks + ', Embeddings: ' + d._count.embeddings);
    });
  }

  // Show all doc filenames
  console.log('\n=== ALL 23 DOCUMENTS ===');
  const all = await prisma.document.findMany({
    where: { userId: user.id },
    select: { filename: true, displayTitle: true, mimeType: true, status: true, _count: { select: { chunks: true } } },
    orderBy: { filename: 'asc' }
  });
  all.forEach(d => {
    const name = d.filename || d.displayTitle || '(null)';
    const type = (d.mimeType || '').split('/').pop();
    console.log('[' + d.status + '] ' + name + ' (' + type + ', ' + d._count.chunks + ' chunks)');
  });
}

main().then(() => prisma.$disconnect());
