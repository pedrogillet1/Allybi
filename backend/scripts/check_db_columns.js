require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  try {
    // Check columns using raw query
    const columns = await prisma.$queryRaw`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'document_embeddings'
      ORDER BY ordinal_position
    `;

    console.log('Columns in document_embeddings:');
    columns.forEach(c => console.log(`  - ${c.column_name} (${c.data_type})`));

  } catch (error) {
    console.error('Error:', error.message);
  }

  await prisma.$disconnect();
}

check();
