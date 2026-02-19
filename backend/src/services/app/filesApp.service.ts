// backend/src/services/files/filesApp.service.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * FilesAppService (ChatGPT-parity, file inventory + nav actions)
 * --------------------------------------------------------------
 * Centralizes "file_actions" operations used by chat nav pills and
 * document dashboards:
 *  - list files
 *  - filter by type/category/folder
 *  - sort
 *  - group
 *  - count_files
 *  - open / locate_file (where)
 *
 * Designed to support your routing/operator families:
 *  - file_actions family should prefer attachments over long text lists
 *  - open/where are terminal nav_pills (intro line + pill buttons only)
 *
 * Uses DocumentAppService as the source of truth for metadata.
 * Never returns absolute paths. URLs are server routes.
 */

import type {
  DocumentAppService,
  ClientDoc,
  DocTypeCategory,
  ListDocsOptions,
  WhereInfo,
} from "./documentsApp.service";

export type FileActionSortBy =
  | "updatedAt"
  | "createdAt"
  | "sizeBytes"
  | "title"
  | "filename";
export type SortDir = "asc" | "desc";

export type FileFilter = {
  docTypes?: DocTypeCategory[];
  mimeTypes?: string[];
  folderPath?: string | null;
  query?: string;
};

export type FileListResult = {
  docs: ClientDoc[];
  total: number;
  applied: {
    filter: FileFilter;
    sortBy: FileActionSortBy;
    sortDir: SortDir;
    limit: number;
  };
};

export type FileCountResult = {
  total: number;
  byType: Record<DocTypeCategory, number>;
};

export class FilesAppService {
  constructor(private readonly documentApp: DocumentAppService) {}

  async list(
    filter: FileFilter = {},
    opts?: { sortBy?: FileActionSortBy; sortDir?: SortDir; limit?: number },
  ): Promise<FileListResult> {
    const sortBy = opts?.sortBy ?? "updatedAt";
    const sortDir = opts?.sortDir ?? "desc";
    const limit =
      typeof opts?.limit === "number" ? Math.max(1, opts!.limit!) : 200;

    // DocumentAppService already filters/sorts deterministically
    const docs = await this.documentApp.listDocs({
      query: filter.query,
      docTypes: filter.docTypes,
      mimeTypes: filter.mimeTypes,
      sortBy,
      sortDir,
      limit,
    } as ListDocsOptions);

    // Optional folderPath filter (client-safe)
    const folder = filter.folderPath ? String(filter.folderPath) : null;
    const filtered = folder
      ? docs.filter((d) => (d.folderPath || null) === folder)
      : docs;

    return {
      docs: filtered,
      total: filtered.length,
      applied: { filter, sortBy, sortDir, limit },
    };
  }

  async count(filter: FileFilter = {}): Promise<FileCountResult> {
    const docs = await this.documentApp.listDocs({
      query: filter.query,
      docTypes: filter.docTypes,
      mimeTypes: filter.mimeTypes,
      sortBy: "updatedAt",
      sortDir: "desc",
      limit: 20000,
    });

    const byType: Record<DocTypeCategory, number> = {
      pdf: 0,
      spreadsheet: 0,
      slides: 0,
      image: 0,
      text: 0,
      unknown: 0,
    };

    for (const d of docs) {
      byType[d.docType] = (byType[d.docType] ?? 0) + 1;
    }

    return { total: docs.length, byType };
  }

  async open(
    docId: string,
  ): Promise<{ doc: ClientDoc | null; openUrl: string | null }> {
    const doc = await this.documentApp.getDoc(docId);
    return { doc, openUrl: doc?.openUrl ?? null };
  }

  async where(docId: string): Promise<WhereInfo> {
    return this.documentApp.where(docId);
  }

  /**
   * Group docs by docType (pdf/spreadsheet/slides/image/text/unknown).
   * This is a common “ChatGPT-like” grouping for file inventories.
   */
  async groupByType(
    filter: FileFilter = {},
    opts?: { sortBy?: FileActionSortBy; sortDir?: SortDir; limit?: number },
  ): Promise<Record<string, ClientDoc[]>> {
    const list = await this.list(filter, opts);
    const grouped: Record<string, ClientDoc[]> = {};
    for (const d of list.docs) {
      if (!grouped[d.docType]) grouped[d.docType] = [];
      grouped[d.docType].push(d);
    }
    return grouped;
  }
}

export default FilesAppService;
