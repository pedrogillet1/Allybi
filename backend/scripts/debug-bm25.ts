/**
 * Debug BM25 Search - Check document content, tsvector column, and language configs
 *
 * Usage: npx ts-node --transpile-only src/scripts/debug-bm25.ts
 */

import prisma from '../config/database';

async function debugBM25() {
  console.log('🔍 Debugging BM25 Search...\n');

  try {
    // ========================================================================
    // Step 1: Check if content_tsv column exists
    // ========================================================================
    console.log('📊 Checking content_tsv column status:');
    console.log('─'.repeat(60));

    const columnCheck = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'document_embeddings'
      AND column_name = 'content_tsv'
    `;

    const hasTsvColumn = columnCheck.length > 0;
    console.log(`   content_tsv column: ${hasTsvColumn ? '✅ EXISTS' : '❌ MISSING'}`);

    if (hasTsvColumn) {
      const tsvStats = await prisma.$queryRaw<Array<{
        total: bigint;
        with_tsv: bigint;
        missing: bigint;
      }>>`
        SELECT
          COUNT(*) as total,
          COUNT(content_tsv) as with_tsv,
          COUNT(*) - COUNT(content_tsv) as missing
        FROM document_embeddings
      `;
      console.log(`   Rows with tsvector: ${tsvStats[0].with_tsv}/${tsvStats[0].total}`);
      console.log(`   Missing: ${tsvStats[0].missing}`);
    }

    // ========================================================================
    // Step 2: Check GIN index status
    // ========================================================================
    console.log('\n📊 Checking GIN index status:');
    console.log('─'.repeat(60));

    const indexes = await prisma.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename = 'document_embeddings'
      AND indexdef LIKE '%gin%'
    `;

    if (indexes.length > 0) {
      for (const idx of indexes) {
        console.log(`   ✅ ${idx.indexname}`);
        console.log(`      ${idx.indexdef}`);
      }
    } else {
      console.log('   ❌ No GIN indexes found');
      console.log('   Run: npx ts-node --transpile-only src/scripts/create-bm25-index.ts');
    }

    // ========================================================================
    // Step 3: Get sample content
    // ========================================================================
    console.log('\n📄 Sample document content:');
    console.log('─'.repeat(60));

    const samples = await prisma.documentEmbedding.findMany({
      take: 3,
      select: {
        id: true,
        content: true,
        document: {
          select: {
            filename: true
          }
        }
      }
    });

    for (const sample of samples) {
      console.log(`\nFile: ${sample.document?.filename || 'Unknown'}`);
      console.log(`Content (first 150 chars): "${sample.content.substring(0, 150)}..."`);
    }

    // ========================================================================
    // Step 4: Test search performance
    // ========================================================================
    console.log('\n\n🔍 Testing BM25 search performance:');
    console.log('─'.repeat(60));

    const testWord = 'revenue';

    if (hasTsvColumn) {
      // Test with pre-computed tsvector (fast)
      console.log(`\nTesting with content_tsv column (optimized):`);
      const startTsv = Date.now();
      const resultsTsv = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*) as count
        FROM document_embeddings
        WHERE content_tsv @@ plainto_tsquery('english', ${testWord})
      `;
      const timeTsv = Date.now() - startTsv;
      console.log(`   "${testWord}": ${resultsTsv[0].count} matches in ${timeTsv}ms`);

      // Get scores
      const scoresTsv = await prisma.$queryRaw<Array<{ rank: number }>>`
        SELECT ts_rank(content_tsv, plainto_tsquery('english', ${testWord})) as rank
        FROM document_embeddings
        WHERE content_tsv @@ plainto_tsquery('english', ${testWord})
        ORDER BY rank DESC
        LIMIT 5
      `;
      if (scoresTsv.length > 0) {
        console.log(`   Top scores: ${scoresTsv.map(s => Number(s.rank).toFixed(4)).join(', ')}`);
      }
    }

    // Test with to_tsvector (slow, for comparison)
    console.log(`\nTesting with to_tsvector() (unoptimized):`);
    const startSlow = Date.now();
    const resultsSlow = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM document_embeddings
      WHERE to_tsvector('english', content) @@ plainto_tsquery('english', ${testWord})
    `;
    const timeSlow = Date.now() - startSlow;
    console.log(`   "${testWord}": ${resultsSlow[0].count} matches in ${timeSlow}ms`);

    if (hasTsvColumn) {
      const speedup = timeSlow > 0 ? (timeSlow / Math.max(1, Date.now() - startSlow)).toFixed(1) : 'N/A';
      console.log(`\n   ⚡ Speedup with tsvector column: ~${speedup}x faster`);
    }

    // ========================================================================
    // Step 5: Check available text search configurations
    // ========================================================================
    console.log('\n\n📊 Available text search configurations:');
    console.log('─'.repeat(60));

    const configs = await prisma.$queryRaw<Array<{ cfgname: string }>>`
      SELECT cfgname FROM pg_ts_config ORDER BY cfgname
    `;
    console.log(configs.map(c => c.cfgname).join(', '));

    // ========================================================================
    // Summary
    // ========================================================================
    console.log('\n\n📋 Summary:');
    console.log('─'.repeat(60));
    console.log(`   content_tsv column: ${hasTsvColumn ? '✅ Ready' : '❌ Missing'}`);
    console.log(`   GIN index: ${indexes.length > 0 ? '✅ Ready' : '❌ Missing'}`);

    if (!hasTsvColumn || indexes.length === 0) {
      console.log('\n⚠️  To fix, run:');
      console.log('   npx ts-node --transpile-only src/scripts/create-bm25-index.ts');
    } else {
      console.log('\n✅ BM25 search is fully optimized!');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugBM25();
