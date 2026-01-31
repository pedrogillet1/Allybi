/* eslint-disable @typescript-eslint/no-explicit-any */

import type { DateRange } from "../types";

/**
 * documents.repo.ts (Koda)
 * ------------------------
 * Read-only repository for Documents + DocumentMetadata (preview status, extraction, etc.)
 *
 * Use cases:
 *  - Admin "Files" dashboard table
 *  - Upload pipeline health (ready/failed/enriching counts)
 *  - Preview generation health (PPTX previewPdfStatus / slideGenerationStatus)
 *
 * Notes:
 *  - Keeps responses light by default (no rawText/extractedText)
 *  - Use getById() for drill-down
 */

export interface DocumentsRepoConfig {
  maxLimit: number;
  defaultLimit: number;
}

export interface DocumentsFilters {
  range: DateRange;
  userId?: string;
  status?: string;        // uploaded/enriching/ready/failed
  mimeType?: string;      // exact match
  folderId?: string;
  filenameContains?: string;
  hasPreviewErrors?: boolean;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface DocumentRow {
  id: string;
  userId: string;

  filename: string;
  mimeType: string;
  fileSize: number;

  status: string;
  createdAt: string;
  updatedAt: string;

  folderId?: string | null;

  language?: string | null;
  chunksCount?: number | null;
  embeddingsGenerated?: boolean | null;

  // Preview / conversion (PPTX)
  previewPdfStatus?: string | null;
  previewPdfAttempts?: number | null;
  previewPdfUpdatedAt?: string | null;
  previewPdfError?: string | null;

  slideGenerationStatus?: string | null;
  slideGenerationError?: string | null;

  // Extraction hints
  pageCount?: number | null;
  wordCount?: number | null;
  ocrConfidence?: number | null;
}

function clampInt(n: any, min: number, max: number, fallback: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

function toDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

export class DocumentsRepo {
  constructor(private prisma: any, private cfg: DocumentsRepoConfig) {}

  async list(
    filters: DocumentsFilters,
    opts: { limit?: number; cursor?: string | null } = {}
  ): Promise<CursorPage<DocumentRow>> {
    const limit = clampInt(opts.limit, 1, this.cfg.maxLimit, this.cfg.defaultLimit);
    const cursor = opts.cursor || null;

    const where: any = {
      createdAt: { gte: toDate(filters.range.from), lt: toDate(filters.range.to) },
      // hide deleted folders by default in higher layers (or add filter here)
    };

    if (filters.userId) where.userId = filters.userId;
    if (filters.status) where.status = filters.status;
    if (filters.mimeType) where.mimeType = filters.mimeType;
    if (filters.folderId) where.folderId = filters.folderId;

    if (filters.filenameContains) {
      where.filename = { contains: filters.filenameContains, mode: "insensitive" };
    }

    // Preview error filter (uses DocumentMetadata fields)
    if (typeof filters.hasPreviewErrors === "boolean") {
      where.metadata = filters.hasPreviewErrors
        ? { is: { OR: [{ previewPdfError: { not: null } }, { slideGenerationError: { not: null } }] } }
        : { is: { AND: [{ previewPdfError: null }, { slideGenerationError: null }] } };
    }

    const rows = await this.prisma.document.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        userId: true,
        filename: true,
        mimeType: true,
        fileSize: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        folderId: true,
        language: true,
        chunksCount: true,
        embeddingsGenerated: true,
        metadata: {
          select: {
            pageCount: true,
            wordCount: true,
            ocrConfidence: true,
            previewPdfStatus: true,
            previewPdfAttempts: true,
            previewPdfUpdatedAt: true,
            previewPdfError: true,
            slideGenerationStatus: true,
            slideGenerationError: true,
          },
        },
      },
    });

    const hasNext = rows.length > limit;
    const page = hasNext ? rows.slice(0, limit) : rows;
    const nextCursor = hasNext ? page[page.length - 1]?.id ?? null : null;

    return {
      items: page.map((r: any) => ({
        id: r.id,
        userId: r.userId,

        filename: r.filename,
        mimeType: r.mimeType,
        fileSize: Number(r.fileSize ?? 0),

        status: r.status,
        createdAt: new Date(r.createdAt).toISOString(),
        updatedAt: new Date(r.updatedAt).toISOString(),

        folderId: r.folderId ?? null,

        language: r.language ?? null,
        chunksCount: r.chunksCount ?? null,
        embeddingsGenerated: Boolean(r.embeddingsGenerated ?? false),

        previewPdfStatus: r.metadata?.previewPdfStatus ?? null,
        previewPdfAttempts: r.metadata?.previewPdfAttempts ?? null,
        previewPdfUpdatedAt: r.metadata?.previewPdfUpdatedAt ? new Date(r.metadata.previewPdfUpdatedAt).toISOString() : null,
        previewPdfError: r.metadata?.previewPdfError ?? null,

        slideGenerationStatus: r.metadata?.slideGenerationStatus ?? null,
        slideGenerationError: r.metadata?.slideGenerationError ?? null,

        pageCount: r.metadata?.pageCount ?? null,
        wordCount: r.metadata?.wordCount ?? null,
        ocrConfidence: r.metadata?.ocrConfidence ?? null,
      })),
      nextCursor,
    };
  }

  async getById(documentId: string) {
    if (!documentId) return null;
    return this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        metadata: true,
        processingMetrics: true,
      },
    });
  }

  async statusBreakdown(filters: DocumentsFilters) {
    const where: any = {
      createdAt: { gte: toDate(filters.range.from), lt: toDate(filters.range.to) },
    };
    if (filters.userId) where.userId = filters.userId;

    const grouped = await this.prisma.document.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    });

    const total = grouped.reduce((sum: number, g: any) => sum + (g._count._all ?? 0), 0);

    return {
      total,
      byStatus: grouped.map((g: any) => ({ key: g.status, count: g._count._all })),
    };
  }
}

export default DocumentsRepo;
