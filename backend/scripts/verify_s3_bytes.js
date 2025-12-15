require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const s3Service = require('../dist/services/s3Storage.service').default;

const prisma = new PrismaClient();

const SIGNATURES = {
  '504b0304': 'ZIP/XLSX/DOCX/PPTX (correct)',
  '504b0506': 'ZIP (empty archive)',
  '25504446': 'PDF (%PDF-)',
  'd0cf11e0': 'MS Office (old)',
  'ffd8ffe0': 'JPEG',
  '89504e47': 'PNG',
};

async function verify() {
  // Get a sample of failed docs - both encrypted and non-encrypted
  const docs = await prisma.document.findMany({
    where: { status: 'failed' },
    select: {
      id: true,
      filename: true,
      encryptedFilename: true,
      fileSize: true,
      mimeType: true,
      isEncrypted: true,
      error: true
    },
    orderBy: { createdAt: 'desc' },
    take: 6
  });

  console.log('=== S3 FILE BYTES VERIFICATION ===\n');

  for (const doc of docs) {
    console.log('----------------------------------------');
    console.log('File: ' + doc.filename);
    console.log('  Expected size: ' + doc.fileSize + ' bytes');
    console.log('  MimeType: ' + doc.mimeType);
    console.log('  isEncrypted: ' + doc.isEncrypted);
    console.log('  Error: ' + (doc.error || '').substring(0, 60));

    try {
      const [buffer] = await s3Service.downloadFile(doc.encryptedFilename);

      const actualSize = buffer.length;
      const sizeMatch = actualSize === doc.fileSize;
      const header4 = buffer.slice(0, 4).toString('hex');
      const header20 = buffer.slice(0, 20).toString('hex');
      const detectedType = SIGNATURES[header4] || 'Unknown/Encrypted';

      // Calculate entropy of first 1000 bytes
      const sampleSize = Math.min(1000, buffer.length);
      const sample = buffer.slice(0, sampleSize);
      const freq = new Map();
      for (const b of sample) {
        freq.set(b, (freq.get(b) || 0) + 1);
      }
      let entropy = 0;
      for (const count of freq.values()) {
        const p = count / sampleSize;
        entropy -= p * Math.log2(p);
      }

      console.log('  --- S3 OBJECT ---');
      console.log('  Actual size: ' + actualSize + ' bytes');
      console.log('  Size match: ' + (sizeMatch ? 'YES' : 'NO'));
      console.log('  First 4 bytes: ' + header4);
      console.log('  First 20 bytes: ' + header20);
      console.log('  Detected type: ' + detectedType);
      console.log('  Entropy: ' + entropy.toFixed(2) + ' bits/byte');

      // Diagnosis
      if (entropy > 7.5) {
        console.log('  DIAGNOSIS: Data looks ENCRYPTED/RANDOM');
      } else if (header4 === '504b0304') {
        console.log('  DIAGNOSIS: Valid ZIP header - should work');
      } else if (header4 === '25504446') {
        console.log('  DIAGNOSIS: Valid PDF header - should work');
      } else {
        console.log('  DIAGNOSIS: Unknown format - possibly corrupted');
      }

    } catch (err) {
      console.log('  S3 Download Error: ' + err.message);
    }
  }

  await prisma.$disconnect();
}

verify();
