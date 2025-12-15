import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import s3Service from '../src/services/s3Storage.service';

const prisma = new PrismaClient();

async function checkS3File() {
  try {
    // Get all failed documents
    const docs = await prisma.document.findMany({
      where: { status: 'failed' },
      select: {
        id: true,
        filename: true,
        encryptedFilename: true,
        fileSize: true,
        mimeType: true,
        error: true
      },
      take: 5
    });

    if (docs.length === 0) {
      console.log('No failed documents found');
      return;
    }

    const signatures: Record<string, string> = {
      '504b0304': 'ZIP/XLSX/DOCX/PPTX',
      '25504446': 'PDF',
      'd0cf11e0': 'MS Office (older)',
      'ffd8ffe0': 'JPEG',
      '89504e47': 'PNG'
    };

    for (const doc of docs) {
      console.log('\n========================================');
      console.log(`Document: ${doc.filename}`);
      console.log(`Expected size: ${doc.fileSize} bytes`);
      console.log(`Error: ${doc.error?.substring(0, 150)}...`);

      try {
        const [buffer] = await s3Service.downloadFile(doc.encryptedFilename);
        console.log(`Actual size: ${buffer.length} bytes`);
        console.log(`Size match: ${buffer.length === doc.fileSize}`);

        const headerHex = buffer.slice(0, 4).toString('hex');
        const detectedType = signatures[headerHex] || 'Unknown';
        console.log(`File signature: ${headerHex} (${detectedType})`);
      } catch (e: any) {
        console.log(`Download error: ${e.message}`);
      }
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkS3File();
