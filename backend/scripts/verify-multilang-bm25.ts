/**
 * Verify Multi-Language BM25 Implementation
 *
 * Tests:
 * 1. Language column exists in documents
 * 2. Language distribution across documents
 * 3. Language-aware trigger is active
 * 4. BM25 search works for English
 * 5. BM25 search works for Spanish
 * 6. BM25 search works for Portuguese
 *
 * Usage: npx ts-node --transpile-only src/scripts/verify-multilang-bm25.ts
 */

import prisma from '../config/database';

async function verifyMultiLanguageBM25(): Promise<void> {
  console.log('═'.repeat(70));
  console.log('  MULTI-LANGUAGE BM25 VERIFICATION');
  console.log('═'.repeat(70));
  console.log('');

  let passed = 0;
  let failed = 0;

  try {
    // ========================================================================
    // Check 1: Language column exists
    // ========================================================================
    console.log('🔍 Check 1: Language column exists in documents');
    const columnCheck = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'documents' AND column_name = 'language'
    `;
    if (columnCheck.length > 0) {
      console.log('   ✅ Language column exists');
      passed++;
    } else {
      console.log('   ❌ Language column missing');
      failed++;
    }

    // ========================================================================
    // Check 2: Language distribution
    // ========================================================================
    console.log('\n🔍 Check 2: Language distribution');
    const langStats = await prisma.$queryRaw<Array<{ language: string; count: bigint }>>`
      SELECT language, COUNT(*) as count
      FROM documents
      WHERE status = 'completed'
      GROUP BY language
      ORDER BY count DESC
    `;
    if (langStats.length > 0) {
      console.log('   ✅ Documents have languages assigned');
      langStats.forEach(s => console.log(`      ${s.language}: ${s.count} documents`));
      passed++;
    } else {
      console.log('   ❌ No documents found');
      failed++;
    }

    // ========================================================================
    // Check 3: Trigger is active
    // ========================================================================
    console.log('\n🔍 Check 3: Language-aware trigger is active');
    const triggerCheck = await prisma.$queryRaw<Array<{ tgname: string }>>`
      SELECT tgname FROM pg_trigger
      WHERE tgrelid = 'document_embeddings'::regclass
        AND tgname = 'tsvectorupdate'
    `;
    if (triggerCheck.length > 0) {
      console.log('   ✅ Trigger is active');
      passed++;
    } else {
      console.log('   ❌ Trigger missing');
      failed++;
    }

    // ========================================================================
    // Check 4: Tsvector populated
    // ========================================================================
    console.log('\n🔍 Check 4: Tsvector populated');
    const tsvStats = await prisma.$queryRaw<Array<{
      total: bigint;
      with_tsv: bigint;
    }>>`
      SELECT
        COUNT(*) as total,
        COUNT(content_tsv) as with_tsv
      FROM document_embeddings
    `;
    const total = Number(tsvStats[0].total);
    const withTsv = Number(tsvStats[0].with_tsv);
    if (withTsv === total && total > 0) {
      console.log(`   ✅ All ${total} embeddings have tsvector`);
      passed++;
    } else {
      console.log(`   ❌ ${total - withTsv} embeddings missing tsvector`);
      failed++;
    }

    // ========================================================================
    // Check 5: Test English search
    // ========================================================================
    console.log('\n🔍 Check 5: English BM25 search');
    const enResults = await prisma.$queryRaw<Array<{
      filename: string;
      language: string;
      rank: number;
    }>>`
      SELECT d.filename, d.language, ts_rank(de.content_tsv, plainto_tsquery('english', 'revenue')) as rank
      FROM document_embeddings de
      JOIN documents d ON de."documentId" = d.id
      WHERE d.language = 'english'
        AND de.content_tsv @@ plainto_tsquery('english', 'revenue')
      ORDER BY rank DESC
      LIMIT 3
    `;
    if (enResults.length > 0) {
      console.log(`   ✅ English search returned ${enResults.length} results`);
      enResults.forEach((r, i) => {
        console.log(`      ${i + 1}. [${r.rank.toFixed(4)}] ${r.filename}`);
      });
      passed++;
    } else {
      console.log('   ⚠️  No English results for "revenue" (may not have matching docs)');
    }

    // ========================================================================
    // Check 6: Test Spanish search
    // ========================================================================
    console.log('\n🔍 Check 6: Spanish BM25 search');
    const esResults = await prisma.$queryRaw<Array<{
      filename: string;
      language: string;
      rank: number;
    }>>`
      SELECT d.filename, d.language, ts_rank(de.content_tsv, plainto_tsquery('spanish', 'ingresos')) as rank
      FROM document_embeddings de
      JOIN documents d ON de."documentId" = d.id
      WHERE d.language = 'spanish'
        AND de.content_tsv @@ plainto_tsquery('spanish', 'ingresos')
      ORDER BY rank DESC
      LIMIT 3
    `;
    if (esResults.length > 0) {
      console.log(`   ✅ Spanish search returned ${esResults.length} results`);
      esResults.forEach((r, i) => {
        console.log(`      ${i + 1}. [${r.rank.toFixed(4)}] ${r.filename}`);
      });
      passed++;
    } else {
      console.log('   ⚠️  No Spanish results for "ingresos" (may not have Spanish docs)');
    }

    // ========================================================================
    // Check 7: Test Portuguese search
    // ========================================================================
    console.log('\n🔍 Check 7: Portuguese BM25 search');
    const ptResults = await prisma.$queryRaw<Array<{
      filename: string;
      language: string;
      rank: number;
    }>>`
      SELECT d.filename, d.language, ts_rank(de.content_tsv, plainto_tsquery('portuguese', 'receita')) as rank
      FROM document_embeddings de
      JOIN documents d ON de."documentId" = d.id
      WHERE d.language = 'portuguese'
        AND de.content_tsv @@ plainto_tsquery('portuguese', 'receita')
      ORDER BY rank DESC
      LIMIT 3
    `;
    if (ptResults.length > 0) {
      console.log(`   ✅ Portuguese search returned ${ptResults.length} results`);
      ptResults.forEach((r, i) => {
        console.log(`      ${i + 1}. [${r.rank.toFixed(4)}] ${r.filename}`);
      });
      passed++;
    } else {
      console.log('   ⚠️  No Portuguese results for "receita" (may not have Portuguese docs)');
    }

    // ========================================================================
    // Check 8: Cross-language search (searches all languages)
    // ========================================================================
    console.log('\n🔍 Check 8: Cross-language search');
    const crossResults = await prisma.$queryRaw<Array<{
      filename: string;
      language: string;
      rank: number;
    }>>`
      SELECT d.filename, d.language, ts_rank(de.content_tsv, plainto_tsquery(d.language::regconfig, 'total')) as rank
      FROM document_embeddings de
      JOIN documents d ON de."documentId" = d.id
      WHERE de.content_tsv @@ plainto_tsquery(d.language::regconfig, 'total')
      ORDER BY rank DESC
      LIMIT 5
    `;
    if (crossResults.length > 0) {
      console.log(`   ✅ Cross-language search returned ${crossResults.length} results`);
      crossResults.forEach((r, i) => {
        console.log(`      ${i + 1}. [${r.language}] [${r.rank.toFixed(4)}] ${r.filename}`);
      });
      passed++;
    } else {
      console.log('   ⚠️  No cross-language results');
    }

    // ========================================================================
    // Summary
    // ========================================================================
    console.log('\n' + '═'.repeat(70));
    console.log('  VERIFICATION SUMMARY');
    console.log('═'.repeat(70));
    console.log(`\n   ✅ Passed: ${passed}`);
    console.log(`   ❌ Failed: ${failed}`);

    if (failed === 0) {
      console.log('\n' + '═'.repeat(70));
      console.log('  ✅ MULTI-LANGUAGE BM25 IS READY');
      console.log('═'.repeat(70));
    } else {
      console.log('\n' + '═'.repeat(70));
      console.log('  ⚠️  SOME CHECKS FAILED - Review above');
      console.log('═'.repeat(70));
    }

  } catch (error: any) {
    console.error('\n❌ Verification failed:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

verifyMultiLanguageBM25()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
