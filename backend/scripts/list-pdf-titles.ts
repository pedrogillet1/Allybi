import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({ where: { email: 'test@koda.com' } });
  if (!user) return;

  console.log('=== ALL PDFs WITH TITLES ===');
  const pdfs = await prisma.document.findMany({
    where: { userId: user.id, mimeType: 'application/pdf' },
    select: {
      id: true,
      filename: true,
      displayTitle: true,
      status: true,
      fileSize: true,
      _count: { select: { chunks: true } }
    },
    orderBy: { fileSize: 'desc' }
  });

  pdfs.forEach(d => {
    const status = d.status === 'ready' ? '[OK]' : '[FAIL]';
    console.log(status);
    console.log('  ID: ' + d.id.slice(0, 8));
    console.log('  Filename: ' + (d.filename || '(null)'));
    console.log('  Title: ' + (d.displayTitle || '(null)'));
    console.log('  Size: ' + (d.fileSize / 1024).toFixed(1) + ' KB, Chunks: ' + d._count.chunks);
    console.log('');
  });
}

main().then(() => prisma.$disconnect());
