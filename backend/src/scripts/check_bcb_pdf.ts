import { Storage } from '@google-cloud/storage';
import * as fs from 'fs';
import * as path from 'path';

const BUCKET = process.env.GCS_BUCKET_NAME || 'koda-user-file-gcs';
const USER_ID = '17a07d7e-1db5-4a0b-b0e7-5f8672a05890';
const DOC_ID = '27fa8bbd-dbe2-4ab0-8fa5-c445cb356c66';

async function main() {
  const storage = new Storage();
  const bucket = storage.bucket(BUCKET);

  // Try different path patterns
  const pathPatterns = [
    `${USER_ID}/${DOC_ID}`,
    `${USER_ID}/${DOC_ID}/original`,
    `uploads/${USER_ID}/${DOC_ID}`,
    `documents/${USER_ID}/${DOC_ID}`,
    `${DOC_ID}`,
  ];

  // List files in the user directory to find the actual path
  console.log('Listing files in user directory...');
  try {
    const [files] = await bucket.getFiles({ prefix: `${USER_ID}/`, maxResults: 20 });
    console.log(`Found ${files.length} files under ${USER_ID}/:`);
    for (const f of files) {
      console.log(`  ${f.name} (${f.metadata.size} bytes)`);
    }
  } catch (e: any) {
    console.log('Error listing user dir:', e.message);
  }

  // Also list by doc ID
  try {
    const [files] = await bucket.getFiles({ prefix: DOC_ID, maxResults: 5 });
    if (files.length) {
      console.log(`\nFound ${files.length} files with docId prefix:`);
      for (const f of files) {
        console.log(`  ${f.name} (${f.metadata.size} bytes)`);
      }
    }
  } catch (e: any) {
    console.log('Error listing by docId:', e.message);
  }

  // Try downloading from first found path
  for (const pattern of pathPatterns) {
    try {
      const [exists] = await bucket.file(pattern).exists();
      if (exists) {
        console.log(`\nFound file at: ${pattern}`);
        const tmpPath = '/tmp/bcb_check.pdf';
        await bucket.file(pattern).download({ destination: tmpPath });
        const stats = fs.statSync(tmpPath);
        console.log(`Downloaded: ${stats.size} bytes`);

        // Use pdf-parse to check page count
        const pdfParse = require('pdf-parse');
        const dataBuffer = fs.readFileSync(tmpPath);
        const data = await pdfParse(dataBuffer);
        console.log(`\nPDF Info:`);
        console.log(`  Pages: ${data.numpages}`);
        console.log(`  Text length: ${data.text.length}`);
        console.log(`  Has form feeds: ${data.text.includes('\f')}`);
        console.log(`  Form feed count: ${(data.text.match(/\f/g) || []).length}`);
        console.log(`  Text preview (first 500 chars):`);
        console.log(data.text.substring(0, 500));

        fs.unlinkSync(tmpPath);
        break;
      }
    } catch (e: any) {
      // skip
    }
  }
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
