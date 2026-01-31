/* eslint-disable @typescript-eslint/no-explicit-any */

import type { AnalyticsConfig } from "../config";
import type { FilesResponse, DateRange } from "../types";
import DocumentsRepo from "../repositories/documents.repo";

/**
 * files.aggregator.ts (Koda)
 * --------------------------
 * Builds the Admin "Files" dashboard payload:
 *  - paginated documents table
 *  - status breakdown for quick health widgets
 *  - preview pipeline hints (PPTX preview status)
 */

export interface FilesAggregatorDeps {
  prisma: any;
  redis?: any;
  config: AnalyticsConfig;
}

export interface FilesQueryInput {
  range: DateRange;

  userId?: string;
  status?: string;
  mimeType?: string;
  folderId?: string;
  filenameContains?: string;
  hasPreviewErrors?: boolean;

  limit?: number;
  cursor?: string | null;
}

export class FilesAggregator {
  private docsRepo: DocumentsRepo;

  constructor(private deps: FilesAggregatorDeps) {
    const cfg = deps.config;
    this.docsRepo = new DocumentsRepo(deps.prisma, { maxLimit: cfg.maxPageSize, defaultLimit: cfg.defaultPageSize });
  }

  async build(input: FilesQueryInput): Promise<FilesResponse> {
    const range = input.range;

    const [page, breakdown] = await Promise.all([
      this.docsRepo.list(
        {
          range,
          userId: input.userId,
          status: input.status,
          mimeType: input.mimeType,
          folderId: input.folderId,
          filenameContains: input.filenameContains,
          hasPreviewErrors: input.hasPreviewErrors,
        },
        {
          limit: input.limit,
          cursor: input.cursor || null,
        }
      ),
      this.docsRepo.statusBreakdown({ range, userId: input.userId }),
    ]);

    // Map DocumentRow -> FileRow contract expected by admin frontend
    const items = page.items.map((d: any) => ({
      id: d.id,
      userId: d.userId ?? null,
      filename: d.filename ?? null,
      mimeType: d.mimeType ?? null,
      sizeBytes: d.fileSize ?? null,
      status: d.status ?? null,
      createdAt: d.createdAt ?? null,
      updatedAt: d.updatedAt ?? null,
      lastQueriedAt: null, // if you track lastQueriedAt in DocumentProcessingMetrics, wire it later
      previewStatus: d.previewPdfStatus ?? null,
    }));

    return {
      range,
      page: { items, nextCursor: page.nextCursor },
      stats: {
        statusBreakdown: breakdown,
        returned: items.length,
        nextCursor: page.nextCursor,
      },
    };
  }
}

export default FilesAggregator;
