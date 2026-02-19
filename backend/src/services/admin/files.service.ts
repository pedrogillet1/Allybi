/**
 * Files Service
 * File/document analytics and details
 */

import type { PrismaClient } from "@prisma/client";
import {
  parseRange,
  formatWindow,
  normalizeRange,
} from "./_shared/rangeWindow";
import { clampLimit } from "./_shared/clamp";
import { processPage, buildCursorClause } from "./_shared/pagination";
import { supportsModel } from "./_shared/prismaAdapter";

export interface FileRow {
  documentId: string;
  filename: string | null;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string;
  statusOk: boolean;
  statusFail: boolean;
  extractionMethod: string | null;
  chunkCountAvg: number;
  durationMsAvg: number;
}

export interface FileListResult {
  range: string;
  items: FileRow[];
  nextCursor?: string;
  counts: {
    total: number;
    ready: number;
    failed: number;
    processing: number;
  };
}

export interface FileDetailResult {
  range: string;
  events: Array<{
    at: string;
    status: string;
    errorCode: string | null;
    durationMs: number | null;
  }>;
  stats: {
    totalEvents: number;
    successCount: number;
    failCount: number;
    avgDurationMs: number;
    totalChunks: number;
  };
}

/**
 * List files with ingestion stats
 */
export async function listFiles(
  prisma: PrismaClient,
  params: { range?: string; limit?: number; cursor?: string },
): Promise<FileListResult> {
  const rangeKey = normalizeRange(params.range, "7d");
  const window = parseRange(rangeKey);
  const limit = clampLimit(params.limit, 50);
  const cursorClause = buildCursorClause(params.cursor);

  const { from, to } = window;

  // Get aggregate counts for KPIs (all time, not filtered by range)
  const [totalCount, readyCount, failedCount, processingCount] =
    await Promise.all([
      prisma.document.count(),
      prisma.document.count({
        where: { status: { in: ["ready", "available", "indexed"] } },
      }),
      prisma.document.count({ where: { status: "failed" } }),
      prisma.document.count({
        where: { status: { in: ["uploaded", "enriching"] } },
      }),
    ]);

  // Get documents with pagination (all documents, not filtered by range)
  const documents = await prisma.document.findMany({
    take: limit + 1,
    ...cursorClause,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      filename: true,
      mimeType: true,
      fileSize: true,
      status: true,
      createdAt: true,
      chunksCount: true,
    },
  });

  const { page, nextCursor } = processPage(documents, limit);
  const docIds = page.map((d) => d.id);

  // Get ingestion events for these documents
  let ingestionMap = new Map<
    string,
    {
      statusOk: boolean;
      statusFail: boolean;
      extractionMethod: string | null;
      durationMs: number | null;
    }
  >();

  if (supportsModel(prisma, "ingestionEvent") && docIds.length > 0) {
    const events = await prisma.ingestionEvent.findMany({
      where: { documentId: { in: docIds } },
      select: {
        documentId: true,
        status: true,
        extractionMethod: true,
        durationMs: true,
      },
      orderBy: { at: "desc" },
    });

    // Get latest event per document
    for (const e of events) {
      if (e.documentId && !ingestionMap.has(e.documentId)) {
        ingestionMap.set(e.documentId, {
          statusOk: e.status === "ok",
          statusFail: e.status === "fail",
          extractionMethod: e.extractionMethod,
          durationMs: e.durationMs,
        });
      }
    }
  }

  // Build file rows
  const items: FileRow[] = page.map((d) => {
    const ingestion = ingestionMap.get(d.id);
    return {
      documentId: d.id,
      filename: d.filename,
      mimeType: d.mimeType,
      sizeBytes: d.fileSize,
      uploadedAt: d.createdAt.toISOString(),
      statusOk:
        ingestion?.statusOk ??
        (d.status === "ready" || d.status === "available"),
      statusFail: ingestion?.statusFail ?? d.status === "failed",
      extractionMethod: ingestion?.extractionMethod ?? null,
      chunkCountAvg: d.chunksCount ?? 0,
      durationMsAvg: ingestion?.durationMs ?? 0,
    };
  });

  return {
    range: rangeKey,
    items,
    ...(nextCursor ? { nextCursor } : {}),
    counts: {
      total: totalCount,
      ready: readyCount,
      failed: failedCount,
      processing: processingCount,
    },
  };
}

/**
 * Get detailed file stats
 */
export async function getFileDetail(
  prisma: PrismaClient,
  params: { fileId: string; range?: string },
): Promise<FileDetailResult> {
  const rangeKey = normalizeRange(params.range, "7d");
  const window = parseRange(rangeKey);
  const { from, to } = window;
  const { fileId } = params;

  // Get document
  const document = await prisma.document.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      chunksCount: true,
    },
  });

  if (!document) {
    return {
      range: rangeKey,
      events: [],
      stats: {
        totalEvents: 0,
        successCount: 0,
        failCount: 0,
        avgDurationMs: 0,
        totalChunks: 0,
      },
    };
  }

  // Get ingestion events for this document
  let events: Array<{
    at: string;
    status: string;
    errorCode: string | null;
    durationMs: number | null;
  }> = [];
  let stats = {
    totalEvents: 0,
    successCount: 0,
    failCount: 0,
    avgDurationMs: 0,
    totalChunks: document.chunksCount ?? 0,
  };

  if (supportsModel(prisma, "ingestionEvent")) {
    const ingestionEvents = await prisma.ingestionEvent.findMany({
      where: {
        documentId: fileId,
        at: { gte: from, lt: to },
      },
      orderBy: { at: "desc" },
      take: 100,
      select: {
        at: true,
        status: true,
        errorCode: true,
        durationMs: true,
      },
    });

    events = ingestionEvents.map((e) => ({
      at: e.at.toISOString(),
      status: e.status,
      errorCode: e.errorCode,
      durationMs: e.durationMs,
    }));

    const successCount = ingestionEvents.filter(
      (e) => e.status === "ok",
    ).length;
    const failCount = ingestionEvents.filter((e) => e.status === "fail").length;
    const totalDuration = ingestionEvents.reduce(
      (sum, e) => sum + (e.durationMs ?? 0),
      0,
    );

    stats = {
      totalEvents: ingestionEvents.length,
      successCount,
      failCount,
      avgDurationMs:
        ingestionEvents.length > 0
          ? Math.round(totalDuration / ingestionEvents.length)
          : 0,
      totalChunks: document.chunksCount ?? 0,
    };
  }

  return {
    range: rangeKey,
    events,
    stats,
  };
}
