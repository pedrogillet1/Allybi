import { Prisma } from "@prisma/client";

import prisma from "../../../config/database";
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
  page: number | null;
  document: {
    id: string;
    filename: string | null;
    displayTitle: string | null;
    mimeType: string;
    createdAt: Date;
    updatedAt: Date;
  };
};

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
        mimeType: true,
        createdAt: true,
        updatedAt: true,
      },
      take: 5000,
      orderBy: { updatedAt: "desc" },
    });

    return docs.map((doc) => ({
      docId: doc.id,
      title: doc.displayTitle || doc.filename || null,
      filename: doc.filename || doc.displayTitle || null,
      mimeType: doc.mimeType || null,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    }));
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
        mimeType: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!doc) return null;
    return {
      docId: doc.id,
      title: doc.displayTitle || doc.filename || null,
      filename: doc.filename || doc.displayTitle || null,
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
      orderBy: { createdAt: "desc" },
      include: {
        document: {
          select: {
            id: true,
            filename: true,
            displayTitle: true,
            mimeType: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    })) as unknown as ChunkWithDocument[];

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
      const snippet = toSnippet(row.text);
      if (!snippet) continue;

      const score = scoreChunkText(snippet, query, tokens, input.mode);
      if (score <= 0) continue;

      scored.push({
        docId: row.documentId,
        title: row.document.displayTitle || row.document.filename || null,
        filename: row.document.filename || row.document.displayTitle || null,
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

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, Math.max(1, input.k));
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
