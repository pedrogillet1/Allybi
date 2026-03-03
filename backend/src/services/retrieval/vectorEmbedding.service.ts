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

import { randomUUID } from "crypto";

import prisma from "../../config/database";
import { logger } from "../../utils/logger";
import { DocumentCryptoService } from "../documents/documentCrypto.service";
import { DocumentKeyService } from "../documents/documentKey.service";
import { EncryptionService } from "../security/encryption.service";
import { EnvelopeService } from "../security/envelope.service";
import { TenantKeyService } from "../security/tenantKey.service";
import embeddingService from "./embedding.service";
import pineconeService from "./pinecone.service";

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
  maxRetries?: number; // default: 3
  verifyAfterStore?: boolean; // default: false (adds latency)
  batchSize?: number; // default: 100
  minContentChars?: number; // default: 8 (skip useless chunks)
  strictVerify?: boolean; // default: true
  preDeleteVectors?: boolean; // default: true
  encryptionMode?: "encrypted_only" | "plaintext";
}

interface ChunkEncryptionServices {
  docKeys: DocumentKeyService;
  docCrypto: DocumentCryptoService;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isFlagEnabled(flagName: string, defaultValue: boolean): boolean {
  const raw = String(process.env[flagName] || "")
    .trim()
    .toLowerCase();
  if (!raw) return defaultValue;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return defaultValue;
}

function buildEmbeddingOperationId(documentId: string): string {
  const compactDocId = String(documentId || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const suffix = randomUUID().slice(0, 8);
  return `op_${Date.now().toString(36)}_${compactDocId.slice(0, 12)}_${suffix}`;
}

let chunkEncryptionServicesSingleton:
  | ChunkEncryptionServices
  | null
  | undefined;

function getChunkEncryptionServicesSafe(): ChunkEncryptionServices | null {
  if (chunkEncryptionServicesSingleton !== undefined)
    return chunkEncryptionServicesSingleton;
  try {
    const encryption = new EncryptionService();
    const envelope = new EnvelopeService(encryption);
    const tenantKeys = new TenantKeyService(prisma as any, encryption);
    const docKeys = new DocumentKeyService(
      prisma as any,
      encryption,
      tenantKeys,
      envelope,
    );
    const docCrypto = new DocumentCryptoService(encryption);
    chunkEncryptionServicesSingleton = { docKeys, docCrypto };
  } catch {
    chunkEncryptionServicesSingleton = null;
  }
  return chunkEncryptionServicesSingleton;
}

/**
 * Pinecone only accepts: string | number | boolean | string[]
 * and rejects null/undefined and objects.
 */
function sanitizePineconeMetadata(
  obj: Record<string, any>,
): Record<string, PineconeMetaValue> {
  const out: Record<string, PineconeMetaValue> = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null) continue;

    if (
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean"
    ) {
      out[k] = v;
      continue;
    }

    if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
      out[k] = v as string[];
      continue;
    }

    // Skip objects/arrays of objects/functions/etc.
  }
  return out;
}

function normalizeChunk(
  raw: InputChunk,
  fallbackIndex: number,
  minContentChars: number,
) {
  const chunkIndex = Number.isFinite(raw.chunkIndex)
    ? (raw.chunkIndex as number)
    : fallbackIndex;
  const pageNumber = Number.isFinite(raw.pageNumber)
    ? (raw.pageNumber as number)
    : undefined;

  // Strip null bytes (0x00) — PostgreSQL rejects them in text columns (error 22021)
  const content = (raw.content ?? raw.text ?? "").replace(/\0/g, "").trim();
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
  options: StoreEmbeddingsOptions = {},
): Promise<void> {
  const {
    maxRetries = 3,
    verifyAfterStore = false,
    batchSize = 100,
    minContentChars = 8,
    strictVerify = isFlagEnabled("INDEXING_STRICT_FAIL_CLOSED", true),
    preDeleteVectors = true,
    encryptionMode = isFlagEnabled("INDEXING_ENCRYPTED_CHUNKS_ONLY", true)
      ? "encrypted_only"
      : "plaintext",
  } = options;
  const strictFailClosed = isFlagEnabled("INDEXING_STRICT_FAIL_CLOSED", true);

  if (!documentId) throw new Error("documentId is required");
  if (!chunks || chunks.length === 0) {
    throw new Error(`CRITICAL: No chunks provided for document ${documentId}`);
  }

  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: { folder: true },
  });
  if (!document) {
    throw new Error(`Document not found: ${documentId}`);
  }

  // Normalize + drop empty/useless chunks early
  const normalized = chunks
    .map((c, i) => normalizeChunk(c, i, minContentChars))
    .filter((c) => c.isUsable);

  if (normalized.length === 0) {
    throw new Error(
      `CRITICAL: All chunks were empty/too-short for document ${documentId}. Nothing to index.`,
    );
  }

  // De-dupe chunkIndex to avoid DB uniqueness conflicts (and Pinecone id collisions)
  const usableChunks = dedupeByChunkIndex(normalized);

  // Generate embeddings for chunks that don't have them (true batch for efficiency)
  const needsEmbedding = usableChunks.filter(
    (c) => !c.embedding || c.embedding.length === 0,
  );
  const operationId = buildEmbeddingOperationId(documentId);
  const indexedAtMs = Date.now();

  await prisma.document.update({
    where: { id: documentId },
    data: {
      indexingState: "running",
      indexingOperationId: operationId,
      indexingError: null,
      indexingUpdatedAt: new Date(indexedAtMs),
    },
  });

  if (needsEmbedding.length > 0) {
    logger.info("[vectorEmbedding] Generating embeddings", {
      needsEmbedding: needsEmbedding.length,
      totalChunks: usableChunks.length,
      documentId,
    });
    // Use true batch API — sends all texts in one OpenAI call (up to 256 per batch)
    const texts = needsEmbedding.map((c) => c.content);
    const batchResult = await embeddingService.generateBatchEmbeddings(texts);
    if (batchResult.failedCount > 0) {
      const failClose = isFlagEnabled("EMBEDDING_FAILCLOSE_V1", true);
      if (failClose) {
        throw new Error(
          `Embedding generation failed for ${batchResult.failedCount}/${batchResult.totalProcessed} chunks`,
        );
      }
    }
    for (let j = 0; j < needsEmbedding.length; j++) {
      const emb = batchResult.embeddings[j];
      needsEmbedding[j].embedding = emb?.embedding || [];
    }
    logger.info("[vectorEmbedding] Embeddings generated", {
      totalProcessed: batchResult.totalProcessed,
      failedCount: batchResult.failedCount,
      processingTimeMs: batchResult.processingTime,
    });
  }

  let lastErr: any = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let pineconeUpserted = false;

    try {
      logger.info("[vectorEmbedding] Storing chunks", {
        chunkCount: usableChunks.length,
        documentId,
        attempt,
        maxRetries,
      });

      // 1) Prepare Pinecone vectors
      const pineconeAvailable =
        typeof pineconeService.isAvailable === "function"
          ? pineconeService.isAvailable()
          : true;
      if (strictFailClosed && !pineconeAvailable) {
        throw new Error(
          "Pinecone unavailable in strict indexing mode; aborting index operation.",
        );
      }

      const documentMetadata = {
        filename: document.filename ?? "unknown",
        originalName: document.filename ?? "unknown",
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
        metadata: {
          ...(c.metadata || {}),
          operationId,
          indexedAtMs,
        },
      }));

      // 2) Pre-delete old vectors to prevent stale tails after shrink reindex.
      if (
        preDeleteVectors &&
        pineconeAvailable &&
        typeof pineconeService.deleteDocumentEmbeddings === "function"
      ) {
        await pineconeService.deleteDocumentEmbeddings(documentId, {
          userId: document.userId,
        });
      }

      // 3) Prepare Postgres records (compute upfront, before async I/O).
      const embeddingRecords = usableChunks.map((c) => ({
        documentId,
        chunkIndex: c.chunkIndex,
        content: c.content,
        embedding: JSON.stringify(c.embedding || []),
        userId: document.userId,
        pageNumber: c.pageNumber ?? c.metadata?.pageNumber ?? null,
        chunkText: c.content.slice(0, 4000),
        metadata: JSON.stringify({
          ...(c.metadata || {}),
          operationId,
          indexedAtMs,
        }),
        chunkType: c.metadata?.chunkType || null,
        embeddingModel:
          process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
        updatedAt: new Date(indexedAtMs),
      }));

      const chunkEncryptors =
        encryptionMode === "encrypted_only"
          ? getChunkEncryptionServicesSafe()
          : null;
      if (encryptionMode === "encrypted_only" && !chunkEncryptors) {
        throw new Error(
          "Chunk encryption services unavailable while INDEXING_ENCRYPTED_CHUNKS_ONLY is enabled.",
        );
      }
      const documentKey =
        encryptionMode === "encrypted_only"
          ? await chunkEncryptors!.docKeys.getDocumentKey(
              document.userId,
              documentId,
            )
          : null;
      const chunkRecords = usableChunks.map((c) => {
        const id = randomUUID();
        const plaintext = c.content;
        const textEncrypted =
          encryptionMode === "encrypted_only"
            ? chunkEncryptors!.docCrypto.encryptChunkText(
                document.userId,
                documentId,
                id,
                plaintext,
                documentKey!,
              )
            : null;
        return {
          id,
          documentId,
          chunkIndex: c.chunkIndex,
          text: encryptionMode === "encrypted_only" ? null : plaintext,
          textEncrypted,
          page: c.pageNumber ?? c.metadata?.pageNumber ?? null,
          startChar: c.metadata?.startChar ?? null,
          endChar: c.metadata?.endChar ?? null,
        };
      });

      // Pinecone upsert FIRST (idempotent — same IDs overwrite).
      // This ensures Pinecone vectors exist before Postgres rows reference them,
      // eliminating the window where chunks exist in Postgres without Pinecone vectors.
      if (pineconeAvailable) {
        await pineconeService.upsertDocumentEmbeddings(
          documentId,
          document.userId,
          documentMetadata,
          pineconeChunks.map((c) => ({
            chunkIndex: c.chunkIndex,
            content: c.content,
            embedding: c.embedding,
            metadata: sanitizePineconeMetadata(c.metadata || {}),
          })),
        );
        pineconeUpserted = true;
        logger.info("[vectorEmbedding] Pinecone upsert ok", {
          chunkCount: usableChunks.length,
          documentId,
        });
      }

      // Postgres tx SECOND — if this fails, compensating rollback deletes Pinecone vectors.
      const txTimeout = parseInt(
        process.env.PRISMA_TRANSACTION_TIMEOUT || "120000",
        10,
      );
      await prisma.$transaction(
        async (tx) => {
          // Clear old — parallel deletes (different tables, no lock contention).
          await Promise.all([
            tx.documentEmbedding.deleteMany({ where: { documentId } }),
            tx.documentChunk.deleteMany({ where: { documentId } }),
          ]);

          // Insert new — parallel streams for embeddings and chunks.
          const embeddingInserts = [];
          for (let i = 0; i < embeddingRecords.length; i += batchSize) {
            embeddingInserts.push(
              tx.documentEmbedding.createMany({
                data: embeddingRecords.slice(i, i + batchSize),
              }),
            );
          }
          const chunkInserts = [];
          for (let i = 0; i < chunkRecords.length; i += batchSize) {
            chunkInserts.push(
              tx.documentChunk.createMany({
                data: chunkRecords.slice(i, i + batchSize),
              }),
            );
          }
          await Promise.all([...embeddingInserts, ...chunkInserts]);
        },
        { maxWait: 10000, timeout: txTimeout },
      );

      if (
        pineconeAvailable &&
        (verifyAfterStore || strictVerify) &&
        typeof pineconeService.verifyDocumentEmbeddings === "function"
      ) {
        const verifyResult = await pineconeService.verifyDocumentEmbeddings(
          documentId,
          {
            userId: document.userId,
            minCount: usableChunks.length,
            expectedCount: usableChunks.length,
            topK: Math.max(usableChunks.length + 20, 1000),
          },
        );
        if (!verifyResult.success) {
          throw new Error(
            `[vectorEmbedding] verification failed for document ${documentId}: ${verifyResult.message}`,
          );
        }
      }

      if (verifyAfterStore || strictVerify) {
        const [dbEmbeddingCount, dbChunkCount] = await Promise.all([
          prisma.documentEmbedding.count({ where: { documentId } }),
          prisma.documentChunk.count({ where: { documentId } }),
        ]);
        if (
          dbEmbeddingCount !== usableChunks.length ||
          dbChunkCount !== usableChunks.length
        ) {
          throw new Error(
            `[vectorEmbedding] DB verification mismatch for ${documentId}: embeddings=${dbEmbeddingCount}, chunks=${dbChunkCount}, expected=${usableChunks.length}`,
          );
        }
      }

      await prisma.document.update({
        where: { id: documentId },
        data: {
          status: "indexed",
          chunksCount: usableChunks.length,
          embeddingsGenerated: true,
          indexingState: "indexed",
          indexingOperationId: operationId,
          indexingError: null,
          indexingUpdatedAt: new Date(),
        },
      });

      logger.info("[vectorEmbedding] Postgres ok", {
        embeddings: embeddingRecords.length,
        chunks: chunkRecords.length,
        documentId,
      });

      // Success
      return;
    } catch (err: any) {
      lastErr = err;
      logger.error("[vectorEmbedding] Attempt failed", {
        attempt,
        documentId,
        error: err?.message || String(err),
      });

      // Compensating rollback: if Pinecone upsert happened in this attempt, remove vectors by op.
      try {
        if (pineconeUpserted) {
          logger.warn("[vectorEmbedding] Rolling back Pinecone vectors", {
            documentId,
            operationId,
          });
          if (
            typeof pineconeService.deleteEmbeddingsByOperationId === "function"
          ) {
            await pineconeService.deleteEmbeddingsByOperationId(
              documentId,
              operationId,
              { userId: document.userId },
            );
          } else if (
            typeof pineconeService.deleteDocumentEmbeddings === "function"
          ) {
            await pineconeService.deleteDocumentEmbeddings(documentId, {
              userId: document.userId,
            });
          }
        }
      } catch (rollbackErr: any) {
        logger.error("[vectorEmbedding] Rollback failed (doc may be inconsistent)", {
          documentId,
          operationId,
          error: rollbackErr?.message || String(rollbackErr),
        });
      }

      if (attempt < maxRetries) {
        const backoff = Math.min(8000, 1000 * Math.pow(2, attempt)); // 2s,4s,8s capped
        logger.info("[vectorEmbedding] Retrying", { backoffMs: backoff, attempt, documentId });
        await sleep(backoff);
      }
    }
  }

  const terminalMessage = String(
    lastErr?.message || lastErr || "Indexing failed",
  );
  const failureData: Record<string, unknown> = {
    indexingState: "failed",
    indexingOperationId: operationId,
    indexingError: terminalMessage.slice(0, 500),
    indexingUpdatedAt: new Date(),
  };
  if (strictFailClosed) failureData.status = "failed";
  try {
    await prisma.document.update({
      where: { id: documentId },
      data: failureData,
    });
  } catch {
    // best effort: document may have been deleted during retries.
  }

  throw new Error(
    `Failed to store embeddings for document ${documentId} after ${maxRetries} attempts: ${terminalMessage}`,
  );
}

/**
 * Delete embeddings for a document from Pinecone + Postgres.
 */
export async function deleteDocumentEmbeddings(
  documentId: string,
): Promise<void> {
  if (!documentId) return;

  logger.info("[vectorEmbedding] Deleting embeddings", { documentId });

  // Best-effort Pinecone delete (don’t block doc deletion if it fails)
  try {
    if (typeof pineconeService.deleteDocumentEmbeddings === "function") {
      await pineconeService.deleteDocumentEmbeddings(documentId);
    }
  } catch (e: any) {
    logger.warn("[vectorEmbedding] Pinecone delete failed", {
      documentId,
      error: e?.message || String(e),
    });
  }

  // Postgres delete with configurable timeout for VPS (default 2 minutes)
  const txTimeout = parseInt(
    process.env.PRISMA_TRANSACTION_TIMEOUT || "120000",
    10,
  );
  await prisma.$transaction(
    async (tx) => {
      await tx.documentEmbedding.deleteMany({ where: { documentId } });
      await tx.documentChunk.deleteMany({ where: { documentId } });
    },
    { maxWait: 10000, timeout: txTimeout },
  );

  logger.info("[vectorEmbedding] Deleted Pinecone + Postgres rows", { documentId });
}

/**
 * Optional chunk-level deletion (only meaningful if your DB schema supports chunk IDs and Pinecone IDs).
 * Keep as noop unless you implement per-chunk IDs.
 */
export async function deleteChunkEmbeddings(
  _chunkIds: string[],
): Promise<void> {
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
