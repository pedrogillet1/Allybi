require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkScrumPdf() {
  console.log('=== INVESTIGATING SCRUM PDF ===\n');

  // Find the document
  const doc = await prisma.document.findFirst({
    where: {
      filename: { contains: 'Scrum' }
    },
    include: {
      embeddings: true,
      chunks: true
    }
  });

  if (!doc) {
    console.log('Document not found!');
    await prisma.$disconnect();
    return;
  }

  console.log('Document Info:');
  console.log('  ID:', doc.id);
  console.log('  Filename:', doc.filename);
  console.log('  Status:', doc.status);
  console.log('  File Size:', doc.fileSize, 'bytes');
  console.log('  MIME Type:', doc.mimeType);
  console.log('  Created:', doc.createdAt);
  console.log('  Embeddings:', doc.embeddings.length);
  console.log('  Chunks:', doc.chunks.length);

  // Check extracted text
  console.log('\n--- Extracted Text Analysis ---');
  if (doc.extractedText) {
    console.log('  Text Length:', doc.extractedText.length, 'characters');
    console.log('  First 500 chars:', doc.extractedText.substring(0, 500));
    console.log('  ...');
    console.log('  Last 500 chars:', doc.extractedText.substring(doc.extractedText.length - 500));
  } else {
    console.log('  NO EXTRACTED TEXT FOUND!');
  }

  // Check chunks
  console.log('\n--- Chunk Details ---');
  for (const chunk of doc.chunks) {
    console.log(`\nChunk ${chunk.chunkIndex}:`);
    console.log('  Content Length:', chunk.content?.length || 0, 'characters');
    console.log('  Metadata:', JSON.stringify(chunk.metadata, null, 2));
    console.log('  Content Preview:', (chunk.content || '').substring(0, 200) + '...');
  }

  // Check embeddings
  console.log('\n--- Embedding Details ---');
  for (const emb of doc.embeddings) {
    const embVector = emb.embedding;
    const hasNonZero = embVector && embVector.some(v => v !== 0);
    console.log(`Embedding ${emb.chunkIndex}: vector length=${embVector?.length || 0}, hasNonZero=${hasNonZero}`);
  }

  // Check document metadata
  console.log('\n--- Document Metadata ---');
  console.log(JSON.stringify(doc.metadata, null, 2));

  await prisma.$disconnect();
}

checkScrumPdf().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
