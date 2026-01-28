import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({ where: { email: 'test@koda.com' } });
  if (!user) return;

  console.log('=== ALL PDFs ===');
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
    orderBy: { filename: 'asc' }
  });

  pdfs.forEach(d => {
    const name = d.filename || d.displayTitle || d.id;
    const status = d.status === 'ready' ? '[OK]' : '[FAIL]';
    console.log(status + ' ' + name);
    console.log('    Size: ' + (d.fileSize / 1024).toFixed(1) + ' KB, Chunks: ' + d._count.chunks);
  });
}

main().then(() => prisma.$disconnect());
