/**
 * Storage Configuration
 *
 * Delegates all S3 operations to the centralized S3StorageService.
 * This module preserves the legacy function-based API surface so
 * existing callers (queues, file services, routes) don't need changes.
 *
 * Lazy-initializes: missing env vars won't crash at import time —
 * errors surface only when an operation is actually called.
 */

import { S3StorageService } from '../services/retrieval/s3Storage.service';

// ---------------------------------------------------------------------------
// Singleton (lazy — safe to import anywhere)
// ---------------------------------------------------------------------------

let _s3: S3StorageService | null = null;

function s3(): S3StorageService {
  if (!_s3) _s3 = new S3StorageService();
  return _s3;
}

// ---------------------------------------------------------------------------
// GCS-style bucket compat (used by legacy upload/download code paths)
// ---------------------------------------------------------------------------

export const bucket = {
  file: (fileName: string) => ({
    save: async (buffer: Buffer, options: { contentType?: string } = {}) => {
      await s3().uploadFile({
        key: fileName,
        buffer,
        mimeType: options.contentType || 'application/octet-stream',
      });
    },
    download: async (): Promise<[Buffer]> => {
      const { buffer } = await s3().downloadFile({ key: fileName });
      return [buffer];
    },
    delete: async () => {
      await s3().deleteFile({ key: fileName });
    },
    exists: async (): Promise<[boolean]> => {
      const exists = await s3().fileExists({ key: fileName });
      return [exists];
    },
    getSignedUrl: async (options: { expires: number }): Promise<[string]> => {
      const expiresIn = Math.max(1, Math.floor((options.expires - Date.now()) / 1000));
      const { url } = await s3().presignDownload({ key: fileName, expiresInSeconds: expiresIn });
      return [url];
    },
  }),
};

// ---------------------------------------------------------------------------
// Flat function API (matches existing import sites)
// ---------------------------------------------------------------------------

export const uploadFile = async (
  fileName: string,
  fileBuffer: Buffer,
  mimeType: string,
): Promise<string> => {
  await s3().uploadFile({ key: fileName, buffer: fileBuffer, mimeType });
  return fileName;
};

export const downloadFile = async (fileName: string): Promise<Buffer> => {
  const { buffer } = await s3().downloadFile({ key: fileName });
  return buffer;
};

export const getSignedUrl = async (
  fileName: string,
  expiresIn: number = 3600,
  _forceDownload: boolean = false,
  _downloadFilename?: string,
): Promise<string> => {
  const { url } = await s3().presignDownload({ key: fileName, expiresInSeconds: expiresIn });
  return url;
};

export const getSignedUploadUrl = async (
  fileName: string,
  mimeType: string,
  expiresIn: number = 3600,
): Promise<string> => {
  const { url } = await s3().presignUpload({ key: fileName, mimeType, expiresInSeconds: expiresIn });
  return url;
};

export const generatePresignedUploadUrl = getSignedUploadUrl;

export const deleteFile = async (fileName: string): Promise<void> => {
  await s3().deleteFile({ key: fileName });
};

export const fileExists = async (fileName: string): Promise<boolean> => {
  return s3().fileExists({ key: fileName });
};

export const getFileMetadata = async (
  fileName: string,
): Promise<{ size?: number; mimeType?: string; lastModified?: Date; etag?: string } | null> => {
  try {
    return await s3().getFileMetadata({ key: fileName });
  } catch {
    return null;
  }
};
