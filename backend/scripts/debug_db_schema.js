require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debug() {
  try {
    // Check document_embeddings table structure
    console.log('=== document_embeddings columns ===');
    const embeddingCols = await prisma.$queryRaw`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'document_embeddings'
      ORDER BY ordinal_position
    `;
    embeddingCols.forEach(c => {
      console.log(`  ${c.column_name} (${c.data_type}) ${c.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'} ${c.column_default ? `DEFAULT ${c.column_default}` : ''}`);
    });

    // Check for triggers
    console.log('\n=== Triggers on document_embeddings ===');
    const triggers = await prisma.$queryRaw`
      SELECT trigger_name, event_manipulation, action_statement
      FROM information_schema.triggers
      WHERE event_object_table = 'document_embeddings'
    `;
    if (triggers.length === 0) {
      console.log('  (no triggers)');
    } else {
      triggers.forEach(t => console.log(`  ${t.trigger_name}: ${t.event_manipulation}`));
    }

    // Check document_chunks table structure
    console.log('\n=== document_chunks columns ===');
    const chunkCols = await prisma.$queryRaw`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'document_chunks'
      ORDER BY ordinal_position
    `;
    chunkCols.forEach(c => {
      console.log(`  ${c.column_name} (${c.data_type}) ${c.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'} ${c.column_default ? `DEFAULT ${c.column_default}` : ''}`);
    });

    // Test a simple insert to document_embeddings
    console.log('\n=== Testing document_embeddings insert ===');
    try {
      await prisma.documentEmbedding.create({
        data: {
          documentId: 'test-doc-id',
          chunkIndex: 0,
          content: 'test content',
          embedding: '[]',
          metadata: '{}',
          chunkType: null
        }
      });
      console.log('  Insert succeeded! Cleaning up...');
      await prisma.documentEmbedding.deleteMany({ where: { documentId: 'test-doc-id' } });
      console.log('  Cleanup done.');
    } catch (insertError) {
      console.log('  Insert FAILED:', insertError.message);
    }

  } catch (error) {
    console.error('Error:', error.message);
  }

  await prisma.$disconnect();
}

debug();
