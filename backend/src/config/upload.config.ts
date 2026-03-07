/**
 * Upload Configuration
 * Centralized configuration for file uploads including resumable upload settings
 *
 * ⚠️ IMPORTANT: This is the SINGLE SOURCE OF TRUTH for all upload limits.
 * All upload paths (multer, presigned, multipart) MUST use these constants.
 */

import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { safeParseInt } from "../utils/safeParseInt";

function loadEnvFileIfExists(filePath: string): void {
  try {
    if (!fs.existsSync(filePath)) return;
    dotenv.config({ path: filePath });
  } catch {
    // no-op: upload config should be importable in isolated tests
  }
}

const envCandidates = [
  path.resolve(process.cwd(), ".env.local"),
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "backend/.env.local"),
  path.resolve(process.cwd(), "backend/.env"),
  path.resolve(__dirname, "../../.env.local"),
  path.resolve(__dirname, "../../.env"),
];

for (const envPath of envCandidates) loadEnvFileIfExists(envPath);

// Keep local storage deterministic across launch styles ("cd backend" vs "--prefix backend").
// In both src/ and dist/, ../../../ resolves to the workspace root.
const workspaceRoot = path.resolve(__dirname, "../../../");
const rawLocalStoragePath =
  process.env.LOCAL_STORAGE_PATH || path.join(workspaceRoot, "storage");
const resolvedLocalStoragePath = path.isAbsolute(rawLocalStoragePath)
  ? rawLocalStoragePath
  : path.resolve(workspaceRoot, rawLocalStoragePath);

export const UPLOAD_CONFIG = {
  // Storage Provider: "gcs" for Google Cloud Storage, "local" for local filesystem (fast dev)
  STORAGE_PROVIDER: (process.env.STORAGE_PROVIDER || "gcs") as "gcs" | "local",
  LOCAL_STORAGE_PATH: resolvedLocalStoragePath,

  // ═══════════════════════════════════════════════════════════════════════════
  // FILE SIZE LIMITS (UNIFIED - used by ALL upload paths)
  // ═══════════════════════════════════════════════════════════════════════════

  // Max File Size (500MB) - SINGLE SOURCE OF TRUTH
  // Used by: multer middleware, presigned URL validation, multipart upload init
  MAX_FILE_SIZE_BYTES:
    safeParseInt(process.env.MAX_FILE_SIZE_MB, 500) * 1024 * 1024,

  // Max Audio File Size (25MB) - smaller limit for audio transcription
  MAX_AUDIO_FILE_SIZE_BYTES:
    safeParseInt(process.env.MAX_AUDIO_FILE_SIZE_MB, 25) * 1024 * 1024,

  // Max batch files per request (prevents memory exhaustion)
  MAX_BATCH_FILES: safeParseInt(process.env.MAX_BATCH_FILES, 1000),

  // ═══════════════════════════════════════════════════════════════════════════
  // MULTIPART UPLOAD SETTINGS
  // ═══════════════════════════════════════════════════════════════════════════

  // Resumable Upload Threshold (20MB) - files larger than this use multipart upload
  RESUMABLE_UPLOAD_THRESHOLD_BYTES:
    safeParseInt(process.env.RESUMABLE_UPLOAD_THRESHOLD_MB, 20) * 1024 * 1024,

  // Resumable upload chunk size (10MB default - larger chunks = fewer requests)
  CHUNK_SIZE_BYTES:
    safeParseInt(process.env.UPLOAD_CHUNK_SIZE_MB, 10) * 1024 * 1024,

  // ═══════════════════════════════════════════════════════════════════════════
  // RETRY AND TIMEOUT SETTINGS
  // ═══════════════════════════════════════════════════════════════════════════

  // Max Upload Retries
  MAX_UPLOAD_RETRIES: safeParseInt(process.env.MAX_UPLOAD_RETRIES, 3),

  // Retry Base Delay (1 second)
  RETRY_BASE_DELAY_MS: safeParseInt(process.env.RETRY_BASE_DELAY_MS, 1000),

  // Presigned URL Expiration (30 minutes - longer for slow VPS connections)
  PRESIGNED_URL_EXPIRATION_SECONDS: safeParseInt(
    process.env.PRESIGNED_URL_EXPIRATION_SECONDS, 1800,
  ),

  // Upload session expiration (24 hours) - for orphan cleanup
  UPLOAD_SESSION_EXPIRATION_HOURS: safeParseInt(
    process.env.UPLOAD_SESSION_EXPIRATION_HOURS, 24,
  ),

  // ═══════════════════════════════════════════════════════════════════════════
  // CONCURRENCY SETTINGS
  // ═══════════════════════════════════════════════════════════════════════════

  // Max Concurrent Uploads (from client)
  MAX_CONCURRENT_UPLOADS: safeParseInt(process.env.MAX_CONCURRENT_UPLOADS, 6),

  // Max Concurrent Chunk Uploads (for multipart)
  MAX_CONCURRENT_CHUNKS: safeParseInt(process.env.MAX_CONCURRENT_CHUNKS, 4),

  // Batch processing size for presigned URL generation
  PRESIGNED_BATCH_SIZE: safeParseInt(process.env.PRESIGNED_BATCH_SIZE, 100),
};

// Type export for TypeScript
export type UploadConfig = typeof UPLOAD_CONFIG;

console.log(
  `✅ Upload config loaded: Multipart threshold ${UPLOAD_CONFIG.RESUMABLE_UPLOAD_THRESHOLD_BYTES / 1024 / 1024}MB, Chunk size ${UPLOAD_CONFIG.CHUNK_SIZE_BYTES / 1024 / 1024}MB`,
);
