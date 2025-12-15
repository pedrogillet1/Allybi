/**
 * Test Google Vision OCR on the Scrum PDF
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import googleVisionOCR from '../src/services/google-vision-ocr.service';
import { downloadFile } from '../src/config/storage';
import encryptionService from '../src/services/encryption.service';

const prisma = new PrismaClient();

async function testOCR() {
  console.log('=== TESTING GOOGLE VISION OCR ===\n');

  console.log('1. Checking Google Vision OCR...');
  if (!googleVisionOCR.isAvailable()) {
    console.error('❌ Not available:', googleVisionOCR.getInitializationError());
    process.exit(1);
  }
  console.log('✅ Google Vision OCR is available\n');

  // Find document
  console.log('2. Finding Scrum PDF...');
  const doc = await prisma.document.findFirst({
    where: { filename: { contains: 'Scrum' } }
  });

  if (!doc) {
    console.log('❌ Document not found');
    await prisma.$disconnect();
    return;
  }

  console.log('✅ Found:', doc.filename, '\n');

  // Download and decrypt
  console.log('3. Downloading from S3...');
  let buffer = await downloadFile(doc.encryptedFilename);
  console.log('✅ Downloaded:', buffer.length, 'bytes');

  if (doc.isEncrypted) {
    console.log('4. Decrypting...');
    buffer = encryptionService.decryptFile(buffer, `document-${doc.userId}`);
    console.log('✅ Decrypted:', buffer.length, 'bytes\n');
  }

  // Run OCR
  console.log('5. Running Google Vision OCR...');
  const startTime = Date.now();

  try {
    const result = await googleVisionOCR.processScannedPDF(buffer);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n✅ OCR COMPLETED!');
    console.log('   Time:', elapsed, 'seconds');
    console.log('   Pages:', result.pageCount);
    console.log('   Characters:', result.text.length);
    console.log('   Words:', result.text.split(/\s+/).length);

    // Preview
    console.log('\n--- PREVIEW (first 1500 chars) ---');
    console.log(result.text.substring(0, 1500));
    console.log('\n--- END PREVIEW ---');

    // Save
    const outputPath = path.join(__dirname, 'scrum_ocr_output.txt');
    fs.writeFileSync(outputPath, result.text);
    console.log('\n📁 Full text saved to:', outputPath);

  } catch (error: any) {
    console.error('❌ OCR Failed:', error.message);
  }

  await prisma.$disconnect();
}

testOCR().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
