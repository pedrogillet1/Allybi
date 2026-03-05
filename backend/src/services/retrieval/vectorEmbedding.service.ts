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

import { randomUUID, createHash } from "crypto";
import type { Prisma } from "@prisma/client";

import prisma from "../../config/database";
import { logger } from "../../utils/logger";
import { DocumentCryptoService } from "../documents/documentCrypto.service";
import { DocumentKeyService } from "../documents/documentKey.service";
import { EncryptionService } from "../security/encryption.service";
import { EnvelopeService } from "../security/envelope.service";
import { TenantKeyService } from "../security/tenantKey.service";
import embeddingService from "./embedding.service";
import { resolveIndexingPolicySnapshot } from "./indexingPolicy.service";
import pineconeService from "./pinecone.service";
import type { InputChunk as PipelineInputChunk } from "../ingestion/pipeline/pipelineTypes";
import {
  recordIndexingActiveOperationConflict,
  recordIndexingPlaintextSensitiveFieldViolation,
  recordIndexingQualityMetrics,
} from "../ingestion/pipeline/pipelineMetrics.service";

type JsonPrimitive = string | number | boolean | null;
type PineconeMetaValue = JsonPrimitive | string[];

export interface InputChunk extends Omit<PipelineInputChunk, "metadata"> {
  text?: string;
  embedding?: number[];
  metadata?: PipelineInputChunk["metadata"] & Record<string, any>;
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

const SAFE_STRUCTURAL_METADATA_KEYS = new Set<string>([
  "documentId",
  "versionId",
  "rootDocumentId",
  "parentVersionId",
  "isLatestVersion",
  "chunkType",
  "sourceType",
  "sectionId",
  "sectionName",
  "sectionLevel",
  "sectionPath",
  "sheetName",
  "tableChunkForm",
  "tableId",
  "rowIndex",
  "columnIndex",
  "cellRef",
  "periodYear",
  "periodMonth",
  "periodQuarter",
  "periodTokens",
  "scaleRaw",
  "scaleMultiplier",
  "startChar",
  "endChar",
  "pageNumber",
  "slideTitle",
  "hasNotes",
  "isFinancial",
  "ocrConfidence",
  "unitConsistencyWarning",
]);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildEmbeddingOperationId(documentId: string): string {
  const compactDocId = String(documentId || "").replace(/[^a-zA-Z0-9_-]/g, "");
  const suffix = randomUUID().slice(0, 8);
  return `op_${Date.now().toString(36)}_${compactDocId.slice(0, 12)}_${suffix}`;
}

let chunkEncryptionServicesSingleton: ChunkEncryptionServices | null = null;

function getChunkEncryptionServicesSafe(): ChunkEncryptionServices | null {
  if (chunkEncryptionServicesSingleton) return chunkEncryptionServicesSingleton;
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
    return chunkEncryptionServicesSingleton;
  } catch {
    return null; // don't cache failure — allow retry on next call
  }
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

function sanitizeStoredChunkMetadata(
  metadata: Record<string, any>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata || {})) {
    if (!SAFE_STRUCTURAL_METADATA_KEYS.has(key)) continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

function hasSensitivePlaintextMetadata(metadata: Record<string, any>): boolean {
  const candidateValues = [
    metadata.rowLabel,
    metadata.colHeader,
    metadata.valueRaw,
    metadata.unitRaw,
  ];
  for (const value of candidateValues) {
    if (typeof value === "string" && value.trim().length > 0) {
      return true;
    }
  }
  return false;
}

function toPrismaJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function serializeMetadata(value: unknown): string {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

function inferScaleSignal(metadata: Record<string, any>): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  if (typeof metadata.scaleRaw === "string" && metadata.scaleRaw.trim()) return true;
  const probe = [
    metadata.colHeader,
    metadata.rowLabel,
    metadata.valueRaw,
  ]
    .map((value) => String(value || ""))
    .join(" ")
    .toLowerCase();
  return /\b(bn|mn|mm|millions?|billions?|thousands?|k)\b|'\s*000/.test(probe);
}

function hasRequiredChunkMetadata(chunk: {
  pageNumber?: number;
  metadata?: Record<string, any>;
}): boolean {
  const metadata = chunk.metadata || {};
  const hasBase =
    typeof metadata.chunkType === "string" &&
    metadata.chunkType.trim().length > 0 &&
    typeof metadata.sourceType === "string" &&
    metadata.sourceType.trim().length > 0;
  if (!hasBase) return false;
  const sourceType = String(metadata.sourceType || "")
    .trim()
    .toLowerCase();
  const chunkType = String(metadata.chunkType || "")
    .trim()
    .toLowerCase();
  const pageLike =
    Number.isFinite(chunk.pageNumber) || Number.isFinite(metadata.pageNumber);
  const hasCellCoordinates =
    Number.isFinite(metadata.rowIndex) && Number.isFinite(metadata.columnIndex);
  const hasCellLabels = Boolean(metadata.rowLabel && metadata.colHeader);
  if (chunkType === "cell_fact") {
    return Boolean(metadata.tableId) && (Boolean(metadata.cellRef) || hasCellCoordinates || hasCellLabels);
  }

  if (sourceType === "pdf") {
    return Boolean(metadata.sectionId) && pageLike;
  }

  if (sourceType === "docx" || sourceType === "pptx") {
    return Boolean(metadata.sectionId);
  }

  if (sourceType === "xlsx") {
    const hasTableScope = Boolean(
      metadata.tableId || metadata.sheetName || metadata.sectionId,
    );
    if (!hasTableScope) return false;
    if (chunkType === "cell_fact") {
      return Boolean(
        metadata.cellRef ||
          Number.isFinite(metadata.rowIndex) ||
          Number.isFinite(metadata.columnIndex) ||
          (metadata.rowLabel && metadata.colHeader),
      );
    }
    return true;
  }

  return Boolean(
    metadata.sectionId ||
      metadata.tableId ||
      metadata.sheetName ||
      pageLike,
  );
}

function withCanonicalVersionMetadata(
  chunk: {
    chunkIndex: number;
    pageNumber?: number;
    content: string;
    embedding?: number[];
    metadata?: Record<string, any>;
  },
  canonical: {
    documentId: string;
    versionId: string;
    rootDocumentId: string;
    parentVersionId?: string;
    isLatestVersion: boolean;
  },
): {
  chunkIndex: number;
  pageNumber?: number;
  content: string;
  embedding?: number[];
  metadata: Record<string, any>;
} {
  return {
    ...chunk,
    metadata: {
      ...(chunk.metadata || {}),
      documentId: canonical.documentId,
      versionId: canonical.versionId,
      rootDocumentId: canonical.rootDocumentId,
      parentVersionId: canonical.parentVersionId,
      isLatestVersion: canonical.isLatestVersion,
    },
  };
}

function collectMissingMetadataIndices(
  chunks: Array<{ chunkIndex: number; pageNumber?: number; metadata?: Record<string, any> }>,
): number[] {
  const missing: number[] = [];
  for (const chunk of chunks) {
    if (!hasRequiredChunkMetadata(chunk)) {
      missing.push(chunk.chunkIndex);
    }
  }
  return missing;
}

function collectMissingVersionMetadataIndices(
  chunks: Array<{ chunkIndex: number; metadata?: Record<string, any> }>,
): number[] {
  const missing: number[] = [];
  for (const chunk of chunks) {
    const metadata = chunk.metadata || {};
    const hasVersionMetadata =
      typeof metadata.documentId === "string" &&
      metadata.documentId.trim().length > 0 &&
      typeof metadata.versionId === "string" &&
      metadata.versionId.trim().length > 0 &&
      typeof metadata.rootDocumentId === "string" &&
      metadata.rootDocumentId.trim().length > 0 &&
      typeof metadata.isLatestVersion === "boolean";
    if (!hasVersionMetadata) missing.push(chunk.chunkIndex);
  }
  return missing;
}

function pickMostRecentDocId(
  docs: Array<{ id: string; createdAt: Date }>,
  fallbackId: string,
): string {
  if (!docs.length) return fallbackId;
  const sorted = [...docs].sort((a, b) => {
    const createdDelta = b.createdAt.getTime() - a.createdAt.getTime();
    if (createdDelta !== 0) return createdDelta;
    return b.id.localeCompare(a.id);
  });
  return sorted[0]?.id || fallbackId;
}

async function resolveRootDocumentId(documentId: string): Promise<string> {
  let currentId: string | null = String(documentId || "").trim();
  let depth = 0;
  while (currentId && depth < 20) {
    depth += 1;
    const row: { id: string; parentVersionId: string | null } | null =
      await prisma.document.findUnique({
      where: { id: currentId },
      select: { id: true, parentVersionId: true },
      });
    if (!row) return String(documentId || "").trim();
    if (!row.parentVersionId) return row.id;
    currentId = row.parentVersionId;
  }
  return String(documentId || "").trim();
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
  const indexingPolicy = resolveIndexingPolicySnapshot();
  const {
    maxRetries = 3,
    verifyAfterStore = false,
    batchSize = 100,
    minContentChars = 8,
    strictVerify = indexingPolicy.strictFailClosed,
    preDeleteVectors = true,
    encryptionMode = indexingPolicy.encryptedChunksOnly
      ? "encrypted_only"
      : "plaintext",
  } = options;
  const strictFailClosed = indexingPolicy.strictFailClosed;
  const enforceEncryptedOnlyInvariant =
    indexingPolicy.enforceEncryptedOnlyInvariant;
  const enforceChunkMetadataInvariant =
    indexingPolicy.enforceChunkMetadataInvariant;
  const enforceVersionMetadataInvariant =
    indexingPolicy.enforceVersionMetadataInvariant;

  if (!documentId) throw new Error("documentId is required");
  if (!chunks || chunks.length === 0) {
    throw new Error(`CRITICAL: No chunks provided for document ${documentId}`);
  }
  if (
    enforceEncryptedOnlyInvariant &&
    indexingPolicy.encryptedChunksOnly &&
    encryptionMode !== "encrypted_only"
  ) {
    throw new Error(
      "INDEXING_ENCRYPTED_CHUNKS_ONLY is enabled; plaintext embedding mode is not allowed.",
    );
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

  const operationId = buildEmbeddingOperationId(documentId);
  const indexedAtMs = Date.now();
  const rootDocumentId = await resolveRootDocumentId(document.id);
  const familyDocs = await prisma.document.findMany({
    where: {
      userId: document.userId,
      OR: [{ id: rootDocumentId }, { parentVersionId: rootDocumentId }],
    },
    select: {
      id: true,
      createdAt: true,
    },
  });
  const latestVersionId = pickMostRecentDocId(familyDocs, document.id);
  const isLatestVersion = latestVersionId === document.id;
  const canonicalVersionMetadata = {
    documentId: document.id,
    versionId: document.id,
    rootDocumentId,
    parentVersionId: document.parentVersionId || undefined,
    isLatestVersion,
  };
  const sharedIndexingMetadata = {
    operationId,
    indexedAtMs,
    ...canonicalVersionMetadata,
  };

  // De-dupe chunkIndex to avoid DB uniqueness conflicts (and Pinecone id collisions)
  const usableChunks = dedupeByChunkIndex(normalized).map((chunk) =>
    withCanonicalVersionMetadata(chunk, canonicalVersionMetadata),
  );
  const missingMetadataChunkIndices = collectMissingMetadataIndices(usableChunks);
  const missingVersionMetadataChunkIndices =
    collectMissingVersionMetadataIndices(usableChunks);

  const metadataTotal = usableChunks.length;
  const metadataComplete = metadataTotal - missingMetadataChunkIndices.length;
  const scaleDetected = usableChunks.filter((chunk) =>
    inferScaleSignal(chunk.metadata || {}),
  ).length;
  const scaleCaptured = usableChunks.filter((chunk) => {
    const metadata = chunk.metadata || {};
    return (
      inferScaleSignal(metadata) &&
      typeof metadata.scaleRaw === "string" &&
      metadata.scaleRaw.trim().length > 0 &&
      typeof metadata.scaleMultiplier === "number" &&
      Number.isFinite(metadata.scaleMultiplier)
    );
  }).length;
  const encryptionExpected = indexingPolicy.encryptedChunksOnly;
  const encryptionTotal = usableChunks.length;
  const encryptionCompliant = encryptionExpected
    ? encryptionMode === "encrypted_only"
      ? encryptionTotal
      : 0
    : encryptionTotal;
  recordIndexingQualityMetrics({
    metadataComplete,
    metadataTotal,
    scaleDetected,
    scaleCaptured,
    encryptionCompliant,
    encryptionTotal,
  });
  if (enforceChunkMetadataInvariant && missingMetadataChunkIndices.length > 0) {
    const sample = missingMetadataChunkIndices.slice(0, 10).join(",");
    throw new Error(
      `Chunk metadata invariant failed for document ${documentId}. Missing required locator metadata on chunk indexes: ${sample}${missingMetadataChunkIndices.length > 10 ? ",..." : ""}`,
    );
  }
  if (
    enforceVersionMetadataInvariant &&
    missingVersionMetadataChunkIndices.length > 0
  ) {
    const sample = missingVersionMetadataChunkIndices.slice(0, 10).join(",");
    throw new Error(
      `Chunk version metadata invariant failed for document ${documentId}. Missing canonical version metadata on chunk indexes: ${sample}${missingVersionMetadataChunkIndices.length > 10 ? ",..." : ""}`,
    );
  }

  // Generate embeddings for chunks that don't have them (true batch for efficiency)
  const needsEmbedding = usableChunks.filter(
    (c) => !c.embedding || c.embedding.length === 0,
  );

  const previousOperationId = document.indexingOperationId ?? null;
  const claim = await prisma.document.updateMany({
    where: {
      id: documentId,
      indexingOperationId: previousOperationId,
    } as any,
    data: {
      indexingOperationId: operationId,
      indexingError: null,
      indexingUpdatedAt: new Date(indexedAtMs),
    },
  });
  if ((claim as any)?.count !== 1) {
    recordIndexingActiveOperationConflict();
    throw new Error(
      `Concurrent indexing operation detected for document ${documentId}. Expected previous operation ${previousOperationId ?? "null"}.`,
    );
  }

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
      if (indexingPolicy.embeddingFailCloseV1) {
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
        content: encryptionMode === "encrypted_only" ? "" : c.content,
        embedding: c.embedding || [],
        metadata: {
          ...(encryptionMode === "encrypted_only"
            ? sanitizeStoredChunkMetadata(c.metadata || {})
            : (c.metadata || {})),
          ...sharedIndexingMetadata,
          ...(encryptionMode === "encrypted_only"
            ? { contentHash: createHash("sha256").update(c.content).digest("hex") }
            : {}),
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
      const stripSensitivePlaintext = encryptionMode === "encrypted_only";
      const sensitivePlaintextViolationCount = stripSensitivePlaintext
        ? usableChunks.reduce((count, chunk) => {
            return count +
              (hasSensitivePlaintextMetadata(chunk.metadata || {}) ? 1 : 0);
          }, 0)
        : 0;
      if (sensitivePlaintextViolationCount > 0) {
        recordIndexingPlaintextSensitiveFieldViolation(
          sensitivePlaintextViolationCount,
        );
      }
      const chunkRecords = usableChunks.map((c) => {
        const id = randomUUID();
        const plaintext = c.content;
        const metadata = c.metadata || {};
        const storedMetadata =
          encryptionMode === "encrypted_only"
            ? sanitizeStoredChunkMetadata(metadata)
            : metadata;
        const metadataJson = toPrismaJsonValue(storedMetadata);
        const metadataEncrypted =
          encryptionMode === "encrypted_only"
            ? chunkEncryptors!.docCrypto.encryptChunkText(
                document.userId,
                documentId,
                `${id}:meta`,
                serializeMetadata(metadata),
                documentKey!,
              )
            : null;
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
          indexingOperationId: operationId,
          isActive: true,
          chunkIndex: c.chunkIndex,
          text: encryptionMode === "encrypted_only" ? null : plaintext,
          textEncrypted,
          page: c.pageNumber ?? c.metadata?.pageNumber ?? null,
          sectionId: metadata.sectionId || null,
          startChar: c.metadata?.startChar ?? null,
          endChar: c.metadata?.endChar ?? null,
          sectionName: metadata.sectionName || null,
          sheetName: metadata.sheetName || null,
          tableChunkForm: metadata.tableChunkForm || null,
          tableId: metadata.tableId || null,
          rowIndex:
            typeof metadata.rowIndex === "number" ? metadata.rowIndex : null,
          columnIndex:
            typeof metadata.columnIndex === "number"
              ? metadata.columnIndex
              : null,
          rowLabel: stripSensitivePlaintext ? null : metadata.rowLabel || null,
          colHeader: stripSensitivePlaintext ? null : metadata.colHeader || null,
          valueRaw:
            stripSensitivePlaintext ? null : metadata.valueRaw || null,
          unitRaw:
            stripSensitivePlaintext ? null : metadata.unitRaw || null,
          unitNormalized:
            stripSensitivePlaintext
              ? null
              : metadata.unitNormalized || null,
          numericValue:
            stripSensitivePlaintext
              ? null
              : typeof metadata.numericValue === "number"
                ? metadata.numericValue
                : null,
          scaleRaw: metadata.scaleRaw || null,
          scaleMultiplier:
            typeof metadata.scaleMultiplier === "number"
              ? metadata.scaleMultiplier
              : null,
          chunkType: metadata.chunkType || null,
          sectionLevel:
            typeof metadata.sectionLevel === "number"
              ? metadata.sectionLevel
              : null,
          sourceType: metadata.sourceType || null,
          ocrConfidence:
            typeof metadata.ocrConfidence === "number"
              ? metadata.ocrConfidence
              : null,
          metadata: metadataJson,
          metadataEncrypted,
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
      // Keep chunk history append-only by deactivating previous active rows.
      const txTimeout = parseInt(
        process.env.PRISMA_TRANSACTION_TIMEOUT || "120000",
        10,
      );
      await prisma.$transaction(
        async (tx) => {
          await tx.documentChunk.updateMany({
            where: {
              documentId,
              isActive: true,
              NOT: { indexingOperationId: operationId },
            } as any,
            data: { isActive: false } as any,
          });
          const chunkInserts = [];
          for (let i = 0; i < chunkRecords.length; i += batchSize) {
            chunkInserts.push(
              tx.documentChunk.createMany({
                data: chunkRecords.slice(i, i + batchSize) as any,
                skipDuplicates: true,
              }),
            );
          }
          await Promise.all(chunkInserts);
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
        const dbChunkCount = await prisma.documentChunk.count({
          where: {
            documentId,
            isActive: true,
            indexingOperationId: operationId,
          } as any,
        });
        if (dbChunkCount !== usableChunks.length) {
          throw new Error(
            `[vectorEmbedding] DB verification mismatch for ${documentId}: chunks=${dbChunkCount}, expected=${usableChunks.length}`,
          );
        }
      }

      await prisma.document.update({
        where: { id: documentId },
        data: {
          // DO NOT set status — pipeline handles it via DocumentStateManager
          chunksCount: usableChunks.length,
          embeddingsGenerated: true,
          indexingOperationId: operationId,
          indexingError: null,
          indexingUpdatedAt: new Date(),
        },
      });

      logger.info("[vectorEmbedding] Postgres ok", {
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

  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { userId: true },
  });
  const userId = String(doc?.userId || "").trim();

  // Best-effort Pinecone delete (don’t block doc deletion if it fails)
  try {
    if (
      userId &&
      typeof pineconeService.deleteDocumentEmbeddings === "function"
    ) {
      await pineconeService.deleteDocumentEmbeddings(documentId, { userId });
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

