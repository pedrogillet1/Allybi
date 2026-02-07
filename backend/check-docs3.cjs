const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

async function main() {
  const p = new PrismaClient();
  try {
    const docs = await p.document.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { filename: true, encryptedFilename: true }
    });

    let output = 'Found ' + docs.length + ' docs:\n';
    for (const d of docs) {
      const key = d.encryptedFilename;
      output += (d.filename || 'noname').slice(0, 35) + ' | key: ' + (key ? key.slice(0, 50) : 'EMPTY') + '\n';
    }

    fs.writeFileSync('/tmp/doc-check2.txt', output);
    console.error(output);
  } finally {
    await p.$disconnect();
  }
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
