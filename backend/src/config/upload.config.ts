/**
 * Upload Configuration
 * Centralized configuration for file uploads including S3 multipart settings
 *
 * ⚠️ IMPORTANT: This is the SINGLE SOURCE OF TRUTH for all upload limits.
 * All upload paths (multer, presigned, multipart) MUST use these constants.
 */

export const UPLOAD_CONFIG = {
  // AWS S3 Configuration
  STORAGE_PROVIDER: "s3" as const,
  S3_BUCKET: process.env.AWS_S3_BUCKET || "koda-user-file",
  S3_REGION: process.env.AWS_REGION || "us-east-1",

  // ═══════════════════════════════════════════════════════════════════════════
  // FILE SIZE LIMITS (UNIFIED - used by ALL upload paths)
  // ═══════════════════════════════════════════════════════════════════════════

  // Max File Size (500MB) - SINGLE SOURCE OF TRUTH
  // Used by: multer middleware, presigned URL validation, multipart upload init
  MAX_FILE_SIZE_BYTES: parseInt(process.env.MAX_FILE_SIZE_MB || "500") * 1024 * 1024,

  // Max Audio File Size (25MB) - smaller limit for audio transcription
  MAX_AUDIO_FILE_SIZE_BYTES: parseInt(process.env.MAX_AUDIO_FILE_SIZE_MB || "25") * 1024 * 1024,

  // Max batch files per request (prevents memory exhaustion)
  MAX_BATCH_FILES: parseInt(process.env.MAX_BATCH_FILES || "1000"),

  // ═══════════════════════════════════════════════════════════════════════════
  // MULTIPART UPLOAD SETTINGS
  // ═══════════════════════════════════════════════════════════════════════════

  // Resumable Upload Threshold (20MB) - files larger than this use multipart upload
  RESUMABLE_UPLOAD_THRESHOLD_BYTES: parseInt(process.env.RESUMABLE_UPLOAD_THRESHOLD_MB || "20") * 1024 * 1024,

  // S3 Multipart Upload Chunk Size (10MB default - larger chunks = fewer requests)
  CHUNK_SIZE_BYTES: parseInt(process.env.UPLOAD_CHUNK_SIZE_MB || "10") * 1024 * 1024,

  // ═══════════════════════════════════════════════════════════════════════════
  // RETRY AND TIMEOUT SETTINGS
  // ═══════════════════════════════════════════════════════════════════════════

  // Max Upload Retries
  MAX_UPLOAD_RETRIES: parseInt(process.env.MAX_UPLOAD_RETRIES || "3"),

  // Retry Base Delay (1 second)
  RETRY_BASE_DELAY_MS: parseInt(process.env.RETRY_BASE_DELAY_MS || "1000"),

  // Presigned URL Expiration (30 minutes - longer for slow VPS connections)
  PRESIGNED_URL_EXPIRATION_SECONDS: parseInt(process.env.PRESIGNED_URL_EXPIRATION_SECONDS || "1800"),

  // Upload session expiration (24 hours) - for orphan cleanup
  UPLOAD_SESSION_EXPIRATION_HOURS: parseInt(process.env.UPLOAD_SESSION_EXPIRATION_HOURS || "24"),

  // ═══════════════════════════════════════════════════════════════════════════
  // CONCURRENCY SETTINGS
  // ═══════════════════════════════════════════════════════════════════════════

  // Max Concurrent Uploads (from client)
  MAX_CONCURRENT_UPLOADS: parseInt(process.env.MAX_CONCURRENT_UPLOADS || "6"),

  // Max Concurrent Chunk Uploads (for multipart)
  MAX_CONCURRENT_CHUNKS: parseInt(process.env.MAX_CONCURRENT_CHUNKS || "4"),

  // Batch processing size for presigned URL generation
  PRESIGNED_BATCH_SIZE: parseInt(process.env.PRESIGNED_BATCH_SIZE || "100"),
};

// Type export for TypeScript
export type UploadConfig = typeof UPLOAD_CONFIG;

console.log(`✅ Upload config loaded: Multipart threshold ${UPLOAD_CONFIG.RESUMABLE_UPLOAD_THRESHOLD_BYTES / 1024 / 1024}MB, Chunk size ${UPLOAD_CONFIG.CHUNK_SIZE_BYTES / 1024 / 1024}MB`);
