// src/services/retrieval/pinecone.service.ts
import { Pinecone } from "@pinecone-database/pinecone";
import {
  buildDocumentDeleteFilter,
  buildOperationDeleteFilter,
  buildScopedFilter,
  buildSheetFilter,
  buildSlideFilter,
} from "./pinecone/pinecone.filters";
import {
  hasNonZeroVector,
  makeVectorId,
  sanitizePineconeMetadata,
  toIsoString,
} from "./pinecone/pinecone.metadata";
import { mapPineconeMatchesToHits } from "./pinecone/pinecone.mappers";
import type {
  PineconeIndexClient,
  PineconeFilter,
  PineconeMetadata,
  PineconeQueryMatch,
  PineconeVector,
} from "./pinecone/pinecone.types";

export interface DocumentMetadataForPinecone {
  filename: string;
  mimeType: string;
  createdAt: Date | string;
  status: string;

  // Optional hierarchy metadata
  originalName?: string;
  categoryId?: string;
  categoryName?: string;
  categoryEmoji?: string;
  folderId?: string;
  folderName?: string;
  folderPath?: string;

  // Optional helpful fields
  title?: string;
  uploadedAt?: Date | string;
  docType?: string;
}

export interface ChunkForPineconeUpsert {
  chunkIndex: number;
  content: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
}

export interface PineconeSearchHit {
  documentId: string;
  chunkIndex: number;
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
  document: {
    id: string;
    filename: string;
    mimeType: string;
    createdAt: string;
    status: string;
    folderId?: string;
    folderPath?: string;
    categoryId?: string;
  };
}

export interface PineconeQueryOptions {
  userId: string;
  topK?: number;
  minSimilarity?: number;
  documentId?: string; // hard filter to one doc
  folderId?: string; // hard filter to one folder
}

export class PineconeService {
  private pc: Pinecone | null = null;
  private initPromise: Promise<void> | null = null;

  private readonly indexName: string;
  private readonly dimension: number;
  private readonly defaultTopK: number;
  private readonly defaultMinSimilarity: number;
  private readonly upsertBatchSize: number;
  private readonly deleteBatchSize: number;

  constructor() {
    this.indexName = process.env.PINECONE_INDEX_NAME || "koda-openai";
    this.dimension = Number(process.env.PINECONE_DIMENSION || 1536);
    this.defaultTopK = Number(process.env.PINECONE_DEFAULT_TOPK || 10);
    this.defaultMinSimilarity = Number(
      process.env.PINECONE_DEFAULT_MIN_SIMILARITY || 0.3,
    );
    // Increased from 100 to 200 for better throughput on large document batches
    this.upsertBatchSize = Number(
      process.env.PINECONE_UPSERT_BATCH_SIZE || 200,
    );
    this.deleteBatchSize = Number(
      process.env.PINECONE_DELETE_BATCH_SIZE || 1000,
    );
  }

  private async ensureInit(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const apiKey = process.env.PINECONE_API_KEY;
      if (!apiKey) {
        this.pc = null;
        return;
      }
      this.pc = new Pinecone({ apiKey });
    })();

    return this.initPromise;
  }

  isAvailable(): boolean {
    return !!process.env.PINECONE_API_KEY;
  }

  private getIndex(): PineconeIndexClient {
    if (!this.pc) throw new Error("Pinecone client not initialized");
    return this.pc.index(this.indexName) as unknown as PineconeIndexClient;
  }

  private assertVectorDim(vec: number[], label: string): void {
    if (!Array.isArray(vec) || vec.length === 0) {
      throw new Error(`[Pinecone] ${label} embedding is empty`);
    }
    if (vec.length !== this.dimension) {
      throw new Error(
        `[Pinecone] ${label} embedding dim mismatch: got ${vec.length}, expected ${this.dimension}. ` +
          `Set PINECONE_DIMENSION to match your index.`,
      );
    }
  }

  /** Pinecone rejects all-zero dense vectors. Use a stable non-zero vector for metadata-only queries. */
  private makeDummyNonZeroVector(): number[] {
    const v = new Array(this.dimension).fill(0);
    v[0] = 1;
    return v;
  }

  private makeVectorId(documentId: string, chunkIndex: number): string {
    return makeVectorId(documentId, chunkIndex);
  }

  private toIso(d: Date | string | undefined): string | undefined {
    return toIsoString(d);
  }

  /**
   * Pinecone metadata accepts only primitives and string arrays.
   * - Drops null/undefined
   * - Converts arrays of non-primitives into strings
   * - Converts objects into JSON strings (truncated)
   */
  private sanitizeMetadata(
    obj: Record<string, unknown>,
    maxJsonChars = 2000,
  ): PineconeMetadata {
    return sanitizePineconeMetadata(obj, maxJsonChars);
  }

  private hasNonZero(vec: number[]): boolean {
    return hasNonZeroVector(vec);
  }

  // ─────────────────────────────────────────────────────────────
  // UPSERT
  // ─────────────────────────────────────────────────────────────

  async upsertDocumentEmbeddings(
    documentId: string,
    userId: string,
    document: DocumentMetadataForPinecone,
    chunks: ChunkForPineconeUpsert[],
  ): Promise<{ upserted: number; skipped: number }> {
    await this.ensureInit();
    if (!this.isAvailable()) return { upserted: 0, skipped: chunks.length };

    const index = this.getIndex();

    const createdAt =
      this.toIso(document.createdAt) || new Date().toISOString();
    const uploadedAt = this.toIso(document.uploadedAt);

    const vectors: PineconeVector[] = [];
    let skipped = 0;

    for (const c of chunks) {
      if (!c.embedding || !this.hasNonZero(c.embedding)) {
        skipped++;
        continue;
      }

      this.assertVectorDim(c.embedding, `chunk ${c.chunkIndex}`);

      // Keep content in metadata (for fast retrieval), but cap size
      const content = (c.content || "").slice(0, 5000);

      const meta = this.sanitizeMetadata({
        // scoping
        userId,
        documentId,

        // doc metadata
        filename: document.filename,
        originalName: document.originalName,
        title: document.title,
        mimeType: document.mimeType,
        status: document.status,
        createdAt,
        uploadedAt,
        docType: document.docType,

        categoryId: document.categoryId,
        categoryName: document.categoryName,
        categoryEmoji: document.categoryEmoji,
        folderId: document.folderId,
        folderName: document.folderName,
        folderPath: document.folderPath,

        // chunk metadata
        chunkIndex: c.chunkIndex,
        content,

        // embedding model tracking (for consistency verification)
        embeddingModel:
          c.metadata?.embeddingModel ||
          process.env.OPENAI_EMBEDDING_MODEL ||
          "text-embedding-3-small",
        embeddingDim: c.metadata?.embeddingDim || this.dimension,

        // extra extraction metadata (pageStart/pageEnd/sheetName/cellRange/etc.)
        ...(c.metadata || {}),
      });

      vectors.push({
        id: this.makeVectorId(documentId, c.chunkIndex),
        values: c.embedding,
        metadata: meta,
      });
    }

    if (vectors.length === 0) {
      throw new Error(
        `[Pinecone] All embeddings invalid (empty or all-zero). ` +
          `Upsert aborted for document ${documentId}.`,
      );
    }

    // batch upsert — parallel for throughput
    const upsertBatches: PineconeVector[][] = [];
    for (let i = 0; i < vectors.length; i += this.upsertBatchSize) {
      upsertBatches.push(vectors.slice(i, i + this.upsertBatchSize));
    }
    await Promise.all(upsertBatches.map((batch) => index.upsert(batch)));

    return { upserted: vectors.length, skipped };
  }

  // ─────────────────────────────────────────────────────────────
  // QUERY
  // ─────────────────────────────────────────────────────────────

  async searchSimilarChunks(
    queryEmbedding: number[],
    userId: string,
    topK = this.defaultTopK,
    minSimilarity = this.defaultMinSimilarity,
    attachedDocumentId?: string,
    folderId?: string,
  ): Promise<PineconeSearchHit[]> {
    await this.ensureInit();
    if (!this.isAvailable()) return [];

    this.assertVectorDim(queryEmbedding, "query");

    const index = this.getIndex();

    const filter: PineconeFilter = this.buildFilter({
      userId,
      documentId: attachedDocumentId,
      folderId,
    });

    const res = await index.query({
      vector: queryEmbedding,
      topK,
      includeMetadata: true,
      filter,
    });

    const matches = Array.isArray(res?.matches) ? res.matches : [];
    const hits: PineconeSearchHit[] = [];

    for (const m of matches) {
      const score = Number(m?.score || 0);
      if (score < minSimilarity) continue;

      const md = (m?.metadata || {}) as Record<string, unknown>;
      const documentId = String(md.documentId || "");
      if (!documentId) continue;

      // Soft filter out deleted docs purely from Pinecone metadata (no DB call)
      const status = String(md.status || "active");
      if (status === "deleted") continue;

      hits.push({
        documentId,
        chunkIndex: Number(md.chunkIndex ?? -1),
        content: String(md.content || ""),
        similarity: score,
        metadata: md,
        document: {
          id: documentId,
          filename: String(md.filename || ""),
          mimeType: String(md.mimeType || ""),
          createdAt: String(md.createdAt || ""),
          status,
          folderId: md.folderId ? String(md.folderId) : undefined,
          folderPath: md.folderPath ? String(md.folderPath) : undefined,
          categoryId: md.categoryId ? String(md.categoryId) : undefined,
        },
      });
    }

    // Dedupe by (docId, chunkIndex) while keeping highest score
    const seen = new Map<string, PineconeSearchHit>();
    for (const h of hits) {
      const k = `${h.documentId}:${h.chunkIndex}`;
      const prev = seen.get(k);
      if (!prev || h.similarity > prev.similarity) seen.set(k, h);
    }

    return [...seen.values()]
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  async query(embedding: number[], options: PineconeQueryOptions) {
    const results = await this.searchSimilarChunks(
      embedding,
      options.userId,
      options.topK ?? this.defaultTopK,
      options.minSimilarity ?? this.defaultMinSimilarity,
      options.documentId,
      options.folderId,
    );

    return results.map((r) => ({
      documentId: r.documentId,
      content: r.content,
      filename: r.document.filename,
      similarity: r.similarity,
      chunkIndex: r.chunkIndex,
      metadata: {
        ...r.metadata,
        filename: r.document.filename,
        mimeType: r.document.mimeType,
        createdAt: r.document.createdAt,
        documentId: r.documentId,
      },
    }));
  }

  private buildFilter(args: {
    userId: string;
    documentId?: string;
    folderId?: string;
  }): PineconeFilter {
    return buildScopedFilter(args);
  }

  // ─────────────────────────────────────────────────────────────
  // METADATA-ONLY LOOKUPS (slide/sheet) using dummy non-zero vector
  // ─────────────────────────────────────────────────────────────

  async searchBySlideNumber(
    userId: string,
    slideNumber: number,
    topK = 50,
    documentId?: string,
  ) {
    await this.ensureInit();
    if (!this.isAvailable()) return [];

    const index = this.getIndex();
    const filter: PineconeFilter = buildSlideFilter(
      userId,
      slideNumber,
      documentId,
    );

    const res = await index.query({
      vector: this.makeDummyNonZeroVector(),
      topK,
      includeMetadata: true,
      filter,
    });

    return this.mapMatchesToHits(res?.matches || []);
  }

  async searchBySheetNumber(
    userId: string,
    sheetNumber: number,
    topK = 200,
    documentId?: string,
  ) {
    await this.ensureInit();
    if (!this.isAvailable()) return [];

    const index = this.getIndex();
    const filter: PineconeFilter = buildSheetFilter(
      userId,
      sheetNumber,
      documentId,
    );

    const res = await index.query({
      vector: this.makeDummyNonZeroVector(),
      topK,
      includeMetadata: true,
      filter,
    });

    return this.mapMatchesToHits(res?.matches || []);
  }

  private mapMatchesToHits(matches: PineconeQueryMatch[]): PineconeSearchHit[] {
    return mapPineconeMatchesToHits(matches);
  }

  // ─────────────────────────────────────────────────────────────
  // DELETE
  // ─────────────────────────────────────────────────────────────

  /**
   * Best practice for deletes in your architecture:
   * - Store chunkCount (or lastChunkIndex) per document in your DB.
   * - Pass chunkCount here so we can delete deterministically without a Pinecone scan.
   *
   * If chunkCount is omitted, we fall back to a bounded query-by-filter (topK 10k).
   */
  async deleteDocumentEmbeddings(
    documentId: string,
    opts?: { userId?: string; chunkCount?: number },
  ) {
    await this.ensureInit();
    if (!this.isAvailable()) return;

    const index = this.getIndex();

    // Fast path: delete by deterministic IDs if chunkCount known
    if (opts?.chunkCount && opts.chunkCount > 0) {
      const ids: string[] = [];
      for (let i = 0; i < opts.chunkCount; i++)
        ids.push(this.makeVectorId(documentId, i));
      await this.deleteIdsInBatches(index, ids);
      return;
    }

    // Fallback path: query vector IDs by metadata filter (bounded to 10k)
    // NOTE: requires userId if your index is multi-tenant and you reuse documentId values.
    const filter = buildDocumentDeleteFilter(documentId, opts?.userId);

    for (let pass = 0; pass < 25; pass += 1) {
      const res = await index.query({
        vector: this.makeDummyNonZeroVector(),
        topK: 10000,
        includeMetadata: false,
        filter,
      });

      const ids = [
        ...new Set((res?.matches || []).map((m) => String(m?.id || ""))),
      ].filter(Boolean);
      if (ids.length === 0) return;
      await this.deleteIdsInBatches(index, ids);
      if (ids.length < 10000) return;
    }
  }

  async deleteEmbeddingsByOperationId(
    documentId: string,
    operationId: string,
    opts?: { userId?: string },
  ): Promise<number> {
    await this.ensureInit();
    if (!this.isAvailable()) return 0;

    const docId = String(documentId || "").trim();
    const opId = String(operationId || "").trim();
    if (!docId || !opId) return 0;

    const index = this.getIndex();
    const filter = buildOperationDeleteFilter(docId, opId, opts?.userId);

    let deleted = 0;
    for (let pass = 0; pass < 25; pass += 1) {
      const res = await index.query({
        vector: this.makeDummyNonZeroVector(),
        topK: 10000,
        includeMetadata: false,
        filter,
      });

      const ids = [
        ...new Set((res?.matches || []).map((m) => String(m?.id || ""))),
      ]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
      if (!ids.length) return deleted;

      await this.deleteIdsInBatches(index, ids);
      deleted += ids.length;
      if (ids.length < 10000) return deleted;
    }
    return deleted;
  }

  async deleteMultipleDocumentEmbeddings(
    documentIds: string[],
    opts?: { userId?: string; chunkCounts?: Record<string, number> },
    onProgress?: (done: number, total: number) => void,
  ) {
    await this.ensureInit();
    if (!this.isAvailable()) return 0;

    let deleted = 0;
    const total = documentIds.length;

    for (let i = 0; i < documentIds.length; i++) {
      const docId = documentIds[i];
      const chunkCount = opts?.chunkCounts?.[docId];
      // re-use single delete logic
      await this.deleteDocumentEmbeddings(docId, {
        userId: opts?.userId,
        chunkCount,
      });
      // we cannot know exact deleted count without listing; treat as “docs processed”
      deleted++;
      onProgress?.(i + 1, total);
    }

    return deleted;
  }

  private async deleteIdsInBatches(index: PineconeIndexClient, ids: string[]) {
    for (let i = 0; i < ids.length; i += this.deleteBatchSize) {
      const batch = ids.slice(i, i + this.deleteBatchSize);
      // Node SDK supports deleteMany(arrayOfIds)
      await index.deleteMany(batch);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // STATS + VERIFY
  // ─────────────────────────────────────────────────────────────

  async getIndexStats(): Promise<{
    available: boolean;
    indexName?: string;
    stats?: unknown;
    error?: string;
  }> {
    await this.ensureInit();
    if (!this.isAvailable()) return { available: false };

    try {
      const index = this.getIndex();
      const stats = await index.describeIndexStats();
      return { available: true, indexName: this.indexName, stats };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return { available: false, error: errorMessage };
    }
  }

  async verifyDocumentEmbeddings(
    documentId: string,
    opts?: {
      userId?: string;
      minCount?: number;
      expectedCount?: number;
      topK?: number;
    },
  ) {
    await this.ensureInit();
    if (!this.isAvailable()) {
      return { success: false, count: 0, message: "Pinecone not available" };
    }

    const index = this.getIndex();
    const filter = opts?.userId
      ? {
          $and: [
            { userId: { $eq: opts.userId } },
            { documentId: { $eq: documentId } },
          ],
        }
      : { documentId: { $eq: documentId } };

    const res = await index.query({
      vector: this.makeDummyNonZeroVector(),
      topK: Math.max(1, Number(opts?.topK || 1000)),
      includeMetadata: true,
      filter,
    });

    const count = (res?.matches || []).length;
    const minCount = opts?.minCount ?? 1;
    const expectedCount =
      typeof opts?.expectedCount === "number" && opts.expectedCount >= 0
        ? opts.expectedCount
        : null;
    const exactMatchOk = expectedCount == null ? true : count === expectedCount;
    const minCountOk = count >= minCount;
    const success = minCountOk && exactMatchOk;

    return {
      success,
      count,
      message: success
        ? `OK: found ${count} vectors`
        : expectedCount != null && count !== expectedCount
          ? `Vector count mismatch: found ${count}, expected ${expectedCount}`
          : "No embeddings found in Pinecone",
    };
  }
}

// Export singleton (kept for backward compatibility)
const pineconeService = new PineconeService();
export default pineconeService;
