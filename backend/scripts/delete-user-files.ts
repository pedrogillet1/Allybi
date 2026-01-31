/**
 * Delete all documents (and related data) for test@koda.com
 *
 * Cleans up:
 *   1. Pinecone vectors
 *   2. S3 files (originals, preview PDFs, slide images)
 *   3. Database records (documents, chunks, embeddings, metadata — via cascade)
 *   4. Empty folders
 *
 * Usage: npx ts-node --transpile-only scripts/delete-user-files.ts
 */

import { PrismaClient } from '@prisma/client';

// Load env before importing app modules
import '../src/config/env';

import { deleteFile } from '../src/config/storage';
import pineconeService from '../src/services/retrieval/pinecone.service';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({ where: { email: 'test@koda.com' } });
  if (!user) {
    console.log('User test@koda.com not found');
    return;
  }
  console.log(`User: ${user.email} (${user.id})\n`);

  // 1. Fetch all documents with related storage info
  const docs = await prisma.document.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      filename: true,
      displayTitle: true,
      encryptedFilename: true,
      mimeType: true,
      status: true,
      metadata: {
        select: {
          previewPdfKey: true,
          slidesData: true,
        },
      },
      _count: { select: { chunks: true } },
    },
  });

  if (docs.length === 0) {
    console.log('No documents found. Nothing to delete.');
    return;
  }

  console.log(`Found ${docs.length} documents to delete.\n`);
  for (const doc of docs) {
    const name = doc.filename || doc.displayTitle || doc.id.slice(0, 8);
    console.log(`  - ${name} (${doc.mimeType}, ${doc._count.chunks} chunks)`);
  }
  console.log('');

  // 2. Delete Pinecone vectors
  console.log('=== DELETING PINECONE VECTORS ===\n');
  const docIds = docs.map(d => d.id);
  const chunkCounts: Record<string, number> = {};
  for (const doc of docs) {
    chunkCounts[doc.id] = doc._count.chunks;
  }

  try {
    const deleted = await pineconeService.deleteMultipleDocumentEmbeddings(
      docIds,
      { userId: user.id, chunkCounts },
      (done, total) => {
        process.stdout.write(`  Pinecone: ${done}/${total} documents cleared\r`);
      }
    );
    console.log(`  Pinecone: ${deleted} documents cleared.              \n`);
  } catch (err: any) {
    console.warn(`  Pinecone cleanup failed (may not be configured): ${err.message}\n`);
  }

  // 3. Delete S3 files
  console.log('=== DELETING S3 FILES ===\n');
  const s3Keys: string[] = [];

  for (const doc of docs) {
    // Original file
    if (doc.encryptedFilename) {
      s3Keys.push(doc.encryptedFilename);
    }

    // Preview PDF
    if (doc.metadata?.previewPdfKey) {
      s3Keys.push(doc.metadata.previewPdfKey);
    }

    // Slide images
    if (doc.metadata?.slidesData) {
      try {
        const slides = JSON.parse(doc.metadata.slidesData);
        if (Array.isArray(slides)) {
          for (const slide of slides) {
            if (slide.storagePath) s3Keys.push(slide.storagePath);
          }
        }
      } catch {
        // slidesData might not be valid JSON
      }
    }
  }

  console.log(`  ${s3Keys.length} S3 keys to delete.`);
  let s3Deleted = 0;
  let s3Failed = 0;

  for (const key of s3Keys) {
    try {
      await deleteFile(key);
      s3Deleted++;
    } catch (err: any) {
      // Don't fail on missing files — they may already be gone
      if (err.code !== 'S3_DELETE_FAILED' || !err.message?.includes('NoSuchKey')) {
        s3Failed++;
        console.warn(`  Failed to delete: ${key} — ${err.message}`);
      } else {
        s3Deleted++;
      }
    }
  }
  console.log(`  S3: ${s3Deleted} deleted, ${s3Failed} failed.\n`);

  // 4. Delete database records (cascade handles chunks, embeddings, metadata, etc.)
  console.log('=== DELETING DATABASE RECORDS ===\n');

  const result = await prisma.document.deleteMany({
    where: { userId: user.id },
  });
  console.log(`  Documents deleted: ${result.count}`);
  console.log('  (chunks, embeddings, metadata, tags, summaries — cascade deleted)\n');

  // 5. Clean up empty folders
  const folders = await prisma.folder.findMany({
    where: { userId: user.id },
    select: { id: true, name: true, nameEncrypted: true },
  });

  if (folders.length > 0) {
    const folderResult = await prisma.folder.deleteMany({
      where: { userId: user.id },
    });
    console.log(`  Folders deleted: ${folderResult.count}\n`);
  } else {
    console.log('  No folders to clean up.\n');
  }

  // Summary
  console.log('=== DONE ===');
  console.log(`  Documents removed: ${result.count}`);
  console.log(`  S3 files removed:  ${s3Deleted}`);
  console.log(`  Pinecone cleared:  ${docIds.length} documents`);
  console.log(`  Folders removed:   ${folders.length}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error('Fatal error:', err);
    prisma.$disconnect();
    process.exit(1);
  });
