import { Prisma, PrismaClient } from "@prisma/client";

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
  "available",
  "completed",
] as const;

type SearchMode = "semantic" | "lexical" | "structural";

type TablePayload = {
  header?: string[];
  rows?: Array<Array<string | number | null>>;
  structureScore?: number;
  numericIntegrityScore?: number;
  warnings?: string[];
};

type RetrievalHit = {
  docId: string;
  location: ChunkLocation;
  snippet: string;
  score: number;
  locationKey?: string;
  chunkId?: string;
  title?: string | null;
  filename?: string | null;
  table?: TablePayload;
};

type ChunkWithDocument = {
  id: string;
  documentId: string;
  chunkIndex: number;
  text: string | null;
  textEncrypted?: string | null;
  page: number | null;
  sectionName?: string | null;
  sheetName?: string | null;
  tableChunkForm?: string | null;
  tableId?: string | null;
  rowIndex?: number | null;
  columnIndex?: number | null;
  rowLabel?: string | null;
  colHeader?: string | null;
  valueRaw?: string | null;
  unitRaw?: string | null;
  unitNormalized?: string | null;
  numericValue?: number | null;
  metadata?: Record<string, unknown> | null;
  document: {
    id: string;
    parentVersionId?: string | null;
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
  sectionName?: string | null;
  sheetName?: string | null;
  tableChunkForm?: string | null;
  tableId?: string | null;
  rowIndex?: number | null;
  columnIndex?: number | null;
  rowLabel?: string | null;
  colHeader?: string | null;
  valueRaw?: string | null;
  unitRaw?: string | null;
  unitNormalized?: string | null;
  numericValue?: number | null;
  metadata?: Record<string, unknown> | null;
};

type DocumentVersionRow = {
  id: string;
  parentVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
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

function rootDocumentIdFor(doc: {
  id: string;
  parentVersionId?: string | null;
}): string {
  return String(doc.parentVersionId || doc.id);
}

function compareDocRecency(
  left: { id: string; updatedAt: Date; createdAt: Date },
  right: { id: string; updatedAt: Date; createdAt: Date },
): number {
  const createdDelta = right.createdAt.getTime() - left.createdAt.getTime();
  if (createdDelta !== 0) return createdDelta;
  return right.id.localeCompare(left.id);
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
    const tenantKeys = new TenantKeyService(prisma as unknown as PrismaClient, encryption);
    const docKeys = new DocumentKeyService(
      prisma as unknown as PrismaClient,
      encryption,
      tenantKeys,
      envelope,
    );
    const docCrypto = new DocumentCryptoService(encryption);
    chunkCryptoServiceSingleton = new ChunkCryptoService(
      prisma as unknown as PrismaClient,
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

function sanitizeLocationToken(value: unknown): string | null {
  const text = String(value || "")
    .replace(/[|]/g, "/")
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

function toLocationKey(
  documentId: string,
  params: {
    page?: number | null;
    sheet?: string | null;
    slide?: number | null;
    sectionKey?: string | null;
    chunkIndex: number;
  },
): string {
  const page =
    typeof params.page === "number" && Number.isFinite(params.page) && params.page > 0
      ? Math.trunc(params.page)
      : null;
  const slide =
    typeof params.slide === "number" &&
    Number.isFinite(params.slide) &&
    params.slide > 0
      ? Math.trunc(params.slide)
      : null;
  const sheet = sanitizeLocationToken(params.sheet);
  const sectionKey = sanitizeLocationToken(params.sectionKey);
  const chunkIndex =
    Number.isFinite(params.chunkIndex) && params.chunkIndex >= 0
      ? Math.trunc(params.chunkIndex)
      : 0;

  const parts: string[] = [`d:${documentId}`];
  if (page != null) {
    parts.push(`p:${page}`);
  } else if (slide == null && !sheet && !sectionKey) {
    parts.push("p:-1");
  }
  if (sheet) parts.push(`s:${sheet}`);
  if (slide != null) parts.push(`sl:${slide}`);
  if (sectionKey) parts.push(`sec:${sectionKey}`);
  parts.push(`c:${chunkIndex}`);
  return parts.join("|");
}

function sectionKeyFromLocation(
  locationKey: string,
  chunkIndex: number,
): string | null {
  const normalizedLocationKey = String(locationKey || "").trim();
  const fromLocation = normalizedLocationKey.match(/\|c:(-?\d+)/i);
  const fromLocationChunk = fromLocation
    ? Number(fromLocation[1] || Number.NaN)
    : Number.NaN;
  if (Number.isFinite(fromLocationChunk) && fromLocationChunk >= 0) {
    return `chunk_${fromLocationChunk}`;
  }
  if (Number.isFinite(chunkIndex) && chunkIndex >= 0) {
    return `chunk_${chunkIndex}`;
  }
  return null;
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

  private isLatestVersionOnlyEnabled(): boolean {
    return isRuntimeFlagEnabled("RETRIEVAL_LATEST_VERSION_ONLY", true);
  }

  private async resolveLatestReadyDocByRootIds(
    rootIds: string[],
  ): Promise<Map<string, DocumentVersionRow>> {
    const uniqueRoots = uniq(rootIds);
    if (!uniqueRoots.length) return new Map();

    const familyDocsRaw = await prisma.document.findMany({
      where: {
        userId: this.userId,
        status: { in: [...READY_DOCUMENT_STATUSES] },
        OR: [
          { id: { in: uniqueRoots } },
          { parentVersionId: { in: uniqueRoots } },
        ],
      },
      select: {
        id: true,
        parentVersionId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const familyDocs = (Array.isArray(familyDocsRaw)
      ? familyDocsRaw
      : []) as unknown as DocumentVersionRow[];

    const latestByRoot = new Map<string, DocumentVersionRow>();
    for (const doc of familyDocs) {
      const rootId = rootDocumentIdFor(doc);
      const existing = latestByRoot.get(rootId);
      if (!existing || compareDocRecency(doc, existing) < 0) {
        latestByRoot.set(rootId, doc);
      }
    }
    return latestByRoot;
  }

  private async resolveScopedDocIds(
    docIds?: string[],
  ): Promise<string[] | undefined> {
    const requested = uniq(Array.isArray(docIds) ? docIds : []);
    if (!requested.length) return undefined;
    if (!this.isLatestVersionOnlyEnabled()) return requested;

    const requestedDocsRaw = await prisma.document.findMany({
      where: {
        userId: this.userId,
        id: { in: requested },
      },
      select: {
        id: true,
        parentVersionId: true,
      },
    });
    const requestedDocs = (Array.isArray(requestedDocsRaw)
      ? requestedDocsRaw
      : []) as Array<{ id: string; parentVersionId: string | null }>;

    if (!requestedDocs.length) return requested;

    const pinnedRevisionIds: string[] = [];
    const requestedRootIds: string[] = [];
    for (const doc of requestedDocs) {
      if (doc.parentVersionId) {
        // Explicit revision ID is treated as a pin.
        pinnedRevisionIds.push(doc.id);
        continue;
      }
      requestedRootIds.push(doc.id);
    }

    const latestByRoot = await this.resolveLatestReadyDocByRootIds(
      requestedRootIds,
    );
    const resolvedRootIds = requestedRootIds.map(
      (rootId) => latestByRoot.get(rootId)?.id || rootId,
    );
    return uniq([...resolvedRootIds, ...pinnedRevisionIds]);
  }

  private async keepLatestVersionHits<T extends { docId: string }>(
    hits: T[],
    scopedDocIds?: string[],
  ): Promise<T[]> {
    if (!hits.length) return hits;
    if (!this.isLatestVersionOnlyEnabled()) return hits;
    if (Array.isArray(scopedDocIds) && scopedDocIds.length > 0) return hits;

    const candidateDocIds = uniq(hits.map((hit) => hit.docId));
    if (!candidateDocIds.length) return hits;

    const docsRaw = await prisma.document.findMany({
      where: {
        userId: this.userId,
        id: { in: candidateDocIds },
      },
      select: {
        id: true,
        parentVersionId: true,
      },
    });
    const docs = (Array.isArray(docsRaw) ? docsRaw : []) as Array<{
      id: string;
      parentVersionId: string | null;
    }>;
    if (!docs.length) return hits;

    const byId = new Map(docs.map((doc) => [doc.id, doc]));
    const rootIds = uniq(docs.map((doc) => rootDocumentIdFor(doc)));
    const latestByRoot = await this.resolveLatestReadyDocByRootIds(rootIds);
    if (!latestByRoot.size) return hits;

    const hitsByRoot = new Map<string, T[]>();
    for (const hit of hits) {
      const doc = byId.get(hit.docId);
      const rootId = doc ? rootDocumentIdFor(doc) : hit.docId;
      const group = hitsByRoot.get(rootId) || [];
      group.push(hit);
      hitsByRoot.set(rootId, group);
    }

    const kept: T[] = [];
    for (const [rootId, rootHits] of hitsByRoot) {
      const latestDocId = latestByRoot.get(rootId)?.id;
      if (!latestDocId) {
        kept.push(...rootHits);
        continue;
      }
      const latestHits = rootHits.filter((hit) => hit.docId === latestDocId);
      // Keep stale hits only when we have no replacement evidence from latest revision.
      kept.push(...(latestHits.length > 0 ? latestHits : rootHits));
    }

    return kept;
  }

  async listDocs(): Promise<DocMeta[]> {
    const docsRaw = await prisma.document.findMany({
      where: {
        userId: this.userId,
        status: { in: [...READY_DOCUMENT_STATUSES] },
      },
      select: {
        id: true,
        parentVersionId: true,
        filename: true,
        displayTitle: true,
        encryptedFilename: true,
        mimeType: true,
        createdAt: true,
        updatedAt: true,
      },
      take: 5000,
      orderBy: [
        { createdAt: "desc" },
        { id: "desc" },
      ],
    });
    const docs = Array.isArray(docsRaw) ? docsRaw : [];

    const effectiveDocs = this.isLatestVersionOnlyEnabled()
      ? (() => {
          const latestByRoot = new Map<
            string,
            (typeof docs)[number]
          >();
          for (const doc of docs) {
            const rootId = rootDocumentIdFor(doc);
            if (!latestByRoot.has(rootId)) {
              latestByRoot.set(rootId, doc);
            }
          }
          return [...latestByRoot.values()];
        })()
      : docs;

    return effectiveDocs.map((doc) => {
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
    const requested = await prisma.document.findFirst({
      where: {
        id: docId,
        userId: this.userId,
      },
      select: {
        id: true,
        parentVersionId: true,
        filename: true,
        displayTitle: true,
        encryptedFilename: true,
        mimeType: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!requested) return null;

    let doc = requested;
    if (
      this.isLatestVersionOnlyEnabled() &&
      !requested.parentVersionId
    ) {
      const latestByRoot = await this.resolveLatestReadyDocByRootIds([
        requested.id,
      ]);
      const latestDocId = latestByRoot.get(requested.id)?.id;
      if (latestDocId && latestDocId !== requested.id) {
        const latest = await prisma.document.findFirst({
          where: {
            id: latestDocId,
            userId: this.userId,
          },
          select: {
            id: true,
            parentVersionId: true,
            filename: true,
            displayTitle: true,
            encryptedFilename: true,
            mimeType: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        if (latest) doc = latest;
      }
    }

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
    RetrievalHit[]
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
        // Fail closed to DB lexical fallback for availability.
      }
      if (!allowDbFallback) return [];
    }

    return this.runChunkSearch({
      mode: "lexical",
      query: opts.query,
      docIds: opts.docIds,
      k: opts.k,
    });
  }

  async lexicalSearch(opts: {
    query: string;
    docIds?: string[];
    k: number;
  }): Promise<RetrievalHit[]> {
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
  }): Promise<RetrievalHit[]> {
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
  }): Promise<RetrievalHit[]> {
    const query = String(input.query || "").trim();
    if (!query) return [];

    const scopedDocIds = await this.resolveScopedDocIds(input.docIds);
    const tokens = tokenizeQuery(query);
    if (!tokens.length) return [];
    const embeddingBackedLexicalFlag = isRuntimeFlagEnabled(
      "RETRIEVAL_LEXICAL_FROM_EMBEDDINGS",
      false,
    );
    const encryptedOnlyChunks = isRuntimeFlagEnabled(
      "INDEXING_ENCRYPTED_CHUNKS_ONLY",
      true,
    );
    const useEmbeddingBackedLexical =
      embeddingBackedLexicalFlag || encryptedOnlyChunks;
    if (useEmbeddingBackedLexical) {
      return this.runEmbeddingBackedChunkSearch(input, query, tokens);
    }

    const where: Prisma.DocumentChunkWhereInput = {
      text: { not: null },
      document: {
        userId: this.userId,
        status: { in: [...READY_DOCUMENT_STATUSES] },
      },
    };

    if (scopedDocIds && scopedDocIds.length > 0) {
      where.documentId = { in: scopedDocIds };
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
            parentVersionId: true,
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
      table?: TablePayload;
      score: number;
      chunkId: string;
    }> = [];

    for (const row of rows) {
      const snippet = toSnippet(plaintextByChunkId.get(row.id) ?? row.text);
      if (!snippet) continue;

      const score = scoreChunkText(snippet, query, tokens, input.mode);
      if (score <= 0) continue;

      const label = resolveDocLabel(row.document);
      const tablePayload = this.buildTablePayloadFromChunkRow(row, snippet);
      const sheet = sanitizeLocationToken(row.sheetName ?? null);
      const sectionKey = sanitizeLocationToken(
        row.sectionName ?? row.tableId ?? row.rowLabel ?? null,
      );
      scored.push({
        docId: row.documentId,
        title: label.title,
        filename: label.filename,
        location: {
          page: row.page ?? null,
          sheet,
          sectionKey,
          versionId: row.documentId,
          rootDocumentId: rootDocumentIdFor(row.document),
        } as ChunkLocation,
        locationKey: toLocationKey(row.documentId, {
          page: row.page ?? null,
          sheet,
          sectionKey,
          chunkIndex: row.chunkIndex,
        }),
        snippet,
        table: tablePayload,
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
    if (scopedDocIds && scopedDocIds.length > 0) {
      const representedDocs = new Set(scored.map((s) => s.docId));
      const missingDocs = scopedDocIds.filter((id) => !representedDocs.has(id));
      // Also backfill docs with very few chunks (< 3) for better coverage
      const thinDocs: string[] = [];
      const docCounts = new Map<string, number>();
      for (const s of scored) {
        docCounts.set(s.docId, (docCounts.get(s.docId) ?? 0) + 1);
      }
      for (const id of scopedDocIds) {
        if ((docCounts.get(id) ?? 0) < 3 && !missingDocs.includes(id)) {
          thinDocs.push(id);
        }
      }
      const docsToBackfill = [...missingDocs, ...thinDocs];

      if (docsToBackfill.length > 0) {
        const perDocLimit = Math.max(
          Math.ceil(input.k / scopedDocIds.length),
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
                parentVersionId: true,
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
          const tablePayload = this.buildTablePayloadFromChunkRow(row, snippet);
          const sheet = sanitizeLocationToken(row.sheetName ?? null);
          const sectionKey = sanitizeLocationToken(
            row.sectionName ?? row.tableId ?? row.rowLabel ?? null,
          );
          scored.push({
            docId: row.documentId,
            title: label.title,
            filename: label.filename,
            location: {
              page: row.page ?? null,
              sheet,
              sectionKey,
              versionId: row.documentId,
              rootDocumentId: rootDocumentIdFor(row.document),
            } as ChunkLocation,
            locationKey: toLocationKey(row.documentId, {
              page: row.page ?? null,
              sheet,
              sectionKey,
              chunkIndex: row.chunkIndex,
            }),
            snippet,
            table: tablePayload,
            score: 0.55,
            chunkId: row.id,
          });
        }
      }
    }

    const filteredScored = await this.keepLatestVersionHits(
      scored,
      scopedDocIds,
    );

    filteredScored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.docId !== b.docId) return a.docId.localeCompare(b.docId);
      if (a.locationKey !== b.locationKey)
        return a.locationKey.localeCompare(b.locationKey);
      return a.chunkId.localeCompare(b.chunkId);
    });

    return filteredScored.slice(0, Math.max(1, input.k));
  }

  private async runEmbeddingBackedChunkSearch(
    input: { mode: SearchMode; query: string; docIds?: string[]; k: number },
    query: string,
    tokens: string[],
  ): Promise<RetrievalHit[]> {
    const scopedDocIds = await this.resolveScopedDocIds(input.docIds);
    const where: Prisma.DocumentChunkWhereInput = {
      document: {
        userId: this.userId,
        status: { in: [...READY_DOCUMENT_STATUSES] },
      },
      OR: tokens.flatMap((token) => [
        { text: { contains: token, mode: "insensitive" } },
        { sectionName: { contains: token, mode: "insensitive" } },
        { sheetName: { contains: token, mode: "insensitive" } },
        { tableId: { contains: token, mode: "insensitive" } },
        { rowLabel: { contains: token, mode: "insensitive" } },
        { colHeader: { contains: token, mode: "insensitive" } },
        { valueRaw: { contains: token, mode: "insensitive" } },
      ]),
    };
    if (scopedDocIds && scopedDocIds.length > 0) {
      where.documentId = { in: scopedDocIds };
    }

    let rows = (await prisma.documentChunk.findMany({
      where,
      take: Math.max(input.k * 8, 80),
      orderBy: [{ documentId: "asc" }, { chunkIndex: "asc" }, { id: "asc" }],
      include: {
        document: {
          select: {
            id: true,
            parentVersionId: true,
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

    if (!rows.length) {
      const broadWhere: Prisma.DocumentChunkWhereInput = {
        document: {
          userId: this.userId,
          status: { in: [...READY_DOCUMENT_STATUSES] },
        },
      };
      if (scopedDocIds && scopedDocIds.length > 0) {
        broadWhere.documentId = { in: scopedDocIds };
      }
      rows = (await prisma.documentChunk.findMany({
        where: broadWhere,
        take: Math.max(input.k * 12, 120),
        orderBy: [{ documentId: "asc" }, { chunkIndex: "asc" }, { id: "asc" }],
        include: {
          document: {
            select: {
              id: true,
              parentVersionId: true,
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
    }

    const plaintextByChunkId = await this.resolveChunkTexts(rows);

    const scored: Array<{
      docId: string;
      title: string | null;
      filename: string | null;
      location: ChunkLocation;
      locationKey: string;
      snippet: string;
      table?: TablePayload;
      score: number;
      chunkId: string;
    }> = [];
    for (const row of rows) {
      const snippet = toSnippet(plaintextByChunkId.get(row.id) ?? row.text);
      if (!snippet) continue;
      const score = scoreChunkText(snippet, query, tokens, input.mode);
      if (score <= 0) continue;
      const label = resolveDocLabel(row.document);
      const tablePayload = this.buildTablePayloadFromChunkRow(row, snippet);
      const sheet = sanitizeLocationToken(row.sheetName ?? null);
      const sectionKey = sanitizeLocationToken(
        row.sectionName ?? row.tableId ?? row.rowLabel ?? null,
      );
      scored.push({
        docId: row.documentId,
        title: label.title,
        filename: label.filename,
        location: {
          page: row.page ?? null,
          sheet,
          sectionKey,
          versionId: row.documentId,
          rootDocumentId: rootDocumentIdFor(row.document),
        } as ChunkLocation,
        locationKey: toLocationKey(row.documentId, {
          page: row.page ?? null,
          sheet,
          sectionKey,
          chunkIndex: row.chunkIndex,
        }),
        snippet,
        table: tablePayload,
        score,
        chunkId: row.id,
      });
    }

    const filteredScored = await this.keepLatestVersionHits(
      scored,
      scopedDocIds,
    );

    filteredScored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.docId !== b.docId) return a.docId.localeCompare(b.docId);
      if (a.locationKey !== b.locationKey)
        return a.locationKey.localeCompare(b.locationKey);
      return a.chunkId.localeCompare(b.chunkId);
    });

    return filteredScored.slice(0, Math.max(1, input.k));
  }

  private async runPineconeSemanticSearch(opts: {
    query: string;
    docIds?: string[];
    k: number;
  }): Promise<RetrievalHit[]> {
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
    const scopedDocIds = await this.resolveScopedDocIds(requestedDocIds);
    const targetDocIds = scopedDocIds ?? [];

    const queryEmbedding = (
      await embeddingsService.generateQueryEmbedding(query)
    ).embedding;

    let hits: Array<{
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
    }> = [];

    if (targetDocIds.length === 1) {
      hits = await pineconeService.searchSimilarChunks(
        queryEmbedding,
        this.userId,
        effectiveTopK,
        minSimilarity,
        targetDocIds[0],
      );
    } else if (targetDocIds.length > 1) {
      const perDocTopK = Math.max(
        Math.ceil(effectiveTopK / targetDocIds.length),
        6,
      );
      const grouped = await Promise.all(
        targetDocIds.map((docId) =>
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
      targetDocIds.length > 0
        ? hits.filter((hit) => targetDocIds.includes(hit.documentId))
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
        const sheet = sanitizeLocationToken(
          typeof md.sheet === "string"
            ? md.sheet
            : typeof md.sheetName === "string"
              ? md.sheetName
              : null,
        );
        const inferredSectionKey = sanitizeLocationToken(
          typeof md.sectionKey === "string"
            ? md.sectionKey
            : typeof md.sectionName === "string"
              ? md.sectionName
              : typeof md.tableId === "string"
                ? md.tableId
                : typeof md.rowLabel === "string"
                  ? md.rowLabel
                  : null,
        );
        const locationKey =
          String(md.locationKey || "").trim() ||
          toLocationKey(hit.documentId, {
            page: page ?? fallbackPage,
            sheet,
            slide,
            sectionKey: inferredSectionKey,
            chunkIndex,
          });
        const sectionKey =
          inferredSectionKey || sectionKeyFromLocation(locationKey, chunkIndex);
        const title = String(md.title || "").trim() || null;
        const filename =
          String(hit.document?.filename || md.filename || "").trim() || null;
        const snippet = toSnippet(
          hit.content || String(md.content || "") || hydrated?.text || "",
        );
        const versionId =
          typeof md.versionId === "string" && String(md.versionId).trim()
            ? String(md.versionId).trim()
            : hit.documentId;
        const rootDocumentId =
          typeof md.rootDocumentId === "string" && String(md.rootDocumentId).trim()
            ? String(md.rootDocumentId).trim()
            : typeof md.parentVersionId === "string" &&
                String(md.parentVersionId).trim()
              ? String(md.parentVersionId).trim()
              : versionId;
        const tablePayload = this.buildTablePayloadFromMetadata(md, snippet);

        return {
          docId: hit.documentId,
          title,
          filename,
          location: {
            page: page ?? fallbackPage,
            slide,
            sheet,
            sectionKey,
            versionId,
            rootDocumentId,
          } as ChunkLocation,
          snippet,
          table: tablePayload,
          score: clamp01(Number(hit.similarity || 0)),
          locationKey,
          chunkId: hydrated?.chunkId || `${hit.documentId}:${chunkIndex}`,
        };
      })
      .filter((item) => item.snippet.length > 0);

    const filteredNormalized = await this.keepLatestVersionHits(
      normalized,
      scopedDocIds,
    );

    filteredNormalized.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.docId !== b.docId) return a.docId.localeCompare(b.docId);
      const ak = String(a.locationKey || "");
      const bk = String(b.locationKey || "");
      if (ak !== bk) return ak.localeCompare(bk);
      return String(a.chunkId || "").localeCompare(String(b.chunkId || ""));
    });

    return filteredNormalized.slice(0, requestedK);
  }

  private buildTablePayloadFromMetadata(
    metadata: Record<string, unknown>,
    snippet: string,
  ): TablePayload | undefined {
    const chunkForm = String(metadata.tableChunkForm || "")
      .trim()
      .toLowerCase();
    if (!chunkForm) return undefined;

    const rowLabel = String(metadata.rowLabel || "").trim();
    const colHeader = String(metadata.colHeader || "").trim();
    const valueRaw = String(metadata.valueRaw || "").trim();
    const unitRaw = String(metadata.unitRaw || "").trim();
    const unitNormalized = String(metadata.unitNormalized || "").trim();

    if (chunkForm === "cell_centric") {
      const header = [rowLabel, colHeader].filter(Boolean);
      const cellText = valueRaw || snippet;
      return {
        header: header.length ? header : undefined,
        rows: [[cellText || null]],
        structureScore: 0.95,
        numericIntegrityScore: unitNormalized ? 0.92 : 0.78,
        warnings:
          unitRaw || unitNormalized
            ? undefined
            : ["unit_missing_for_cell_fact"],
      };
    }

    if (chunkForm === "row_aggregate") {
      return {
        header: rowLabel ? [rowLabel] : undefined,
        rows: [[snippet || null]],
        structureScore: 0.85,
        numericIntegrityScore: 0.8,
      };
    }

    if (chunkForm === "table_summary") {
      const sheetName = String(metadata.sheetName || "").trim();
      const tableId = String(metadata.tableId || "").trim();
      const header = [sheetName, tableId].filter(Boolean);
      return {
        header: header.length ? header : undefined,
        rows: [[snippet || null]],
        structureScore: 0.7,
        numericIntegrityScore: 0.7,
      };
    }

    return undefined;
  }

  private buildTablePayloadFromChunkRow(
    row: ChunkRow,
    snippet: string,
  ): TablePayload | undefined {
    const merged: Record<string, unknown> = {
      ...(row.metadata && typeof row.metadata === "object"
        ? row.metadata
        : {}),
      tableChunkForm: row.tableChunkForm ?? undefined,
      tableId: row.tableId ?? undefined,
      rowLabel: row.rowLabel ?? undefined,
      colHeader: row.colHeader ?? undefined,
      valueRaw: row.valueRaw ?? undefined,
      unitRaw: row.unitRaw ?? undefined,
      unitNormalized: row.unitNormalized ?? undefined,
      sheetName: row.sheetName ?? undefined,
    };
    return this.buildTablePayloadFromMetadata(merged, snippet);
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
      metadata: Record<string, unknown>;
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
