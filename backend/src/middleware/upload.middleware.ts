import multer from 'multer';
import path from 'path';
import { Request, Response, NextFunction } from 'express';
import { UPLOAD_CONFIG } from '../config/upload.config';

// REMOVED: storageService - deleted service, using stub
const storageService = {
  hasCapacity: async (userId: string, size: number) => ({ hasCapacity: true, required: size, available: 10 * 1024 * 1024 * 1024, shortfall: 0 }),
  formatBytes: (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
};

// Configure multer for memory storage (we'll upload directly to GCS)
const storage = multer.memoryStorage();

/**
 * Check if file is a Mac/Windows hidden system file
 * These files cause 400 errors and should be rejected
 */
const isMacHiddenFile = (filename: string): boolean => {
  const hiddenPatterns = [
    '.DS_Store',
    '.localized',
    '__MACOSX',
    'Thumbs.db',
    'desktop.ini',
  ];

  // Check if starts with dot (hidden file)
  if (filename.startsWith('.')) {
    return true;
  }

  // Check against known patterns
  return hiddenPatterns.some(pattern => filename.includes(pattern));
};

// File filter
const fileFilter = (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // ✅ CRITICAL: Reject Mac/Windows hidden files
  if (isMacHiddenFile(file.originalname)) {
    console.log('🚫 [Backend] Rejected hidden file:', file.originalname);
    cb(new Error(`System files not allowed: ${file.originalname}`));
    return;
  }
  // Allowed file types
  const allowedMimeTypes = [
    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/html',
    'application/rtf',

    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/tiff',
    'image/bmp',
    'image/svg+xml',
    'image/x-icon',

    // Design files
    'image/vnd.adobe.photoshop',
    'application/photoshop',
    'application/psd',

    // Video files
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',

    // Generic fallback for when browser can't detect MIME type
    'application/octet-stream',
  ];

  // Allowed file extensions as fallback validation
  const allowedExtensions = [
    // Documents
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.html', '.rtf',
    // Images
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.tiff', '.tif', '.bmp', '.svg', '.ico',
    // Design files
    '.psd', '.ai', '.sketch', '.fig', '.xd',
    // Video files
    '.mp4', '.webm', '.ogg', '.mov', '.avi',
  ];

  const fileExtension = path.extname(file.originalname).toLowerCase();

  // Accept if MIME type is in whitelist OR extension is allowed
  if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} with extension ${fileExtension} not allowed`));
  }
};

// ✅ UNIFIED: Use centralized config for file size limit
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: UPLOAD_CONFIG.MAX_FILE_SIZE_BYTES, // Unified limit from config (500MB)
  },
});

// Middleware for single file upload
export const uploadSingle = upload.single('file');

// Middleware for file upload with optional thumbnail
export const uploadWithThumbnail = upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]);

// Middleware for multiple file upload
export const uploadMultiple = upload.array('files', 10); // Max 10 files

// Audio upload for voice transcription
const audioStorage = multer.memoryStorage();

const audioFilter = (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedAudioTypes = [
    'audio/webm',
    'audio/wav',
    'audio/mp3',
    'audio/mpeg',
    'audio/ogg',
    'audio/m4a',
  ];

  if (allowedAudioTypes.includes(file.mimetype) || file.mimetype.startsWith('audio/')) {
    cb(null, true);
  } else {
    cb(new Error(`Audio type ${file.mimetype} not allowed`));
  }
};

// ✅ UNIFIED: Use centralized config for audio file size limit
export const uploadAudio = multer({
  storage: audioStorage,
  fileFilter: audioFilter,
  limits: {
    fileSize: UPLOAD_CONFIG.MAX_AUDIO_FILE_SIZE_BYTES, // Unified limit from config (25MB)
  },
}).single('audio');

/**
 * Middleware to check storage capacity before upload
 * Should be used BEFORE multer middleware in the route chain
 */
export const checkStorageCapacity = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Get file size from Content-Length header
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);

    if (contentLength === 0) {
      // If we can't determine size from header, let it through
      // The actual check will happen after multer processes the file
      next();
      return;
    }

    // Check capacity
    const capacityCheck = await storageService.hasCapacity(req.user.id, contentLength);

    if (!capacityCheck.hasCapacity) {
      console.log(`🚫 [Storage] Upload blocked - insufficient storage`);
      console.log(`   Required: ${storageService.formatBytes(capacityCheck.required)}`);
      console.log(`   Available: ${storageService.formatBytes(capacityCheck.available)}`);
      console.log(`   Shortfall: ${storageService.formatBytes(capacityCheck.shortfall)}`);

      res.status(507).json({
        error: 'Insufficient storage',
        code: 'STORAGE_LIMIT_EXCEEDED',
        message: `You don't have enough storage space. You need ${storageService.formatBytes(capacityCheck.required)} but only have ${storageService.formatBytes(capacityCheck.available)} available.`,
        required: capacityCheck.required,
        available: capacityCheck.available,
        shortfall: capacityCheck.shortfall,
        requiredFormatted: storageService.formatBytes(capacityCheck.required),
        availableFormatted: storageService.formatBytes(capacityCheck.available),
        shortfallFormatted: storageService.formatBytes(capacityCheck.shortfall)
      });
      return;
    }

    next();
  } catch (error) {
    const err = error as Error;
    console.error('❌ [Storage] Error checking capacity:', err.message);
    // Don't block upload on capacity check errors
    next();
  }
};

/**
 * Middleware to check storage capacity AFTER multer has processed the file
 * Use this if content-length header is unreliable
 */
export const checkStorageCapacityAfterUpload = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Calculate total file size from uploaded files
    let totalSize = 0;

    if (req.file) {
      totalSize = req.file.size;
    } else if (req.files) {
      if (Array.isArray(req.files)) {
        totalSize = req.files.reduce((sum, file) => sum + file.size, 0);
      } else {
        // req.files is an object with field names as keys
        for (const fieldName of Object.keys(req.files)) {
          const fieldFiles = req.files[fieldName];
          totalSize += fieldFiles.reduce((sum: number, file: Express.Multer.File) => sum + file.size, 0);
        }
      }
    }

    if (totalSize === 0) {
      next();
      return;
    }

    // Check capacity
    const capacityCheck = await storageService.hasCapacity(req.user.id, totalSize);

    if (!capacityCheck.hasCapacity) {
      console.log(`🚫 [Storage] Upload blocked after processing - insufficient storage`);
      console.log(`   Required: ${storageService.formatBytes(capacityCheck.required)}`);
      console.log(`   Available: ${storageService.formatBytes(capacityCheck.available)}`);

      res.status(507).json({
        error: 'Insufficient storage',
        code: 'STORAGE_LIMIT_EXCEEDED',
        message: `You don't have enough storage space. You need ${storageService.formatBytes(capacityCheck.required)} but only have ${storageService.formatBytes(capacityCheck.available)} available.`,
        required: capacityCheck.required,
        available: capacityCheck.available,
        shortfall: capacityCheck.shortfall,
        requiredFormatted: storageService.formatBytes(capacityCheck.required),
        availableFormatted: storageService.formatBytes(capacityCheck.available),
        shortfallFormatted: storageService.formatBytes(capacityCheck.shortfall)
      });
      return;
    }

    next();
  } catch (error) {
    const err = error as Error;
    console.error('❌ [Storage] Error checking capacity after upload:', err.message);
    // Don't block upload on capacity check errors
    next();
  }
};
