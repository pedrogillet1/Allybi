/**
 * ============================================================================
 * KODA UPLOAD SYSTEM - TYPE DEFINITIONS
 * ============================================================================
 *
 * Complete TypeScript types for the upload system
 *
 * @version 2.0.0
 * @date 2024-12-10
 */

// ============================================================================
// DOCUMENT TYPES
// ============================================================================

export enum DocumentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  DELETING = 'deleting',
}

export enum FileType {
  PDF = 'pdf',
  DOCX = 'docx',
  XLSX = 'xlsx',
  PPTX = 'pptx',
  TXT = 'txt',
  IMAGE = 'image',
  UNKNOWN = 'unknown',
}

export interface Document {
  id: string;
  userId: string;
  folderId?: string;
  filename: string;
  displayTitle?: string;
  encryptedFilename: string;
  mimeType: string;
  fileType: FileType;
  size: number;
  status: DocumentStatus;
  uploadedAt: Date;
  processedAt?: Date;
  error?: string;
  s3Key: string;
  s3Bucket: string;
  pageCount?: number;
  wordCount?: number;
  language?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentMetadata {
  id: string;
  documentId: string;
  extractedText?: string;
  ocrConfidence?: number;
  thumbnailUrl?: string;
  author?: string;
  createdDate?: Date;
  modifiedDate?: Date;
  keywords?: string[];
  summary?: string;
  entities?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentChunk {
  chunkIndex: number;
  text: string;
  metadata: {
    pageNumber?: number;
    sectionHeading?: string;
    docTitle?: string;
    chunkType?: string;
  };
}

export interface DocumentEmbedding {
  id: string;
  documentId: string;
  chunkIndex: number;
  chunkText: string;
  embedding: number[];
  pineconeId: string;
  metadata: Record<string, any>;
  createdAt: Date;
}

// ============================================================================
// UPLOAD TYPES
// ============================================================================

export interface CreateDocumentPayload {
  filename: string;
  s3Key: string;
  size: number;
  mimeType: string;
  folderId?: string;
}

export interface MultipartUploadInitiatePayload {
  filename: string;
  fileType: string;
  fileSize: number;
}

export interface MultipartUploadInitiateResponse {
  uploadId: string;
  key: string;
}

export interface PresignedUrlRequest {
  uploadId: string;
  key: string;
  partNumbers: number[];
}

export interface PresignedUrlResponse {
  urls: Array<{
    partNumber: number;
    url: string;
  }>;
}

export interface MultipartUploadPart {
  PartNumber: number;
  ETag: string;
}

export interface CompleteMultipartUploadPayload {
  uploadId: string;
  key: string;
  parts: MultipartUploadPart[];
}

export interface CompleteMultipartUploadResponse {
  location: string;
  key: string;
}

// ============================================================================
// TEXT EXTRACTION TYPES
// ============================================================================

export interface TextExtractionResult {
  fullText: string;
  pageCount: number;
  languageGuess: string;
  ocrConfidence?: number;
  metadata?: Record<string, any>;
}

export interface PDFExtractionOptions {
  preserveFormatting?: boolean;
  extractImages?: boolean;
}

export interface OCROptions {
  language?: string;
  confidence?: number;
}

// ============================================================================
// CHUNKING TYPES
// ============================================================================

export interface ChunkingOptions {
  chunkSize?: number; // in tokens
  overlapSize?: number; // in tokens
  respectSentences?: boolean;
  respectParagraphs?: boolean;
}

export interface ChunkingResult {
  chunks: DocumentChunk[];
  totalChunks: number;
  averageChunkSize: number;
}

// ============================================================================
// EMBEDDING TYPES
// ============================================================================

export interface EmbeddingOptions {
  model?: string;
  batchSize?: number;
  maxRetries?: number;
  timeout?: number;
}

export interface EmbeddingResult {
  embeddings: number[][];
  model: string;
  usage: {
    totalTokens: number;
    promptTokens: number;
  };
}

// ============================================================================
// VECTOR STORE TYPES
// ============================================================================

export interface VectorStoreRecord {
  id: string;
  values: number[];
  metadata: {
    documentId: string;
    userId: string;
    chunkIndex: number;
    chunkText: string;
    filename: string;
    pageNumber?: number;
    chunkType?: string;
  };
}

export interface VectorStoreUpsertResult {
  upsertedCount: number;
  namespace?: string;
}

export interface VectorStoreQueryOptions {
  topK?: number;
  filter?: Record<string, any>;
  includeMetadata?: boolean;
  includeValues?: boolean;
}

export interface VectorStoreQueryResult {
  matches: Array<{
    id: string;
    score: number;
    values?: number[];
    metadata?: Record<string, any>;
  }>;
}

// ============================================================================
// QUEUE TYPES
// ============================================================================

export enum QueueName {
  DOCUMENT_CORE = 'documents:core',
  DOCUMENT_ENRICHMENT = 'documents:enrichment',
  DOCUMENT_DELETE = 'documents:delete',
}

export enum JobName {
  PROCESS_DOCUMENT_CORE = 'process-document-core',
  PROCESS_DOCUMENT_ENRICHMENT = 'process-document-enrichment',
  DELETE_DOCUMENT = 'delete-document',
}

export interface ProcessDocumentCoreJob {
  documentId: string;
}

export interface ProcessDocumentEnrichmentJob {
  documentId: string;
}

export interface DeleteDocumentJob {
  documentId: string;
  userId: string;
}

export interface QueueConfig {
  name: string;
  concurrency: number;
  retries: number;
  backoff: 'fixed' | 'exponential';
  timeout?: number;
}

// ============================================================================
// SERVICE RESPONSE TYPES
// ============================================================================

export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export interface ProcessingResult {
  documentId: string;
  status: DocumentStatus;
  chunksCreated: number;
  embeddingsGenerated: number;
  processingTimeMs: number;
  error?: string;
}

export interface EnrichmentResult {
  documentId: string;
  summary?: string;
  keywords?: string[];
  entities?: Record<string, any>;
  thumbnailUrl?: string;
  processingTimeMs: number;
  error?: string;
}

export interface DeleteResult {
  documentId: string;
  deletedFromVectorStore: boolean;
  deletedFromS3: boolean;
  deletedFromDB: boolean;
  error?: string;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface GetDocumentsQuery {
  folderId?: string;
  status?: DocumentStatus;
  fileType?: FileType;
  limit?: number;
  offset?: number;
  sortBy?: 'uploadedAt' | 'filename' | 'size';
  sortOrder?: 'asc' | 'desc';
}

export interface GetDocumentsResponse {
  documents: Document[];
  total: number;
  limit: number;
  offset: number;
}

export interface GetDocumentStatusResponse {
  status: DocumentStatus;
  progress?: number;
  error?: string;
  processingStartedAt?: Date;
  estimatedCompletionAt?: Date;
}

export interface UpdateDocumentPayload {
  displayTitle?: string;
  folderId?: string;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  INVALID_FILE_TYPE = 'INVALID_FILE_TYPE',
  UPLOAD_FAILED = 'UPLOAD_FAILED',
  PROCESSING_FAILED = 'PROCESSING_FAILED',
  DOCUMENT_NOT_FOUND = 'DOCUMENT_NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export class UploadError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: Record<string, any>
  ) {
    super(message);
    this.name = 'UploadError';
  }
}

// ============================================================================
// VALIDATION SCHEMAS (for zod)
// ============================================================================

export interface ValidationSchema {
  createDocument: any;
  updateDocument: any;
  initiateUpload: any;
  completeUpload: any;
  getDocuments: any;
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

export interface UploadConfig {
  MAX_FILE_SIZE: number;
  CHUNK_SIZE: number;
  ALLOWED_MIME_TYPES: string[];
  PRESIGNED_URL_EXPIRY: number;
  MAX_CONCURRENT_UPLOADS: number;
}

export interface StorageConfig {
  S3_BUCKET: string;
  S3_REGION: string;
  S3_ACCESS_KEY: string;
  S3_SECRET_KEY: string;
}

export interface EmbeddingConfig {
  MODEL: string;
  BATCH_SIZE: number;
  MAX_RETRIES: number;
  TIMEOUT: number;
  API_KEY: string;
}

export interface QueueConfigMap {
  CORE: QueueConfig;
  ENRICHMENT: QueueConfig;
  DELETE: QueueConfig;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type AsyncResult<T> = Promise<ServiceResponse<T>>;

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  DocumentStatus,
  FileType,
  QueueName,
  JobName,
  ErrorCode,
  UploadError,
};
