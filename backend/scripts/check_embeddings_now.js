require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  // Check document statuses
  const statusCounts = await prisma.document.groupBy({
    by: ['status'],
    _count: { status: true }
  });
  console.log('=== Document Status Counts ===');
  statusCounts.forEach(s => console.log(s.status + ': ' + s._count.status));

  // Check for documents with chunks (embeddings)
  const docsWithChunks = await prisma.document.findMany({
    where: { status: 'completed' },
    select: {
      id: true,
      filename: true,
      status: true,
      _count: { select: { chunks: true } }
    },
    take: 10
  });

  console.log('\n=== Completed Documents with Chunks ===');
  if (docsWithChunks.length === 0) {
    console.log('No completed documents found');
  } else {
    docsWithChunks.forEach(d => {
      console.log(d.filename.substring(0, 40).padEnd(42) + ' | chunks: ' + d._count.chunks);
    });
  }

  // Check total chunks in database
  const totalChunks = await prisma.documentChunk.count();
  console.log('\n=== Total Chunks in Database: ' + totalChunks + ' ===');

  // Check recent chunk creation
  const recentChunks = await prisma.documentChunk.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      createdAt: true,
      document: { select: { filename: true } }
    }
  });

  console.log('\n=== Most Recent Chunks ===');
  if (recentChunks.length === 0) {
    console.log('No chunks found');
  } else {
    recentChunks.forEach(c => {
      console.log(c.createdAt.toISOString().substring(0, 19) + ' | ' + c.document.filename.substring(0, 40));
    });
  }

  // Check if any chunks have embeddings (check a sample)
  const chunkWithEmbedding = await prisma.documentChunk.findFirst({
    select: {
      id: true,
      embedding: true,
      content: true
    }
  });

  console.log('\n=== Sample Chunk Embedding Check ===');
  if (chunkWithEmbedding) {
    const hasEmbedding = chunkWithEmbedding.embedding && chunkWithEmbedding.embedding.length > 0;
    console.log('Has embedding vector: ' + hasEmbedding);
    if (hasEmbedding) {
      console.log('Embedding dimensions: ' + chunkWithEmbedding.embedding.length);
    }
    console.log('Content preview: ' + (chunkWithEmbedding.content || '').substring(0, 100) + '...');
  } else {
    console.log('No chunks found to check');
  }

  await prisma.$disconnect();
}
check();
