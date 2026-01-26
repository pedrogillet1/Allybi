/**
 * Storage Configuration - Now using AWS S3
 * Provides the same interface for backward compatibility
 */

import s3StorageService from '../services/s3Storage.service';

// For backward compatibility, export a bucket-like object
export const bucket = {
  file: (fileName: string) => ({
    save: async (buffer: Buffer, options: any) => {
      await s3StorageService.uploadFile(fileName, buffer, options.contentType);
    },
    download: async () => {
      const [buffer] = await s3StorageService.downloadFile(fileName);
      return [buffer];
    },
    delete: async () => {
      await s3StorageService.deleteFile(fileName);
    },
    exists: async () => {
      return [await s3StorageService.fileExists(fileName)];
    },
    getSignedUrl: async (options: any) => {
      const expiresIn = Math.floor((options.expires - Date.now()) / 1000);
      const url = await s3StorageService.generatePresignedDownloadUrl(fileName, expiresIn);
      return [url];
    }
  })
};

console.log('✅ AWS S3 Storage initialized');

/**
 * Upload a file to AWS S3
 */
export const uploadFile = async (
  fileName: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<string> => {
  return await s3StorageService.uploadFile(fileName, fileBuffer, mimeType);
};

/**
 * Download a file from AWS S3
 */
export const downloadFile = async (fileName: string): Promise<Buffer> => {
  const [buffer] = await s3StorageService.downloadFile(fileName);
  return buffer;
};

/**
 * Generate a signed URL for temporary file access (download)
 */
export const getSignedUrl = async (
  fileName: string,
  expiresIn: number = 3600,
  forceDownload: boolean = false,
  downloadFilename?: string
): Promise<string> => {
  return await s3StorageService.generatePresignedDownloadUrl(fileName, expiresIn);
};

/**
 * Generate a signed URL for direct upload to AWS S3
 */
export const getSignedUploadUrl = async (
  fileName: string,
  mimeType: string,
  expiresIn: number = 3600 // 1 hour for upload
): Promise<string> => {
  return await s3StorageService.generatePresignedUploadUrl(fileName, mimeType, expiresIn);
};

/**
 * Alias for getSignedUploadUrl (for backward compatibility)
 */
export const generatePresignedUploadUrl = getSignedUploadUrl;

/**
 * Delete a file from AWS S3
 */
export const deleteFile = async (fileName: string): Promise<void> => {
  await s3StorageService.deleteFile(fileName);
};

/**
 * Check if a file exists in AWS S3
 */
export const fileExists = async (fileName: string): Promise<boolean> => {
  return await s3StorageService.fileExists(fileName);
};

/**
 * Get file metadata from AWS S3
 */
export const getFileMetadata = async (fileName: string) => {
  return await s3StorageService.getFileMetadata(fileName);
};

// Export null for storage to maintain compatibility
export default null;
