const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const fs = require('fs');

p.document.findMany({
  orderBy: { createdAt: 'desc' },
  take: 5,
  select: { filename: true, encryptedFilename: true }
}).then(docs => {
  let output = '';
  docs.forEach(d => {
    const key = d.encryptedFilename;
    output += (d.filename || 'noname').slice(0, 35) + ' | key: ' + (key ? key.slice(0, 50) : 'EMPTY') + '\n';
  });
  fs.writeFileSync('/tmp/doc-check.txt', output);
  process.stderr.write(output);
}).finally(() => p.$disconnect());
