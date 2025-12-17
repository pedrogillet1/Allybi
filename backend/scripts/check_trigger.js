require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkTrigger() {
  try {
    // Get trigger definition
    const triggers = await prisma.$queryRaw`
      SELECT
        t.tgname as trigger_name,
        pg_get_triggerdef(t.oid) as trigger_definition
      FROM pg_trigger t
      JOIN pg_class c ON t.tgrelid = c.oid
      WHERE c.relname = 'document_embeddings'
      AND t.tgisinternal = false
    `;

    console.log('=== Triggers on document_embeddings ===\n');
    triggers.forEach(t => {
      console.log(`Trigger: ${t.trigger_name}`);
      console.log(`Definition: ${t.trigger_definition}`);
      console.log('');
    });

    // Check for the tsvector update function
    const functions = await prisma.$queryRaw`
      SELECT
        proname,
        prosrc
      FROM pg_proc
      WHERE proname LIKE '%tsvector%' OR proname LIKE '%document_embedding%'
    `;

    console.log('=== Related Functions ===\n');
    functions.forEach(f => {
      console.log(`Function: ${f.proname}`);
      console.log(`Source: ${f.prosrc.substring(0, 500)}...`);
      console.log('');
    });

  } catch (error) {
    console.error('Error:', error.message);
  }

  await prisma.$disconnect();
}

checkTrigger();
