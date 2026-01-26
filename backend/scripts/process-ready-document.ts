import prisma from '../config/database';
import * as fileActionsService from '../services/fileActions.service';

async function processDocument() {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: '75fc0452-231f-495e-a1c8-5d129ee3feed' },
      include: { users: true }
    });

    if (!doc) {
      console.log('❌ Document not found');
      return;
    }

    console.log(`📝 Processing: ${doc.filename}`);
    console.log(`   User ID: ${doc.userId}`);
    console.log(`   Document ID: ${doc.id}`);

    // Call the processDocument method from fileActions service
    await fileActionsService.processDocument(doc.id, doc.userId);

    console.log('✅ Document processed successfully!');
    await prisma.$disconnect();
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    await prisma.$disconnect();
  }
}

processDocument();
