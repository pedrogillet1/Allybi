import prisma from '../config/database';
import { reprocessDocument } from '../services/document.service';

async function regenerateExcelEmbeddings() {
  try {
    console.log('\n🔄 ===== REGENERATING EXCEL EMBEDDINGS =====\n');

    // Get the latest Excel file
    const latestExcel = await prisma.document.findFirst({
      where: {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (!latestExcel) {
      console.log('❌ No Excel file found!');
      await prisma.$disconnect();
      return;
    }

    console.log(`📄 Found Excel file:`);
    console.log(`   Filename: ${latestExcel.filename}`);
    console.log(`   ID: ${latestExcel.id}`);
    console.log(`   User ID: ${latestExcel.userId}`);
    console.log(`   Status: ${latestExcel.status}`);
    console.log(`   Created: ${latestExcel.createdAt.toISOString()}\n`);

    console.log('🔄 Starting reprocessing (this may take 30-60 seconds)...\n');

    // CRITICAL: Delete existing metadata to force fresh Excel processing
    console.log('🗑️  Deleting cached metadata to force fresh Excel extraction...');
    await prisma.documentMetadata.deleteMany({
      where: { documentId: latestExcel.id }
    });
    console.log('✅ Metadata deleted\n');

    // Use reprocessDocument which will regenerate embeddings
    await reprocessDocument(latestExcel.id, latestExcel.userId);

    console.log('\n✅ ===== EMBEDDINGS REGENERATED SUCCESSFULLY =====\n');
    console.log('You can now test the query: "what excel did i upload"\n');
    console.log('Expected response: "Lista_9 (1) (1) (6).xlsx" with multiple rows of data\n');

    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ ===== ERROR REGENERATING EMBEDDINGS =====');
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

regenerateExcelEmbeddings();
