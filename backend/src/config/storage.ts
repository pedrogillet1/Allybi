/**
 * Storage Configuration
 *
 * Supports both S3 (production) and local filesystem (development).
 * Set STORAGE_PROVIDER=local in .env for fast local development.
 *
 * Delegates S3 operations to the centralized S3StorageService.
 * Local operations use the filesystem directly.
 *
 * Lazy-initializes: missing env vars won't crash at import time —
 * errors surface only when an operation is actually called.
 */

import { S3StorageService } from '../services/retrieval/s3Storage.service';
import { UPLOAD_CONFIG } from './upload.config';
import fs from 'fs/promises';
import path from 'path';

// ---------------------------------------------------------------------------
// Storage mode detection
// ---------------------------------------------------------------------------

const isLocalStorage = UPLOAD_CONFIG.STORAGE_PROVIDER === 'local';
const localStoragePath = UPLOAD_CONFIG.LOCAL_STORAGE_PATH;

if (isLocalStorage) {
  console.log(`📁 Storage: LOCAL mode (path: ${localStoragePath})`);
} else {
  console.log(`☁️  Storage: S3 mode (bucket: ${UPLOAD_CONFIG.S3_BUCKET})`);
}

// ---------------------------------------------------------------------------
// Local storage helpers
// ---------------------------------------------------------------------------

async function localUpload(key: string, buffer: Buffer): Promise<void> {
  const filePath = path.join(localStoragePath, key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buffer);
}

async function localDownload(key: string): Promise<Buffer> {
  const filePath = path.join(localStoragePath, key);
  return fs.readFile(filePath);
}

async function localDelete(key: string): Promise<void> {
  const filePath = path.join(localStoragePath, key);
  try {
    await fs.unlink(filePath);
  } catch (e: any) {
    if (e.code !== 'ENOENT') throw e;
  }
}

async function localExists(key: string): Promise<boolean> {
  const filePath = path.join(localStoragePath, key);
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function localMetadata(key: string): Promise<{ size?: number; mimeType?: string; lastModified?: Date } | null> {
  const filePath = path.join(localStoragePath, key);
  try {
    const stat = await fs.stat(filePath);
    return {
      size: stat.size,
      lastModified: stat.mtime,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// S3 Singleton (lazy — safe to import anywhere)
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
      if (isLocalStorage) {
        await localUpload(fileName, buffer);
      } else {
        await s3().uploadFile({
          key: fileName,
          buffer,
          mimeType: options.contentType || 'application/octet-stream',
        });
      }
    },
    download: async (): Promise<[Buffer]> => {
      if (isLocalStorage) {
        const buffer = await localDownload(fileName);
        return [buffer];
      }
      const { buffer } = await s3().downloadFile({ key: fileName });
      return [buffer];
    },
    delete: async () => {
      if (isLocalStorage) {
        await localDelete(fileName);
      } else {
        await s3().deleteFile({ key: fileName });
      }
    },
    exists: async (): Promise<[boolean]> => {
      if (isLocalStorage) {
        const exists = await localExists(fileName);
        return [exists];
      }
      const exists = await s3().fileExists({ key: fileName });
      return [exists];
    },
    getSignedUrl: async (options: { expires: number }): Promise<[string]> => {
      if (isLocalStorage) {
        // For local storage, return a local file URL (for preview)
        return [`/api/storage/local/${encodeURIComponent(fileName)}`];
      }
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
  if (isLocalStorage) {
    await localUpload(fileName, fileBuffer);
    return fileName;
  }
  await s3().uploadFile({ key: fileName, buffer: fileBuffer, mimeType });
  return fileName;
};

export const downloadFile = async (fileName: string): Promise<Buffer> => {
  if (isLocalStorage) {
    return localDownload(fileName);
  }
  const { buffer } = await s3().downloadFile({ key: fileName });
  return buffer;
};

export const getSignedUrl = async (
  fileName: string,
  expiresIn: number = 3600,
  _forceDownload: boolean = false,
  _downloadFilename?: string,
): Promise<string> => {
  if (isLocalStorage) {
    return `/api/storage/local/${encodeURIComponent(fileName)}`;
  }
  const { url } = await s3().presignDownload({ key: fileName, expiresInSeconds: expiresIn });
  return url;
};

export const getSignedUploadUrl = async (
  fileName: string,
  mimeType: string,
  expiresIn: number = 3600,
): Promise<string> => {
  if (isLocalStorage) {
    // For local storage, return local upload endpoint
    return `/api/presigned-urls/local-upload/${encodeURIComponent(fileName)}`;
  }
  const { url } = await s3().presignUpload({ key: fileName, mimeType, expiresInSeconds: expiresIn });
  return url;
};

export const generatePresignedUploadUrl = getSignedUploadUrl;

export const deleteFile = async (fileName: string): Promise<void> => {
  if (isLocalStorage) {
    await localDelete(fileName);
    return;
  }
  await s3().deleteFile({ key: fileName });
};

export const fileExists = async (fileName: string): Promise<boolean> => {
  if (isLocalStorage) {
    return localExists(fileName);
  }
  return s3().fileExists({ key: fileName });
};

export const getFileMetadata = async (
  fileName: string,
): Promise<{ size?: number; mimeType?: string; lastModified?: Date; etag?: string } | null> => {
  if (isLocalStorage) {
    return localMetadata(fileName);
  }
  try {
    return await s3().getFileMetadata({ key: fileName });
  } catch {
    return null;
  }
};
