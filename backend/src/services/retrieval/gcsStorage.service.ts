// src/services/retrieval/gcsStorage.service.ts
/**
 * Google Cloud Storage (GCS) Storage Service
 * - Simple upload/download/delete
 * - V4 signed URL upload/download (direct-from-browser)
 * - Resumable uploads for large files
 *
 * This is the canonical storage implementation for Koda (Google-only).
 */

import { Storage, type GetSignedUrlConfig } from "@google-cloud/storage";
import { Readable } from "stream";
import { logger } from "../../utils/logger";
import { EncryptionService } from "../security/encryption.service";

export type GcsStorageConfig = {
  projectId?: string;
  bucket: string;
  // Optional: explicitly set credentials file path. If undefined, ADC is used.
  keyFilename?: string;
  presignedUrlExpiresSeconds: number;
};

export class GcsStorageError extends Error {
  public readonly code:
    | "GCS_NOT_CONFIGURED"
    | "GCS_UPLOAD_FAILED"
    | "GCS_DOWNLOAD_FAILED"
    | "GCS_DELETE_FAILED"
    | "GCS_HEAD_FAILED"
    | "GCS_PRESIGN_FAILED"
    | "GCS_RESUMABLE_FAILED";

  public readonly cause?: unknown;

  constructor(code: GcsStorageError["code"], message: string, cause?: unknown) {
    super(message);
    this.name = "GcsStorageError";
    this.code = code;
    this.cause = cause;
  }
}

function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
    );
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function loadConfigFromEnv(): GcsStorageConfig {
  return {
    projectId:
      process.env.GCS_PROJECT_ID ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      undefined,
    bucket: process.env.GCS_BUCKET_NAME || "",
    // GOOGLE_APPLICATION_CREDENTIALS is the standard env var for service account JSON path.
    // Fall back to legacy env used across this codebase.
    keyFilename:
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.GCS_KEY_FILE ||
      undefined,
    presignedUrlExpiresSeconds: Number(
      process.env.GCS_SIGNED_URL_EXPIRES || 1800,
    ),
  };
}

export class GcsStorageService {
  private storage: Storage | null = null;
  private readonly cfg: GcsStorageConfig;

  constructor(cfg?: Partial<GcsStorageConfig>) {
    this.cfg = { ...loadConfigFromEnv(), ...(cfg || {}) };
  }

  private assertConfigured(): void {
    if (!this.cfg.bucket) {
      throw new GcsStorageError(
        "GCS_NOT_CONFIGURED",
        "GCS bucket is not configured (GCS_BUCKET_NAME).",
      );
    }
  }

  private client(): Storage {
    if (this.storage) return this.storage;

    const opts: ConstructorParameters<typeof Storage>[0] = {};
    if (this.cfg.projectId) opts.projectId = this.cfg.projectId;
    if (this.cfg.keyFilename) opts.keyFilename = this.cfg.keyFilename;

    this.storage = new Storage(opts);
    return this.storage;
  }

  private bucket() {
    this.assertConfigured();
    return this.client().bucket(this.cfg.bucket);
  }

  // ===========================================================================
  // BASIC FILE OPS
  // ===========================================================================

  async uploadFile(params: {
    key: string;
    buffer: Buffer;
    mimeType: string;
  }): Promise<{ key: string }> {
    try {
      const file = this.bucket().file(params.key);
      let uploadBuffer = params.buffer;
      const customMeta: Record<string, string> = {};

      // D-5: Client-side encrypt before saving to GCS
      if (process.env.KODA_ENCRYPT_GCS === "true" && process.env.KODA_MASTER_KEY_BASE64) {
        const enc = new EncryptionService();
        const masterKey = Buffer.from(process.env.KODA_MASTER_KEY_BASE64, "base64");
        const aad = `gcs:${params.key}`;
        const payload = enc.encryptBuffer(uploadBuffer, masterKey, aad);
        uploadBuffer = Buffer.from(JSON.stringify(payload));
        customMeta.clientEncrypted = "true";
      }

      await file.save(uploadBuffer, {
        contentType: params.mimeType || "application/octet-stream",
        resumable: false, // this codepath is used for backend-to-GCS uploads
        metadata: Object.keys(customMeta).length > 0 ? { metadata: customMeta } : undefined,
      });
      return { key: params.key };
    } catch (err) {
      throw new GcsStorageError(
        "GCS_UPLOAD_FAILED",
        `Failed to upload to GCS (key="${params.key}").`,
        err,
      );
    }
  }

  async downloadFile(params: {
    key: string;
  }): Promise<{ buffer: Buffer; mimeType: string }> {
    try {
      const file = this.bucket().file(params.key);
      const [meta] = await file.getMetadata();
      const mimeType =
        (meta.contentType as string) || "application/octet-stream";
      let [buf] = await file.download();

      // D-5: Decrypt if the file was client-side encrypted on upload
      const customMeta = (meta.metadata || {}) as Record<string, string>;
      if (
        customMeta.clientEncrypted === "true" &&
        process.env.KODA_MASTER_KEY_BASE64
      ) {
        try {
          const enc = new EncryptionService();
          const masterKey = Buffer.from(process.env.KODA_MASTER_KEY_BASE64, "base64");
          const aad = `gcs:${params.key}`;
          const payload = JSON.parse(buf.toString());
          buf = enc.decryptBuffer(payload, masterKey, aad);
        } catch (decryptErr) {
          logger.warn("[GCS] Failed to decrypt client-encrypted file, returning raw", {
            key: params.key,
            error: (decryptErr as Error).message,
          });
        }
      }

      return { buffer: buf, mimeType };
    } catch (err) {
      throw new GcsStorageError(
        "GCS_DOWNLOAD_FAILED",
        `Failed to download from GCS (key="${params.key}").`,
        err,
      );
    }
  }

  async deleteFile(params: { key: string }): Promise<void> {
    try {
      const file = this.bucket().file(params.key);
      await file.delete({ ignoreNotFound: true });
    } catch (err) {
      throw new GcsStorageError(
        "GCS_DELETE_FAILED",
        `Failed to delete from GCS (key="${params.key}").`,
        err,
      );
    }
  }

  async fileExists(params: { key: string }): Promise<boolean> {
    try {
      const file = this.bucket().file(params.key);
      const [exists] = await file.exists();
      return exists;
    } catch (err) {
      throw new GcsStorageError(
        "GCS_HEAD_FAILED",
        `Failed to check file existence in GCS (key="${params.key}").`,
        err,
      );
    }
  }

  async getFileMetadata(params: { key: string }): Promise<{
    size?: number;
    mimeType?: string;
    lastModified?: Date;
    etag?: string;
    md5Hash?: string;
    crc32c?: string;
  } | null> {
    try {
      const file = this.bucket().file(params.key);
      const [meta] = await file.getMetadata();
      return {
        size: meta.size ? Number(meta.size) : undefined,
        mimeType: (meta.contentType as string) || undefined,
        lastModified: meta.updated ? new Date(meta.updated) : undefined,
        etag: (meta.etag as string) || undefined,
        md5Hash: (meta.md5Hash as string) || undefined,
        crc32c: (meta.crc32c as string) || undefined,
      };
    } catch {
      return null;
    }
  }

  // ===========================================================================
  // FILE LISTING
  // ===========================================================================

  /**
   * List files in the bucket with optional prefix filter and pagination.
   */
  async listFiles(params?: {
    prefix?: string;
    maxResults?: number;
    pageToken?: string;
  }): Promise<{
    files: Array<{ name: string; size?: number; updated?: Date }>;
    nextPageToken?: string;
  }> {
    try {
      const opts: Record<string, unknown> = {
        autoPaginate: false,
      };
      if (params?.prefix) opts.prefix = params.prefix;
      if (params?.maxResults) opts.maxResults = params.maxResults;
      if (params?.pageToken) opts.pageToken = params.pageToken;

      const [files, , apiResponse] = await this.bucket().getFiles(opts);

      return {
        files: files.map((f) => ({
          name: f.name,
          size: f.metadata?.size ? Number(f.metadata.size) : undefined,
          updated: f.metadata?.updated
            ? new Date(f.metadata.updated as string)
            : undefined,
        })),
        nextPageToken: (apiResponse as any)?.nextPageToken || undefined,
      };
    } catch (err) {
      throw new GcsStorageError(
        "GCS_HEAD_FAILED",
        `Failed to list files in GCS bucket.`,
        err,
      );
    }
  }

  // ===========================================================================
  // SIGNED URLS (V4)
  // ===========================================================================

  async presignUpload(params: {
    key: string;
    mimeType: string;
    expiresInSeconds?: number;
  }): Promise<{ url: string }> {
    try {
      const file = this.bucket().file(params.key);
      const expiresMs =
        (params.expiresInSeconds ?? this.cfg.presignedUrlExpiresSeconds) * 1000;
      const options: GetSignedUrlConfig = {
        version: "v4",
        action: "write",
        expires: Date.now() + expiresMs,
      };
      const [url] = await file.getSignedUrl(options);
      return { url };
    } catch (err) {
      throw new GcsStorageError(
        "GCS_PRESIGN_FAILED",
        `Failed to generate GCS signed upload URL (key="${params.key}").`,
        err,
      );
    }
  }

  async presignDownload(params: {
    key: string;
    expiresInSeconds?: number;
  }): Promise<{ url: string }> {
    try {
      const file = this.bucket().file(params.key);
      const expiresMs =
        (params.expiresInSeconds ?? this.cfg.presignedUrlExpiresSeconds) * 1000;
      const options: GetSignedUrlConfig = {
        version: "v4",
        action: "read",
        expires: Date.now() + expiresMs,
      };
      const [url] = await file.getSignedUrl(options);
      return { url };
    } catch (err) {
      throw new GcsStorageError(
        "GCS_PRESIGN_FAILED",
        `Failed to generate GCS signed download URL (key="${params.key}").`,
        err,
      );
    }
  }

  // ===========================================================================
  // CORS CONFIGURATION
  // ===========================================================================

  /**
   * Ensure the GCS bucket has CORS configured for browser-based uploads.
   * Safe to call on every boot — idempotent (overwrites with same config).
   */
  async ensureBucketCors(origins?: string[]): Promise<void> {
    try {
      const allowedOrigins = origins ?? [
        "https://allybi.co",
        "https://www.allybi.co",
        "https://app.allybi.co",
        ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
        "http://localhost:3000",
      ];
      // Deduplicate
      const unique = [...new Set(allowedOrigins)];

      await this.bucket().setCorsConfiguration([
        {
          origin: unique,
          method: ["PUT", "GET", "HEAD", "OPTIONS"],
          responseHeader: [
            "Content-Type",
            "Content-Length",
            "x-goog-resumable",
          ],
          maxAgeSeconds: 3600,
        },
      ]);
      logger.info("[GCS] Bucket CORS configured", { origins: unique });
    } catch (err) {
      // Non-fatal — bucket may already have CORS or service account lacks storage.buckets.update.
      logger.warn("[GCS] Failed to set bucket CORS (uploads may fail from browser)", {
        error: (err as Error).message,
      });
    }
  }

  // ===========================================================================
  // RESUMABLE UPLOADS (GCS native)
  // ===========================================================================

  async createResumableUpload(params: {
    key: string;
    mimeType: string;
    origin?: string;
  }): Promise<{ uploadUrl: string }> {
    try {
      const file = this.bucket().file(params.key);
      const [uploadUrl] = await file.createResumableUpload({
        metadata: {
          contentType: params.mimeType || "application/octet-stream",
        },
        // origin tells GCS to include CORS headers in subsequent chunk-upload responses
        origin:
          params.origin || process.env.FRONTEND_URL || "http://localhost:3000",
      });
      return { uploadUrl };
    } catch (err) {
      throw new GcsStorageError(
        "GCS_RESUMABLE_FAILED",
        `Failed to initialize GCS resumable upload (key="${params.key}").`,
        err,
      );
    }
  }
}
