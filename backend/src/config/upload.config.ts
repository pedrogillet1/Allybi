/**
 * Upload Configuration
 * Centralized configuration for file uploads including S3 multipart settings
 */

export const UPLOAD_CONFIG = {
  // AWS S3 Configuration
  STORAGE_PROVIDER: "s3" as const,
  S3_BUCKET: process.env.AWS_S3_BUCKET || "koda-user-file",
  S3_REGION: process.env.AWS_REGION || "us-east-1",

  // Resumable Upload Threshold (20MB) - files larger than this use multipart upload
  RESUMABLE_UPLOAD_THRESHOLD_BYTES: parseInt(process.env.RESUMABLE_UPLOAD_THRESHOLD_MB || "20") * 1024 * 1024,

  // S3 Multipart Upload Chunk Size (5MB minimum for S3)
  CHUNK_SIZE_BYTES: parseInt(process.env.UPLOAD_CHUNK_SIZE_MB || "5") * 1024 * 1024,

  // Max File Size (500MB)
  MAX_FILE_SIZE_BYTES: parseInt(process.env.MAX_FILE_SIZE_MB || "500") * 1024 * 1024,

  // Max Upload Retries
  MAX_UPLOAD_RETRIES: parseInt(process.env.MAX_UPLOAD_RETRIES || "3"),

  // Retry Base Delay (1 second)
  RETRY_BASE_DELAY_MS: parseInt(process.env.RETRY_BASE_DELAY_MS || "1000"),

  // Presigned URL Expiration (10 minutes)
  PRESIGNED_URL_EXPIRATION_SECONDS: parseInt(process.env.PRESIGNED_URL_EXPIRATION_SECONDS || "600"),

  // Max Concurrent Uploads (from client)
  MAX_CONCURRENT_UPLOADS: parseInt(process.env.MAX_CONCURRENT_UPLOADS || "6"),

  // Max Concurrent Chunk Uploads (for multipart)
  MAX_CONCURRENT_CHUNKS: parseInt(process.env.MAX_CONCURRENT_CHUNKS || "4"),
};

// Type export for TypeScript
export type UploadConfig = typeof UPLOAD_CONFIG;

console.log(`✅ Upload config loaded: Multipart threshold ${UPLOAD_CONFIG.RESUMABLE_UPLOAD_THRESHOLD_BYTES / 1024 / 1024}MB, Chunk size ${UPLOAD_CONFIG.CHUNK_SIZE_BYTES / 1024 / 1024}MB`);
