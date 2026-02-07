/**
 * @deprecated This service is DEPRECATED. Use unifiedUploadService.js instead.
 *
 * Migration guide:
 * - import unifiedUploadService from './unifiedUploadService'
 * - unifiedUploadService.uploadFolder(files, onProgress, categoryId)
 * - unifiedUploadService.uploadSingleFile(file, folderId, onProgress)
 *
 * The new unified service:
 * - Uses presigned URLs for direct S3 uploads (faster, bypasses backend)
 * - Implements true parallel processing (no artificial delays)
 * - Preserves folder structure (same behavior as this service)
 * - Supports multipart uploads for large files
 *
 * This file is kept for backward compatibility but will be removed in a future version.
 *
 * ===============================================================================
 *
 * FolderUploadService - REDESIGNED FROM SCRATCH (DEPRECATED)
 *
 * CORE CONCEPT:
 * - The uploaded folder structure is ALWAYS preserved
 * - When uploading from Documents page (no category): creates a new Category with the folder name
 * - When uploading from inside a category/subfolder: creates the folder as a subfolder in that location
 * - All immediate files in the folder are added to the created folder
 * - All subfolders become nested subfolders
 * - Files in nested folders are properly mapped to their respective folders
 *
 * EXAMPLE 1 (from Documents page):
 * Upload "koda website/" containing:
 *   - file1.pdf
 *   - file2.doc
 *   - saaa/
 *     - nested.pdf
 *
 * Result:
 * - Category: "koda website" (shows 2 files: file1.pdf, file2.doc)
 * - Subfolder: "saaa" (under koda website, shows 1 file: nested.pdf)
 *
 * EXAMPLE 2 (from inside a category called "Projects"):
 * Upload same "koda website/" folder
 *
 * Result:
 * - Category: "Projects" (unchanged)
 * - Subfolder: "koda website" (under Projects, shows 2 files: file1.pdf, file2.doc)
 * - Subfolder: "saaa" (under koda website, shows 1 file: nested.pdf)
 */

import api from './api';

class FolderUploadService {
  constructor() {
    this.maxConcurrentUploads = 3;  // ✅ REDUCED: Prevent database connection exhaustion
    this.delayBetweenBatches = 500; // ✅ NEW: Delay between batches to allow connections to release
    this.uploadProgress = {
      totalFiles: 0,
      uploadedFiles: 0,
      currentBatch: 0,
      totalBatches: 0,
      errors: []
    };

    // ✅ File filtering configuration - matches backend upload.middleware.ts
    this.hiddenFilePatterns = [
      '.DS_Store',
      '.localized',
      '__MACOSX',
      'Thumbs.db',
      'desktop.ini',
    ];

    this.allowedExtensions = [
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
    ];
  }

  /**
   * Check if a file should be skipped (hidden/system file)
   */
  isHiddenFile(filename) {
    // Check if starts with dot (hidden file)
    if (filename.startsWith('.')) {
      return true;
    }

    // Check against known patterns
    return this.hiddenFilePatterns.some(pattern => filename.includes(pattern));
  }

  /**
   * Check if a file has an allowed extension
   */
  isAllowedFile(filename) {
    const ext = '.' + filename.split('.').pop().toLowerCase();
    return this.allowedExtensions.includes(ext);
  }

  /**
   * Filter files before upload - removes hidden files and unsupported types
   */
  filterFiles(files) {
    const validFiles = [];
    const skippedFiles = [];

    files.forEach(file => {
      const filename = file.name || file.webkitRelativePath?.split('/').pop() || '';

      if (this.isHiddenFile(filename)) {
        skippedFiles.push({ file, reason: 'hidden/system file' });
      } else if (!this.isAllowedFile(filename)) {
        skippedFiles.push({ file, reason: 'unsupported file type' });
      } else {
        validFiles.push(file);
      }
    });

    if (skippedFiles.length > 0) {
      skippedFiles.forEach(({ file, reason }) => {
      });
    }

    return validFiles;
  }

  /**
   * Extract folder structure from uploaded files
   * Returns: { rootFolderName, subfolders[], files[] }
   */
  analyzeFolderStructure(files) {
    if (files.length === 0) {
      throw new Error('No files provided');
    }
    // Extract root folder name from first file
    const firstPath = files[0].webkitRelativePath;
    if (!firstPath) {
      throw new Error('Files must have webkitRelativePath (folder upload required)');
    }

    const rootFolderName = firstPath.split('/')[0];

    // Validate folder name
    if (!rootFolderName || rootFolderName.trim() === '') {
      throw new Error('Invalid folder name: folder name cannot be empty');
    }
    if (rootFolderName === '.' || rootFolderName === '..') {
      throw new Error(`Invalid folder name: "${rootFolderName}" is not allowed`);
    }
    files.slice(0, 5).forEach(f => {
    });

    // Build subfolder structure
    const subfolderSet = new Set();
    const subfolders = [];
    const fileList = [];

    files.forEach(file => {
      const fullPath = file.webkitRelativePath;
      const pathParts = fullPath.split('/');

      // Remove root folder name to get relative path
      // ["koda website", "file.pdf"] → ["file.pdf"]
      // ["koda website", "saaa", "nested.pdf"] → ["saaa", "nested.pdf"]
      const relativeParts = pathParts.slice(1);

      // Add file to file list
      fileList.push({
        file: file,
        fullPath: fullPath,
        relativePath: relativeParts.join('/'),
        fileName: relativeParts[relativeParts.length - 1],
        depth: relativeParts.length - 1, // 0 = direct child of category
        folderPath: relativeParts.length > 1 ? relativeParts.slice(0, -1).join('/') : null
      });

      // Build subfolder structure (if file is nested)
      for (let i = 0; i < relativeParts.length - 1; i++) {
        const folderPath = relativeParts.slice(0, i + 1).join('/');
        const folderName = relativeParts[i];
        const parentPath = i > 0 ? relativeParts.slice(0, i).join('/') : null;

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
    subfolders.forEach(sf => {
    });
    const rootFiles = fileList.filter(f => f.depth === 0);
    const nestedFiles = fileList.filter(f => f.depth > 0);
    // ✅ DEBUG: Show detailed breakdown of nested files
    if (nestedFiles.length > 0) {
      nestedFiles.forEach((f, idx) => {
      });
    } else {
    }

    if (fileList.length > 0) {
    } else {
    }

    return {
      rootFolderName,
      subfolders,
      files: fileList
    };
  }

  /**
   * Create or get category (root folder)
   */
  async ensureCategory(categoryName) {
    // Validate category name before making API call
    if (!categoryName || typeof categoryName !== 'string') {
      throw new Error(`Invalid category name: ${JSON.stringify(categoryName)}`);
    }

    const trimmedName = categoryName.trim();
    if (trimmedName === '' || trimmedName === '.' || trimmedName === '..') {
      throw new Error(`Invalid category name: "${categoryName}" is not allowed`);
    }

    try {
      // ✅ FIX: Use backend's reuseExisting option to prevent duplicates
      const createResponse = await api.post('/api/folders', {
        name: trimmedName,
        emoji: null, // Use null to allow default SVG icon
        reuseExisting: true  // ✅ Reuse if exists instead of creating duplicate
      });

      const folderId = createResponse.data?.id || createResponse.data?.folder?.id;
      return folderId;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Create subfolder hierarchy
   * Returns mapping of folderPath → folderId
   */
  async createSubfolders(subfolders, categoryId) {
    if (subfolders.length === 0) {
      return {};
    }

    try {
      const response = await api.post('/api/folders/bulk', {
        folderTree: subfolders,
        defaultEmoji: null, // Use null to allow default SVG icon
        parentFolderId: categoryId
      });
      // ✅ DEBUG: Verify all subfolders were mapped correctly
      const folderMap = response.data?.folderMap || {};
      subfolders.forEach(sf => {
        if (folderMap[sf.path]) {
        } else {
        }
      });

      return response.data.folderMap;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Map files to their folder IDs
   */
  mapFilesToFolders(files, categoryId, folderMap) {
    const fileMapping = files.map(fileInfo => {
      const { file, fileName, folderPath, depth } = fileInfo;

      let folderId;
      if (depth === 0) {
        // File is directly in category (root level)
        folderId = categoryId;
      } else {
        // File is in a subfolder
        folderId = folderMap[folderPath];
      }

      if (!folderId) {
      }

      return {
        file,
        fileName,
        folderId,
        relativePath: fileInfo.relativePath,
        depth: fileInfo.depth,
        folderPath: fileInfo.folderPath
      };
    });
    // ✅ DEBUG: Verify all files have folder IDs
    const filesWithFolderId = fileMapping.filter(f => f.folderId);
    const filesWithoutFolderId = fileMapping.filter(f => !f.folderId);
    if (filesWithoutFolderId.length > 0) {
      filesWithoutFolderId.forEach(f => {
      });
    }

    return fileMapping;
  }

  /**
   * Calculate SHA-256 hash of a file using Web Worker (non-blocking)
   */
  async calculateFileHash(file) {
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

  /**
   * Upload a single file
   */
  async uploadSingleFile(fileObj, onProgress) {
    const { file, fileName, folderId, relativePath } = fileObj;

    try {
      // ✅ FIX: Calculate file hash with timeout to prevent hanging
      const hashStart = Date.now();

      const fileHash = await Promise.race([
        this.calculateFileHash(file),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Hash calculation timeout after 30s for "${fileName}"`)), 30000)
        )
      ]);

      const hashDuration = Date.now() - hashStart;
      const formData = new FormData();
      formData.append('files', file);
      formData.append('fileHash', fileHash);
      formData.append('filename', fileName);

      if (folderId) {
        formData.append('folderId', folderId);
      }

      // Include relativePath for backend fallback folder creation
      if (relativePath) {
        formData.append('relativePath', relativePath);
      }
      const uploadStart = Date.now();

      const response = await api.post('/api/documents/upload', formData, {
        timeout: 600000, // 10 minute timeout for large files (up to 500MB)
        onUploadProgress: (progressEvent) => {
          const percentComplete = (progressEvent.loaded / progressEvent.total) * 100;
          onProgress(percentComplete);
        }
      });

      const uploadDuration = Date.now() - uploadStart;
      return { success: true, fileId: response.data.document?.id, fileName };
    } catch (error) {
      return { success: false, fileName, error: error.message };
    }
  }

  /**
   * ✅ OPTIMIZED: True parallel batch processing
   * All batches start simultaneously, not sequentially
   */
  async uploadFilesInParallel(fileMapping, onOverallProgress) {
    const totalFiles = fileMapping.length;
    let uploadedFiles = 0;

    // Create batches for concurrent limit (but process ALL batches in parallel)
    const batches = [];
    for (let i = 0; i < fileMapping.length; i += this.maxConcurrentUploads) {
      batches.push(fileMapping.slice(i, i + this.maxConcurrentUploads));
    }
    this.uploadProgress = { totalFiles, uploadedFiles: 0, errors: [] };

    // ✅ TRUE PARALLEL: Process ALL batches simultaneously
    const allBatchPromises = batches.map(async (batch) => {
      // Process all files in this batch simultaneously
      const batchPromises = batch.map(async (fileObj) => {
        const result = await this.uploadSingleFile(fileObj, () => {});

        // Safely update shared progress
        uploadedFiles++;
        this.uploadProgress.uploadedFiles = uploadedFiles;

        if (!result.success) {
          this.uploadProgress.errors.push({ fileName: result.fileName, error: result.error });
        }

        // Update overall progress
        const overallPercentage = Math.round((uploadedFiles / totalFiles) * 100);
        onOverallProgress({
          percentage: overallPercentage,
          message: `Uploading... (${uploadedFiles}/${totalFiles})`
        });

        return result;
      });

      return Promise.all(batchPromises);
    });

    // Wait for ALL batches to complete (they all run in parallel)
    const allResultsNested = await Promise.all(allBatchPromises);
    const results = allResultsNested.flat();

    const successCount = results.filter(r => r.success).length;
    const failureCount = totalFiles - successCount;
    return {
      results,
      totalFiles,
      successCount,
      failureCount,
      errors: this.uploadProgress.errors
    };
  }

  /**
   * MAIN METHOD: Upload entire folder with nested structure
   *
   * @param files - FileList from folder upload
   * @param onProgress - Progress callback
   * @param existingCategoryId - If provided, create the folder AS A SUBFOLDER of this category/folder
   */
  async uploadFolder(files, onProgress, existingCategoryId = null) {
    try {
      // Step 0: Filter out hidden files and unsupported types BEFORE analysis
      onProgress({ stage: 'filtering', message: 'Filtering files...' });
      const filteredFiles = this.filterFiles(Array.from(files));
      if (filteredFiles.length === 0) {
        throw new Error('No valid files to upload. All files were filtered out (hidden files or unsupported types).');
      }

      // Step 1: Analyze folder structure with filtered files
      onProgress({ stage: 'analyzing', message: 'Analyzing folder structure...' });
      const structure = this.analyzeFolderStructure(filteredFiles);

      let categoryId; // This will be the final ID where files are placed
      let categoryName;

      // **THE FIX STARTS HERE**

      // SCENARIO 1: Uploading a folder to create a NEW ROOT CATEGORY.
      if (!existingCategoryId) {
        onProgress({ stage: 'category', message: `Creating category "${structure.rootFolderName}"...` });

        // Use ensureCategory to get the ID of the new or existing root category.
        // This becomes the direct parent for all files and subfolders.
        categoryId = await this.ensureCategory(structure.rootFolderName);
        categoryName = structure.rootFolderName;
      // SCENARIO 2: Uploading a folder INTO an EXISTING CATEGORY.
      } else {
        onProgress({ stage: 'category', message: `Creating folder "${structure.rootFolderName}"...` });

        // ✅ FIX: Check if subfolder already exists before creating
        try {
          // Fetch all folders to check if this subfolder already exists
          const foldersResponse = await api.get('/api/folders?includeAll=true');
          const folderList = foldersResponse.data?.items || foldersResponse.data?.folders || [];
          const existingSubfolder = folderList.find(
            f => f.name === structure.rootFolderName && (f.parentFolderId === existingCategoryId || f.parentId === existingCategoryId)
          );

          if (existingSubfolder) {
            // Use existing subfolder instead of creating a duplicate
            categoryId = existingSubfolder.id;
            categoryName = structure.rootFolderName;
          } else {
            // Create the uploaded folder as a SUBFOLDER of the existing location.
            // The files will go into this new subfolder.
            const createResponse = await api.post('/api/folders', {
              name: structure.rootFolderName,
              emoji: null, // FIX for icon bug
              parentId: existingCategoryId
            });
            categoryId = createResponse.data?.id || createResponse.data?.folder?.id;
            categoryName = structure.rootFolderName;
          }
        } catch (error) {
          throw error;
        }
      }

      // **THE FIX ENDS HERE**

      // Step 2: Create subfolders within the target `categoryId`
      let folderMap = {};
      if (structure.subfolders.length > 0) {
        onProgress({ stage: 'subfolders', message: `Creating ${structure.subfolders.length} subfolders...` });
        folderMap = await this.createSubfolders(structure.subfolders, categoryId);
      } else {
      }

      // Step 4: Map files to folders
      onProgress({ stage: 'mapping', message: 'Mapping files to folders...' });
      const fileMapping = this.mapFilesToFolders(structure.files, categoryId, folderMap);

      // Step 5: Upload files in parallel
      onProgress({
        stage: 'uploading',
        message: 'Uploading files...',
        uploaded: 0,
        total: files.length,
        percentage: 0
      });

      const uploadResults = await this.uploadFilesInParallel(fileMapping, (progressData) => {
        onProgress({
          stage: 'uploading',
          message: `Uploading files (${progressData.currentBatch}/${progressData.totalBatches} batches)...`,
          ...progressData
        });
      });

      // Step 6: Complete
      onProgress({
        stage: 'complete',
        message: 'Upload complete!',
        uploaded: uploadResults.totalFiles,
        total: uploadResults.totalFiles,
        percentage: 100,
        successCount: uploadResults.successCount,
        failureCount: uploadResults.failureCount
      });
      return {
        ...uploadResults,
        categoryId,
        categoryName
      };
    } catch (error) {
      onProgress({ stage: 'error', message: error.message });
      throw error;
    }
  }

  /**
   * Reset upload progress
   */
  resetProgress() {
    this.uploadProgress = {
      totalFiles: 0,
      uploadedFiles: 0,
      currentBatch: 0,
      totalBatches: 0,
      errors: []
    };
  }
}

export default new FolderUploadService();
