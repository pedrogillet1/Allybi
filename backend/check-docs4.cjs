require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

async function main() {
  console.log('DATABASE:', process.env.DATABASE_URL.split('@')[1].split('?')[0]);

  const p = new PrismaClient();
  try {
    const count = await p.document.count();
    console.log('Total docs:', count);

    const docs = await p.document.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { filename: true, encryptedFilename: true }
    });

    for (const d of docs) {
      const key = d.encryptedFilename;
      console.log((d.filename || 'noname').slice(0, 35), '| key:', key ? key.slice(0, 50) : 'EMPTY');
    }
  } finally {
    await p.$disconnect();
  }
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
