const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

p.document.findMany({
  orderBy: { createdAt: 'desc' },
  take: 5,
  select: { filename: true, encryptedFilename: true }
}).then(docs => {
  docs.forEach(d => {
    const key = d.encryptedFilename;
    console.log((d.filename || 'noname').slice(0, 30), '| key:', key ? key.slice(0, 50) : 'EMPTY');
  });
}).finally(() => p.$disconnect());
