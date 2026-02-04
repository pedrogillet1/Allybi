/**
 * Vector Embedding Service (Clean)
 *
 * Responsibilities:
 * - Generate embeddings (via embedding.service)
 * - Store embeddings/chunks in Postgres
 * - Upsert searchable chunks to Pinecone (optional)
 * - Retry on transient failures
 * - Compensating rollback to avoid inconsistent state
 *
 * Notes:
 * - Pinecone is treated as an optional accelerator. If Pinecone is down/missing,
 *   we still store chunks/embeddings in Postgres so chat can work.
 * - Chunk indexes are made deterministic and de-duped to avoid unique conflicts.
 */

import prisma from '../../config/database';
import embeddingService from './embedding.service';
import pineconeService from './pinecone.service';

type JsonPrimitive = string | number | boolean | null;
type PineconeMetaValue = JsonPrimitive | string[];

export interface InputChunk {
  chunkIndex?: number;
  pageNumber?: number;
  content?: string;
  text?: string;
  embedding?: number[];
  metadata?: Record<string, any>;
}

export interface StoreEmbeddingsOptions {
  maxRetries?: number;          // default: 3
  verifyAfterStore?: boolean;   // default: false (adds latency)
  batchSize?: number;           // default: 100
  minContentChars?: number;     // default: 8 (skip useless chunks)
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Pinecone only accepts: string | number | boolean | string[]
 * and rejects null/undefined and objects.
 */
function sanitizePineconeMetadata(obj: Record<string, any>): Record<string, PineconeMetaValue> {
  const out: Record<string, PineconeMetaValue> = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null) continue;

    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out[k] = v;
      continue;
    }

    if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
      out[k] = v as string[];
      continue;
    }

    // Skip objects/arrays of objects/functions/etc.
  }
  return out;
}

function normalizeChunk(raw: InputChunk, fallbackIndex: number, minContentChars: number) {
  const chunkIndex = Number.isFinite(raw.chunkIndex) ? (raw.chunkIndex as number) : fallbackIndex;
  const pageNumber = Number.isFinite(raw.pageNumber) ? (raw.pageNumber as number) : undefined;

  const content = (raw.content ?? raw.text ?? '').trim();
  const embedding = Array.isArray(raw.embedding) ? raw.embedding : [];
  const metadata = raw.metadata ?? {};

  const isUsable = content.length >= minContentChars;
  return { chunkIndex, pageNumber, content, embedding, metadata, isUsable };
}

function dedupeByChunkIndex<T extends { chunkIndex: number }>(items: T[]): T[] {
  // Keep first occurrence to preserve deterministic behavior
  const seen = new Set<number>();
  const out: T[] = [];
  for (const it of items) {
    if (seen.has(it.chunkIndex)) continue;
    seen.add(it.chunkIndex);
    out.push(it);
  }
  return out;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const result = await embeddingService.generateEmbedding(text);
  return result.embedding;
}

/**
 * Store embeddings for a document in Postgres + Pinecone (optional).
 */
export async function storeDocumentEmbeddings(
  documentId: string,
  chunks: InputChunk[],
  options: StoreEmbeddingsOptions = {}
): Promise<void> {
  const {
    maxRetries = 3,
    verifyAfterStore = false,
    batchSize = 100,
    minContentChars = 8,
  } = options;

  if (!documentId) throw new Error('documentId is required');
  if (!chunks || chunks.length === 0) {
    throw new Error(`CRITICAL: No chunks provided for document ${documentId}`);
  }

  // Normalize + drop empty/useless chunks early
  const normalized = chunks
    .map((c, i) => normalizeChunk(c, i, minContentChars))
    .filter((c) => c.isUsable);

  if (normalized.length === 0) {
    throw new Error(
      `CRITICAL: All chunks were empty/too-short for document ${documentId}. Nothing to index.`
    );
  }

  // De-dupe chunkIndex to avoid DB uniqueness conflicts (and Pinecone id collisions)
  const usableChunks = dedupeByChunkIndex(normalized);

  // Generate embeddings for chunks that don't have them (true batch for efficiency)
  const needsEmbedding = usableChunks.filter((c) => !c.embedding || c.embedding.length === 0);
  if (needsEmbedding.length > 0) {
    console.log(
      `🔢 [vectorEmbedding] Generating embeddings for ${needsEmbedding.length}/${usableChunks.length} chunks (doc=${documentId})`
    );
    // Use true batch API — sends all texts in one OpenAI call (up to 256 per batch)
    const texts = needsEmbedding.map((c) => c.content);
    const batchResult = await embeddingService.generateBatchEmbeddings(texts);
    for (let j = 0; j < needsEmbedding.length; j++) {
      const emb = batchResult.embeddings[j];
      needsEmbedding[j].embedding = emb?.embedding || [];
    }
    console.log(
      `✅ [vectorEmbedding] Embeddings generated (${batchResult.totalProcessed} processed, ${batchResult.failedCount} failed, ${batchResult.processingTime}ms)`
    );
  }

  let lastErr: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let pineconeUpserted = false;

    try {
      console.log(
        `💾 [vectorEmbedding] Store ${usableChunks.length} chunks for doc=${documentId} (attempt ${attempt}/${maxRetries})`
      );

      // 1) Fetch document metadata
      const document = await prisma.document.findUnique({
        where: { id: documentId },
        include: { folder: true },
      });

      if (!document) {
        throw new Error(`Document not found: ${documentId}`);
      }

      // 2) Prepare Pinecone vectors (optional)
      const pineconeAvailable = typeof pineconeService.isAvailable === 'function'
        ? pineconeService.isAvailable()
        : true; // fallback if old service

      const documentMetadata = {
        filename: document.filename ?? 'unknown',
        originalName: document.filename ?? 'unknown',
        mimeType: document.mimeType,
        createdAt: document.createdAt,
        status: document.status,
        folderId: document.folderId || undefined,
        folderName: document.folder?.name || undefined,
        // Add more if your schema has it:
        // categoryId: document.categoryId || undefined,
        // categoryName: document.category?.name || undefined,
      };

      const pineconeChunks = usableChunks.map((c) => ({
        chunkIndex: c.chunkIndex,
        content: c.content,
        embedding: c.embedding || [],
        metadata: c.metadata || {},
      }));

      // 3) Prepare Postgres records (compute upfront, before async I/O)
      const embeddingRecords = usableChunks.map((c) => ({
        documentId,
        chunkIndex: c.chunkIndex,
        content: c.content,
        embedding: JSON.stringify(c.embedding || []),
        metadata: JSON.stringify(c.metadata || {}),
        chunkType: c.metadata?.chunkType || null,
      }));

      const chunkRecords = usableChunks.map((c) => ({
        documentId,
        chunkIndex: c.chunkIndex,
        text: c.content,
        page: c.pageNumber ?? c.metadata?.pageNumber ?? null,
        startChar: c.metadata?.startChar ?? null,
        endChar: c.metadata?.endChar ?? null,
      }));

      // 4) Run Pinecone upsert and Postgres write IN PARALLEL
      const pineconePromise = pineconeAvailable
        ? pineconeService.upsertDocumentEmbeddings(
            documentId,
            document.userId,
            documentMetadata,
            pineconeChunks.map((c) => ({
              chunkIndex: c.chunkIndex,
              content: c.content,
              embedding: c.embedding,
              metadata: sanitizePineconeMetadata(c.metadata || {}),
            }))
          ).then(() => {
            pineconeUpserted = true;
            console.log(`✅ [vectorEmbedding] Pinecone upsert ok (${usableChunks.length} chunks)`);
          })
        : Promise.resolve().then(() => {
            console.warn('⚠️ [vectorEmbedding] Pinecone not available — storing Postgres only');
          });

      // Transaction timeout configurable via env for VPS deployments
      const txTimeout = parseInt(process.env.PRISMA_TRANSACTION_TIMEOUT || '30000', 10);
      const postgresPromise = prisma.$transaction(async (tx) => {
        // Clear old — parallel deletes (different tables, no lock contention)
        await Promise.all([
          tx.documentEmbedding.deleteMany({ where: { documentId } }),
          tx.documentChunk.deleteMany({ where: { documentId } }),
        ]);

        // Insert new — parallel streams for embeddings and chunks
        const embeddingInserts = [];
        for (let i = 0; i < embeddingRecords.length; i += batchSize) {
          embeddingInserts.push(
            tx.documentEmbedding.createMany({
              data: embeddingRecords.slice(i, i + batchSize),
              skipDuplicates: true,
            })
          );
        }
        const chunkInserts = [];
        for (let i = 0; i < chunkRecords.length; i += batchSize) {
          chunkInserts.push(
            tx.documentChunk.createMany({
              data: chunkRecords.slice(i, i + batchSize),
              skipDuplicates: true,
            })
          );
        }
        await Promise.all([...embeddingInserts, ...chunkInserts]);
      }, { maxWait: 10000, timeout: txTimeout });

      await Promise.all([pineconePromise, postgresPromise]);

      console.log(
        `✅ [vectorEmbedding] Postgres ok: embeddings=${embeddingRecords.length}, chunks=${chunkRecords.length}`
      );

      // Success
      return;
    } catch (err: any) {
      lastErr = err;
      console.error(`❌ [vectorEmbedding] Attempt ${attempt} failed: ${err?.message || err}`);

      // Compensating rollback: if Pinecone succeeded but Postgres failed, delete Pinecone vectors.
      // (This prevents “search finds doc but DB says missing” drift.)
      try {
        if (pineconeUpserted && typeof pineconeService.deleteDocumentEmbeddings === 'function') {
          console.warn(`🔄 [vectorEmbedding] Rolling back Pinecone vectors for doc=${documentId}`);
          await pineconeService.deleteDocumentEmbeddings(documentId);
        }
      } catch (rollbackErr: any) {
        console.error(
          `❌ [vectorEmbedding] Rollback failed (doc may be inconsistent): ${rollbackErr?.message || rollbackErr}`
        );
      }

      if (attempt < maxRetries) {
        const backoff = Math.min(8000, 1000 * Math.pow(2, attempt)); // 2s,4s,8s capped
        console.log(`⏳ [vectorEmbedding] retrying in ${backoff}ms...`);
        await sleep(backoff);
      }
    }
  }

  throw new Error(
    `Failed to store embeddings for document ${documentId} after ${maxRetries} attempts: ${lastErr?.message || lastErr}`
  );
}

/**
 * Delete embeddings for a document from Pinecone + Postgres.
 */
export async function deleteDocumentEmbeddings(documentId: string): Promise<void> {
  if (!documentId) return;

  console.log(`🗑️ [vectorEmbedding] Deleting embeddings for doc=${documentId}`);

  // Best-effort Pinecone delete (don’t block doc deletion if it fails)
  try {
    if (typeof pineconeService.deleteDocumentEmbeddings === 'function') {
      await pineconeService.deleteDocumentEmbeddings(documentId);
    }
  } catch (e: any) {
    console.warn(`⚠️ [vectorEmbedding] Pinecone delete failed: ${e?.message || e}`);
  }

  // Postgres delete with configurable timeout for VPS
  const txTimeout = parseInt(process.env.PRISMA_TRANSACTION_TIMEOUT || '30000', 10);
  await prisma.$transaction(async (tx) => {
    await tx.documentEmbedding.deleteMany({ where: { documentId } });
    await tx.documentChunk.deleteMany({ where: { documentId } });
  }, { maxWait: 10000, timeout: txTimeout });

  console.log(`✅ [vectorEmbedding] Deleted Pinecone + Postgres rows for doc=${documentId}`);
}

/**
 * Optional chunk-level deletion (only meaningful if your DB schema supports chunk IDs and Pinecone IDs).
 * Keep as noop unless you implement per-chunk IDs.
 */
export async function deleteChunkEmbeddings(_chunkIds: string[]): Promise<void> {
  // Implement if you add stable per-chunk vector IDs and chunkId metadata in Pinecone.
  return;
}

export const vectorEmbeddingService = {
  generateEmbedding,
  storeDocumentEmbeddings,
  deleteDocumentEmbeddings,
  deleteChunkEmbeddings,
};

export default vectorEmbeddingService;
