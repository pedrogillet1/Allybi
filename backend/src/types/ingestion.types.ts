// src/types/ingestion.types.ts

import type {
  DocumentType,
  DocMimeType,
  DocExtension,
} from "./documents.types";
import type { DomainId } from "./domains.types";

/**
 * Ingestion = the pipeline that turns an uploaded file into:
 * 1) a stored file (local or S3)
 * 2) extracted text/structure (pdf/docx/xlsx/pptx/image OCR)
 * 3) an index-ready representation (chunks + metadata)
 *
 * This file is TYPE-ONLY. No runtime logic here.
 */

// ---------------------------------------------
// Core identifiers
// ---------------------------------------------

export type UploadId = string; // unique per upload attempt
export type UploadSessionId = string; // groups multiple parts or multi-file flow
export type DocumentId = string; // canonical doc id in your system
export type UserId = string;

// ---------------------------------------------
// Storage targets
// ---------------------------------------------

export type StorageBackend = "local" | "s3";

export interface StoredObjectRef {
  backend: StorageBackend;
  bucket?: string; // required for s3
  key?: string; // required for s3
  localPath?: string; // required for local
  publicUrl?: string; // optional (if you ever expose)
  sizeBytes: number;
  checksumSha256?: string; // optional but recommended
}

// ---------------------------------------------
// Upload inputs (frontend -> backend)
// ---------------------------------------------

export interface UploadInitRequest {
  userId: UserId;
  fileName: string;
  mimeType: DocMimeType | string;
  sizeBytes: number;

  /**
   * Optional UX metadata from frontend:
   * - folder/category selection
   * - tags
   * - user-provided display name
   */
  folderId?: string | null;
  categoryId?: string | null;
  tags?: string[];
  displayName?: string;

  /**
   * Optional: hint for how user expects the doc to be treated.
   * You can set this from UI selection (e.g., "Finance", "Legal").
   */
  domainHint?: DomainId | null;

  /**
   * Optional: replace/overwrite behavior.
   * - If replaceDocId is set: update existing doc version (new upload)
   */
  replaceDocId?: DocumentId | null;
}

export interface UploadInitResponse {
  uploadId: UploadId;
  sessionId: UploadSessionId;

  storage: StorageBackend;

  /**
   * For S3 multipart:
   * - create multipart upload and return uploadId/key + part instructions
   */
  multipart?: MultipartUploadInit;

  /**
   * For direct upload:
   * - e.g., presigned PUT URL or server endpoint
   */
  direct?: DirectUploadInit;

  limits: IngestionLimits;
}

// ---------------------------------------------
// Upload mechanisms
// ---------------------------------------------

export interface MultipartUploadInit {
  bucket: string;
  key: string;
  uploadId: string; // S3 multipart upload id
  partSizeBytes: number;
  maxParts: number;
}

export interface DirectUploadInit {
  /**
   * If you use presigned PUT:
   */
  presignedUrl?: string;

  /**
   * If you upload to backend directly:
   */
  uploadEndpoint?: string;

  headers?: Record<string, string>;
}

// ---------------------------------------------
// Limits & validation
// ---------------------------------------------

export interface IngestionLimits {
  maxFileSizeBytes: number;
  maxFilesPerSession: number;
  allowedExtensions: DocExtension[];
  allowedMimeTypes: string[];
  requireVirusScan?: boolean;
}

export type IngestionValidationStatus = "ok" | "rejected" | "warn";

export type IngestionRejectReason =
  | "file_too_large"
  | "unsupported_type"
  | "mime_mismatch"
  | "empty_file"
  | "corrupt_file"
  | "encrypted_pdf_unsupported"
  | "password_required"
  | "malware_suspected"
  | "policy_blocked";

export interface IngestionValidationResult {
  status: IngestionValidationStatus;
  reasons?: IngestionRejectReason[];
  warnings?: string[];
  detected: {
    extension: DocExtension | string;
    mimeType: string;
    docType: DocumentType | string;
  };
}

// ---------------------------------------------
// Ingestion pipeline stages
// ---------------------------------------------

export type IngestionStage =
  | "received"
  | "validated"
  | "stored"
  | "converted"
  | "extracted"
  | "chunked"
  | "embedded"
  | "indexed"
  | "completed"
  | "failed";

export type IngestionErrorCode =
  | "validation_failed"
  | "storage_failed"
  | "conversion_failed"
  | "extraction_failed"
  | "chunking_failed"
  | "embedding_failed"
  | "index_failed"
  | "timeout"
  | "unknown";

export interface IngestionProgress {
  stage: IngestionStage;
  /**
   * Optional numeric progress for long steps (OCR, embeddings, etc.)
   * Use 0..1, keep it monotonic if possible.
   */
  pct?: number;

  /**
   * Short UI-safe status message (no stack traces).
   */
  message?: string;

  /**
   * Debug-only details, never show to normal users unless in debug UI.
   */
  debug?: Record<string, any>;
}

export interface IngestionFailure {
  code: IngestionErrorCode;
  message: string; // user-safe message
  retryable: boolean;
  details?: Record<string, any>; // internal / logs
}

// ---------------------------------------------
// Extraction outputs
// ---------------------------------------------

export type ExtractionEngine =
  | "pdf_text"
  | "pdf_ocr"
  | "docx"
  | "xlsx"
  | "pptx"
  | "image_ocr"
  | "txt"
  | "unknown";

export interface ExtractionStats {
  engine: ExtractionEngine;
  charCount: number;
  pageCount?: number;
  sheetCount?: number;
  slideCount?: number;

  /**
   * OCR quality if applicable
   */
  ocrAvgConfidence?: number; // 0..1
  ocrLanguage?: string; // e.g. "por", "eng"
  gibberishScore?: number; // 0..1 (optional)
}

export interface ExtractedAnchor {
  /**
   * Used for precise citations in UI (page/sheet/cell/slide).
   */
  type: "page" | "sheet" | "slide" | "cell" | "section";
  value: string | number;
  label?: string; // e.g. "Page 3", "Sheet2!B12"
}

export interface ExtractedChunk {
  chunkId: string;
  text: string;
  anchor?: ExtractedAnchor;

  /**
   * Optional signals used in ranking/quality gates.
   */
  tokenCount?: number;
  charCount?: number;
  scoreHints?: {
    isTable?: boolean;
    isHeading?: boolean;
    isList?: boolean;
  };
}

export interface ExtractionResult {
  stats: ExtractionStats;
  /**
   * Raw extracted text (optional). Some systems only keep chunks.
   */
  text?: string;

  /**
   * Chunked representation for retrieval.
   */
  chunks: ExtractedChunk[];

  /**
   * Detected domains/entities, if your ingestion does pre-tagging.
   */
  domainHints?: DomainId[];
  entities?: Array<{ type: string; value: string; confidence?: number }>;
}

// ---------------------------------------------
// Indexing outputs
// ---------------------------------------------

export interface IndexWriteResult {
  documentId: DocumentId;
  versionId?: string;
  indexedAt: string; // ISO

  /**
   * Search-index references, if any.
   */
  vectorIndexName?: string;
  vectorCount?: number;

  /**
   * Metadata persisted for UI.
   */
  displayName?: string;
  fileName: string;
  docType: DocumentType | string;
  mimeType: string;
  sizeBytes: number;
  storageRef: StoredObjectRef;
}

// ---------------------------------------------
// Canonical ingestion job state
// ---------------------------------------------

export interface IngestionJob {
  uploadId: UploadId;
  sessionId: UploadSessionId;
  userId: UserId;

  fileName: string;
  mimeType: string;
  sizeBytes: number;

  createdAt: string; // ISO
  updatedAt: string; // ISO

  validation?: IngestionValidationResult;

  storageRef?: StoredObjectRef;

  progress: IngestionProgress;

  extraction?: ExtractionResult;
  indexWrite?: IndexWriteResult;

  failed?: IngestionFailure;

  /**
   * Convenience flags for UI.
   */
  isComplete: boolean;
  isFailed: boolean;
}

// ---------------------------------------------
// API responses for ingestion endpoints
// ---------------------------------------------

export interface UploadStatusResponse {
  uploadId: UploadId;
  job: IngestionJob;
}

export interface UploadCompleteRequest {
  uploadId: UploadId;
  sessionId: UploadSessionId;

  /**
   * For S3 multipart completion.
   */
  multipartComplete?: {
    bucket: string;
    key: string;
    uploadId: string;
    parts: Array<{ partNumber: number; etag: string }>;
  };
}

export interface UploadCompleteResponse {
  uploadId: UploadId;
  documentId: DocumentId;
  indexed: boolean;
  job: IngestionJob;
}

// ---------------------------------------------
// Optional: “smart” doc classification hints
// ---------------------------------------------

export interface DocClassificationHint {
  domainHint?: DomainId | null;
  languageHint?: "en" | "pt" | "es" | string;
  isScanned?: boolean;
  isSpreadsheet?: boolean;
  containsTablesLikely?: boolean;
}
