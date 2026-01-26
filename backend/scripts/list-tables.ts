import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function listTables() {
  try {
    console.log('='.repeat(60));
    console.log('DATABASE TABLES CHECK');
    console.log('='.repeat(60));

    // List all tables
    const tables = await prisma.$queryRaw<any[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;

    console.log('\nExisting tables:');
    tables.forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.table_name}`);
    });

    // Check if document_chunks exists (could be different name)
    const chunkTables = tables.filter((t: any) =>
      t.table_name.toLowerCase().includes('chunk') ||
      t.table_name.toLowerCase().includes('embedding')
    );

    console.log('\nChunk/Embedding related tables:');
    if (chunkTables.length === 0) {
      console.log('  NONE FOUND - Tables need to be created!');
    } else {
      chunkTables.forEach((t: any) => console.log(`  - ${t.table_name}`));
    }

    // Check documents count
    const docCount = await prisma.document.count();
    console.log(`\nTotal documents: ${docCount}`);

    const completedCount = await prisma.document.count({ where: { status: 'completed' } });
    console.log(`Completed documents: ${completedCount}`);

    console.log('\n' + '='.repeat(60));

  } catch (e: any) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

listTables();
