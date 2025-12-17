import * as dotenv from 'dotenv';
dotenv.config();

import s3Service from '../src/services/s3Storage.service';

async function testS3() {
  try {
    // Create a test file
    const testContent = 'Hello, this is a test file to verify S3 upload and download!';
    const testBuffer = Buffer.from(testContent, 'utf8');
    const testFilename = `test-${Date.now()}.txt`;

    console.log('=== Testing S3 Upload/Download ===\n');
    console.log(`Original content: "${testContent}"`);
    console.log(`Original size: ${testBuffer.length} bytes\n`);

    // Upload
    console.log('Uploading to S3...');
    await s3Service.uploadFile(testFilename, testBuffer, 'text/plain');
    console.log('✅ Upload successful\n');

    // Download
    console.log('Downloading from S3...');
    const [downloadedBuffer, mimeType] = await s3Service.downloadFile(testFilename);
    console.log('✅ Download successful\n');

    // Compare
    console.log(`Downloaded size: ${downloadedBuffer.length} bytes`);
    console.log(`Downloaded content: "${downloadedBuffer.toString('utf8')}"`);
    console.log(`Content matches: ${testContent === downloadedBuffer.toString('utf8')}`);

    // Cleanup
    console.log('\nCleaning up...');
    await s3Service.deleteFile(testFilename);
    console.log('✅ Test file deleted');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

testS3();
