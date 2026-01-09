/**
 * Check user documents and chunks
 */
import * as dotenv from 'dotenv';
dotenv.config();

import prisma from '../../src/config/database';

async function checkUserDocs() {
  const userId = '9e9a66c3-3894-434d-93b0-8c5562a24d91';

  // Get ALL documents (any status)
  const docs = await prisma.document.findMany({
    where: { userId },
    select: { id: true, filename: true, mimeType: true, status: true }
  });

  console.log(`\nUser has ${docs.length} documents (all statuses):`);
  const byStatus: Record<string, number> = {};
  docs.forEach(d => {
    byStatus[d.status] = (byStatus[d.status] || 0) + 1;
  });
  console.log('By status:', byStatus);

  console.log('\nDocuments:');
  docs.slice(0, 20).forEach(d => console.log(`  - [${d.status}] ${d.filename}`));

  // Get chunk count
  const chunkCount = await prisma.documentChunk.count({
    where: { document: { userId } }
  });

  console.log(`\nTotal chunks in PostgreSQL: ${chunkCount}`);

  // Sample chunks with text (schema uses 'text' not 'content')
  const sampleChunks = await prisma.documentChunk.findMany({
    where: { document: { userId } },
    take: 10,
    orderBy: { id: 'desc' },
    include: {
      document: { select: { filename: true } }
    }
  });

  console.log('\nSample chunk contents (latest 10):');
  sampleChunks.forEach((c, i) => {
    const preview = c.text.substring(0, 150).replace(/\n/g, ' ');
    console.log(`\n[${c.document.filename} - Chunk ${c.chunkIndex}]:`);
    console.log(`  "${preview}..."`);
  });

  // Search for specific terms in chunks
  const termsToSearch = ['revenue', 'expense', 'profit', 'budget', 'margin', 'Lone Mountain'];
  console.log('\n\nTerm frequency in chunks:');

  for (const term of termsToSearch) {
    const count = await prisma.documentChunk.count({
      where: {
        document: { userId },
        text: { contains: term, mode: 'insensitive' }
      }
    });
    console.log(`  "${term}": ${count} chunks`);
  }

  await prisma.$disconnect();
}

checkUserDocs().catch(console.error);
