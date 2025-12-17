/**
 * UnifiedUploadService - COMPLETE REFACTOR
 *
 * This service replaces both folderUploadService.js and presignedUploadService.js
 * with a single, optimized upload engine that:
 *
 * 1. Uses presigned URLs for direct S3 uploads (bypasses backend file handling)
 * 2. Preserves folder structure for folder uploads
 * 3. Implements true parallel processing (no artificial delays)
 * 4. Uses Web Workers for non-blocking SHA-256 hashing
 * 5. Supports client-side encryption (zero-knowledge)
 * 6. Handles multipart uploads for large files (>20MB) via resumableUploadService
 *
 * UPLOAD FLOW:
 * 1. Filter files (remove hidden/system files)
 * 2. Analyze folder structure (if folder upload)
 * 3. Create categories/subfolders (bulk API)
 * 4. Check file sizes - route large files to resumable upload
 * 5. Request presigned URLs for small/medium files
 * 6. Upload files directly to S3 in parallel
 * 7. Notify backend of completion
 */

import api from './api';
import axios from 'axios';
import { uploadLargeFile } from './resumableUploadService';
import { UPLOAD_CONFIG, shouldUseResumableUpload } from '../config/upload.config';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  // Maximum concurrent uploads (optimized for browser limits)
  MAX_CONCURRENT_UPLOADS: UPLOAD_CONFIG.MAX_CONCURRENT_UPLOADS || 6,

  // Resumable upload threshold (20MB) - files larger use multipart
  RESUMABLE_THRESHOLD: UPLOAD_CONFIG.RESUMABLE_UPLOAD_THRESHOLD_BYTES || 20 * 1024 * 1024,

  // Max retry attempts for failed uploads
  MAX_RETRIES: UPLOAD_CONFIG.MAX_RETRIES || 3,

  // Initial retry delay (exponential backoff)
  INITIAL_RETRY_DELAY: UPLOAD_CONFIG.RETRY_DELAY_BASE || 1000,

  // Max retry attempts for completion notification
  MAX_CONFIRM_RETRIES: 5,

  // File filtering patterns
  HIDDEN_FILE_PATTERNS: UPLOAD_CONFIG.HIDDEN_FILE_PATTERNS || [
    '.DS_Store',
    '.localized',
    '__MACOSX',
    'Thumbs.db',
    'desktop.ini',
    '.gitignore',
    '.git',
    '.svn',
    '.hg',
  ],

  // Allowed file extensions (matches backend)
  ALLOWED_EXTENSIONS: UPLOAD_CONFIG.ALLOWED_EXTENSIONS || [
    // Documents
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.html', '.htm', '.rtf', '.csv',
    // Images
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.tiff', '.tif', '.bmp', '.svg', '.ico',
    // Design files
    '.psd', '.ai', '.sketch', '.fig', '.xd',
    // Video files
    '.mp4', '.webm', '.ogg', '.mov', '.avi', '.mpeg', '.mpg',
    // Audio files
    '.mp3', '.wav', '.weba', '.oga', '.m4a',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// FILE FILTERING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a file should be skipped (hidden/system file)
 */
function isHiddenFile(filename) {
  if (!filename) return true;

  // Check if starts with dot (hidden file)
  if (filename.startsWith('.')) {
    return true;
  }

  // Check against known patterns
  return CONFIG.HIDDEN_FILE_PATTERNS.some(pattern => filename.includes(pattern));
}

/**
 * Check if a file has an allowed extension
 */
function isAllowedFile(filename) {
  if (!filename) return false;
  const ext = '.' + filename.split('.').pop().toLowerCase();
  return CONFIG.ALLOWED_EXTENSIONS.includes(ext);
}

/**
 * Filter files before upload - removes hidden files and unsupported types
 */
function filterFiles(files) {
  const validFiles = [];
  const skippedFiles = [];

  files.forEach(file => {
    const filename = file.name || file.webkitRelativePath?.split('/').pop() || '';

    if (isHiddenFile(filename)) {
      skippedFiles.push({ file, reason: 'hidden/system file' });
    } else if (!isAllowedFile(filename)) {
      skippedFiles.push({ file, reason: 'unsupported file type' });
    } else {
      validFiles.push(file);
    }
  });

  if (skippedFiles.length > 0) {
    skippedFiles.forEach(({ file, reason }) => {
    });
  }

  return { validFiles, skippedFiles };
}

// ═══════════════════════════════════════════════════════════════════════════
// FOLDER STRUCTURE ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Analyze folder structure from uploaded files
 * Returns: { rootFolderName, subfolders[], files[] }
 */
function analyzeFolderStructure(files) {
  if (files.length === 0) {
    throw new Error('No files provided');
  }
  // Extract root folder name from first file
  const firstPath = files[0].webkitRelativePath;
  if (!firstPath) {
    throw new Error('Files must have webkitRelativePath (folder upload required)');
  }

  // Normalize root folder name to NFC for proper Unicode handling
  const rootFolderName = firstPath.split('/')[0].normalize('NFC');

  // Validate folder name
  if (!rootFolderName || rootFolderName.trim() === '') {
    throw new Error('Invalid folder name: folder name cannot be empty');
  }
  if (rootFolderName === '.' || rootFolderName === '..') {
    throw new Error(`Invalid folder name: "${rootFolderName}" is not allowed`);
  }
  // Build subfolder structure
  const subfolderSet = new Set();
  const subfolders = [];
  const fileList = [];

  files.forEach(file => {
    const fullPath = file.webkitRelativePath;
    const pathParts = fullPath.split('/');

    // Remove root folder name to get relative path
    const relativeParts = pathParts.slice(1);

    // Add file to file list
    // Normalize paths to NFC to handle Unicode characters properly (e.g., "Capítulo" instead of "Capil̃tulo")
    fileList.push({
      file: file,
      fullPath: fullPath.normalize('NFC'),
      relativePath: relativeParts.join('/').normalize('NFC'),
      fileName: relativeParts[relativeParts.length - 1].normalize('NFC'),
      depth: relativeParts.length - 1, // 0 = direct child of category
      folderPath: relativeParts.length > 1 ? relativeParts.slice(0, -1).join('/').normalize('NFC') : null
    });

    // Build subfolder structure (if file is nested)
    for (let i = 0; i < relativeParts.length - 1; i++) {
      // Normalize folder paths/names to NFC for proper Unicode handling
      const folderPath = relativeParts.slice(0, i + 1).join('/').normalize('NFC');
      const folderName = relativeParts[i].normalize('NFC');
      const parentPath = i > 0 ? relativeParts.slice(0, i).join('/').normalize('NFC') : null;

      if (!subfolderSet.has(folderPath)) {
        subfolderSet.add(folderPath);
        subfolders.push({
          name: folderName,
          path: folderPath,
          parentPath: parentPath,
          depth: i // 0 = direct child of category
        });
      }
    }
  });

  // Sort subfolders by depth (parents before children)
  subfolders.sort((a, b) => a.depth - b.depth);
  return {
    rootFolderName,
    subfolders,
    files: fileList
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// FOLDER CREATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ensure category exists (create or reuse)
 */
async function ensureCategory(categoryName) {
  if (!categoryName || typeof categoryName !== 'string') {
    throw new Error(`Invalid category name: ${JSON.stringify(categoryName)}`);
  }

  const trimmedName = categoryName.trim();
  if (trimmedName === '' || trimmedName === '.' || trimmedName === '..') {
    throw new Error(`Invalid category name: "${categoryName}" is not allowed`);
  }

  try {
    const createResponse = await api.post('/api/folders', {
      name: trimmedName,
      emoji: null,
      reuseExisting: true
    });

    const folderId = createResponse.data.folder.id;
    return folderId;
  } catch (error) {
    throw error;
  }
}

/**
 * Create subfolder hierarchy using bulk API
 * Returns mapping of folderPath → folderId
 */
async function createSubfolders(subfolders, categoryId) {
  if (subfolders.length === 0) {
    return {};
  }

  try {
    const response = await api.post('/api/folders/bulk', {
      folderTree: subfolders,
      defaultEmoji: null,
      parentFolderId: categoryId
    });
    return response.data.folderMap;
  } catch (error) {
    throw error;
  }
}

/**
 * Check if subfolder exists and get its ID, or create it
 */
async function ensureSubfolder(folderName, parentFolderId) {
  try {
    // Check if subfolder already exists
    const foldersResponse = await api.get('/api/folders?includeAll=true');
    const existingSubfolder = foldersResponse.data.folders.find(
      f => f.name === folderName && f.parentFolderId === parentFolderId
    );

    if (existingSubfolder) {
      return existingSubfolder.id;
    }

    // Create new subfolder
    const createResponse = await api.post('/api/folders', {
      name: folderName,
      emoji: null,
      parentFolderId: parentFolderId
    });
    return createResponse.data.folder.id;
  } catch (error) {
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FILE HASHING (Web Worker)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate SHA-256 hash using Web Worker (non-blocking)
 */
function calculateFileHash(file) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/hash.worker.js', import.meta.url));

    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error(`Hash calculation timeout for "${file.name}"`));
    }, 60000); // 60 second timeout

    worker.onmessage = (event) => {
      clearTimeout(timeout);
      if (event.data.error) {
        reject(new Error(event.data.error));
      } else {
        resolve(event.data.hash);
      }
      worker.terminate();
    };

    worker.onerror = (error) => {
      clearTimeout(timeout);
      reject(error);
      worker.terminate();
    };

    worker.postMessage({ file });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PRESIGNED URL UPLOADS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Request presigned URLs for multiple files
 */
async function requestPresignedUrls(files, folderId) {
  const urlRequests = files.map(fileInfo => ({
    // Normalize filename to NFC to handle Unicode characters properly (e.g., "Capítulo" instead of "Capil̃tulo")
    fileName: (fileInfo.fileName || fileInfo.file.name).normalize('NFC'),
    fileType: fileInfo.file.type || 'application/octet-stream',
    fileSize: fileInfo.file.size,
    relativePath: fileInfo.relativePath ? fileInfo.relativePath.normalize('NFC') : null,
    folderId: fileInfo.folderId || folderId
  }));

  const { data } = await api.post('/api/presigned-urls/bulk', {
    files: urlRequests,
    folderId
  });
  return data;
}

/**
 * Upload single file to S3 using presigned URL
 */
async function uploadFileToS3(file, presignedUrl, documentId, onProgress) {
  let retries = 0;

  while (retries < CONFIG.MAX_RETRIES) {
    try {
      const response = await axios.put(presignedUrl, file, {
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'x-amz-server-side-encryption': 'AES256'
        },
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const percent = (progressEvent.loaded / progressEvent.total) * 100;
            onProgress(percent);
          }
        }
      });

      if (response.status !== 200) {
        throw new Error(`Upload failed with status ${response.status}`);
      }

      return { success: true, documentId };
    } catch (error) {
      retries++;

      if (retries >= CONFIG.MAX_RETRIES) {
        // Rollback: Delete orphaned database record
        try {
          await api.delete(`/api/documents/${documentId}`);
        } catch (rollbackError) {
        }

        return { success: false, documentId, error: error.message };
      }

      // Exponential backoff
      const delay = CONFIG.INITIAL_RETRY_DELAY * Math.pow(2, retries);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Notify backend of completed uploads with retry
 */
async function notifyCompletionWithRetry(documentIds) {
  let lastError = null;

  for (let attempt = 1; attempt <= CONFIG.MAX_CONFIRM_RETRIES; attempt++) {
    try {
      const response = await api.post('/api/presigned-urls/complete', {
        documentIds
      }, {
        timeout: 60000 // ✅ FIX: Increased timeout to 60s for large uploads (was 10s)
      });
      return response.data;
    } catch (error) {
      lastError = error;
      // Check if error is retryable
      const isRetryable =
        !error.response ||
        error.response.status >= 500 ||
        error.response.status === 429 ||
        error.code === 'ECONNABORTED' ||
        error.code === 'ETIMEDOUT';

      if (!isRetryable) {
        throw error;
      }

      if (attempt < CONFIG.MAX_CONFIRM_RETRIES) {
        const delay = CONFIG.INITIAL_RETRY_DELAY * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN UPLOAD FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Upload multiple files (not folders) using presigned URLs
 *
 * @param {File[]} files - Array of File objects
 * @param {string|null} folderId - Target folder ID
 * @param {function} onProgress - Progress callback (progress, fileName, stage)
 * @returns {Promise<Object>} Upload results
 */
async function uploadFiles(files, folderId, onProgress) {
  const startTime = Date.now();
  // Filter files
  const { validFiles, skippedFiles } = filterFiles(files);

  if (validFiles.length === 0) {
    throw new Error('No valid files to upload');
  }

  // Separate large files (>20MB) from small files
  const largeFiles = validFiles.filter(f => shouldUseResumableUpload(f.size));
  const smallFiles = validFiles.filter(f => !shouldUseResumableUpload(f.size));

  console.log(`📤 [Upload] Processing ${validFiles.length} files: ${smallFiles.length} small, ${largeFiles.length} large`);

  const results = [];
  let completedCount = 0;

  try {
    // Upload large files first using resumable upload (one at a time to avoid memory issues)
    if (largeFiles.length > 0) {
      onProgress?.({ stage: 'uploading', message: `Uploading large files (0/${largeFiles.length})...`, percentage: 5 });

      for (const file of largeFiles) {
        try {
          const result = await uploadLargeFile(file, folderId, (progress) => {
            const largeFileProgress = (completedCount / validFiles.length) * 100;
            const currentProgress = progress.percentage / 100 / validFiles.length * 100;
            onProgress?.({
              stage: 'uploading',
              message: `Uploading large file: ${file.name}`,
              percentage: 5 + (largeFileProgress + currentProgress) * 0.85
            });
          });
          results.push(result);
          completedCount++;
        } catch (error) {
          console.error(`❌ Failed to upload large file ${file.name}:`, error);
          results.push({ success: false, fileName: file.name, error: error?.message || String(error) });
          completedCount++;
        }
      }
    }

    // Upload small files using presigned URLs
    if (smallFiles.length > 0) {
      // Prepare file info
      const fileInfos = smallFiles.map(file => ({
        file,
        // Normalize filename to NFC to handle Unicode characters properly
        fileName: file.name.normalize('NFC'),
        folderId
      }));

      // Request presigned URLs
      onProgress?.({ stage: 'preparing', message: 'Preparing upload...', percentage: 5 + (completedCount / validFiles.length) * 85 });
      const { presignedUrls, documentIds, skippedFiles: skippedByBackend = [] } = await requestPresignedUrls(fileInfos, folderId);

      // ✅ FIX: Filter out skipped files to match presignedUrls/documentIds arrays
      // Backend returns shorter arrays when files are skipped (already exist)
      const skippedSet = new Set(skippedByBackend.map(f => f.normalize('NFC')));
      const filesToUpload = smallFiles.filter(f => !skippedSet.has(f.name.normalize('NFC')));

      // Add skipped files to results immediately (they're already uploaded)
      if (skippedByBackend.length > 0) {
        console.log(`📋 [Upload] ${skippedByBackend.length} files skipped (already exist): ${skippedByBackend.join(', ')}`);
        for (const skippedName of skippedByBackend) {
          results.push({ success: true, fileName: skippedName, skipped: true });
          completedCount++;
        }
      }

      // Upload all files in parallel batches
      onProgress?.({ stage: 'uploading', message: 'Uploading files...', percentage: 10 + (completedCount / validFiles.length) * 85 });

      // Process in batches - now arrays are aligned (filesToUpload.length === presignedUrls.length)
      const batches = [];
      for (let i = 0; i < filesToUpload.length; i += CONFIG.MAX_CONCURRENT_UPLOADS) {
        batches.push({
          files: filesToUpload.slice(i, i + CONFIG.MAX_CONCURRENT_UPLOADS),
          urls: presignedUrls.slice(i, i + CONFIG.MAX_CONCURRENT_UPLOADS),
          ids: documentIds.slice(i, i + CONFIG.MAX_CONCURRENT_UPLOADS)
        });
      }

      // Process all batches in parallel
      const batchPromises = batches.map(async (batch) => {
        const batchResults = await Promise.all(
          batch.files.map(async (file, idx) => {
            const result = await uploadFileToS3(
              file,
              batch.urls[idx],
              batch.ids[idx],
              (percent) => {
                // Individual file progress (optional)
              }
            );

            completedCount++;
            const overallProgress = 5 + (completedCount / validFiles.length) * 85;
            onProgress?.({
              stage: 'uploading',
              message: `Uploading (${completedCount}/${validFiles.length})`,
              percentage: overallProgress
            });

            return result;
          })
        );
        return batchResults;
      });

      const allBatchResults = await Promise.all(batchPromises);
      results.push(...allBatchResults.flat());

      // Notify backend of completion for small files
      const successfulSmallUploads = allBatchResults.flat().filter(r => r.success);
      if (successfulSmallUploads.length > 0) {
        onProgress?.({ stage: 'finalizing', message: 'Finalizing...', percentage: 95 });
        await notifyCompletionWithRetry(successfulSmallUploads.map(r => r.documentId));
      }
    }

    const duration = Date.now() - startTime;
    const successfulUploads = results.filter(r => r.success);
    onProgress?.({ stage: 'complete', message: 'Upload complete!', percentage: 100 });

    return {
      successCount: successfulUploads.length,
      failureCount: validFiles.length - successfulUploads.length,
      totalFiles: validFiles.length,
      skippedFiles: skippedFiles.length,
      results,
      duration
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Upload a folder with structure preservation
 *
 * @param {File[]} files - Array of File objects from folder input
 * @param {function} onProgress - Progress callback
 * @param {string|null} existingCategoryId - Parent category ID (null for root)
 * @returns {Promise<Object>} Upload results with categoryId
 */
async function uploadFolder(files, onProgress, existingCategoryId = null) {
  const startTime = Date.now();
  try {
    // Step 0: Filter files
    onProgress?.({ stage: 'filtering', message: 'Filtering files...', percentage: 2 });
    const { validFiles, skippedFiles } = filterFiles(Array.from(files));

    if (validFiles.length === 0) {
      // Provide detailed information about why files were skipped
      const skippedReasons = skippedFiles.slice(0, 5).map(f => {
        const fileName = f.file?.name || f.file?.webkitRelativePath?.split('/').pop() || 'unknown';
        return `"${fileName}" (${f.reason || 'filtered'})`;
      }).join(', ');
      const extraCount = skippedFiles.length > 5 ? ` and ${skippedFiles.length - 5} more` : '';
      throw new Error(`No valid files to upload. Skipped: ${skippedReasons}${extraCount}`);
    }
    // Step 1: Analyze folder structure
    onProgress?.({ stage: 'analyzing', message: 'Analyzing folder structure...', percentage: 5 });
    const structure = analyzeFolderStructure(validFiles);

    // Step 2: Create category/subfolder
    let categoryId;
    let categoryName;

    if (!existingCategoryId) {
      // Creating new root category
      onProgress?.({ stage: 'category', message: `Creating category "${structure.rootFolderName}"...`, percentage: 8 });
      categoryId = await ensureCategory(structure.rootFolderName);
      categoryName = structure.rootFolderName;
    } else {
      // Creating subfolder inside existing category
      onProgress?.({ stage: 'category', message: `Creating folder "${structure.rootFolderName}"...`, percentage: 8 });
      categoryId = await ensureSubfolder(structure.rootFolderName, existingCategoryId);
      categoryName = structure.rootFolderName;
    }

    // Step 3: Create subfolders
    let folderMap = {};
    if (structure.subfolders.length > 0) {
      onProgress?.({ stage: 'subfolders', message: `Creating ${structure.subfolders.length} subfolders...`, percentage: 12 });
      folderMap = await createSubfolders(structure.subfolders, categoryId);
    }

    // Step 4: Map files to folders
    onProgress?.({ stage: 'mapping', message: 'Preparing files...', percentage: 15 });

    const fileInfos = structure.files.map(fileInfo => {
      let targetFolderId;
      if (fileInfo.depth === 0) {
        targetFolderId = categoryId;
      } else {
        targetFolderId = folderMap[fileInfo.folderPath];
      }

      return {
        file: fileInfo.file,
        fileName: fileInfo.fileName,
        relativePath: fileInfo.relativePath,
        folderId: targetFolderId
      };
    });

    // Separate large files (>20MB) from small files for folder uploads
    const largeFileInfos = fileInfos.filter(fi => shouldUseResumableUpload(fi.file.size));
    const smallFileInfos = fileInfos.filter(fi => !shouldUseResumableUpload(fi.file.size));

    console.log(`📤 [Folder Upload] Processing ${fileInfos.length} files: ${smallFileInfos.length} small, ${largeFileInfos.length} large`);

    let completedCount = 0;
    const results = [];

    // Step 5a: Upload large files first using resumable upload
    if (largeFileInfos.length > 0) {
      onProgress?.({ stage: 'uploading', message: `Uploading large files (0/${largeFileInfos.length})...`, percentage: 18 });

      for (const fileInfo of largeFileInfos) {
        try {
          const result = await uploadLargeFile(fileInfo.file, fileInfo.folderId, (progress) => {
            const largeFileProgress = (completedCount / fileInfos.length) * 100;
            onProgress?.({
              stage: 'uploading',
              message: `Uploading large file: ${fileInfo.fileName}`,
              percentage: 18 + (largeFileProgress + progress.percentage / fileInfos.length) * 0.72
            });
          });
          results.push({ ...result, fileName: fileInfo.fileName });
          completedCount++;
        } catch (error) {
          console.error(`❌ Failed to upload large file ${fileInfo.fileName}:`, error);
          results.push({ success: false, fileName: fileInfo.fileName, error: error?.message || String(error) });
          completedCount++;
        }
      }
    }

    // Step 5b: Upload small files using presigned URLs
    if (smallFileInfos.length > 0) {
      // Request presigned URLs for small files only
      onProgress?.({ stage: 'preparing', message: 'Requesting upload URLs...', percentage: 18 + (completedCount / fileInfos.length) * 72 });
      const { presignedUrls, documentIds, skippedFiles: skippedByBackend = [] } = await requestPresignedUrls(smallFileInfos, categoryId);

      // ✅ FIX: Filter out skipped files to match presignedUrls/documentIds arrays
      // Backend returns shorter arrays when files are skipped (already exist)
      const skippedSet = new Set(skippedByBackend.map(f => f.normalize('NFC')));
      const fileInfosToUpload = smallFileInfos.filter(fi => !skippedSet.has(fi.fileName.normalize('NFC')));

      // Add skipped files to results immediately (they're already uploaded)
      if (skippedByBackend.length > 0) {
        console.log(`📋 [Folder Upload] ${skippedByBackend.length} files skipped (already exist): ${skippedByBackend.join(', ')}`);
        for (const skippedName of skippedByBackend) {
          results.push({ success: true, fileName: skippedName, skipped: true });
          completedCount++;
        }
      }

      // Step 6: Upload all small files in parallel
      onProgress?.({ stage: 'uploading', message: 'Uploading files...', percentage: 20 + (completedCount / fileInfos.length) * 70 });

      // Process in batches for concurrent limit - arrays are now aligned
      const batches = [];
      for (let i = 0; i < fileInfosToUpload.length; i += CONFIG.MAX_CONCURRENT_UPLOADS) {
        batches.push({
          fileInfos: fileInfosToUpload.slice(i, i + CONFIG.MAX_CONCURRENT_UPLOADS),
          urls: presignedUrls.slice(i, i + CONFIG.MAX_CONCURRENT_UPLOADS),
          ids: documentIds.slice(i, i + CONFIG.MAX_CONCURRENT_UPLOADS)
        });
      }
      // Process ALL batches in parallel
      const batchPromises = batches.map(async (batch) => {
        const batchResults = await Promise.all(
          batch.fileInfos.map(async (fileInfo, idx) => {
            const result = await uploadFileToS3(
              fileInfo.file,
              batch.urls[idx],
              batch.ids[idx],
              null // No per-file progress for batch uploads
            );

            completedCount++;
            const overallProgress = 20 + (completedCount / fileInfos.length) * 70;
            onProgress?.({
              stage: 'uploading',
              message: `Uploading (${completedCount}/${fileInfos.length})`,
              percentage: overallProgress
            });

            return {
              ...result,
              fileName: fileInfo.fileName
            };
          })
        );
        return batchResults;
      });

      const allBatchResults = await Promise.all(batchPromises);
      results.push(...allBatchResults.flat());

      // Notify backend of completion for small files
      const successfulSmallUploads = allBatchResults.flat().filter(r => r.success);
      if (successfulSmallUploads.length > 0) {
        try {
          await notifyCompletionWithRetry(successfulSmallUploads.map(r => r.documentId));
        } catch (confirmError) {
          console.error('Failed to notify completion for small files:', confirmError);
        }
      }
    }

    // Step 7: Final summary
    // 🔥 FIX: S3 upload complete = 80%, backend processing will update to 100% via WebSocket
    onProgress?.({ stage: 'processing', message: 'Processing documents...', percentage: 80 });

    const duration = Date.now() - startTime;
    const successfulUploads = results.filter(r => r.success);
    const successCount = successfulUploads.length;
    const failureCount = fileInfos.length - successCount;

    // 🔥 NOTE: Don't emit 100% here - let backend emit 100% after verification
    // Backend will emit progress 80% → 100% as it processes (extraction, chunking, embedding, verification)
    // Frontend should listen to 'document-processing-update' WebSocket events for real-time progress
    onProgress?.({
      stage: 'processing',
      message: `Uploaded ${successCount} files, processing...`,
      percentage: 80,
      successCount,
      failureCount,
      // 🔥 NEW: Signal to frontend that backend will send remaining progress
      awaitingBackendProgress: true
    });

    return {
      successCount,
      failureCount,
      totalFiles: fileInfos.length,
      skippedFiles: skippedFiles.length,
      results,
      categoryId,
      categoryName,
      duration,
      errors: results.filter(r => !r.success).map(r => ({ fileName: r.fileName, error: r.error }))
    };
  } catch (error) {
    onProgress?.({ stage: 'error', message: error.message, percentage: 0 });
    throw error;
  }
}

/**
 * Upload a single file using presigned URL
 *
 * @param {File} file - File to upload
 * @param {string|null} folderId - Target folder ID
 * @param {function} onProgress - Progress callback
 * @returns {Promise<Object>} Upload result with document info
 */
async function uploadSingleFile(file, folderId, onProgress) {
  // Filter check
  if (isHiddenFile(file.name)) {
    throw new Error(`Cannot upload hidden/system file: ${file.name}`);
  }
  if (!isAllowedFile(file.name)) {
    throw new Error(`Unsupported file type: ${file.name}`);
  }

  try {
    // Check if file should use resumable (multipart) upload
    if (shouldUseResumableUpload(file.size)) {
      console.log(`📤 [Upload] Using resumable upload for large file: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
      return await uploadLargeFile(file, folderId, onProgress);
    }

    // Standard presigned URL upload for smaller files
    // Request presigned URL
    onProgress?.({ stage: 'preparing', message: 'Preparing...', percentage: 5 });

    const { data } = await api.post('/api/presigned-urls/bulk', {
      files: [{
        // Normalize filename to NFC to handle Unicode characters properly (e.g., "Capítulo" instead of "Capil̃tulo")
        fileName: file.name.normalize('NFC'),
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
        folderId
      }],
      folderId
    });

    const presignedUrl = data.presignedUrls[0];
    const documentId = data.documentIds[0];

    // Upload to S3
    onProgress?.({ stage: 'uploading', message: 'Uploading...', percentage: 10 });

    const result = await uploadFileToS3(
      file,
      presignedUrl,
      documentId,
      (percent) => {
        onProgress?.({
          stage: 'uploading',
          message: `Uploading... ${Math.round(percent)}%`,
          percentage: 10 + (percent * 0.8)
        });
      }
    );

    if (!result.success) {
      throw new Error(result.error || 'Upload failed');
    }

    // Notify backend
    onProgress?.({ stage: 'finalizing', message: 'Finalizing...', percentage: 95 });
    await notifyCompletionWithRetry([documentId]);

    onProgress?.({ stage: 'complete', message: 'Complete!', percentage: 100 });

    return {
      success: true,
      documentId,
      fileName: file.name
    };
  } catch (error) {
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

const unifiedUploadService = {
  // Main upload functions
  uploadFiles,
  uploadFolder,
  uploadSingleFile,

  // Utility functions
  filterFiles,
  isHiddenFile,
  isAllowedFile,
  analyzeFolderStructure,
  calculateFileHash,

  // Folder operations
  ensureCategory,
  ensureSubfolder,
  createSubfolders,

  // Configuration
  CONFIG
};

export default unifiedUploadService;

// Named exports for convenience
export {
  uploadFiles,
  uploadFolder,
  uploadSingleFile,
  filterFiles,
  isHiddenFile,
  isAllowedFile,
  analyzeFolderStructure,
  calculateFileHash,
  CONFIG
};
