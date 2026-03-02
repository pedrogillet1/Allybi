import { Prisma } from "@prisma/client";

import prisma from "../../../config/database";
import { DocumentCryptoService } from "../../documents/documentCrypto.service";
import { DocumentKeyService } from "../../documents/documentKey.service";
import { EmbeddingsService } from "../../retrieval/embedding.service";
import { ChunkCryptoService } from "../../retrieval/chunkCrypto.service";
import pineconeService from "../../retrieval/pinecone.service";
import { EncryptionService } from "../../security/encryption.service";
import { EnvelopeService } from "../../security/envelope.service";
import { TenantKeyService } from "../../security/tenantKey.service";
import type {
  ChunkLocation,
  DocMeta,
  DocStore,
  LexicalIndex,
  SemanticIndex,
  StructuralIndex,
} from "./retrievalEngine.service";

const READY_DOCUMENT_STATUSES = [
  "ready",
  "indexed",
  "enriching",
  "available",
  "completed",
] as const;

type SearchMode = "semantic" | "lexical" | "structural";

type ChunkWithDocument = {
  id: string;
  documentId: string;
  chunkIndex: number;
  text: string | null;
  textEncrypted?: string | null;
  page: number | null;
  document: {
    id: string;
    filename: string | null;
    displayTitle: string | null;
    encryptedFilename?: string | null;
    mimeType: string;
    createdAt: Date;
    updatedAt: Date;
  };
};

type EmbeddingWithDocument = {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  pageNumber: number | null;
  document: {
    id: string;
    filename: string | null;
    displayTitle: string | null;
    encryptedFilename?: string | null;
    mimeType: string;
    createdAt: Date;
    updatedAt: Date;
  };
};

type ChunkRow = {
  id: string;
  documentId: string;
  chunkIndex: number;
  text: string | null;
  textEncrypted?: string | null;
  page: number | null;
};

let embeddingsServiceSingleton: EmbeddingsService | null | undefined;
let chunkCryptoServiceSingleton: ChunkCryptoService | null | undefined;

function isRuntimeFlagEnabled(
  flagName: string,
  defaultValue: boolean,
): boolean {
  const raw = String(process.env[flagName] || "")
    .trim()
    .toLowerCase();
  if (!raw) return defaultValue;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return defaultValue;
}

function parsePositiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function toSafeInt(value: unknown, fallback: number): number {
  const parsed = parsePositiveNumber(value, fallback);
  return Math.floor(parsed);
}

function parseNullableNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function uniq(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = String(value || "").trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function getEmbeddingsServiceSafe(): EmbeddingsService | null {
  if (embeddingsServiceSingleton !== undefined)
    return embeddingsServiceSingleton;
  try {
    embeddingsServiceSingleton = new EmbeddingsService();
  } catch {
    embeddingsServiceSingleton = null;
  }
  return embeddingsServiceSingleton;
}

function getChunkCryptoServiceSafe(): ChunkCryptoService | null {
  if (chunkCryptoServiceSingleton !== undefined)
    return chunkCryptoServiceSingleton;
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
    chunkCryptoServiceSingleton = new ChunkCryptoService(
      prisma as any,
      docKeys,
      docCrypto,
    );
  } catch {
    chunkCryptoServiceSingleton = null;
  }
  return chunkCryptoServiceSingleton;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeQuery(query: string): string[] {
  const normalized = normalizeText(query);
  if (!normalized) return [];
  return normalized
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .slice(0, 12);
}

function scoreChunkText(
  text: string,
  query: string,
  tokens: string[],
  mode: SearchMode,
): number {
  const normalizedText = normalizeText(text);
  if (!normalizedText) return 0;
  if (!tokens.length) return 0;

  let tokenHits = 0;
  for (const token of tokens) {
    if (normalizedText.includes(token)) tokenHits += 1;
  }

  const tokenScore = tokenHits / tokens.length;
  const normalizedQuery = normalizeText(query);
  const fullQueryBoost =
    normalizedQuery.length >= 8 && normalizedText.includes(normalizedQuery)
      ? 0.2
      : 0;

  const structuralBoost =
    mode === "structural" && /^[A-Z0-9][^\n]{0,120}:/.test(text.trim())
      ? 0.1
      : 0;

  const lexicalBoost = mode === "lexical" ? 0.04 : 0;
  const semanticBoost = mode === "semantic" ? 0.08 : 0;

  return clamp01(
    tokenScore +
      fullQueryBoost +
      structuralBoost +
      lexicalBoost +
      semanticBoost,
  );
}

function toLocationKey(
  documentId: string,
  page: number | null,
  chunkIndex: number,
): string {
  return `d:${documentId}|p:${page ?? -1}|c:${chunkIndex}`;
}

function toSnippet(text: string | null): string {
  const clean = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "";
  return clean.length > 1200 ? `${clean.slice(0, 1199)}…` : clean;
}

function filenameFromStorageKey(
  storageKey: string | null | undefined,
): string | null {
  const key = String(storageKey || "").trim();
  if (!key) return null;
  const tail = key.split("/").pop();
  if (!tail) return null;
  try {
    return decodeURIComponent(tail);
  } catch {
    return tail;
  }
}

function resolveDocLabel(doc: {
  filename?: string | null;
  displayTitle?: string | null;
  encryptedFilename?: string | null;
}): { title: string | null; filename: string | null } {
  const fromStorage = filenameFromStorageKey(doc.encryptedFilename);
  const filename = doc.filename || doc.displayTitle || fromStorage || null;
  const title = doc.displayTitle || doc.filename || fromStorage || null;
  return { title, filename };
}

class PrismaRetrievalUserAdapter
  implements DocStore, SemanticIndex, LexicalIndex, StructuralIndex
{
  constructor(private readonly userId: string) {}

  async listDocs(): Promise<DocMeta[]> {
    const docs = await prisma.document.findMany({
      where: {
        userId: this.userId,
        status: { in: [...READY_DOCUMENT_STATUSES] },
      },
      select: {
        id: true,
        filename: true,
        displayTitle: true,
        encryptedFilename: true,
        mimeType: true,
        createdAt: true,
        updatedAt: true,
      },
      take: 5000,
      orderBy: { id: "asc" },
    });

    return docs.map((doc) => {
      const label = resolveDocLabel(doc);
      return {
        docId: doc.id,
        title: label.title,
        filename: label.filename,
        mimeType: doc.mimeType || null,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
      };
    });
  }

  async getDocMeta(docId: string): Promise<DocMeta | null> {
    const doc = await prisma.document.findFirst({
      where: {
        id: docId,
        userId: this.userId,
      },
      select: {
        id: true,
        filename: true,
        displayTitle: true,
        encryptedFilename: true,
        mimeType: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!doc) return null;
    const label = resolveDocLabel(doc);
    return {
      docId: doc.id,
      title: label.title,
      filename: label.filename,
      mimeType: doc.mimeType || null,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }

  async search(opts: { query: string; docIds?: string[]; k: number }): Promise<
    Array<{
      docId: string;
      location: ChunkLocation;
      snippet: string;
      score: number;
      locationKey?: string;
      chunkId?: string;
    }>
  > {
    const pineconePrimary = isRuntimeFlagEnabled(
      "RETRIEVAL_SEMANTIC_PINECONE_PRIMARY",
      true,
    );
    const allowDbFallback = isRuntimeFlagEnabled(
      "RETRIEVAL_SEMANTIC_DB_FALLBACK",
      true,
    );

    if (pineconePrimary) {
      try {
        const semanticResults = await this.runPineconeSemanticSearch(opts);
        if (semanticResults.length > 0) return semanticResults;
      } catch {
        // Fail closed to DB lexical-semantic fallback for availability.
      }
      if (!allowDbFallback) return [];
    }

    return this.runChunkSearch({
      mode: "semantic",
      query: opts.query,
      docIds: opts.docIds,
      k: opts.k,
    });
  }

  async lexicalSearch(opts: {
    query: string;
    docIds?: string[];
    k: number;
  }): Promise<
    Array<{
      docId: string;
      location: ChunkLocation;
      snippet: string;
      score: number;
      locationKey?: string;
      chunkId?: string;
    }>
  > {
    return this.runChunkSearch({
      mode: "lexical",
      query: opts.query,
      docIds: opts.docIds,
      k: opts.k,
    });
  }

  async structuralSearch(opts: {
    query: string;
    docIds?: string[];
    k: number;
    anchors: string[];
  }): Promise<
    Array<{
      docId: string;
      location: ChunkLocation;
      snippet: string;
      score: number;
      locationKey?: string;
      chunkId?: string;
    }>
  > {
    const anchorQuery = opts.anchors.length
      ? `${opts.query} ${opts.anchors.join(" ")}`
      : opts.query;
    return this.runChunkSearch({
      mode: "structural",
      query: anchorQuery,
      docIds: opts.docIds,
      k: opts.k,
    });
  }

  private async runChunkSearch(input: {
    mode: SearchMode;
    query: string;
    docIds?: string[];
    k: number;
  }): Promise<
    Array<{
      docId: string;
      location: ChunkLocation;
      snippet: string;
      score: number;
      locationKey?: string;
      chunkId?: string;
      title?: string | null;
      filename?: string | null;
    }>
  > {
    const query = String(input.query || "").trim();
    if (!query) return [];

    const tokens = tokenizeQuery(query);
    if (!tokens.length) return [];
    const embeddingBackedLexical = isRuntimeFlagEnabled(
      "RETRIEVAL_LEXICAL_FROM_EMBEDDINGS",
      false,
    );
    if (embeddingBackedLexical) {
      return this.runEmbeddingBackedChunkSearch(input, query, tokens);
    }

    const where: Prisma.DocumentChunkWhereInput = {
      text: { not: null },
      document: {
        userId: this.userId,
        status: { in: [...READY_DOCUMENT_STATUSES] },
      },
    };

    if (input.docIds && input.docIds.length > 0) {
      where.documentId = { in: input.docIds };
    }

    where.OR = tokens.map((token) => ({
      text: { contains: token, mode: "insensitive" },
    }));

    const rows = (await prisma.documentChunk.findMany({
      where,
      take: Math.max(input.k * 8, 80),
      orderBy: [{ documentId: "asc" }, { chunkIndex: "asc" }, { id: "asc" }],
      include: {
        document: {
          select: {
            id: true,
            filename: true,
            displayTitle: true,
            encryptedFilename: true,
            mimeType: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    })) as unknown as ChunkWithDocument[];
    const plaintextByChunkId = await this.resolveChunkTexts(rows);

    const scored: Array<{
      docId: string;
      title: string | null;
      filename: string | null;
      location: ChunkLocation;
      locationKey: string;
      snippet: string;
      score: number;
      chunkId: string;
    }> = [];

    for (const row of rows) {
      const snippet = toSnippet(plaintextByChunkId.get(row.id) ?? row.text);
      if (!snippet) continue;

      const score = scoreChunkText(snippet, query, tokens, input.mode);
      if (score <= 0) continue;

      const label = resolveDocLabel(row.document);
      scored.push({
        docId: row.documentId,
        title: label.title,
        filename: label.filename,
        location: {
          page: row.page ?? null,
        } as ChunkLocation,
        locationKey: toLocationKey(
          row.documentId,
          row.page ?? null,
          row.chunkIndex,
        ),
        snippet,
        score,
        chunkId: row.id,
      });
    }

    // Scoped-document diversity fallback: when we have explicit docIds
    // (attached documents), ensure EVERY document contributes at least a few
    // chunks. Keyword search is biased toward docs whose text happens to
    // contain query tokens — the other attached docs get zero representation.
    // For multi-doc overview questions ("visão geral dos docs que anexei")
    // the LLM needs context from ALL documents to give a useful answer.
    if (input.docIds && input.docIds.length > 0) {
      const representedDocs = new Set(scored.map((s) => s.docId));
      const missingDocs = input.docIds.filter((id) => !representedDocs.has(id));
      // Also backfill docs with very few chunks (< 3) for better coverage
      const thinDocs: string[] = [];
      const docCounts = new Map<string, number>();
      for (const s of scored) {
        docCounts.set(s.docId, (docCounts.get(s.docId) ?? 0) + 1);
      }
      for (const id of input.docIds) {
        if ((docCounts.get(id) ?? 0) < 3 && !missingDocs.includes(id)) {
          thinDocs.push(id);
        }
      }
      const docsToBackfill = [...missingDocs, ...thinDocs];

      if (docsToBackfill.length > 0) {
        const perDocLimit = Math.max(
          Math.ceil(input.k / input.docIds.length),
          4,
        );
        const fallbackWhere: Prisma.DocumentChunkWhereInput = {
          text: { not: null },
          documentId: { in: docsToBackfill },
          document: {
            userId: this.userId,
            status: { in: [...READY_DOCUMENT_STATUSES] },
          },
        };
        const fallbackRows = (await prisma.documentChunk.findMany({
          where: fallbackWhere,
          take: perDocLimit * docsToBackfill.length,
          orderBy: [{ documentId: "asc" }, { chunkIndex: "asc" }],
          include: {
            document: {
              select: {
                id: true,
                filename: true,
                displayTitle: true,
                encryptedFilename: true,
                mimeType: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        })) as unknown as ChunkWithDocument[];
        const fallbackPlaintextByChunkId =
          await this.resolveChunkTexts(fallbackRows);

        const existingKeys = new Set(scored.map((s) => s.chunkId));
        const backfillPerDoc = new Map<string, number>();
        for (const row of fallbackRows) {
          if (existingKeys.has(row.id)) continue;
          const count = backfillPerDoc.get(row.documentId) ?? 0;
          if (count >= perDocLimit) continue;
          const snippet = toSnippet(
            fallbackPlaintextByChunkId.get(row.id) ?? row.text,
          );
          if (!snippet) continue;
          backfillPerDoc.set(row.documentId, count + 1);
          const label = resolveDocLabel(row.document);
          scored.push({
            docId: row.documentId,
            title: label.title,
            filename: label.filename,
            location: { page: row.page ?? null } as ChunkLocation,
            locationKey: toLocationKey(
              row.documentId,
              row.page ?? null,
              row.chunkIndex,
            ),
            snippet,
            score: 0.55,
            chunkId: row.id,
          });
        }
      }
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.docId !== b.docId) return a.docId.localeCompare(b.docId);
      if (a.locationKey !== b.locationKey)
        return a.locationKey.localeCompare(b.locationKey);
      return a.chunkId.localeCompare(b.chunkId);
    });

    return scored.slice(0, Math.max(1, input.k));
  }

  private async runEmbeddingBackedChunkSearch(
    input: { mode: SearchMode; query: string; docIds?: string[]; k: number },
    query: string,
    tokens: string[],
  ): Promise<
    Array<{
      docId: string;
      location: ChunkLocation;
      snippet: string;
      score: number;
      locationKey?: string;
      chunkId?: string;
      title?: string | null;
      filename?: string | null;
    }>
  > {
    const where: Prisma.DocumentEmbeddingWhereInput = {
      content: { not: "" },
      document: {
        userId: this.userId,
        status: { in: [...READY_DOCUMENT_STATUSES] },
      },
      OR: tokens.map((token) => ({
        content: { contains: token, mode: "insensitive" },
      })),
    };
    if (input.docIds && input.docIds.length > 0) {
      where.documentId = { in: input.docIds };
    }

    const rows = (await prisma.documentEmbedding.findMany({
      where,
      take: Math.max(input.k * 8, 80),
      orderBy: [{ documentId: "asc" }, { chunkIndex: "asc" }, { id: "asc" }],
      include: {
        document: {
          select: {
            id: true,
            filename: true,
            displayTitle: true,
            encryptedFilename: true,
            mimeType: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    })) as unknown as EmbeddingWithDocument[];

    const scored: Array<{
      docId: string;
      title: string | null;
      filename: string | null;
      location: ChunkLocation;
      locationKey: string;
      snippet: string;
      score: number;
      chunkId: string;
    }> = [];
    for (const row of rows) {
      const snippet = toSnippet(row.content);
      if (!snippet) continue;
      const score = scoreChunkText(snippet, query, tokens, input.mode);
      if (score <= 0) continue;
      const label = resolveDocLabel(row.document);
      scored.push({
        docId: row.documentId,
        title: label.title,
        filename: label.filename,
        location: { page: row.pageNumber ?? null } as ChunkLocation,
        locationKey: toLocationKey(
          row.documentId,
          row.pageNumber ?? null,
          row.chunkIndex,
        ),
        snippet,
        score,
        chunkId: `${row.documentId}:${row.chunkIndex}`,
      });
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.docId !== b.docId) return a.docId.localeCompare(b.docId);
      if (a.locationKey !== b.locationKey)
        return a.locationKey.localeCompare(b.locationKey);
      return a.chunkId.localeCompare(b.chunkId);
    });

    return scored.slice(0, Math.max(1, input.k));
  }

  private async runPineconeSemanticSearch(opts: {
    query: string;
    docIds?: string[];
    k: number;
  }): Promise<
    Array<{
      docId: string;
      location: ChunkLocation;
      snippet: string;
      score: number;
      locationKey?: string;
      chunkId?: string;
      title?: string | null;
      filename?: string | null;
    }>
  > {
    const query = String(opts.query || "").trim();
    if (!query) return [];
    if (!pineconeService.isAvailable()) return [];

    const embeddingsService = getEmbeddingsServiceSafe();
    if (!embeddingsService) return [];

    const requestedK = Math.max(1, toSafeInt(opts.k, 10));
    const effectiveTopK = Math.max(requestedK * 4, 24);
    const minSimilarity = parsePositiveNumber(
      process.env.RETRIEVAL_SEMANTIC_PINECONE_MIN_SIMILARITY,
      0.2,
    );
    const requestedDocIds = uniq(Array.isArray(opts.docIds) ? opts.docIds : []);

    const queryEmbedding = (
      await embeddingsService.generateQueryEmbedding(query)
    ).embedding;

    let hits: Array<{
      documentId: string;
      chunkIndex: number;
      content: string;
      similarity: number;
      metadata: Record<string, any>;
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
    }> = [];

    if (requestedDocIds.length === 1) {
      hits = await pineconeService.searchSimilarChunks(
        queryEmbedding,
        this.userId,
        effectiveTopK,
        minSimilarity,
        requestedDocIds[0],
      );
    } else if (requestedDocIds.length > 1) {
      const perDocTopK = Math.max(
        Math.ceil(effectiveTopK / requestedDocIds.length),
        6,
      );
      const grouped = await Promise.all(
        requestedDocIds.map((docId) =>
          pineconeService.searchSimilarChunks(
            queryEmbedding,
            this.userId,
            perDocTopK,
            minSimilarity,
            docId,
          ),
        ),
      );
      hits = grouped.flat();
    } else {
      hits = await pineconeService.searchSimilarChunks(
        queryEmbedding,
        this.userId,
        effectiveTopK,
        minSimilarity,
      );
    }

    const filteredHits =
      requestedDocIds.length > 0
        ? hits.filter((hit) => requestedDocIds.includes(hit.documentId))
        : hits;

    const deduped = new Map<string, (typeof filteredHits)[number]>();
    for (const hit of filteredHits) {
      const key = `${hit.documentId}:${hit.chunkIndex}`;
      const prev = deduped.get(key);
      if (!prev || hit.similarity > prev.similarity) deduped.set(key, hit);
    }
    const semanticHydrated = await this.resolveSemanticFallbackChunks([
      ...deduped.values(),
    ]);

    const normalized = [...deduped.values()]
      .map((hit) => {
        const md = (hit.metadata || {}) as Record<string, unknown>;
        const page = parseNullableNumber(md.page ?? md.pageNumber);
        const slide = parseNullableNumber(md.slide ?? md.slideNumber);
        const chunkIndex = Number(hit.chunkIndex ?? md.chunkIndex ?? -1);
        const semanticKey = `${hit.documentId}:${chunkIndex}`;
        const hydrated = semanticHydrated.get(semanticKey);
        const fallbackPage = hydrated?.page ?? null;
        const locationKey =
          String(md.locationKey || "").trim() ||
          toLocationKey(hit.documentId, page ?? fallbackPage, chunkIndex);
        const title = String(md.title || "").trim() || null;
        const filename =
          String(hit.document?.filename || md.filename || "").trim() || null;
        const snippet = toSnippet(
          hit.content || String(md.content || "") || hydrated?.text || "",
        );

        return {
          docId: hit.documentId,
          title,
          filename,
          location: {
            page: page ?? fallbackPage,
            slide,
            sheet:
              typeof md.sheet === "string"
                ? String(md.sheet)
                : typeof md.sheetName === "string"
                  ? String(md.sheetName)
                  : null,
            sectionKey:
              typeof md.sectionKey === "string" ? String(md.sectionKey) : null,
          } as ChunkLocation,
          snippet,
          score: clamp01(Number(hit.similarity || 0)),
          locationKey,
          chunkId: hydrated?.chunkId || `${hit.documentId}:${chunkIndex}`,
        };
      })
      .filter((item) => item.snippet.length > 0);

    normalized.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.docId !== b.docId) return a.docId.localeCompare(b.docId);
      const ak = String(a.locationKey || "");
      const bk = String(b.locationKey || "");
      if (ak !== bk) return ak.localeCompare(bk);
      return String(a.chunkId || "").localeCompare(String(b.chunkId || ""));
    });

    return normalized.slice(0, requestedK);
  }

  private async resolveChunkTexts(
    rows: ChunkRow[],
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (!rows.length) return out;

    const toDecryptByDoc = new Map<string, string[]>();
    for (const row of rows) {
      const plain = String(row.text || "").trim();
      if (plain) {
        out.set(row.id, plain);
        continue;
      }
      const encrypted = String(row.textEncrypted || "").trim();
      if (!encrypted) continue;
      const list = toDecryptByDoc.get(row.documentId) || [];
      list.push(row.id);
      toDecryptByDoc.set(row.documentId, list);
    }
    if (toDecryptByDoc.size === 0) return out;

    const chunkCrypto = getChunkCryptoServiceSafe();
    if (!chunkCrypto) return out;

    const docs = [...toDecryptByDoc.keys()].sort((a, b) => a.localeCompare(b));
    for (const docId of docs) {
      const chunkIds = uniq((toDecryptByDoc.get(docId) || []).sort());
      if (!chunkIds.length) continue;
      try {
        const decrypted = await chunkCrypto.decryptChunksBatch(
          this.userId,
          docId,
          chunkIds,
        );
        for (const chunkId of chunkIds) {
          const text = String(decrypted.get(chunkId) || "").trim();
          if (!text) continue;
          out.set(chunkId, text);
        }
      } catch {
        // Decryption is best-effort; callers skip empty snippets.
      }
    }

    return out;
  }

  private async resolveSemanticFallbackChunks(
    hits: Array<{
      documentId: string;
      chunkIndex: number;
      content: string;
      metadata: Record<string, any>;
    }>,
  ): Promise<
    Map<string, { chunkId: string; text: string; page: number | null }>
  > {
    const needsHydration = new Map<string, number[]>();
    for (const hit of hits) {
      const md = (hit.metadata || {}) as Record<string, unknown>;
      const existing = toSnippet(hit.content || String(md.content || ""));
      if (existing) continue;
      const idx = Number(hit.chunkIndex ?? md.chunkIndex ?? -1);
      if (!Number.isFinite(idx) || idx < 0) continue;
      const arr = needsHydration.get(hit.documentId) || [];
      arr.push(idx);
      needsHydration.set(hit.documentId, arr);
    }
    if (needsHydration.size === 0) return new Map();

    const ors = [...needsHydration.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([docId, chunkIndexes]) => ({
        documentId: docId,
        chunkIndex: { in: [...new Set(chunkIndexes)].sort((a, b) => a - b) },
      }));
    if (!ors.length) return new Map();

    const rows = (await prisma.documentChunk.findMany({
      where: {
        OR: ors,
        document: {
          userId: this.userId,
          status: { in: [...READY_DOCUMENT_STATUSES] },
        },
      },
      select: {
        id: true,
        documentId: true,
        chunkIndex: true,
        text: true,
        textEncrypted: true,
        page: true,
      },
      orderBy: [{ documentId: "asc" }, { chunkIndex: "asc" }, { id: "asc" }],
      take: Math.max(ors.length * 12, 120),
    })) as unknown as ChunkRow[];

    if (!rows.length) return new Map();
    const plaintextByChunkId = await this.resolveChunkTexts(rows);
    const out = new Map<
      string,
      { chunkId: string; text: string; page: number | null }
    >();
    for (const row of rows) {
      const snippet = toSnippet(plaintextByChunkId.get(row.id) ?? row.text);
      if (!snippet) continue;
      const key = `${row.documentId}:${row.chunkIndex}`;
      if (!out.has(key)) {
        out.set(key, {
          chunkId: row.id,
          text: snippet,
          page: row.page ?? null,
        });
      }
    }
    return out;
  }
}

class LexicalIndexAdapter implements LexicalIndex {
  constructor(private readonly delegate: PrismaRetrievalUserAdapter) {}

  async search(opts: { query: string; docIds?: string[]; k: number }): Promise<
    Array<{
      docId: string;
      location: ChunkLocation;
      snippet: string;
      score: number;
      locationKey?: string;
      chunkId?: string;
    }>
  > {
    return this.delegate.lexicalSearch(opts);
  }
}

class StructuralIndexAdapter implements StructuralIndex {
  constructor(private readonly delegate: PrismaRetrievalUserAdapter) {}

  async search(opts: {
    query: string;
    docIds?: string[];
    k: number;
    anchors: string[];
  }): Promise<
    Array<{
      docId: string;
      location: ChunkLocation;
      snippet: string;
      score: number;
      locationKey?: string;
      chunkId?: string;
    }>
  > {
    return this.delegate.structuralSearch(opts);
  }
}

export interface PrismaRetrievalEngineDependencies {
  docStore: DocStore;
  semanticIndex: SemanticIndex;
  lexicalIndex: LexicalIndex;
  structuralIndex: StructuralIndex;
}

export class PrismaRetrievalAdapterFactory {
  createForUser(userId: string): PrismaRetrievalEngineDependencies {
    const adapter = new PrismaRetrievalUserAdapter(userId);
    return {
      docStore: adapter,
      semanticIndex: adapter,
      lexicalIndex: new LexicalIndexAdapter(adapter),
      structuralIndex: new StructuralIndexAdapter(adapter),
    };
  }
}
