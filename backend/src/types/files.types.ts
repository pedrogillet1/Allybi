// src/types/files.types.ts
/**
 * FILES TYPES (Chat + Documents UI contract)
 *
 * Goals:
 * - Canonical file metadata shape used across: inventory, list/filter/sort, source buttons, attachments.
 * - Stable IDs + predictable optional fields for mixed backends (local/S3).
 * - Works for "See all" navigation from chat → documents screen (filterExtensions, query, domain, folder).
 */

export type DocId = string; // e.g. "doc:abc123"
export type ISODateTime = string; // new Date().toISOString()

export type StorageProvider = "local" | "s3" | "gcs" | "azure" | "unknown";

export type DocType =
  | "pdf"
  | "doc"
  | "docx"
  | "ppt"
  | "pptx"
  | "xls"
  | "xlsx"
  | "csv"
  | "txt"
  | "md"
  | "json"
  | "png"
  | "jpg"
  | "jpeg"
  | "webp"
  | "heic"
  | "tiff"
  | "unknown";

export type MimeType =
  | "application/pdf"
  | "application/msword"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  | "application/vnd.ms-powerpoint"
  | "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  | "application/vnd.ms-excel"
  | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  | "text/plain"
  | "text/markdown"
  | "text/csv"
  | "application/json"
  | "image/png"
  | "image/jpeg"
  | "image/webp"
  | "image/heic"
  | "image/tiff"
  | string;

export type IngestionStatus =
  | "queued"
  | "uploading"
  | "uploaded"
  | "extracting"
  | "indexing"
  | "ready"
  | "failed";

export type ExtractionStatus = "not_started" | "running" | "success" | "failed";

export type IndexStatus = "not_started" | "running" | "success" | "failed";

export type DocumentVisibility = "private" | "shared" | "workspace" | "public";

export interface FileLocation {
  /** Optional folder path used by docs screen navigation */
  folderPath?: string; // e.g. "/Finance/2025/"
  /** Optional folder id if you use hierarchical folders */
  folderId?: string;
  /** Optional category id if you use categories */
  categoryId?: string;
}

export interface FileIndexingInfo {
  ingestionStatus: IngestionStatus;
  extractionStatus: ExtractionStatus;
  indexStatus: IndexStatus;

  /** Useful for UX */
  progressPct?: number; // 0..100
  message?: string;

  /** Fail details (kept short for UI; raw logs should be server-side only) */
  errorCode?: string;
  errorMessage?: string;
  failedAt?: ISODateTime;
  startedAt?: ISODateTime;
  completedAt?: ISODateTime;
}

export interface DocumentFile {
  /** Canonical document id used everywhere (chat sources, retrieval, previews) */
  documentId: DocId;

  /** Display title shown to user (may differ from filename) */
  title: string;

  /** Original filename as uploaded */
  filename: string;

  /** File type info */
  docType: DocType;
  mimeType: MimeType;

  /** Storage */
  storageProvider?: StorageProvider;
  storageKey?: string; // S3 key / local path key (not a filesystem path exposed to client)
  sizeBytes?: number;

  /** Dates */
  uploadedAt?: ISODateTime;
  updatedAt?: ISODateTime;
  lastAccessedAt?: ISODateTime;

  /** Where it lives in UI */
  location?: FileLocation;

  /** Light metadata for list/search UI */
  tags?: string[];
  domainHint?: string; // output of domain_detection (top domain id)
  languageHint?: string; // 'en' | 'pt' | 'es' | etc.

  /** Indexing/processing status for upload UX */
  indexing?: FileIndexingInfo;

  /** Optional preview pointers */
  thumbnailUrl?: string; // signed or proxied URL
  previewUrl?: string; // signed or proxied URL

  /** Permissions */
  visibility?: DocumentVisibility;
  ownerUserId?: string;
}

/**
 * File inventory query contract (documents screen + chat "see all")
 */
export interface FileQuery {
  queryText?: string; // keyword search in filename/title/snippets
  folderId?: string;
  folderPath?: string;
  categoryId?: string;
  tags?: string[];

  /** Filter by file types/extensions */
  docTypes?: DocType[];
  extensions?: string[]; // ["pdf","xlsx"] if your frontend uses raw ext

  /** Domain filter (if user asked "legal files", etc.) */
  domain?: string;

  /** Time filters */
  uploadedAfter?: ISODateTime;
  uploadedBefore?: ISODateTime;

  /** Pagination */
  limit?: number; // default 20
  cursor?: string; // opaque server cursor
  offset?: number; // optional (cursor preferred)
}

export type FileSortKey =
  | "uploadedAt"
  | "updatedAt"
  | "filename"
  | "title"
  | "sizeBytes"
  | "docType";

import type { SortDirection } from "./common.types";
export type { SortDirection } from "./common.types";

export interface FileSort {
  key: FileSortKey;
  direction: SortDirection;
}

export interface FileListResponse {
  items: DocumentFile[];
  totalCount: number;
  nextCursor?: string;
  appliedQuery?: FileQuery;
  appliedSort?: FileSort;
}

/**
 * Chat attachment: file list (for "list my files", "show excel files", etc.)
 * Frontend can render as a dedicated list UI, with optional "See all".
 */
export interface FileListAttachment {
  type: "file_list";
  items: DocumentFile[];
  totalCount: number;

  /** Chat → Documents deep-link behavior */
  seeAll?: {
    label: string; // "See all"
    totalCount: number;
    remainingCount: number;

    /** Optional filters to apply on docs page */
    filterExtensions?: string[]; // ["xlsx","xls","csv"]
    filterDocTypes?: DocType[];
    domain?: string;
    folderId?: string;
    folderPath?: string;
    queryText?: string;
  };
}

/**
 * Upload session types (large uploads / multipart)
 */
export type UploadSessionStatus =
  | "created"
  | "uploading"
  | "finalizing"
  | "completed"
  | "failed"
  | "aborted";

export interface UploadSession {
  uploadSessionId: string;
  documentId?: DocId;

  filename: string;
  mimeType: MimeType;
  sizeBytes?: number;

  status: UploadSessionStatus;
  createdAt: ISODateTime;
  updatedAt?: ISODateTime;

  /** Optional multipart info */
  provider?: StorageProvider;
  partsUploaded?: number;
  partsTotal?: number;

  errorCode?: string;
  errorMessage?: string;
}

/**
 * Deletion job/progress (async delete UX)
 */
export type DeleteJobStatus = "queued" | "running" | "completed" | "failed";

export interface DeleteJob {
  jobId: string;
  documentIds: DocId[];
  status: DeleteJobStatus;
  createdAt: ISODateTime;
  updatedAt?: ISODateTime;

  progressPct?: number; // 0..100
  deletedCount?: number;
  totalCount?: number;

  errorCode?: string;
  errorMessage?: string;
}

/**
 * Helper: infer DocType from filename (frontend convenience only)
 */
export function inferDocTypeFromFilename(filename: string): DocType {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  if (!ext) return "unknown";
  if (ext === "jpg") return "jpg";
  if (ext === "jpeg") return "jpeg";
  if (ext === "png") return "png";
  if (ext === "webp") return "webp";
  if (ext === "heic") return "heic";
  if (ext === "tiff" || ext === "tif") return "tiff";
  if (ext === "pdf") return "pdf";
  if (ext === "doc") return "doc";
  if (ext === "docx") return "docx";
  if (ext === "ppt") return "ppt";
  if (ext === "pptx") return "pptx";
  if (ext === "xls") return "xls";
  if (ext === "xlsx") return "xlsx";
  if (ext === "csv") return "csv";
  if (ext === "txt") return "txt";
  if (ext === "md") return "md";
  if (ext === "json") return "json";
  return "unknown";
}
