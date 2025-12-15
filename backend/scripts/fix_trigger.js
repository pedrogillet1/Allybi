require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixTrigger() {
  try {
    console.log('=== Fixing document_embeddings trigger ===\n');

    // Drop the existing broken trigger and function
    console.log('1. Dropping existing trigger...');
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS tsvectorupdate ON document_embeddings`);
    console.log('   Done.');

    console.log('2. Dropping existing function...');
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS document_embeddings_content_tsv_trigger()`);
    console.log('   Done.');

    // Create new function with correct column name (camelCase with quotes)
    console.log('3. Creating fixed function...');
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION document_embeddings_content_tsv_trigger()
      RETURNS trigger AS $$
      BEGIN
        NEW."contentTsv" := to_tsvector('english', NEW.content);
        RETURN NEW;
      END
      $$ LANGUAGE plpgsql
    `);
    console.log('   Done.');

    // Create new trigger
    console.log('4. Creating fixed trigger...');
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER tsvectorupdate
      BEFORE INSERT OR UPDATE OF content ON document_embeddings
      FOR EACH ROW
      EXECUTE FUNCTION document_embeddings_content_tsv_trigger()
    `);
    console.log('   Done.');

    // Test insert
    console.log('\n5. Testing insert...');
    const result = await prisma.$executeRaw`
      INSERT INTO document_embeddings (id, "documentId", "chunkIndex", content, embedding, metadata, "createdAt")
      VALUES (
        'test-fix-id-123',
        'test-doc-fix',
        0,
        'test content for trigger fix',
        '[]',
        '{}',
        NOW()
      )
    `;
    console.log('   Insert succeeded!');

    // Verify tsvector was populated
    const check = await prisma.$queryRaw`
      SELECT "contentTsv" IS NOT NULL as has_tsv
      FROM document_embeddings
      WHERE id = 'test-fix-id-123'
    `;
    console.log('   contentTsv populated:', check[0].has_tsv);

    // Cleanup
    await prisma.$executeRaw`DELETE FROM document_embeddings WHERE id = 'test-fix-id-123'`;
    console.log('   Test data cleaned up.');

    console.log('\n✅ TRIGGER FIXED SUCCESSFULLY!');

  } catch (error) {
    console.error('Error:', error.message);
    console.error('Full error:', error);
  }

  await prisma.$disconnect();
}

fixTrigger();
