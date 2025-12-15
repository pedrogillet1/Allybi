require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  // Get failed documents with all relevant fields
  const docs = await prisma.document.findMany({
    where: {
      status: { in: ['failed', 'processing_failed'] }
    },
    select: {
      id: true,
      filename: true,
      encryptedFilename: true,
      fileSize: true,
      mimeType: true,
      status: true,
      isEncrypted: true,
      encryptionIV: true,
      encryptionAuthTag: true,
      encryptionSalt: true,
      fileHash: true,
      error: true,
      createdAt: true
    },
    orderBy: { createdAt: 'desc' },
    take: 15
  });

  console.log('=== Failed Documents Analysis ===\n');
  console.log('Total failed docs: ' + docs.length + '\n');

  // Analyze patterns
  let patterns = {
    encryptedTrue: 0,
    encryptedFalse: 0,
    hasEncryptionIV: 0,
    hasEncryptionAuthTag: 0,
    hasEncryptionSalt: 0,
    fileSizeZero: 0,
    fileSizeNormal: 0,
    errorTypes: {}
  };

  for (const doc of docs) {
    console.log('----------------------------------------');
    console.log('File: ' + doc.filename);
    console.log('  ID: ' + doc.id);
    console.log('  Status: ' + doc.status);
    console.log('  FileSize: ' + doc.fileSize + ' bytes');
    console.log('  MimeType: ' + doc.mimeType);
    console.log('  isEncrypted: ' + doc.isEncrypted);
    console.log('  encryptionIV: ' + (doc.encryptionIV ? 'SET' : 'null'));
    console.log('  encryptionAuthTag: ' + (doc.encryptionAuthTag ? 'SET' : 'null'));
    console.log('  encryptionSalt: ' + (doc.encryptionSalt ? 'SET' : 'null'));
    console.log('  Error: ' + (doc.error || '').substring(0, 100));
    console.log('  Created: ' + doc.createdAt.toISOString());

    // Count patterns
    if (doc.isEncrypted) patterns.encryptedTrue++;
    else patterns.encryptedFalse++;
    if (doc.encryptionIV) patterns.hasEncryptionIV++;
    if (doc.encryptionAuthTag) patterns.hasEncryptionAuthTag++;
    if (doc.encryptionSalt) patterns.hasEncryptionSalt++;
    if (doc.fileSize === 0) patterns.fileSizeZero++;
    else patterns.fileSizeNormal++;

    // Track error types
    const errorKey = (doc.error || 'No error').substring(0, 50);
    patterns.errorTypes[errorKey] = (patterns.errorTypes[errorKey] || 0) + 1;
  }

  console.log('\n\n=== PATTERN SUMMARY ===');
  console.log('isEncrypted=true: ' + patterns.encryptedTrue);
  console.log('isEncrypted=false: ' + patterns.encryptedFalse);
  console.log('has encryptionIV: ' + patterns.hasEncryptionIV);
  console.log('has encryptionAuthTag: ' + patterns.hasEncryptionAuthTag);
  console.log('has encryptionSalt: ' + patterns.hasEncryptionSalt);
  console.log('fileSize=0: ' + patterns.fileSizeZero);
  console.log('fileSize>0: ' + patterns.fileSizeNormal);

  console.log('\n=== ERROR TYPE DISTRIBUTION ===');
  for (const [error, count] of Object.entries(patterns.errorTypes)) {
    console.log('  "' + error + '": ' + count);
  }

  // Check for problematic pattern: isEncrypted=true but no metadata
  const problematic = docs.filter(d =>
    d.isEncrypted === true && (!d.encryptionIV || !d.encryptionAuthTag)
  );

  if (problematic.length > 0) {
    console.log('\n\nPROBLEMATIC DOCS (isEncrypted=true but missing metadata):');
    problematic.forEach(d => console.log('  - ' + d.filename + ' (ID: ' + d.id + ')'));
  }

  await prisma.$disconnect();
}
check();
