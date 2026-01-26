/**
 * Add Multi-Language BM25 Support Migration
 *
 * Adds:
 * 1. Language column to documents table
 * 2. Language-aware trigger for tsvector generation
 * 3. Updates existing embeddings with proper language tsvector
 *
 * Usage: npx ts-node --transpile-only src/scripts/add-multilanguage-support.ts
 */

import prisma from '../config/database';

async function addMultiLanguageSupport() {
  console.log('═'.repeat(70));
  console.log('  MULTI-LANGUAGE BM25 SUPPORT MIGRATION');
  console.log('═'.repeat(70));
  console.log('');

  try {
    // ========================================================================
    // Step 1: Add language column to documents
    // ========================================================================
    console.log('📝 Step 1/6: Adding language column to documents...');

    await prisma.$executeRaw`
      ALTER TABLE documents
      ADD COLUMN IF NOT EXISTS language VARCHAR(20) DEFAULT 'english'
    `;
    console.log('   ✅ Language column added');

    // ========================================================================
    // Step 2: Add indexes for language
    // ========================================================================
    console.log('📝 Step 2/6: Adding indexes...');

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_documents_language
      ON documents(language)
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_documents_user_language
      ON documents("userId", language)
    `);
    console.log('   ✅ Indexes created');

    // ========================================================================
    // Step 3: Ensure tsvector column exists
    // ========================================================================
    console.log('📝 Step 3/6: Ensuring tsvector column exists...');

    await prisma.$executeRaw`
      ALTER TABLE document_embeddings
      ADD COLUMN IF NOT EXISTS content_tsv tsvector
    `;
    console.log('   ✅ Tsvector column ready');

    // ========================================================================
    // Step 4: Create language-aware trigger function
    // ========================================================================
    console.log('📝 Step 4/6: Creating language-aware trigger...');

    await prisma.$executeRaw`
      CREATE OR REPLACE FUNCTION document_embeddings_content_tsv_trigger()
      RETURNS trigger AS $$
      DECLARE
        doc_language VARCHAR(20);
      BEGIN
        SELECT language INTO doc_language
        FROM documents
        WHERE id = NEW."documentId";

        IF doc_language IS NULL OR doc_language = '' THEN
          doc_language := 'english';
        END IF;

        IF doc_language NOT IN ('english', 'spanish', 'portuguese') THEN
          doc_language := 'english';
        END IF;

        NEW.content_tsv := to_tsvector(doc_language::regconfig, NEW.content);
        RETURN NEW;
      END
      $$ LANGUAGE plpgsql
    `;

    await prisma.$executeRaw`DROP TRIGGER IF EXISTS tsvectorupdate ON document_embeddings`;

    await prisma.$executeRaw`
      CREATE TRIGGER tsvectorupdate
      BEFORE INSERT OR UPDATE OF content
      ON document_embeddings
      FOR EACH ROW
      EXECUTE FUNCTION document_embeddings_content_tsv_trigger()
    `;
    console.log('   ✅ Language-aware trigger created');

    // ========================================================================
    // Step 5: Create GIN index
    // ========================================================================
    console.log('📝 Step 5/6: Ensuring GIN index exists...');

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_document_embeddings_content_tsv
      ON document_embeddings
      USING GIN (content_tsv)
    `);
    console.log('   ✅ GIN index ready');

    // ========================================================================
    // Step 6: Set default language and update tsvectors
    // ========================================================================
    console.log('📝 Step 6/6: Updating existing data...');

    // Set default language for documents without one
    const docsUpdated = await prisma.$executeRaw`
      UPDATE documents
      SET language = 'english'
      WHERE language IS NULL OR language = ''
    `;
    console.log(`   ✅ Set language for ${docsUpdated} documents`);

    // Update tsvectors for embeddings
    const embeddingsUpdated = await prisma.$executeRaw`
      UPDATE document_embeddings de
      SET content_tsv = to_tsvector(
        COALESCE((SELECT language FROM documents WHERE id = de."documentId"), 'english')::regconfig,
        de.content
      )
      WHERE content_tsv IS NULL
    `;
    console.log(`   ✅ Updated tsvector for ${embeddingsUpdated} embeddings`);

    // ========================================================================
    // Verification
    // ========================================================================
    console.log('\n🔍 Verifying installation...');

    // Check language distribution
    const langStats = await prisma.$queryRaw<Array<{ language: string; count: bigint }>>`
      SELECT language, COUNT(*) as count
      FROM documents
      GROUP BY language
      ORDER BY count DESC
    `;
    console.log('\n📊 Language distribution:');
    langStats.forEach(s => console.log(`   ${s.language}: ${s.count} documents`));

    // Check tsvector status
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
    console.log(`\n📊 Tsvector status: ${tsvStats[0].with_tsv}/${tsvStats[0].total} populated`);

    // Check trigger
    const triggerCheck = await prisma.$queryRaw<Array<{ tgname: string }>>`
      SELECT tgname FROM pg_trigger
      WHERE tgrelid = 'document_embeddings'::regclass
        AND tgname = 'tsvectorupdate'
    `;
    console.log(`\n📊 Trigger: ${triggerCheck.length > 0 ? '✅ Active' : '❌ Missing'}`);

    console.log('\n' + '═'.repeat(70));
    console.log('  ✅ MULTI-LANGUAGE SUPPORT READY');
    console.log('═'.repeat(70));
    console.log('\nNext steps:');
    console.log('1. Run language re-detection: npx ts-node --transpile-only src/scripts/redetect-languages.ts');
    console.log('2. Test with: npx ts-node --transpile-only src/scripts/verify-multilang-bm25.ts');

  } catch (error: any) {
    console.error('\n❌ Migration failed:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

addMultiLanguageSupport()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
