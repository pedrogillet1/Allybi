import { PrismaClient } from '@prisma/client';
import { downloadFile } from '../../src/config/storage';
import * as fs from 'fs';

const prisma = new PrismaClient();

async function main() {
  const docId = '27fa8bbd-dbe2-4ab0-8fa5-c445cb356c66';

  // Get the encrypted filename (GCS key)
  const doc = await prisma.document.findUnique({
    where: { id: docId },
    select: { id: true, encryptedFilename: true, filename: true, filenameEncrypted: true },
  });

  console.log('Doc keys:', {
    id: doc?.id,
    encryptedFilename: doc?.encryptedFilename,
    filenameEncrypted: doc?.filenameEncrypted ? '(has value)' : null,
    filename: doc?.filename,
  });

  // Download the file
  const gcsKey = doc?.encryptedFilename;
  if (!gcsKey) {
    console.error('No encryptedFilename / storage key found');
    await prisma.$disconnect();
    return;
  }

  console.log('\nDownloading from storage key:', gcsKey);
  const buffer = await downloadFile(gcsKey);
  console.log('Downloaded:', buffer.length, 'bytes');

  // Save locally for analysis
  const tmpPath = '/tmp/bcb_check.pdf';
  fs.writeFileSync(tmpPath, buffer);

  // Use pdf-parse
  const pdfParse = require('pdf-parse');
  const data = await pdfParse(buffer);
  console.log('\n=== PDF Analysis ===');
  console.log('Pages:', data.numpages);
  console.log('Text length:', data.text.length);
  console.log('Has form feeds (\\f):', data.text.includes('\f'));
  console.log('Form feed count:', (data.text.match(/\f/g) || []).length);

  // Check text per page using form feeds
  if (data.text.includes('\f')) {
    const pages = data.text.split('\f');
    console.log('\nPer-page text lengths:');
    for (let i = 0; i < pages.length; i++) {
      console.log(`  Page ${i + 1}: ${pages[i].length} chars, ${pages[i].trim().split(/\s+/).length} words`);
    }
  } else {
    console.log('\nNo form feeds — all text treated as single page');
    console.log('Total chars:', data.text.length);
    console.log('Total words:', data.text.trim().split(/\s+/).length);
  }

  console.log('\n=== Full text (first 2000 chars) ===');
  console.log(data.text.substring(0, 2000));

  fs.unlinkSync(tmpPath);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
