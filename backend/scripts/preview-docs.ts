import prisma from '../src/config/database';

async function main() {
  const user = await prisma.user.findFirst({ where: { email: 'test@koda.com' } });
  if (!user) {
    console.log('User not found');
    return;
  }

  const chunks = await prisma.documentChunk.findMany({
    where: {
      document: {
        userId: user.id,
        status: { in: ['ready', 'available', 'indexed', 'completed'] }
      }
    },
    select: {
      documentId: true,
      text: true,
      document: { select: { mimeType: true } }
    },
    take: 80
  });

  const byDoc: Record<string, { mime: string; texts: string[] }> = {};
  for (const c of chunks) {
    if (!byDoc[c.documentId]) byDoc[c.documentId] = { mime: c.document.mimeType, texts: [] };
    if (c.text) byDoc[c.documentId].texts.push(c.text.substring(0, 200));
  }

  console.log('Document content previews:\n');
  let i = 1;
  for (const [docId, data] of Object.entries(byDoc)) {
    console.log(`--- Doc ${i++} (${data.mime}) [${docId.substring(0,8)}...] ---`);
    console.log(data.texts[0] || 'No text');
    console.log('');
  }

  await prisma.$disconnect();
}

main();
