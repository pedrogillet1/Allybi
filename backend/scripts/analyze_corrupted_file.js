/**
 * Analyze a corrupted S3 file to understand the corruption pattern
 */

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const s3Service = require('../dist/services/s3Storage.service').default;

const prisma = new PrismaClient();

async function analyzeFile() {
  try {
    // Get a recent failed document
    const doc = await prisma.document.findFirst({
      where: { status: 'failed' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        filename: true,
        encryptedFilename: true,
        fileSize: true,
        mimeType: true,
        error: true
      }
    });

    if (!doc) {
      console.log('No failed documents found');
      return;
    }

    console.log('=== Analyzing Corrupted File ===\n');
    console.log('Document:', doc.filename);
    console.log('Expected size:', doc.fileSize, 'bytes');
    console.log('MIME type:', doc.mimeType);
    console.log('Error:', doc.error?.substring(0, 200));
    console.log('');

    // Download the file
    const [buffer] = await s3Service.downloadFile(doc.encryptedFilename);
    console.log('Downloaded size:', buffer.length, 'bytes');
    console.log('');

    // Analyze content
    console.log('=== First 100 bytes (hex) ===');
    console.log(buffer.slice(0, 100).toString('hex'));
    console.log('');

    console.log('=== First 100 bytes (ascii) ===');
    // Replace non-printable chars with dots
    const ascii = Array.from(buffer.slice(0, 100))
      .map(b => b >= 32 && b < 127 ? String.fromCharCode(b) : '.')
      .join('');
    console.log(ascii);
    console.log('');

    // Check for common patterns
    const signatures = {
      '504b0304': 'ZIP/XLSX/DOCX/PPTX',
      '25504446': 'PDF (%PDF)',
      'd0cf11e0': 'MS Office (old)',
      'ffd8ffe0': 'JPEG',
      '89504e47': 'PNG',
      '7b227479': 'JSON ({"ty)',
      '3c3f786d': 'XML (<?xm)',
      '3c21444f': 'HTML (<!DO)',
      'efbbbf': 'UTF-8 BOM',
    };

    const header4 = buffer.slice(0, 4).toString('hex');
    const header3 = buffer.slice(0, 3).toString('hex');

    console.log('=== Signature Analysis ===');
    console.log('First 4 bytes:', header4);
    console.log('First 3 bytes:', header3);

    const match = signatures[header4] || signatures[header3];
    if (match) {
      console.log('Detected format:', match);
    } else {
      console.log('Unknown format - possibly corrupted or encrypted');
    }
    console.log('');

    // Check for Base64 encoding (common corruption pattern)
    const base64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    const first100 = buffer.slice(0, 100).toString('ascii');
    const isBase64Like = first100.split('').every(c => base64Chars.includes(c) || c < ' ');

    console.log('=== Corruption Check ===');
    console.log('Looks like Base64:', isBase64Like);

    // Try base64 decode if it looks like base64
    if (isBase64Like) {
      try {
        const decoded = Buffer.from(buffer.toString('ascii'), 'base64');
        console.log('Base64 decoded first 10 bytes:', decoded.slice(0, 10).toString('hex'));
        if (decoded.slice(0, 4).toString('hex') === '504b0304') {
          console.log('⚠️  FILE WAS BASE64 ENCODED! Decoded data is valid ZIP!');
        }
      } catch (e) {
        console.log('Not valid base64');
      }
    }

    // Check for JSON (could be error response stored as file)
    if (first100.trim().startsWith('{') || first100.trim().startsWith('[')) {
      console.log('⚠️  File content looks like JSON - might be an error response!');
      try {
        const json = JSON.parse(buffer.toString('utf8'));
        console.log('JSON content:', JSON.stringify(json, null, 2).substring(0, 500));
      } catch (e) {
        console.log('Not valid JSON');
      }
    }

    // Check entropy (random/encrypted data has high entropy)
    const byteFreq = new Map();
    for (const b of buffer) {
      byteFreq.set(b, (byteFreq.get(b) || 0) + 1);
    }
    let entropy = 0;
    for (const count of byteFreq.values()) {
      const p = count / buffer.length;
      entropy -= p * Math.log2(p);
    }
    console.log('Entropy:', entropy.toFixed(2), 'bits/byte (random data ~8, compressed ~7-8, text ~4-5)');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeFile();
