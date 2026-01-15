import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ReactComponent as CloseIcon } from '../assets/x-close.svg';
import fileTypesStackIcon from '../assets/file-types-stack.svg';
import { ReactComponent as CheckIcon } from '../assets/check.svg';
// ✅ REFACTORED: Use unified upload service (replaces folderUploadService + presignedUploadService)
import unifiedUploadService from '../services/unifiedUploadService';
import { useDocuments } from '../context/DocumentsContext';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationsStore';
import { analyzeFileBatch, determineNotifications } from '../utils/fileTypeAnalyzer';
import api from '../services/api';
import pdfIcon from '../assets/pdf-icon.png';
import docIcon from '../assets/doc-icon.png';
import txtIcon from '../assets/txt-icon.png';
import xlsIcon from '../assets/xls.png';
import pptxIcon from '../assets/pptx.png';
import jpgIcon from '../assets/jpg-icon.png';
import pngIcon from '../assets/png-icon.png';
import movIcon from '../assets/mov.png';
import mp4Icon from '../assets/mp4.png';
import mp3Icon from '../assets/mp3.svg';
import folderIcon from '../assets/folder_icon.svg';

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRESS INVARIANTS - UI LAYER ENFORCEMENT
// ═══════════════════════════════════════════════════════════════════════════════
// These helpers enforce NON-NEGOTIABLE progress invariants at the UI layer:
// A) Progress must be MONOTONIC: never decreases
// B) Progress must be CLAMPED to [0, 100]
// C) Sizes must always use local File.size (never 0)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Enforce monotonic progress - percentage can only increase, never decrease
 * @param {number} currentProgress - Current progress percentage
 * @param {number} newProgress - New progress percentage
 * @param {string} itemId - Item ID for debugging
 * @returns {number} - Monotonic progress (max of current and new)
 */
function enforceMonotonicProgress(currentProgress, newProgress, itemId = '') {
  // INVARIANT A: Monotonic - never decrease
  const current = currentProgress || 0;
  const next = newProgress || 0;

  // INVARIANT B: Clamp to [0, 100]
  const clamped = Math.max(0, Math.min(100, next));

  // Return maximum (monotonic guarantee)
  const result = Math.max(current, clamped);

  // Debug logging
  if (typeof window !== 'undefined' && window.DEBUG_UPLOAD) {
    if (next < current) {
      console.warn(`[ProgressUI] BLOCKED non-monotonic update for ${itemId}: ${current.toFixed(1)} → ${next.toFixed(1)} (kept ${result.toFixed(1)})`);
    } else if (clamped !== next) {
      console.warn(`[ProgressUI] CLAMPED progress for ${itemId}: ${next.toFixed(1)} → ${clamped.toFixed(1)}`);
    }
  }

  return result;
}

/**
 * Ensure bytes values are never 0 when we have a known file size
 * @param {number} bytesFromService - Bytes value from upload service
 * @param {number} localFileSize - Local file size (File.size)
 * @returns {number} - Non-zero bytes value
 */
function enforceNonZeroBytes(bytesFromService, localFileSize) {
  // INVARIANT C: Size must always be positive from local File.size
  if (bytesFromService > 0) return bytesFromService;
  if (localFileSize > 0) return localFileSize;
  return 0;
}

const UniversalUploadModal = ({ isOpen, onClose, categoryId = null, onUploadComplete, initialFiles = null }) => {
  const { t } = useTranslation();
  const { showError, addNotification, showFileTypeDetected, showUnsupportedFiles, showLimitedSupportFiles } = useNotifications();
  // ✅ FIX: Get fetchAllData to force refresh all documents after upload
  const { fetchFolders, invalidateCache, fetchAllData } = useDocuments();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [uploadingFiles, setUploadingFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [folderUploadProgress, setFolderUploadProgress] = useState(null);
  const [showErrorBanner, setShowErrorBanner] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [showNotification, setShowNotification] = useState(false);
  const [notificationType, setNotificationType] = useState('success');
  const [uploadedCount, setUploadedCount] = useState(0);
  const folderInputRef = React.useRef(null);
  // 🔧 GOOGLE DRIVE STYLE: Track throughput data for display
  const [throughputData, setThroughputData] = useState({
    throughputMbps: 0,
    bytesUploaded: 0,
    totalBytes: 0,
    etaSeconds: null
  });
  // 🔧 FIX #5: UI resilience - detect stalled progress for shimmer animation (per-item)
  const lastProgressByItemRef = React.useRef(new Map()); // Map<itemId, {progress, timestamp, timerId}>

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      lastProgressByItemRef.current.forEach((val) => {
        if (val.timerId) clearTimeout(val.timerId);
      });
    };
  }, []);

  const onDrop = useCallback(async (acceptedFiles) => {
    // Show a loading indicator immediately for instant UI feedback
    const loadingId = 'loading-indicator-' + Date.now();
    setUploadingFiles(prev => [...prev, { id: loadingId, status: 'loading', isLoading: true }]);

    // Yield to the main thread to allow the UI to update immediately
    await new Promise(resolve => setTimeout(resolve, 0));

    // Separate folder files from regular files
    const folderFiles = acceptedFiles.filter(file => file.webkitRelativePath);
    const regularFiles = acceptedFiles.filter(file => !file.webkitRelativePath);

    // Filter out empty files (0 bytes) - skip them but DON'T abort the entire upload
    const validFiles = regularFiles.filter(file => file.size > 0);
    const skippedEmptyFiles = regularFiles.filter(file => file.size === 0);

    // Log skipped files but continue with valid ones
    if (skippedEmptyFiles.length > 0) {
      console.log(`⏭️ [Upload] Skipping ${skippedEmptyFiles.length} empty (0-byte) files:`, skippedEmptyFiles.map(f => f.name));
      // Only show error if ALL files are invalid
      if (validFiles.length === 0 && folderFiles.length === 0) {
        showError(t('alerts.folderDragDropNotSupported'));
        setUploadingFiles(prev => prev.filter(f => f.id !== loadingId));
        return;
      }
    }

    const newEntries = [];

    // Process folder files - group by root folder name
    if (folderFiles.length > 0) {
      const folderGroups = {};

      folderFiles.forEach(file => {
        const folderName = file.webkitRelativePath.split('/')[0];
        if (!folderGroups[folderName]) {
          folderGroups[folderName] = [];
        }
        folderGroups[folderName].push(file);
      });

      // Create a folder entry for each folder
      Object.entries(folderGroups).forEach(([folderName, files]) => {
        const totalSize = files.reduce((sum, file) => sum + file.size, 0);

        newEntries.push({
          file: files[0], // Store first file as reference
          allFiles: files, // Store all files for upload
          id: Math.random().toString(36).substr(2, 9),
          status: 'pending',
          progress: 0,
          error: null,
          isFolder: true,
          folderName: folderName,
          fileCount: files.length,
          totalSize: totalSize,
          processingStage: null
        });
      });
    }

    // Process valid regular files only (not empty files)
    if (validFiles.length > 0) {
      validFiles.forEach(file => {
        newEntries.push({
          file,
          id: Math.random().toString(36).substr(2, 9),
          status: 'pending',
          progress: 0,
          error: null,
          path: file.path || file.name,
          folderPath: file.path ? file.path.substring(0, file.path.lastIndexOf('/')) : null,
          isFolder: false,
          processingStage: null
        });
      });
    }

    // Remove the loading indicator and add the new entries
    setUploadingFiles(prev => {
      const updated = prev.filter(f => f.id !== loadingId);
      return [...updated, ...newEntries];
    });
  }, []);

  /**
   * Custom drag and drop handler for folders
   * Uses webkitGetAsEntry() to traverse folder structure
   */
  const handleDragDrop = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const items = Array.from(e.dataTransfer.items);
    // Check if any item is a folder
    const hasFolder = items.some(item => {
      const entry = item.webkitGetAsEntry?.();
      return entry && entry.isDirectory;
    });

    if (!hasFolder) {
      // No folders - let react-dropzone handle it
      return;
    }
    // Process all items (files and folders)
    const allFiles = [];

    for (const item of items) {
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          await traverseFileTree(entry, '', allFiles);
        }
      }
    }
    // Pass to existing onDrop function
    if (allFiles.length > 0) {
      onDrop(allFiles);
    }
  }, [onDrop]);

  /**
   * Recursively traverse file tree and collect all files with paths
   * CRITICAL FIX: DirectoryReader.readEntries() returns entries in batches (~100 per call).
   * We MUST keep calling readEntries() until it returns an empty array to get ALL files.
   */
  async function traverseFileTree(item, path, allFiles, skippedFiles = []) {
    return new Promise((resolve) => {
      if (item.isFile) {
        // It's a file - get the File object with error handling
        item.file(
          (file) => {
            // Skip hidden/system files
            const isHidden = file.name.startsWith('.') ||
                            file.name === '.DS_Store' ||
                            file.name === 'Thumbs.db' ||
                            file.name === 'desktop.ini' ||
                            file.name.includes('__MACOSX');

            if (isHidden) {
              console.log(`⏭️ [Upload] Skipping hidden file: ${file.name}`);
              skippedFiles.push({ name: file.name, reason: 'hidden/system file' });
              resolve();
              return;
            }

            // Skip 0-byte files (but don't abort - just skip)
            if (file.size === 0) {
              console.log(`⏭️ [Upload] Skipping 0-byte file: ${file.name}`);
              skippedFiles.push({ name: file.name, reason: '0-byte file' });
              resolve();
              return;
            }

            // Normalize path to NFC for proper Unicode handling
            const relativePath = (path + file.name).normalize('NFC');

            // Create a new File object with webkitRelativePath
            const fileWithPath = new File([file], file.name, {
              type: file.type,
              lastModified: file.lastModified
            });

            // Add webkitRelativePath property
            Object.defineProperty(fileWithPath, 'webkitRelativePath', {
              value: relativePath,
              writable: false
            });

            allFiles.push(fileWithPath);
            resolve();
          },
          (error) => {
            // Error callback - log but don't fail the entire traversal
            console.error(`❌ [Upload] Failed to read file ${item.name}:`, error);
            skippedFiles.push({ name: item.name, reason: `read error: ${error.message || error}` });
            resolve(); // Continue with other files
          }
        );
      } else if (item.isDirectory) {
        // It's a directory - traverse it
        const dirReader = item.createReader();
        const dirPath = (path + item.name + '/').normalize('NFC');

        // CRITICAL FIX: Read ALL entries by calling readEntries repeatedly
        // Browsers return entries in batches of ~100 at a time
        const readAllEntries = async () => {
          const allEntries = [];

          const readBatch = () => {
            return new Promise((res, rej) => {
              dirReader.readEntries(
                (entries) => res(entries),
                (error) => rej(error)
              );
            });
          };

          try {
            let entries = await readBatch();
            while (entries.length > 0) {
              allEntries.push(...entries);
              entries = await readBatch(); // Keep reading until empty
            }
          } catch (error) {
            console.error(`❌ [Upload] Failed to read directory ${item.name}:`, error);
          }

          return allEntries;
        };

        readAllEntries().then(async (entries) => {
          console.log(`📁 [Upload] Directory "${item.name}" contains ${entries.length} entries`);

          // Process all entries sequentially to maintain order
          for (const entry of entries) {
            await traverseFileTree(entry, dirPath, allFiles, skippedFiles);
          }
          resolve();
        }).catch((error) => {
          console.error(`❌ [Upload] Error reading directory ${item.name}:`, error);
          resolve(); // Continue with other directories
        });
      } else {
        resolve(); // Unknown entry type, skip
      }
    });
  }

  // Process initial files when modal opens with dropped files
  useEffect(() => {
    if (isOpen && initialFiles && initialFiles.length > 0) {
      onDrop(initialFiles);
    }
  }, [isOpen, initialFiles, onDrop]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: {
      // Documents
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-powerpoint': ['.ppt'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'text/plain': ['.txt'],
      'text/csv': ['.csv'],
      'text/html': ['.html', '.htm'],
      'application/rtf': ['.rtf'],

      // Images
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/gif': ['.gif'],
      'image/webp': ['.webp'],
      'image/tiff': ['.tiff', '.tif'],
      'image/bmp': ['.bmp'],
      'image/svg+xml': ['.svg'],
      'image/x-icon': ['.ico'],

      // Design files
      'image/vnd.adobe.photoshop': ['.psd'],
      'application/photoshop': ['.psd'],
      'application/psd': ['.psd'],

      // Video files
      'video/mp4': ['.mp4'],
      'video/webm': ['.webm'],
      'video/ogg': ['.ogg'],
      'video/quicktime': ['.mov'],
      'video/mpeg': ['.mpeg', '.mpg'],
      'video/x-msvideo': ['.avi'],

      // Audio files
      'audio/mpeg': ['.mp3'],
      'audio/wav': ['.wav'],
      'audio/webm': ['.weba'],
      'audio/ogg': ['.oga'],
      'audio/x-m4a': ['.m4a'],

      // Generic fallback for unknown types
      'application/octet-stream': ['.ai', '.sketch', '.fig', '.xd'],
    },
    maxSize: 500 * 1024 * 1024, // 500MB
    multiple: true,
    noClick: true, // Disable click on root div, we'll use manual button
    noDrag: false, // Enable drag-and-drop
  });

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileIcon = (filename) => {
    if (!filename) return txtIcon;
    const ext = filename.toLowerCase();
    if (ext.match(/\.(pdf)$/)) return pdfIcon;
    if (ext.match(/\.(doc|docx)$/)) return docIcon;
    if (ext.match(/\.(txt|csv|svg|html|htm|json|xml|md|rtf)$/)) return txtIcon;
    if (ext.match(/\.(xls|xlsx)$/)) return xlsIcon;
    if (ext.match(/\.(ppt|pptx)$/)) return pptxIcon;
    if (ext.match(/\.(jpg|jpeg)$/)) return jpgIcon;
    if (ext.match(/\.(png|gif|webp|bmp|tiff|tif|ico)$/)) return pngIcon;
    if (ext.match(/\.(mov)$/)) return movIcon;
    if (ext.match(/\.(mp4|avi|mpeg|mpg|webm)$/)) return mp4Icon;
    if (ext.match(/\.(mp3|wav|m4a|oga|weba)$/)) return mp3Icon;
    return txtIcon; // Default fallback icon for unknown files
  };

  const removeFile = (fileId) => {
    setUploadingFiles(prev => prev.filter(f => f.id !== fileId));
  };

  // ✅ REFACTORED: Use unified upload service for all uploads
  const handleUploadAll = async () => {
    // ✅ Auth check: Redirect to signup if not authenticated
    if (!isAuthenticated) {
      navigate('/signup');
      return;
    }

    const pendingFiles = uploadingFiles.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) return;

    // ============================================================================
    // 🔍 FILE-TYPE INTELLIGENCE: Analyze batch before upload (A1 requirement)
    // ============================================================================
    const filesToAnalyze = pendingFiles
      .filter(f => !f.isFolder) // Only analyze files, not folders
      .map(f => ({ name: f.file?.name || f.name, size: f.file?.size || f.totalSize }));

    if (filesToAnalyze.length > 0) {
      const analysis = analyzeFileBatch(filesToAnalyze);
      const notifications = determineNotifications(analysis);

      // Show notifications for detected file-type conditions
      notifications.forEach(notif => {
        if (notif.type === 'unsupportedFiles') {
          showUnsupportedFiles(notif.data);
        } else if (notif.type === 'limitedSupportFiles') {
          showLimitedSupportFiles(notif.data);
        } else if (notif.type === 'fileTypeDetected') {
          showFileTypeDetected(notif.data);
        }
      });

      // ⚠️ BLOCK UPLOAD if unsupported files detected
      if (analysis.unsupportedFiles.length > 0) {
        console.warn('❌ Upload blocked: unsupported file types detected', analysis.unsupportedFiles);
        // Mark unsupported files as failed
        setUploadingFiles(prev => prev.map(f => {
          const isUnsupported = analysis.unsupportedFiles.some(uf => uf.name === (f.file?.name || f.name));
          return isUnsupported ? { ...f, status: 'failed', error: 'Unsupported file type' } : f;
        }));
        setIsUploading(false);
        return; // Don't proceed with upload
      }
    }
    // ============================================================================

    setIsUploading(true);

    const folderEntries = pendingFiles.filter(f => f.isFolder);
    const fileEntries = pendingFiles.filter(f => !f.isFolder);

    // Track counts across parallel operations
    let totalSuccessCount = 0;
    let totalFailureCount = 0;

    // ✅ Process folder uploads using unified service
    const processFolder = async (folderEntry) => {
      try {
        // INVARIANT D: Initialize with local file sizes to prevent 0g/0b display
        setUploadingFiles(prev => prev.map(f =>
          f.id === folderEntry.id ? {
            ...f,
            status: 'uploading',
            bytesUploaded: 0,
            totalBytes: folderEntry.totalSize || 0  // Use local totalSize from the start
          } : f
        ));

        // Use unified upload service with presigned URLs
        const results = await unifiedUploadService.uploadFolder(
          folderEntry.allFiles,
          (progress) => {
            const itemId = folderEntry.id;
            const rawPct = progress.percentage || 0;

            // ═══════════════════════════════════════════════════════════════════════════
            // CRITICAL FIX: Enforce monotonicity at UI layer
            // Progress must NEVER decrease - this is a NON-NEGOTIABLE invariant
            // ═══════════════════════════════════════════════════════════════════════════
            setUploadingFiles(prev => {
              const currentItem = prev.find(f => f.id === itemId);
              const currentProgress = currentItem?.progress || 0;

              // INVARIANT A: Monotonic - use enforceMonotonicProgress helper
              const monotonicPct = enforceMonotonicProgress(currentProgress, rawPct, itemId);

              // INVARIANT C: totalBytes must never be 0 if we have local totalSize
              const localTotalSize = folderEntry.totalSize || 0;
              const safeTotalBytes = enforceNonZeroBytes(progress.totalBytes, localTotalSize);
              const safeBytesUploaded = progress.bytesUploaded || 0;

              // 🔧 FIX #5: Per-item stall detection using Map ref
              const now = Date.now();
              const itemState = lastProgressByItemRef.current.get(itemId) || { progress: 0, timestamp: now, timerId: null };

              if (Math.abs(monotonicPct - itemState.progress) < 0.5) {
                // Progress hasn't changed significantly - start stall timer if not already running
                if (!itemState.timerId) {
                  const timerId = setTimeout(() => {
                    // Mark as stalled in state
                    setUploadingFiles(p => p.map(f =>
                      f.id === itemId ? { ...f, isStalled: true } : f
                    ));
                    // Update ref to indicate stalled
                    const current = lastProgressByItemRef.current.get(itemId);
                    if (current) {
                      lastProgressByItemRef.current.set(itemId, { ...current, timerId: null });
                    }
                  }, 1500); // 1.5 seconds
                  lastProgressByItemRef.current.set(itemId, { ...itemState, timerId });
                }
              } else {
                // Progress changed - clear stall timer and state
                if (itemState.timerId) {
                  clearTimeout(itemState.timerId);
                }
                lastProgressByItemRef.current.set(itemId, { progress: monotonicPct, timestamp: now, timerId: null });
              }

              return prev.map(f =>
                f.id === itemId ? {
                  ...f,
                  progress: monotonicPct, // MONOTONIC: Only increases
                  processingStage: progress.message || 'Uploading...',
                  // 🔧 GOOGLE DRIVE STYLE: Store throughput data per entry
                  throughputMbps: progress.throughputMbps,
                  etaSeconds: progress.etaSeconds,
                  bytesUploaded: safeBytesUploaded,
                  // INVARIANT C: Always have valid totalBytes (use local size as fallback)
                  totalBytes: safeTotalBytes,
                  // Per-item stalled state (only clear here if progress changed)
                  ...(Math.abs(monotonicPct - itemState.progress) >= 0.5 && { isStalled: false })
                } : f
              );
            });

            // Update global throughput state
            if (progress.throughputMbps !== undefined) {
              setThroughputData(prev => ({
                throughputMbps: progress.throughputMbps || 0,
                bytesUploaded: progress.bytesUploaded || 0,
                // INVARIANT C: Never let totalBytes go to 0
                totalBytes: progress.totalBytes > 0 ? progress.totalBytes : (prev.totalBytes || folderEntry.totalSize || 0),
                etaSeconds: progress.etaSeconds
              }));
            }
          },
          categoryId
        );

        // Clean up stall tracking for this item
        const itemState = lastProgressByItemRef.current.get(folderEntry.id);
        if (itemState?.timerId) clearTimeout(itemState.timerId);
        lastProgressByItemRef.current.delete(folderEntry.id);

        setUploadingFiles(prev => prev.map(f =>
          f.id === folderEntry.id ? { ...f, status: 'completed', progress: 100, processingStage: null, isStalled: false } : f
        ));

        totalSuccessCount += results.successCount;
        totalFailureCount += results.failureCount;
      } catch (error) {
        // Clean up stall tracking for this item
        const itemState = lastProgressByItemRef.current.get(folderEntry.id);
        if (itemState?.timerId) clearTimeout(itemState.timerId);
        lastProgressByItemRef.current.delete(folderEntry.id);

        setUploadingFiles(prev => prev.map(f =>
          f.id === folderEntry.id ? { ...f, status: 'failed', error: error.message, isStalled: false } : f
        ));
        totalFailureCount += folderEntry.fileCount;
      }
    };

    // ✅ Process file uploads using unified service with MONOTONIC PROGRESS ENFORCEMENT
    const processFile = async (fileEntry) => {
      try {
        // INVARIANT D: Initialize with local file size to prevent 0g/0b display
        const localFileSize = fileEntry.file?.size || 0;
        setUploadingFiles(prev => prev.map(f =>
          f.id === fileEntry.id ? {
            ...f,
            status: 'uploading',
            progress: 10,
            processingStage: 'Uploading...',
            bytesUploaded: 0,
            totalBytes: localFileSize  // Use local file.size from the start
          } : f
        ));
        // Use unified upload service with presigned URLs for single files
        await unifiedUploadService.uploadSingleFile(
          fileEntry.file,
          categoryId,
          (progress) => {
            const itemId = fileEntry.id;
            const rawPct = progress.percentage || 0;

            setUploadingFiles(prev => {
              // Find current item to enforce monotonicity
              const currentItem = prev.find(f => f.id === itemId);
              const currentProgress = currentItem?.progress || 0;

              // INVARIANT A: Monotonic - progress can only increase
              const monotonicPct = enforceMonotonicProgress(currentProgress, rawPct, itemId);

              // INVARIANT C: Never let totalBytes be 0 when we have a known file size
              const localFileSize = fileEntry.file?.size || fileEntry.size || 0;
              const safeTotalBytes = enforceNonZeroBytes(progress.totalBytes, localFileSize);
              const safeBytesUploaded = Math.min(progress.bytesUploaded || 0, safeTotalBytes);

              return prev.map(f =>
                f.id === itemId ? {
                  ...f,
                  progress: monotonicPct,
                  processingStage: progress.message || 'Uploading...',
                  // Store bytes for size display
                  bytesUploaded: safeBytesUploaded,
                  totalBytes: safeTotalBytes,
                  throughputMbps: progress.throughputMbps,
                  etaSeconds: progress.etaSeconds
                } : f
              );
            });
          }
        );

        setUploadingFiles(prev => prev.map(f =>
          f.id === fileEntry.id ? { ...f, status: 'completed', progress: 100, processingStage: null } : f
        ));

        totalSuccessCount++;
      } catch (error) {
        const message = error.response?.data?.message || error.message || 'Upload failed';
        setUploadingFiles(prev => prev.map(f =>
          f.id === fileEntry.id ? { ...f, status: 'failed', error: message } : f
        ));
        totalFailureCount++;
      }
    };

    // ✅ Execute ALL uploads in parallel (no sequential waiting)
    const allPromises = [
      ...folderEntries.map(processFolder),
      ...fileEntries.map(processFile)
    ];
    await Promise.all(allPromises);

    // Final UI updates
    if (totalSuccessCount > 0) {
      setUploadedCount(totalSuccessCount);
      setNotificationType('success');
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 5000);

      // Add notification to global notification system
      addNotification({
        type: 'info',
        title: t('upload.notifications.uploadComplete'),
        text: t('upload.notifications.uploadCompleteText', { count: totalSuccessCount }),
        action: { type: 'navigate', target: '/documents' }
      });
    }

    if (totalFailureCount > 0 && totalSuccessCount === 0) {
      setNotificationType('error');
      setShowNotification(true);
      setTimeout(() => setShowNotification(false), 5000);

      // Add error notification to global notification system
      addNotification({
        type: 'error',
        title: t('upload.notifications.uploadFailed'),
        text: t('upload.notifications.uploadFailedText', { count: totalFailureCount })
      });
    } else if (totalFailureCount > 0 && totalSuccessCount > 0) {
      // Partial success
      addNotification({
        type: 'warning',
        title: t('upload.notifications.uploadPartialComplete'),
        text: t('upload.notifications.uploadPartialCompleteText', { success: totalSuccessCount, failed: totalFailureCount }),
        action: { type: 'navigate', target: '/documents' }
      });
    }

    // ✅ FIX: Immediately refresh ALL data after upload to show the new documents
    // This is critical - invalidate cache and force fetch to ensure documents appear
    // even if WebSocket events fail to arrive
    invalidateCache();
    await fetchAllData(true); // Force refresh all documents + folders

    // Check storage after upload and warn if approaching limit
    if (totalSuccessCount > 0) {
      try {
        const storageResponse = await api.get('/api/storage');
        const { used, limit } = storageResponse.data;
        const usagePercent = (used / limit) * 100;

        if (usagePercent >= 90) {
          addNotification({
            type: 'error',
            title: t('upload.notifications.storageAlmostFull'),
            text: t('upload.notifications.storageAlmostFullText', { percent: Math.round(usagePercent) }),
            action: { type: 'navigate', target: '/upgrade' }
          });
        } else if (usagePercent >= 70) {
          addNotification({
            type: 'warning',
            title: t('upload.notifications.storageRunningLow'),
            text: t('upload.notifications.storageRunningLowText', { percent: Math.round(usagePercent) }),
            action: { type: 'navigate', target: '/upgrade' }
          });
        }
      } catch (storageError) {
        // Silently fail - storage check is not critical
        console.warn('Failed to check storage:', storageError);
      }
    }

    setIsUploading(false);

    if (onUploadComplete) {
      onUploadComplete();
    }

    // Check for failures and auto-close
    const hasFailures = uploadingFiles.some(f => f.status === 'failed');
    if (!hasFailures) {
      // Short delay to show success, then close
      setTimeout(() => {
        setUploadingFiles([]);
        setFolderUploadProgress(null);
        onClose();
      }, 1000);
    }
  };

  const handleCancel = () => {
    if (!isUploading) {
      setUploadingFiles([]);
      setFolderUploadProgress(null);
      setShowErrorBanner(false);
      setErrorMessage('');
      onClose();
    }
  };

  const handleFolderSelect = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) {
      return;
    }

    // Validate that files have webkitRelativePath
    const firstFile = files[0];
    if (!firstFile.webkitRelativePath) {
      showError(t('alerts.folderSelectionFailed'));
      return;
    }

    // ✅ FIX: Wait for browser to populate file sizes (some browsers need this)
    // Without this delay, file.size might be 0 when files are first selected
    await new Promise(resolve => setTimeout(resolve, 50));

    await onDrop(files);

    // Reset the input so the same folder can be selected again
    e.target.value = '';
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: 16,
      boxSizing: 'border-box'
    }}>
      {/* Global shimmer animation keyframes - injected once at component root */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      <div style={{
        width: '100%',
        maxWidth: 520,
        paddingTop: 18,
        paddingBottom: 18,
        position: 'relative',
        background: 'white',
        borderRadius: 14,
        outline: '1px #E6E6EC solid',
        outlineOffset: '-1px',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 18,
        display: 'flex',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)'
      }}>
        {/* Header */}
        <div style={{
          alignSelf: 'stretch',
          height: 30,
          paddingLeft: 18,
          paddingRight: 18,
          justifyContent: 'flex-start',
          alignItems: 'center',
          display: 'flex'
        }}>
          <div style={{
            color: '#32302C',
            fontSize: 20,
            fontFamily: 'Plus Jakarta Sans',
            fontWeight: '700',
            textTransform: 'capitalize',
            lineHeight: '30px'
          }}>
            {t('upload.uploadDocuments')}
          </div>
        </div>

        {/* Close button */}
        <button
          onClick={handleCancel}
          disabled={isUploading}
          style={{
            width: 32,
            height: 32,
            right: -16,
            top: -16,
            position: 'absolute',
            background: 'white',
            borderRadius: 100,
            outline: '1px rgba(55, 53, 47, 0.09) solid',
            outlineOffset: '-1px',
            justifyContent: 'center',
            alignItems: 'center',
            display: 'flex',
            border: 'none',
            cursor: isUploading ? 'not-allowed' : 'pointer',
            opacity: isUploading ? 0.5 : 1
          }}
        >
          <CloseIcon style={{ width: 12, height: 12 }} />
        </button>

        <div style={{ alignSelf: 'stretch', height: 1, background: '#E6E6EC' }} />

        {/* Drop zone */}
        <div style={{
          alignSelf: 'stretch',
          paddingLeft: 18,
          paddingRight: 18,
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          display: 'flex'
        }}>
          <div
            {...getRootProps({
              onDrop: handleDragDrop
            })}
            style={{
              alignSelf: 'stretch',
              minHeight: 380,
              paddingLeft: 16,
              paddingRight: 16,
              paddingTop: 32,
              paddingBottom: 32,
              background: isDragActive ? '#EFEFEF' : '#F5F5F5',
              overflow: 'visible',
              borderRadius: 20,
              outline: '1px #E6E6EC solid',
              outlineOffset: '-1px',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 16,
              display: 'flex',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxSizing: 'border-box'
            }}
          >
            <input {...getInputProps()} />

            {/* File Types Stack Icon */}
            <img
              src={fileTypesStackIcon}
              alt="File Types"
              style={{
                width: '100%',
                maxWidth: '360px',
                height: 'auto',
                display: 'block',
                filter: 'drop-shadow(0 8px 16px rgba(0, 0, 0, 0.15))',
                transition: 'transform 0.3s ease, filter 0.3s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px) scale(1.02)';
                e.currentTarget.style.filter = 'drop-shadow(0 12px 24px rgba(0, 0, 0, 0.2))';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.filter = 'drop-shadow(0 8px 16px rgba(0, 0, 0, 0.15))';
              }}
            />

            <div style={{
              flexDirection: 'column',
              justifyContent: 'flex-start',
              alignItems: 'center',
              gap: 4,
              display: 'flex'
            }}>
              <div style={{
                alignSelf: 'stretch',
                justifyContent: 'center',
                alignItems: 'flex-start',
                gap: 6,
                display: 'flex'
              }}>
                <div style={{
                  color: '#32302C',
                  fontSize: 20,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '600',
                  textTransform: 'capitalize',
                  lineHeight: '30px'
                }}>
                  {isDragActive ? t('upload.dropFilesHere') : t('upload.uploadOrDragDrop')}
                </div>
              </div>
              <div style={{
                width: '100%',
                maxWidth: 366,
                textAlign: 'center',
                color: '#6C6B6E',
                fontSize: 16,
                fontFamily: 'Plus Jakarta Sans',
                fontWeight: '500',
                lineHeight: '24px'
              }}>
                {t('upload.uploadDescription')}
              </div>
            </div>

            {/* Buttons Container */}
            <div style={{
              justifyContent: 'center',
              alignItems: 'center',
              gap: 10,
              display: 'flex',
              flexWrap: 'wrap',
              width: '100%'
            }}>
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  open();
                }}
                style={{
                  flex: '1 1 auto',
                  minWidth: 120,
                  maxWidth: 160,
                  height: 48,
                  paddingLeft: 16,
                  paddingRight: 16,
                  paddingTop: 10,
                  paddingBottom: 10,
                  background: 'white',
                  borderRadius: 100,
                  outline: '1px #E6E6EC solid',
                  outlineOffset: '-1px',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 8,
                  display: 'flex',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  boxSizing: 'border-box'
                }}
              >
                <div style={{
                  color: '#323232',
                  fontSize: 15,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '600',
                  textTransform: 'capitalize',
                  lineHeight: '24px',
                  textAlign: 'center'
                }}>
                  {t('upload.selectFiles')}
                </div>
              </div>

              <div
                onClick={(e) => {
                  e.stopPropagation();
                  folderInputRef.current?.click();
                }}
                style={{
                  flex: '1 1 auto',
                  minWidth: 120,
                  maxWidth: 160,
                  height: 48,
                  paddingLeft: 16,
                  paddingRight: 16,
                  paddingTop: 10,
                  paddingBottom: 10,
                  background: 'white',
                  borderRadius: 100,
                  outline: '1px #E6E6EC solid',
                  outlineOffset: '-1px',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 8,
                  display: 'flex',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  boxSizing: 'border-box'
                }}>
                <div style={{
                  color: '#323232',
                  fontSize: 15,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '600',
                  textTransform: 'capitalize',
                  lineHeight: '24px',
                  textAlign: 'center'
                }}>
                  {t('upload.selectFolder')}
                </div>
              </div>
            </div>

            {/* Hidden folder input */}
            <input
              ref={folderInputRef}
              type="file"
              webkitdirectory=""
              directory=""
              mozdirectory=""
              multiple
              onChange={handleFolderSelect}
              style={{ display: 'none' }}
            />
          </div>
        </div>

        {/* Error Banner */}
        {showErrorBanner && (
          <div style={{
            alignSelf: 'stretch',
            paddingLeft: 18,
            paddingRight: 18
          }}>
            <div style={{
              width: '100%',
              padding: 10,
              background: 'rgba(24, 24, 24, 0.90)',
              borderRadius: 100,
              flexDirection: 'row',
              justifyContent: 'flex-start',
              alignItems: 'center',
              gap: 12,
              display: 'flex'
            }}>
              {/* Error Icon */}
              <div style={{ width: 32, height: 32, position: 'relative', flexShrink: 0 }}>
                <div style={{
                  width: 32,
                  height: 32,
                  left: 0,
                  top: 0,
                  position: 'absolute',
                  background: 'rgba(217, 45, 32, 0.60)',
                  borderRadius: 9999
                }} />
                <div style={{
                  width: 26,
                  height: 26,
                  left: 3,
                  top: 3,
                  position: 'absolute',
                  background: 'rgba(217, 45, 32, 0.60)',
                  borderRadius: 9999
                }} />
                <div style={{
                  width: 20,
                  height: 20,
                  left: 6,
                  top: 6,
                  position: 'absolute',
                  background: 'rgba(217, 45, 32, 0.60)',
                  borderRadius: 9999
                }} />
                <div style={{
                  width: 14,
                  height: 14,
                  left: 9,
                  top: 9,
                  position: 'absolute',
                  background: '#D92D20',
                  borderRadius: 9999
                }} />
              </div>
              {/* Error Message */}
              <div style={{
                flex: 1,
                color: 'white',
                fontSize: 14,
                fontFamily: 'Plus Jakarta Sans',
                fontWeight: '500',
                lineHeight: '20px'
              }}>
                {errorMessage || 'Hmm… the upload didn\'t work. Please retry.'}
              </div>
            </div>
          </div>
        )}

        {/* Folder upload progress banner - HIDDEN (progress shown on individual files) */}

        {/* File list */}
        {uploadingFiles.length > 0 && (
          <div style={{
            alignSelf: 'stretch',
            paddingLeft: 18,
            paddingRight: 18,
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 12,
            display: 'flex',
            maxHeight: 280,
            overflowY: 'auto'
          }}>
            {uploadingFiles.map((item) => (
              // Skip rendering if this is a loading indicator
              item.isLoading ? (
                <div
                  key={item.id}
                  style={{
                    alignSelf: 'stretch',
                    height: 72,
                    padding: 12,
                    background: 'white',
                    borderRadius: 12,
                    outline: '1px #E6E6EC solid',
                    outlineOffset: '-1px',
                    justifyContent: 'center',
                    alignItems: 'center',
                    display: 'flex'
                  }}
                >
                  <div style={{
                    width: 24,
                    height: 24,
                    border: '3px solid #E6E6EC',
                    borderTop: '3px solid #32302C',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite'
                  }} />
                  <span style={{
                    marginLeft: 12,
                    color: '#6C6B6E',
                    fontSize: 14,
                    fontFamily: 'Plus Jakarta Sans',
                    fontWeight: '500'
                  }}>
                    {t('upload.processing')}
                  </span>
                </div>
              ) : (
              <div
                key={item.id}
                style={{
                  alignSelf: 'stretch',
                  height: 72,
                  padding: 12,
                  position: 'relative',
                  background: 'white',
                  borderRadius: 12,
                  outline: item.status === 'failed' ? '2px #EF4444 solid' : '1px #E6E6EC solid',
                  outlineOffset: '-1px',
                  justifyContent: 'flex-start',
                  alignItems: 'center',
                  gap: 12,
                  display: 'flex',
                  overflow: 'hidden'
                }}
              >
                {/* Grey progress fill background with shimmer when stalled */}
                {item.status === 'uploading' && (
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    height: '100%',
                    width: `${Math.min(100, item.progress || 0)}%`,
                    background: item.isStalled
                      ? 'linear-gradient(90deg, rgba(169, 169, 169, 0.12) 25%, rgba(200, 200, 200, 0.25) 50%, rgba(169, 169, 169, 0.12) 75%)'
                      : 'rgba(169, 169, 169, 0.12)',
                    backgroundSize: item.isStalled ? '200% 100%' : 'auto',
                    borderRadius: 12,
                    transition: 'width 0.3s ease-out',
                    zIndex: 0,
                    animation: item.isStalled ? 'shimmer 1.5s infinite' : 'none'
                  }} />
                )}

                <div style={{
                  flex: 1,
                  minWidth: 0,
                  justifyContent: 'flex-start',
                  alignItems: 'center',
                  gap: 12,
                  display: 'flex',
                  position: 'relative',
                  zIndex: 1,
                  background: 'transparent'
                }}>
                  {/* File/Folder icon */}
                  <div style={{
                    width: 48,
                    height: 48,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <img
                      src={item.isFolder ? folderIcon : getFileIcon(item.file.name)}
                      alt={item.isFolder ? item.folderName : item.file.name}
                      style={{
                        width: 48,
                        height: 48,
                        objectFit: 'contain'
                      }}
                    />
                  </div>

                  <div style={{
                    flex: '1 1 0',
                    flexDirection: 'column',
                    justifyContent: 'flex-start',
                    alignItems: 'flex-start',
                    gap: 6,
                    display: 'flex'
                  }}>
                    <div style={{
                      alignSelf: 'stretch',
                      color: '#32302C',
                      fontSize: 14,
                      fontFamily: 'Plus Jakarta Sans',
                      fontWeight: '600',
                      lineHeight: '20px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {item.isFolder ? item.folderName : item.file.name}
                    </div>
                    <div style={{
                      alignSelf: 'stretch',
                      color: item.status === 'failed' ? '#EF4444' : '#6B7280',
                      fontSize: 12,
                      fontFamily: 'Plus Jakarta Sans',
                      fontWeight: '500',
                      lineHeight: '16px'
                    }}>
                      {item.isFolder ? (
                        // Folder status display
                        item.status === 'failed'
                          ? 'Upload failed. Try again.'
                          : item.status === 'completed'
                          ? `${formatFileSize(item.totalSize || (item.allFiles?.reduce((sum, f) => sum + (f.size || 0), 0) || 0))} • ${item.fileCount} file${item.fileCount > 1 ? 's' : ''}`
                          : item.status === 'uploading'
                          ? (() => {
                              // 🔧 GOOGLE DRIVE STYLE: Show throughput + bytes + ETA
                              const bytesUploaded = item.bytesUploaded || 0;
                              // INVARIANT D: Compute totalBytes from allFiles if totalSize/totalBytes are 0
                              const computedTotalSize = item.allFiles?.reduce((sum, f) => sum + (f.size || 0), 0) || 0;
                              const totalBytes = (item.totalBytes > 0 ? item.totalBytes : item.totalSize) || computedTotalSize || 0;
                              const throughput = item.throughputMbps || 0;
                              const eta = item.etaSeconds;

                              // Format ETA
                              let etaStr = '';
                              if (eta !== null && eta !== undefined && eta > 0) {
                                if (eta < 60) {
                                  etaStr = `${eta}s left`;
                                } else if (eta < 3600) {
                                  etaStr = `${Math.floor(eta / 60)}m ${eta % 60}s left`;
                                } else {
                                  etaStr = `${Math.floor(eta / 3600)}h ${Math.floor((eta % 3600) / 60)}m left`;
                                }
                              }

                              // Build status string: "12.5 MB / 50 MB • 8.2 Mbps • 4m 30s left"
                              const parts = [];
                              if (totalBytes > 0) {
                                parts.push(`${formatFileSize(bytesUploaded)} / ${formatFileSize(totalBytes)}`);
                              }
                              if (throughput > 0.1) {
                                parts.push(`${throughput.toFixed(1)} Mbps`);
                              }
                              if (etaStr) {
                                parts.push(etaStr);
                              }

                              return parts.length > 0
                                ? parts.join(' • ')
                                : `${formatFileSize(totalBytes || computedTotalSize)} – ${Math.min(100, Math.round(item.progress || 0))}%`;
                            })()
                          : `${formatFileSize(item.totalSize || (item.allFiles?.reduce((sum, f) => sum + (f.size || 0), 0) || 0))} • ${item.fileCount} file${item.fileCount > 1 ? 's' : ''}`
                      ) : (
                        // File status display
                        item.status === 'failed'
                          ? 'Upload failed. Try again.'
                          : item.status === 'completed'
                          ? `${formatFileSize(item.file.size)}`
                          : item.status === 'uploading'
                          ? `${formatFileSize(item.file.size)} – ${Math.min(100, Math.round(item.progress || 0))}%`
                          : `${formatFileSize(item.file.size)}`
                      )}
                    </div>
                  </div>
                </div>

                {/* Remove button */}
                {item.status !== 'uploading' && (
                  <button
                    onClick={() => removeFile(item.id)}
                    style={{
                      width: 24,
                      height: 24,
                      right: -6,
                      top: -6,
                      position: 'absolute',
                      background: 'white',
                      borderRadius: 100,
                      outline: '1px rgba(55, 53, 47, 0.09) solid',
                      outlineOffset: '-1px',
                      justifyContent: 'center',
                      alignItems: 'center',
                      display: 'flex',
                      border: 'none',
                      cursor: 'pointer',
                      zIndex: 2
                    }}
                  >
                    <CloseIcon style={{ width: 12, height: 12 }} />
                  </button>
                )}
              </div>
              )
            ))}
          </div>
        )}

        {uploadingFiles.length > 0 && (
          <>
            <div style={{ alignSelf: 'stretch', height: 1, background: '#E6E6EC' }} />

            {/* Action buttons */}
            <div style={{
              alignSelf: 'stretch',
              paddingLeft: 18,
              paddingRight: 18,
              justifyContent: 'flex-start',
              alignItems: 'flex-start',
              gap: 8,
              display: 'flex'
            }}>
              <button
                onClick={handleCancel}
                disabled={isUploading}
                style={{
                  flex: '1 1 0',
                  height: 52,
                  paddingLeft: 18,
                  paddingRight: 18,
                  paddingTop: 10,
                  paddingBottom: 10,
                  background: '#F5F5F5',
                  borderRadius: 100,
                  outline: '1px #E6E6EC solid',
                  outlineOffset: '-1px',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 8,
                  display: 'flex',
                  border: 'none',
                  cursor: isUploading ? 'not-allowed' : 'pointer',
                  opacity: isUploading ? 0.5 : 1
                }}
              >
                <div style={{
                  color: '#323232',
                  fontSize: 16,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '700',
                  textTransform: 'capitalize',
                  lineHeight: '24px'
                }}>
                  {t('upload.cancel')}
                </div>
              </button>

              <button
                onClick={handleUploadAll}
                disabled={isUploading || uploadingFiles.filter(f => f.status === 'pending').length === 0}
                style={{
                  flex: '1 1 0',
                  height: 52,
                  background: (isUploading || uploadingFiles.filter(f => f.status === 'pending').length === 0) ? '#E6E6EC' : '#181818',
                  borderRadius: 100,
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 8,
                  display: 'flex',
                  border: 'none',
                  cursor: (isUploading || uploadingFiles.filter(f => f.status === 'pending').length === 0) ? 'not-allowed' : 'pointer'
                }}
              >
                <div style={{
                  color: (isUploading || uploadingFiles.filter(f => f.status === 'pending').length === 0) ? '#9CA3AF' : 'white',
                  fontSize: 16,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '600',
                  textTransform: 'capitalize',
                  lineHeight: '24px'
                }}>
                  {isUploading ? t('upload.uploading') : t('nav.upload')}
                </div>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Success/Error Notification */}
      {showNotification && (uploadedCount > 0 || notificationType === 'error') && (
        <div style={{
          position: 'fixed',
          top: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'calc(100% - 700px)',
          maxWidth: '960px',
          minWidth: '400px',
          zIndex: 99999,
          animation: 'slideDown 0.3s ease-out'
        }}>
          <div style={{
            width: '100%',
            padding: '6px 16px',
            background: 'rgba(24, 24, 24, 0.90)',
            borderRadius: 100,
            justifyContent: 'center',
            alignItems: 'center',
            gap: 10,
            display: 'inline-flex'
          }}>
            {notificationType === 'success' ? (
              <>
                <div style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: '#34A853',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <CheckIcon style={{width: 12, height: 12}} />
                </div>
                <div style={{
                  flex: '1 1 0',
                  color: 'white',
                  fontSize: 13,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '400',
                  lineHeight: '18px',
                  wordWrap: 'break-word'
                }}>
                  {uploadedCount} document{uploadedCount > 1 ? 's have' : ' has'} been successfully uploaded.
                </div>
              </>
            ) : (
              <>
                <div style={{width: 24, height: 24, position: 'relative', flexShrink: 0}}>
                  <div style={{width: 20.57, height: 20.57, left: 1.71, top: 1.71, position: 'absolute', background: 'rgba(217, 45, 32, 0.60)', borderRadius: 9999}} />
                  <div style={{width: 24, height: 24, left: 0, top: 0, position: 'absolute', background: 'rgba(217, 45, 32, 0.60)', borderRadius: 9999}} />
                  <div style={{width: 17.14, height: 17.14, left: 3.43, top: 3.43, position: 'absolute', background: '#D92D20', overflow: 'hidden', borderRadius: 8.57, outline: '1.07px #D92D20 solid', outlineOffset: '-1.07px'}}>
                    <div style={{width: 9.33, height: 9.33, left: 3.91, top: 3.91, position: 'absolute'}}>
                      <svg width="9" height="9" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M5.83333 2.5H4.16667V5.83333H5.83333V2.5ZM5.83333 7.5H4.16667V9.16667H5.83333V7.5Z" fill="white"/>
                      </svg>
                    </div>
                  </div>
                </div>
                <div style={{
                  flex: '1 1 0',
                  color: 'white',
                  fontSize: 13,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '400',
                  lineHeight: '18px',
                  wordWrap: 'break-word'
                }}>
                  {errorMessage || 'Upload failed. Please try again.'}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Keyframe animation for loading spinner */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes slideDown {
          from { transform: translateX(-50%) translateY(-20px); opacity: 0; }
          to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default UniversalUploadModal;
