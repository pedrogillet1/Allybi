/**
 * Storage Configuration
 *
 * Supports both GCS (production) and local filesystem (development).
 * Set STORAGE_PROVIDER=local in .env for fast local development.
 *
 * Delegates GCS operations to the centralized GcsStorageService.
 * Local operations use the filesystem directly.
 *
 * Lazy-initializes: missing env vars won't crash at import time —
 * errors surface only when an operation is actually called.
 */

import { GcsStorageService } from "../services/retrieval/gcsStorage.service";
import { UPLOAD_CONFIG } from "./upload.config";
import fs from "fs/promises";
import path from "path";

// ---------------------------------------------------------------------------
// Storage mode detection
// ---------------------------------------------------------------------------

const isLocalStorage = UPLOAD_CONFIG.STORAGE_PROVIDER === "local";
const localStoragePath = UPLOAD_CONFIG.LOCAL_STORAGE_PATH;

if (isLocalStorage) {
  console.log(`📁 Storage: LOCAL mode (path: ${localStoragePath})`);
} else {
  console.log(
    `☁️  Storage: GCS mode (bucket: ${process.env.GCS_BUCKET_NAME || "unset"})`,
  );
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
    if (e.code !== "ENOENT") throw e;
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

async function localMetadata(
  key: string,
): Promise<{ size?: number; mimeType?: string; lastModified?: Date } | null> {
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
// GCS singleton (lazy — safe to import anywhere)
// ---------------------------------------------------------------------------

let _gcs: GcsStorageService | null = null;

function gcs(): GcsStorageService {
  if (!_gcs) {
    _gcs = new GcsStorageService();
    // Configure bucket CORS on first access so browser uploads work.
    _gcs.ensureBucketCors().catch(() => {});
  }
  return _gcs;
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
        await gcs().uploadFile({
          key: fileName,
          buffer,
          mimeType: options.contentType || "application/octet-stream",
        });
      }
    },
    download: async (): Promise<[Buffer]> => {
      if (isLocalStorage) {
        const buffer = await localDownload(fileName);
        return [buffer];
      }
      const { buffer } = await gcs().downloadFile({ key: fileName });
      return [buffer];
    },
    delete: async () => {
      if (isLocalStorage) {
        await localDelete(fileName);
      } else {
        await gcs().deleteFile({ key: fileName });
      }
    },
    exists: async (): Promise<[boolean]> => {
      if (isLocalStorage) {
        const exists = await localExists(fileName);
        return [exists];
      }
      const exists = await gcs().fileExists({ key: fileName });
      return [exists];
    },
    getSignedUrl: async (options: { expires: number }): Promise<[string]> => {
      if (isLocalStorage) {
        // For local storage, return a local file URL (for preview)
        return [`/api/storage/local/${encodeURIComponent(fileName)}`];
      }
      const expiresIn = Math.max(
        1,
        Math.floor((options.expires - Date.now()) / 1000),
      );
      const { url } = await gcs().presignDownload({
        key: fileName,
        expiresInSeconds: expiresIn,
      });
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
  await gcs().uploadFile({ key: fileName, buffer: fileBuffer, mimeType });
  return fileName;
};

export const downloadFile = async (fileName: string): Promise<Buffer> => {
  if (isLocalStorage) {
    return localDownload(fileName);
  }
  const { buffer } = await gcs().downloadFile({ key: fileName });
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
  const { url } = await gcs().presignDownload({
    key: fileName,
    expiresInSeconds: expiresIn,
  });
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
  const { url } = await gcs().presignUpload({
    key: fileName,
    mimeType,
    expiresInSeconds: expiresIn,
  });
  return url;
};

export const generatePresignedUploadUrl = getSignedUploadUrl;

export const deleteFile = async (fileName: string): Promise<void> => {
  if (isLocalStorage) {
    await localDelete(fileName);
    return;
  }
  await gcs().deleteFile({ key: fileName });
};

export const fileExists = async (fileName: string): Promise<boolean> => {
  if (isLocalStorage) {
    return localExists(fileName);
  }
  return gcs().fileExists({ key: fileName });
};

export const getFileMetadata = async (
  fileName: string,
): Promise<{
  size?: number;
  mimeType?: string;
  lastModified?: Date;
  etag?: string;
} | null> => {
  if (isLocalStorage) {
    return localMetadata(fileName);
  }
  try {
    return await gcs().getFileMetadata({ key: fileName });
  } catch {
    return null;
  }
};
