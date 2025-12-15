require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function reprocessScrumPdf() {
  console.log('=== REPROCESSING SCRUM PDF ===\n');

  // Find the document
  const doc = await prisma.document.findFirst({
    where: {
      filename: { contains: 'Scrum' }
    }
  });

  if (!doc) {
    console.log('Document not found!');
    await prisma.$disconnect();
    return;
  }

  console.log('Document found:', doc.filename);
  console.log('Document ID:', doc.id);
  console.log('Current status:', doc.status);

  // Set status to pending to trigger reprocessing
  await prisma.document.update({
    where: { id: doc.id },
    data: { status: 'pending' }
  });

  console.log('\n✅ Document status set to PENDING');
  console.log('The document will be reprocessed by the document queue.');
  console.log('\nTo trigger processing, either:');
  console.log('1. Restart the backend server, or');
  console.log('2. Use the reprocess endpoint\n');

  await prisma.$disconnect();
}

reprocessScrumPdf().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
