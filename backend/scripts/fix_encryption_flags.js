const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixEncryptionFlags() {
  try {
    // Find all failed documents with "Failed to decrypt" error
    const failedDocs = await prisma.document.findMany({
      where: {
        status: 'failed',
        error: { contains: 'decrypt' }
      },
      select: {
        id: true,
        filename: true,
        isEncrypted: true,
        encryptionIV: true,
        encryptionAuthTag: true
      }
    });

    console.log(`Found ${failedDocs.length} documents with decryption failures`);

    if (failedDocs.length === 0) {
      console.log('No documents to fix');
      return;
    }

    // Update them to isEncrypted: false and clear encryption keys
    const result = await prisma.document.updateMany({
      where: {
        id: { in: failedDocs.map(d => d.id) }
      },
      data: {
        isEncrypted: false,
        encryptionIV: null,
        encryptionAuthTag: null,
        encryptionSalt: null,
        status: 'processing', // Reset to processing so they can be reprocessed
        error: null
      }
    });

    console.log(`✅ Fixed ${result.count} documents`);
    console.log('Documents will need to be reprocessed. Run retrigger-stuck endpoint or restart backend.');

  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

fixEncryptionFlags();
