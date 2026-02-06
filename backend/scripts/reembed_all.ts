/**
 * Re-embed All Documents Script
 *
 * Purpose: Clean up stale/mixed embeddings and re-embed all documents
 * with the current embedding model for consistent cross-lingual retrieval.
 *
 * Usage:
 *   npm run reembed:all              # Re-embed all users
 *   npm run reembed:all -- --user=<userId>  # Re-embed specific user
 *   npm run reembed:all -- --dry-run # Preview without making changes
 */

import prisma from '../src/config/database';
import { PineconeService } from '../src/services/retrieval/pinecone.service';
import { EmbeddingsService } from '../src/services/retrieval/embedding.service';

// Configuration
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
const EMBEDDING_DIM = Number(process.env.OPENAI_EMBEDDING_DIMENSIONS || 1536);
const CHUNK_BATCH_SIZE = 100; // Chunks per embedding batch

interface ReembedStats {
  usersProcessed: number;
  documentsProcessed: number;
  documentsSkipped: number;
  documentsFailed: number;
  chunksEmbedded: number;
  vectorsDeleted: number;
  vectorsUpserted: number;
  startTime: Date;
  endTime?: Date;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const userIdArg = args.find(a => a.startsWith('--user='));
  const targetUserId = userIdArg ? userIdArg.split('=')[1] : null;

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  KODA RE-EMBED ALL DOCUMENTS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log(`  Target: ${targetUserId || 'ALL USERS'}`);
  console.log(`  Embedding Model: ${EMBEDDING_MODEL}`);
  console.log(`  Embedding Dimensions: ${EMBEDDING_DIM}`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  const stats: ReembedStats = {
    usersProcessed: 0,
    documentsProcessed: 0,
    documentsSkipped: 0,
    documentsFailed: 0,
    chunksEmbedded: 0,
    vectorsDeleted: 0,
    vectorsUpserted: 0,
    startTime: new Date(),
  };

  const pinecone = new PineconeService();
  const embeddings = new EmbeddingsService();

  // Check Pinecone availability
  const pineconeStats = await pinecone.getIndexStats();
  if (!pineconeStats.available) {
    console.error('❌ Pinecone is not available. Check PINECONE_API_KEY.');
    process.exit(1);
  }
  console.log(`✓ Pinecone connected: ${pineconeStats.indexName}`);
  console.log('');

  // Get users to process
  const users = targetUserId
    ? await prisma.user.findMany({ where: { id: targetUserId }, select: { id: true, email: true } })
    : await prisma.user.findMany({ select: { id: true, email: true } });

  if (users.length === 0) {
    console.log('No users found to process.');
    process.exit(0);
  }

  console.log(`Found ${users.length} user(s) to process.`);
  console.log('');

  for (const user of users) {
    console.log(`\n─────────────────────────────────────────────────────────────────`);
    console.log(`Processing user: ${user.email || user.id}`);
    console.log(`─────────────────────────────────────────────────────────────────`);

    // Get all documents for this user that have chunks
    const documents = await prisma.document.findMany({
      where: {
        userId: user.id,
        status: { in: ['ready', 'available', 'indexed', 'completed', 'enriching'] },
      },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        status: true,
        createdAt: true,
        embeddingsGenerated: true,
        chunksCount: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    console.log(`  Found ${documents.length} document(s)`);

    for (const doc of documents) {
      // Get actual chunk count from DB
      const chunkCount = await prisma.documentChunk.count({
        where: { documentId: doc.id },
      });

      // Skip documents with no chunks
      if (chunkCount === 0) {
        console.log(`  ⏭️  ${doc.filename}: No chunks, skipping`);
        stats.documentsSkipped++;
        continue;
      }

      console.log(`  📄 ${doc.filename} (${chunkCount} chunks)`);

      if (dryRun) {
        console.log(`     [DRY RUN] Would delete old vectors and re-embed ${chunkCount} chunks`);
        stats.documentsProcessed++;
        stats.chunksEmbedded += chunkCount;
        continue;
      }

      try {
        // Step 1: Delete existing vectors for this document
        console.log(`     Deleting old vectors...`);
        await pinecone.deleteDocumentEmbeddings(doc.id, { userId: user.id, chunkCount });
        stats.vectorsDeleted += chunkCount;

        // Step 2: Get all chunks for this document
        const chunks = await prisma.documentChunk.findMany({
          where: { documentId: doc.id },
          select: {
            id: true,
            chunkIndex: true,
            text: true,
            page: true,
          },
          orderBy: { chunkIndex: 'asc' },
        });

        if (chunks.length === 0) {
          console.log(`     ⚠️  No chunks found in DB, skipping`);
          stats.documentsSkipped++;
          continue;
        }

        // Step 3: Generate embeddings in batches
        console.log(`     Generating embeddings for ${chunks.length} chunks...`);
        const chunksForUpsert: Array<{
          chunkIndex: number;
          content: string;
          embedding: number[];
          metadata: Record<string, any>;
        }> = [];

        for (let i = 0; i < chunks.length; i += CHUNK_BATCH_SIZE) {
          const batch = chunks.slice(i, i + CHUNK_BATCH_SIZE);
          const texts = batch.map(c => c.text || '').filter(t => t.length > 0);

          if (texts.length === 0) continue;

          const embeddingResult = await embeddings.generateBatchEmbeddings(texts);

          let embIdx = 0;
          for (const chunk of batch) {
            if (!chunk.text || chunk.text.length === 0) continue;

            const emb = embeddingResult.embeddings[embIdx];
            embIdx++;

            if (!emb || emb.embedding.length === 0) {
              console.log(`     ⚠️  Empty embedding for chunk ${chunk.chunkIndex}`);
              continue;
            }

            chunksForUpsert.push({
              chunkIndex: chunk.chunkIndex,
              content: chunk.text,
              embedding: emb.embedding,
              metadata: {
                page: chunk.page,
                embeddingModel: EMBEDDING_MODEL,
                embeddingDim: EMBEDDING_DIM,
              },
            });
          }

          stats.chunksEmbedded += batch.length;
        }

        // Step 4: Upsert to Pinecone with new embeddings
        console.log(`     Upserting ${chunksForUpsert.length} vectors to Pinecone...`);
        const upsertResult = await pinecone.upsertDocumentEmbeddings(
          doc.id,
          user.id,
          {
            filename: doc.filename ?? 'unknown',
            mimeType: doc.mimeType,
            createdAt: doc.createdAt,
            status: doc.status,
          },
          chunksForUpsert
        );

        stats.vectorsUpserted += upsertResult.upserted;

        // Step 5: Update document metadata
        await prisma.document.update({
          where: { id: doc.id },
          data: {
            embeddingsGenerated: true,
          },
        });

        console.log(`     ✅ Done: ${upsertResult.upserted} vectors upserted`);
        stats.documentsProcessed++;

      } catch (error) {
        console.error(`     ❌ Error processing document:`, error);
        stats.documentsFailed++;
      }
    }

    stats.usersProcessed++;
  }

  stats.endTime = new Date();
  const durationMs = stats.endTime.getTime() - stats.startTime.getTime();
  const durationMin = (durationMs / 1000 / 60).toFixed(2);

  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  RE-EMBED COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  Duration: ${durationMin} minutes`);
  console.log(`  Users processed: ${stats.usersProcessed}`);
  console.log(`  Documents processed: ${stats.documentsProcessed}`);
  console.log(`  Documents skipped: ${stats.documentsSkipped}`);
  console.log(`  Documents failed: ${stats.documentsFailed}`);
  console.log(`  Chunks embedded: ${stats.chunksEmbedded}`);
  console.log(`  Vectors deleted: ${stats.vectorsDeleted}`);
  console.log(`  Vectors upserted: ${stats.vectorsUpserted}`);
  console.log('═══════════════════════════════════════════════════════════════');

  await prisma.$disconnect();
  process.exit(stats.documentsFailed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
