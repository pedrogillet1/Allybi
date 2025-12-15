const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const https = require('https');
const http = require('http');

const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIyNzFhOTI4Mi00NjNiLTQyYmQtYWMyYy00MDM0Y2U5ZDk1MjQiLCJlbWFpbCI6ImxvY2FsaG9zdEBrb2RhLmNvbSIsImlhdCI6MTc2NTY0NTI3NCwiZXhwIjoxNzY1NzMxNjc0fQ.FVQLD4yDQZ61rkJpZBd0CLgfxeK9BJ0x4d50rzAEd2k';
const BASE_URL = 'http://localhost:5000';

async function retryDoc(docId) {
  return new Promise((resolve, reject) => {
    const req = http.request(`${BASE_URL}/api/documents/${docId}/retry`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function triggerReprocessing() {
  try {
    // Find all documents in 'processing' status
    const docs = await prisma.document.findMany({
      where: {
        status: 'processing'
      },
      select: {
        id: true,
        filename: true
      }
    });

    console.log(`Found ${docs.length} documents to process\n`);

    let successCount = 0;
    let failCount = 0;

    for (const doc of docs) {
      try {
        console.log(`Processing: ${doc.filename}...`);
        const result = await retryDoc(doc.id);
        successCount++;
        console.log(`  ✅ Started processing`);
      } catch (e) {
        failCount++;
        console.log(`  ❌ Failed: ${e.message}`);
      }
    }

    console.log(`\n=== Summary ===`);
    console.log(`Started: ${successCount}`);
    console.log(`Failed: ${failCount}`);

  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

triggerReprocessing();
