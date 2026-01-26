/**
 * ============================================================================
 * KODA BM25 SETUP SCRIPT
 * ============================================================================
 *
 * This script sets up the BM25 keyword search infrastructure:
 * 1. Creates the document_chunks table (via Prisma)
 * 2. Adds full-text search index for PostgreSQL
 * 3. Populates chunks from existing documents
 *
 * Run: npx ts-node src/scripts/setup-bm25.ts
 */

import prisma from '../config/database';

async function setupBM25() {
  console.log('🚀 [BM25 SETUP] Starting BM25 infrastructure setup...\n');

  try {
    // ========================================
    // Step 1: Check if table exists
    // ========================================
    console.log('📋 [Step 1] Checking if document_chunks table exists...');

    try {
      const tableCheck = await prisma.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = 'document_chunks'
        );
      `;

      if (tableCheck[0]?.exists) {
        console.log('   ✅ Table already exists');
      } else {
        console.log('   ⚠️ Table does not exist - run "npx prisma db push" first');
        console.log('   📝 After running prisma db push, run this script again.\n');
        return;
      }
    } catch (error) {
      console.log('   ⚠️ Could not check table existence, assuming it needs to be created');
      console.log('   📝 Run "npx prisma db push" to create the table.\n');
      return;
    }

    // ========================================
    // Step 2: Create full-text search index
    // ========================================
    console.log('\n📋 [Step 2] Creating full-text search index...');

    try {
      // Check if index exists
      const indexCheck = await prisma.$queryRaw<Array<{ exists: boolean }>>`
        SELECT EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE indexname = 'idx_document_chunks_fulltext'
        );
      `;

      if (indexCheck[0]?.exists) {
        console.log('   ✅ Full-text search index already exists');
      } else {
        // Create GIN index for full-text search
        // Using 'simple' configuration for language-independent tokenization
        // MUST match the configuration used in kodaHybridSearch.service.ts
        await prisma.$executeRaw`
          CREATE INDEX idx_document_chunks_fulltext
          ON document_chunks
          USING GIN (to_tsvector('simple', text));
        `;
        console.log('   ✅ Created full-text search index');
      }
    } catch (error: any) {
      if (error.message?.includes('already exists')) {
        console.log('   ✅ Full-text search index already exists');
      } else {
        console.error('   ❌ Error creating index:', error.message);
      }
    }

    // ========================================
    // Step 3: Show statistics
    // ========================================
    console.log('\n📋 [Step 3] Current statistics...');

    const chunkCount = await prisma.documentChunk.count();
    const documentCount = await prisma.document.count({
      where: { status: 'ready' }
    });

    console.log(`   📊 Documents (ready): ${documentCount}`);
    console.log(`   📊 Document chunks: ${chunkCount}`);

    if (chunkCount === 0 && documentCount > 0) {
      console.log('\n⚠️ No chunks exist yet. You need to populate chunks from existing documents.');
      console.log('   Run: npx ts-node src/scripts/populate-bm25-chunks.ts');
    }

    // ========================================
    // Done
    // ========================================
    console.log('\n✅ [BM25 SETUP] Setup complete!\n');
    console.log('Next steps:');
    console.log('1. If chunks are empty, run: npx ts-node src/scripts/populate-bm25-chunks.ts');
    console.log('2. Restart the backend server');
    console.log('3. Test BM25 search with a keyword query\n');

  } catch (error) {
    console.error('❌ [BM25 SETUP] Setup failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the setup
setupBM25();
