// scripts/encryptFilenames.ts
// One-time migration: encrypt all plaintext document filenames

import prisma from '../src/config/database';
import { EncryptionService } from '../src/services/security/encryption.service';
import { EnvelopeService } from '../src/services/security/envelope.service';
import { TenantKeyService } from '../src/services/security/tenantKey.service';
import { DocumentKeyService } from '../src/services/documents/documentKey.service';
import { DocumentCryptoService } from '../src/services/documents/documentCrypto.service';

async function main() {
  const enc = new EncryptionService();
  const env = new EnvelopeService(enc);
  const tenantKeys = new TenantKeyService(prisma, enc);
  const docKeys = new DocumentKeyService(prisma, enc, tenantKeys, env);
  const docCrypto = new DocumentCryptoService(enc);

  const docs = await prisma.document.findMany({
    where: { filename: { not: null }, filenameEncrypted: null },
    select: { id: true, userId: true, filename: true },
  });

  console.log(`Documents to encrypt: ${docs.length}`);
  let okCount = 0;
  let failCount = 0;

  for (const doc of docs) {
    try {
      const dk = await docKeys.getDocumentKey(doc.userId, doc.id);
      const encrypted = docCrypto.encryptFilename(doc.id, doc.filename!, dk);

      await prisma.document.update({
        where: { id: doc.id },
        data: { filenameEncrypted: encrypted, filename: null },
      });
      okCount++;
      if (okCount % 10 === 0) console.log(`  encrypted ${okCount}/${docs.length}...`);
    } catch (err: any) {
      console.error(`Failed [${doc.id}]: ${err.message}`);
      failCount++;
    }
  }

  console.log(`Done. Encrypted: ${okCount} | Failed: ${failCount}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
