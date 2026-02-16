import React, { useState, useEffect, useRef, startTransition, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import cleanDocumentName from '../../utils/cleanDocumentName';
import LeftNav from '../app-shell/LeftNav';
import NotificationPanel from '../notifications/NotificationPanel';
import { useIsMobile } from '../../hooks/useIsMobile';
import MoveToCategoryModal from '../library/MoveToCategoryModal';
import CreateCategoryModal from '../library/CreateCategoryModal';
import DeleteConfirmationModal from '../library/DeleteConfirmationModal';
import RenameModal from '../library/RenameModal';
import CreateFolderModal from '../folders/CreateFolderModal';
import { useNotifications } from '../../context/NotificationsStore';
import { useDocuments } from '../../context/DocumentsContext';
import { analyzeFileBatch, determineNotifications } from '../../utils/files/fileTypeAnalyzer';
import { ReactComponent as SearchIcon} from '../../assets/Search.svg';
import { ReactComponent as CheckIcon} from '../../assets/check.svg';
import { ReactComponent as ExpandIcon } from '../../assets/expand.svg';
import { ReactComponent as DownloadIcon } from '../../assets/download.svg';
import { ReactComponent as RenameIcon } from '../../assets/Edit 5.svg';
import { ReactComponent as MoveIcon } from '../../assets/add.svg';
import { ReactComponent as DeleteIcon } from '../../assets/Trash can-red.svg';
import LayeredFolderIcon from '../folders/LayeredFolderIcon';
import FolderBrowserModal from '../folders/FolderBrowserModal';
import CategoryIcon from '../library/CategoryIcon';
import { ROUTES } from '../../constants/routes';
import api from '../../services/api';
// ✅ REFACTORED: Use unified upload service (replaces folderUploadService + presignedUploadService)
import unifiedUploadService from '../../services/unifiedUploadService';
import { DocumentScanner } from '../scanner';
import { UPLOAD_CONFIG } from '../../config/upload.config';
import { buildRoute } from '../../constants/routes';
import pdfIcon from '../../assets/pdf-icon.png';
import docIcon from '../../assets/doc-icon.png';
import txtIcon from '../../assets/txt-icon.png';
import xlsIcon from '../../assets/xls.png';
import jpgIcon from '../../assets/jpg-icon.png';
import pngIcon from '../../assets/png-icon.png';
import pptxIcon from '../../assets/pptx.png';
import movIcon from '../../assets/mov.png';
import mp4Icon from '../../assets/mp4.png';
import mp3Icon from '../../assets/mp3.svg';
import folderIcon from '../../assets/folder_icon.svg';
import filesIcon from '../../assets/files-icon.svg';
import dropzoneIllustration from '../../assets/dropzone-files-illustration.svg';
import { generateThumbnail, supportsThumbnail } from '../../utils/files/thumbnailGenerator';
import { encryptFile, encryptData } from '../../utils/security/encryption';
import { extractText } from '../../utils/files/textExtraction';
import { encryptionWorkerManager } from '../../utils/security/encryptionWorkerManager';
import '../chat/streaming/StreamingAnimation.css';
import { useAuth } from '../../context/AuthContext';
import pLimit from 'p-limit';

// ─── Single source of truth for supported upload formats ───
const SUPPORTED_FORMATS = [
  { key: 'pdf',  label: 'PDF',  icon: pdfIcon,  kind: 'doc' },
  { key: 'doc',  label: 'DOCX', icon: docIcon,  kind: 'doc',  exts: ['.doc', '.docx'] },
  { key: 'pptx', label: 'PPTX', icon: pptxIcon, kind: 'presentation', exts: ['.ppt', '.pptx'] },
  { key: 'xlsx', label: 'XLSX', icon: xlsIcon,  kind: 'sheet', exts: ['.xls', '.xlsx'] },
  { key: 'jpg',  label: 'JPG',  icon: jpgIcon,  kind: 'image', exts: ['.jpg', '.jpeg'] },
  { key: 'png',  label: 'PNG',  icon: pngIcon,  kind: 'image' },
  { key: 'mp3',  label: 'MP3',  icon: mp3Icon,  kind: 'media' },
  { key: 'mp4',  label: 'MP4',  icon: mp4Icon,  kind: 'media' },
];

// Build the accept map from SUPPORTED_FORMATS for useDropzone
/**
 * Filter Mac hidden files before upload
 * Mac creates .DS_Store, __MACOSX, and other system files that cause 400 errors
 */
const filterMacHiddenFiles = (files) => {
  const macHiddenPatterns = [
    /^\./,              // Starts with dot (.DS_Store, .localized)
    /__MACOSX/,         // Mac resource fork
    /\.DS_Store$/,      // Specific .DS_Store
    /Thumbs\.db$/,      // Windows thumbnail cache
    /desktop\.ini$/,    // Windows folder settings
  ];

  const filtered = Array.from(files).filter(file => {
    const fileName = file.name || '';
    const filePath = file.webkitRelativePath || fileName;

    // Check if file matches any hidden pattern
    const isHidden = macHiddenPatterns.some(pattern =>
      pattern.test(fileName) || pattern.test(filePath)
    );

    if (isHidden) {
      return false;
    }

    return true;
  });

  const filteredCount = files.length - filtered.length;
  if (filteredCount > 0) {
  }

  return filtered;
};

/**
 * Check if file is Mac hidden file
 */
const isMacHiddenFile = (fileName) => {
  const macHiddenPatterns = [
    /^\./,
    /__MACOSX/,
    /\.DS_Store$/,
    /Thumbs\.db$/,
    /desktop\.ini$/,
  ];

  return macHiddenPatterns.some(pattern => pattern.test(fileName));
};

/**
 * Get File object from FileSystemFileEntry
 */
const getFileFromEntry = (fileEntry) => {
  return new Promise((resolve, reject) => {
    fileEntry.file(resolve, reject);
  });
};

/**
 * Read folder recursively and preserve structure
 */
const readFolderRecursively = async (directoryEntry, path = '') => {
  const files = [];
  const reader = directoryEntry.createReader();

  const readEntries = () => {
    return new Promise((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
  };

  let entries = await readEntries();

  // Keep reading until no more entries (some browsers return in batches)
  while (entries.length > 0) {
    for (const entry of entries) {
      if (entry.isFile) {
        const file = await getFileFromEntry(entry);
        if (file && !isMacHiddenFile(file.name)) {
          const relativePath = path ? `${path}/${entry.name}` : entry.name;
          files.push({
            file: file,
            relativePath: relativePath
          });
        }
      } else if (entry.isDirectory) {
        const subPath = path ? `${path}/${entry.name}` : entry.name;
        const subFiles = await readFolderRecursively(entry, subPath);
        files.push(...subFiles);
      }
    }
    entries = await readEntries();
  }

  return files;
};

/**
 * Process dropped entries (files or folders)
 */
const processDroppedEntries = async (entries) => {
  const items = [];

  for (const entry of entries) {
    if (entry.isFile) {
      // Single file
      const file = await getFileFromEntry(entry);
      if (file && !isMacHiddenFile(file.name)) {
        items.push({
          file,
          status: 'pending',
          progress: 0,
          error: null,
          category: 'Uncategorized'
        });
      }
    } else if (entry.isDirectory) {
      // Folder
      const folderFiles = await readFolderRecursively(entry);

      if (folderFiles.length === 0) {
        continue;
      }

      // ✅ FIX: Normalize to match button upload structure
      // Convert wrapped objects { file: File, relativePath: "..." } to File objects with webkitRelativePath
      const normalizedFiles = folderFiles.map(({ file, relativePath }) => {
        // Create new File object with webkitRelativePath property
        const newFile = new File([file], file.name, {
          type: file.type,
          lastModified: file.lastModified
        });

        // Add webkitRelativePath property (non-standard but needed for compatibility)
        Object.defineProperty(newFile, 'webkitRelativePath', {
          value: `${entry.name}/${relativePath}`,
          writable: false,
          enumerable: true,
          configurable: true
        });

        return newFile;
      });

      // Calculate total size from normalized files
      const totalSize = normalizedFiles.reduce((sum, f) => sum + f.size, 0);

      items.push({
        isFolder: true,
        folderName: entry.name,
        files: normalizedFiles,  // ✅ Now matches button upload structure
        status: 'pending',
        progress: 0,
        error: null,
        totalSize: totalSize,
        fileCount: normalizedFiles.length
      });
    }
  }

  return items;
};

/**
 * Format file size in human-readable format
 */
const formatFileSize = (bytes) => {
  if (!bytes || bytes <= 0 || !isFinite(bytes)) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

const MAX_VISIBLE_DESTINATIONS = 6;

const UploadHub = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { showSuccess, showError, showUploadSuccess, showUploadError, showDeleteSuccess, showFileExists, showFileTypeDetected, showUnsupportedFiles, showLimitedSupportFiles } = useNotifications();
  // ⚡ PERFORMANCE FIX: Use documents/folders from context (no duplicate API calls)
  const { documents: contextDocuments, folders: contextFolders, socket, fetchDocuments, fetchFolders, invalidateCache, fetchAllData, getRootFolders, getDocumentCountByFolder, moveToFolder } = useDocuments();
  const { encryptionPassword, user } = useAuth(); // ⚡ ZERO-KNOWLEDGE ENCRYPTION

  // Local state for real-time WebSocket updates (initialized from context)
  const [documents, setDocuments] = useState([]);
  const [folders, setFolders] = useState([]);

  // ⚡ PERFORMANCE: Initialize local state from context (no API call)
  useEffect(() => {
    if (contextDocuments.length > 0 && documents.length === 0) {
      setDocuments(contextDocuments);
    }
  }, [contextDocuments, documents.length]);

  useEffect(() => {
    if (contextFolders.length > 0 && folders.length === 0) {
      setFolders(contextFolders);
    }
  }, [contextFolders, folders.length]);

  const [expandedFolders, setExpandedFolders] = useState(new Set()); // Track which folders are expanded
  const [searchQuery, setSearchQuery] = useState('');
  const [showNotificationsPopup, setShowNotificationsPopup] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState([]);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationType, setNotificationType] = useState('success');
  const [openDropdownId, setOpenDropdownId] = useState(null);
  const [showCategoryModal, setShowCategoryModal] = useState(null); // Stores identifier of item being moved
  const [selectedCategoryId, setSelectedCategoryId] = useState(null); // NEW: Selected category in modal
  const [showNewCategoryModal, setShowNewCategoryModal] = useState(false);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [itemToRename, setItemToRename] = useState(null);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [showFormatsModal, setShowFormatsModal] = useState(false);
  const [isLibraryExpanded, setIsLibraryExpanded] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [modalSearchQuery, setModalSearchQuery] = useState('');
  const [destinationSearchQuery, setDestinationSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState(new Set());
  const [showAllDestinationsModal, setShowAllDestinationsModal] = useState(false);
  const [expandedModalCategories, setExpandedModalCategories] = useState(new Set());
  const [allDestModalSearch, setAllDestModalSearch] = useState('');
  const embeddingTimeoutsRef = useRef({}); // Track embedding timeouts for slow processing warnings
  const [folderBrowserModal, setFolderBrowserModal] = useState({
    isOpen: false,
    folderIndex: null,
    folderName: '',
    files: []
  });

  // Document Scanner state (mobile only)
  const [showScanner, setShowScanner] = useState(false);

  // ✅ Listen for document processing updates via WebSocket
  useEffect(() => {
    if (!socket) {
      return;
    }
    const handleProcessingUpdate = (data) => {
      // Update uploadingFiles with processing progress
      setUploadingFiles(prev => prev.map(file => {
        // Handle individual file uploads
        if (file.documentId === data.documentId) {
          // Map backend processing progress (0-100%) to UI progress (50-100%)
          // Upload phase uses 0-50%, processing phase uses 50-100%
          const uiProgress = 50 + (data.progress * 0.5);
          return {
            ...file,
            processingProgress: data.progress,
            progress: uiProgress,
            statusMessage: data.message || file.statusMessage,
            stage: data.message || file.stage || 'Processing...'
          };
        }

        // Handle folder uploads - check if this document belongs to this folder
        if (file.isFolder && file.documentIds && file.documentIds.includes(data.documentId)) {
          const processedCount = file.processedFiles || 0;

          // If this document just completed, increment processed count
          if (data.progress === 100 || data.stage === 'completed' || data.stage === 'complete') {
            const newProcessedCount = processedCount + 1;
            const folderProgress = 50 + ((newProcessedCount / file.totalFiles) * 50);
            return {
              ...file,
              processedFiles: newProcessedCount,
              progress: folderProgress,
              stage: `Processing... (${newProcessedCount}/${file.totalFiles})`
            };
          }
        }

        return file;
      }));

      // When processing completes (100%), remove the item from upload list
      if (data.progress === 100 || data.stage === 'complete' || data.stage === 'completed') {
        // Increment completed count
        completedFilesCountRef.current += 1;
        const newCompletedCount = completedFilesCountRef.current;
        const totalFiles = totalFilesToUploadRef.current;
        // Check if any folder has completed all its files
        setUploadingFiles(prev => {
          const updatedFiles = prev.filter(f => {
            // Keep individual files if they're not this document
            if (f.documentId !== data.documentId) {
              // Check if this is a folder that has completed all files
              if (f.isFolder && f.documentIds && f.processedFiles === f.totalFiles) {
                return false; // Remove completed folder
              }
              return true; // Keep this file
            }
            return false; // Remove this individual file (it's the one that completed)
          });

          // If all files are done, show notification using unified toast
          if (newCompletedCount === totalFiles && totalFiles > 0) {
            showUploadSuccess(newCompletedCount);
          }

          return updatedFiles;
        });
      }
    };

    socket.on('document-processing-update', handleProcessingUpdate);

    // ⚡ NEW: Listen for embedding completion
    const handleEmbeddingsReady = (data) => {
      // Clear timeout if it exists
      if (embeddingTimeoutsRef.current[data.documentId]) {
        clearTimeout(embeddingTimeoutsRef.current[data.documentId]);
        delete embeddingTimeoutsRef.current[data.documentId];
      }

      // Update document in state
      setDocuments(prev => prev.map(doc =>
        doc.id === data.documentId
          ? {
              ...doc,
              processingStatus: 'completed',
              aiChatReady: true
            }
          : doc
      ));
    };

    socket.on('document-embeddings-ready', handleEmbeddingsReady);

    // ⚡ NEW: Listen for embedding failure
    const handleEmbeddingsFailed = (data) => {
      // Update document in state
      setDocuments(prev => prev.map(doc =>
        doc.id === data.documentId
          ? {
              ...doc,
              processingStatus: 'failed',
              aiChatReady: false,
              processingError: data.error
            }
          : doc
      ));
    };

    socket.on('document-embeddings-failed', handleEmbeddingsFailed);

    return () => {
      socket.off('document-processing-update', handleProcessingUpdate);
      socket.off('document-embeddings-ready', handleEmbeddingsReady);
      socket.off('document-embeddings-failed', handleEmbeddingsFailed);

      // Clear all embedding timeouts on unmount
      Object.values(embeddingTimeoutsRef.current).forEach(timeoutId => {
        clearTimeout(timeoutId);
      });
      embeddingTimeoutsRef.current = {};

      // Don't disconnect - it's a shared socket
    };
  }, [socket]); // Re-run when socket becomes available

  // ✅ Poll backend for document processing status after upload completes
  // Uses a ref to track processing folders without causing effect re-runs
  const processingFoldersRef = useRef(new Map()); // folderName -> { documentIds, totalFiles }

  useEffect(() => {
    const interval = setInterval(async () => {
      const folders = processingFoldersRef.current;
      if (folders.size === 0) return;

      // Batch all folders into ONE polling call to avoid rate-limits (429) when multiple
      // folders are processing at once.
      const allDocIds = [];
      for (const [, info] of folders.entries()) {
        for (const id of (info.documentIds || [])) allDocIds.push(id);
      }
      const uniqueDocIds = Array.from(new Set(allDocIds)).filter(Boolean);
      if (uniqueDocIds.length === 0) return;

      let statuses = {};
      try {
        const response = await api.post('/api/documents/processing-status', {
          documentIds: uniqueDocIds
        });
        const data = response?.data || response;
        statuses = data?.statuses || {};
      } catch (err) {
        const status = err?.response?.status;
        // Most common failure here is 429 (statusPollingLimiter). Just retry later.
        if (status) console.warn(`[UploadHub] processing-status poll failed: ${status}`);
        return;
      }

      for (const [folderName, info] of folders.entries()) {
        const ids = Array.isArray(info.documentIds) ? info.documentIds : [];
        const totalCount = info.totalFiles || ids.length || 1;

        let readyCount = 0;
        let failedCount = 0;
        let skippedCount = 0;
        for (const id of ids) {
          const s = statuses?.[id];
          if (s === 'failed') failedCount++;
          if (s === 'skipped') skippedCount++;
          if (s === 'ready' || s === 'indexed' || s === 'skipped') readyCount++;
        }
        const doneCount = readyCount + failedCount;
        const allReady = doneCount >= totalCount;

        if (allReady) {
          // All done — set 100% and dismiss
          folders.delete(folderName);
          setUploadingFiles(prev => prev.map(f =>
            (f.isFolder && f.folderName === folderName)
              ? { ...f, status: 'completed', progress: 100, stage: null }
              : f
          ));
          invalidateCache();
          fetchAllData(true);

          // Notify about failed/skipped files so user knows what didn't process
          const issueCount = failedCount + skippedCount;
          if (issueCount > 0) {
            const parts = [];
            if (failedCount > 0) parts.push(`${failedCount} failed`);
            if (skippedCount > 0) parts.push(`${skippedCount} had no extractable content`);
            showError(`${issueCount} file${issueCount > 1 ? 's' : ''} in "${folderName}" could not be fully processed: ${parts.join(', ')}.`);
          }

          setTimeout(() => {
            setUploadingFiles(prev => prev.filter(f => !(f.isFolder && f.folderName === folderName)));
          }, 1500);
        } else {
          // Partial — smoothly fill from upload% toward 100%
          setUploadingFiles(prev => prev.map(f => {
            if (f.isFolder && f.folderName === folderName && f.status === 'processing') {
              const base = info.uploadEndProgress || 60;
              const pct = base + ((100 - base) * (doneCount / totalCount));
              const next = Math.max(f.progress || 0, Math.min(99, Math.round(pct)));
              return { ...f, progress: next, stage: `Processing (${doneCount}/${totalCount})...` };
            }
            return f;
          }));
        }
      }
    }, 3500);

    return () => clearInterval(interval);
  }, []); // Empty deps — runs once, uses ref for data

  const getEmojiForCategory = (categoryName) => {
    const emojiMap = {
      'Work': '💼',
      'Work Documents': '💼',
      'Health': '🏥',
      'Travel': '✈️',
      'Finance': '💰',
      'Financial': '💰',
      'Personal': '👤',
      'Education': '📚',
      'Family': '👨‍👩‍👧‍👦',
      'Legal': '⚖️',
      'Insurance': '🛡️',
      'Tax': '🧾',
      'Receipts': '🧾',
      'Palmeiras': '⚽',
      'Football': '⚽',
      'Sports': '⚽'
    };
    return emojiMap[categoryName] || '📁';
  };

  const toggleCategoryExpand = (catId, setter = setExpandedCategories) => {
    setter(prev => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  };

  // ⚡ PERFORMANCE: Compute derived data with useMemo (after getEmojiForCategory is defined)
  const topLevelFolders = useMemo(() => {
    return folders.filter(f =>
      !f.parentFolderId && f.name.toLowerCase() !== 'recently added'
    );
  }, [folders]);

  const categories = useMemo(() => {
    return folders
      .filter(folder => !folder.parentFolderId && folder.name.toLowerCase() !== 'recently added')
      .map(folder => ({
        id: folder.id,
        name: folder.name,
        emoji: folder.emoji || getEmojiForCategory(folder.name),
      }));
  }, [folders]);

  const getSubfolders = (parentId) => {
    return folders
      .filter(f => f.parentFolderId === parentId)
      .map(f => ({ id: f.id, name: f.name, emoji: f.emoji || null }));
  };

  // Recursive check: does any descendant of parentId match the query?
  const hasMatchingDescendant = (parentId, q) => {
    const children = folders.filter(f => f.parentFolderId === parentId);
    return children.some(c =>
      c.name.toLowerCase().includes(q) || hasMatchingDescendant(c.id, q)
    );
  };

  const filteredCategories = useMemo(() => {
    if (!destinationSearchQuery.trim()) return categories;
    const q = destinationSearchQuery.trim().toLowerCase();
    return categories.filter(cat => {
      if (cat.name.toLowerCase().includes(q)) return true;
      return hasMatchingDescendant(cat.id, q);
    });
  }, [categories, destinationSearchQuery, folders]);

  // Auto-expand ancestors of matching folders at any depth
  useEffect(() => {
    if (!destinationSearchQuery.trim()) return;
    const q = destinationSearchQuery.trim().toLowerCase();
    const toExpand = new Set();
    // Recursively find folders whose children match, and mark them for expand
    const findAndExpand = (parentId) => {
      const children = folders.filter(f => f.parentFolderId === parentId);
      let anyMatch = false;
      children.forEach(child => {
        const childMatches = child.name.toLowerCase().includes(q);
        const descendantMatches = findAndExpand(child.id);
        if (childMatches || descendantMatches) {
          toExpand.add(parentId);
          anyMatch = true;
        }
      });
      return anyMatch;
    };
    categories.forEach(cat => findAndExpand(cat.id));
    if (toExpand.size > 0) {
      setExpandedCategories(prev => new Set([...prev, ...toExpand]));
    }
  }, [destinationSearchQuery, categories, folders]);

  // Helper to resolve destination name from an id (searches ALL folders, not just root categories)
  const getDestinationName = (destId) => {
    if (!destId) return t('uploadHub.noCategoryLabel');
    const folder = folders.find(f => f.id === destId);
    return folder?.name || t('uploadHub.noCategoryLabel');
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Only close if clicking outside the dropdown area
      if (openDropdownId !== null && !event.target.closest('[data-dropdown]')) {
        setOpenDropdownId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Track when all files have completed for notification
  const [uploadedCount, setUploadedCount] = React.useState(0);
  const totalFilesToUploadRef = React.useRef(0);
  const completedFilesCountRef = React.useRef(0);

  // Debug: Log state changes
  React.useEffect(() => {
  }, [showNotification, uploadedCount, notificationType]);

  // Note: Error notifications are now handled individually in the upload catch blocks
  // using the unified Toast system with detailed error messages and retry options

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

  // Filter both documents and folders
  const filteredDocuments = documents.filter(doc =>
    (doc.filename || doc.displayTitle || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredFolders = folders.filter(folder =>
    (folder.name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Only show documents in Recently Added, not category folders
  // Categories should not appear in the upload/recently added area
  const combinedItems = [
    ...filteredDocuments.map(d => ({ ...d, isDocument: true }))
  ];

  const calculateFileHash = async (file) => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  };

  // Note: drag-and-drop is handled by custom handlers (handleDrop) on the main
  // content container. Button file selection uses fileInputRef / folderInputRef.

  // Drag and drop overlay handlers
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Required to allow drop
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Check if we're leaving the drag container entirely
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;

    // If mouse is outside the container bounds, hide overlay
    if (x <= rect.left || x >= rect.right || y <= rect.top || y >= rect.bottom) {
      setIsDraggingOver(false);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    // ✅ NEW: Check if items are folders using DataTransferItemList
    const items = e.dataTransfer.items;

    if (items && items.length > 0) {
      const entries = [];

      // Convert DataTransferItemList to array
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            entries.push(entry);
          }
        }
      }

      // Process entries (files or folders)
      const processedItems = await processDroppedEntries(entries);

      if (processedItems.length === 0) {
        return;
      }

      // Apply selected destination and check folder file limits
      const destId = selectedDestinationRef.current || null;
      const destName = getDestinationName(destId);
      const allowed = [];
      for (const item of processedItems) {
        if (item.isFolder && item.fileCount > UPLOAD_CONFIG.MAX_FOLDER_FILES) {
          showError(`Folder "${item.folderName}" has ${item.fileCount} files. Maximum is ${UPLOAD_CONFIG.MAX_FOLDER_FILES} files per folder.`);
          continue;
        }
        item.folderId = destId;
        item.category = destName;
        allowed.push(item);
      }
      if (allowed.length === 0) return;
      setUploadingFiles(prev => [...allowed, ...prev]);
    } else {
      // Fallback to old behavior for browsers that don't support DataTransferItemList
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      const filteredFiles = filterMacHiddenFiles(files);

      if (filteredFiles.length === 0) {
        return;
      }

      const destId2 = selectedDestinationRef.current || null;
      const destName2 = getDestinationName(destId2);
      const pendingFiles = filteredFiles.map(file => ({
        file,
        status: 'pending',
        progress: 0,
        error: null,
        folderId: destId2,
        category: destName2,
        path: file.path || file.name,
        folderPath: file.path ? file.path.substring(0, file.path.lastIndexOf('/')) : null
      }));

      setUploadingFiles(prev => [...pendingFiles, ...prev]);
    }
  };

  // Open folder browser modal
  const handleOpenFolderBrowser = (folderIndex) => {
    const folder = uploadingFiles[folderIndex];
    if (folder && folder.isFolder) {
      setFolderBrowserModal({
        isOpen: true,
        folderIndex: folderIndex,
        folderName: folder.folderName,
        files: folder.files
      });
    }
  };

  // Close folder browser modal
  const handleCloseFolderBrowser = () => {
    setFolderBrowserModal({
      isOpen: false,
      folderIndex: null,
      folderName: '',
      files: []
    });
  };

  // Remove file from folder (called from modal)
  const handleRemoveFileFromFolder = (relativePath) => {
    const folderIndex = folderBrowserModal.folderIndex;
    if (folderIndex === null) return;

    setUploadingFiles(prev => {
      const newFiles = [...prev];
      const folder = newFiles[folderIndex];
      if (folder && folder.isFolder && folder.files) {
        // Filter out the file with the matching relativePath
        folder.files = folder.files.filter(f => {
          const filePath = f.webkitRelativePath || f.name;
          return filePath !== relativePath;
        });
        // Update file count and total size
        folder.fileCount = folder.files.length;
        folder.totalSize = folder.files.reduce((sum, f) => sum + (f.size || 0), 0);

        // If no files left, remove the folder entirely
        if (folder.files.length === 0) {
          newFiles.splice(folderIndex, 1);
          handleCloseFolderBrowser();
        } else {
          // Update modal files
          setFolderBrowserModal(prev => ({
            ...prev,
            files: folder.files
          }));
        }
      }
      return newFiles;
    });
  };

  const handleConfirmUpload = async () => {
    const pendingItems = uploadingFiles.filter(f => f.status === 'pending');
    if (pendingItems.length === 0) return;
    // ✅ FIX: Filter hidden files before counting and update items
    // Handle both File objects (drag-and-drop) and { file, relativePath } wrapped objects (button upload)
    const filteredItems = pendingItems.map(item => {
      if (item.isFolder) {
        const validFiles = item.files.filter(f => {
          const name = f.name || f.file?.name || '';
          return !isMacHiddenFile(name);
        });
        return {
          ...item,
          files: validFiles,
          fileCount: validFiles.length,
          totalSize: validFiles.reduce((sum, f) => sum + (f.size || f.file?.size || 0), 0)
        };
      }
      return item;
    });

    // Update state with filtered items
    setUploadingFiles(prev => prev.map(item => {
      const filtered = filteredItems.find(fi => fi === item || (fi.isFolder && fi.folderName === item.folderName));
      return filtered || item;
    }));

    // Count valid files only (excluding hidden files)
    const totalFiles = filteredItems.reduce((count, item) => {
      if (item.isFolder) {
        return count + item.files.length;
      }
      return count + 1;
    }, 0);

    totalFilesToUploadRef.current = totalFiles;
    completedFilesCountRef.current = 0;

    // Get current state snapshot
    const itemsToUpload = [...uploadingFiles];

    // Mark all pending items as uploading
    setUploadingFiles(prev => prev.map(f =>
      f.status === 'pending' ? { ...f, status: 'uploading' } : f
    ));

    // ⚡ PARALLEL UPLOAD OPTIMIZATION: Use p-limit for concurrent uploads
    // ✅ OPTIMIZED: Increased to 10 concurrent uploads for better performance
    const limit = pLimit(10);

    // Create upload promises for all items
    const uploadPromises = itemsToUpload.map((item, i) => {
      if (item.status !== 'pending') return Promise.resolve();

      // Wrap each upload in p-limit for concurrency control
      return limit(async () => {

      if (item.isFolder) {
        // Handle folder upload using the dedicated folder upload service
        // ✅ FIX: Handle both File objects (drag-and-drop) and wrapped objects (legacy)
        const files = item.files.map((fileOrWrapper, idx) => {
          // Check if it's already a File object with webkitRelativePath (drag-and-drop)
          if (fileOrWrapper instanceof File) {
            // File object from drag-and-drop - already has webkitRelativePath
            return fileOrWrapper;
          }

          // Legacy wrapped structure: {file: File, relativePath: "..."}
          if (fileOrWrapper.file) {
            const file = fileOrWrapper.file;
            // Attach webkitRelativePath if not already present
            if (!file.webkitRelativePath && fileOrWrapper.relativePath) {
              Object.defineProperty(file, 'webkitRelativePath', {
                value: fileOrWrapper.relativePath,
                writable: false,
                enumerable: true  // ✅ CRITICAL FIX: Make it enumerable so it's sent in API requests
              });
            }
            return file;
          }

          // Fallback: return as-is
          return fileOrWrapper;
        });
        // ✅ VERIFICATION: Check that all files have webkitRelativePath
        const filesWithPath = files.filter(f => f.webkitRelativePath);
        const filesWithoutPath = files.filter(f => !f.webkitRelativePath);

        // ✅ REFACTORED: Use unified upload service (same as UniversalUploadModal)
        try {
          const results = await unifiedUploadService.uploadFolder(
            files,
            (progress) => {
              // Upload phase: 0→60% based on FILE COUNT (not bytes)
              // Processing phase (polling): 60→100% based on ready doc count
              setUploadingFiles(prev => prev.map((f) => {
                if (f.isFolder && f.folderName === item.folderName) {
                  if (progress.stage === 'complete') {
                    return { ...f, progress: Math.max(f.progress || 0, 60), stage: 'Processing...', status: 'uploading' };
                  }
                  // Use file count for smooth, predictable progress
                  const completed = progress.completedFiles || 0;
                  const total = progress.totalFiles || item.files?.length || 1;
                  if (completed > 0 && total > 0) {
                    // File-count based: each file = equal slice of 0-59%
                    const scaled = Math.min(59, Math.round((completed / total) * 60));
                    const next = Math.max(f.progress || 0, scaled);
                    return { ...f, progress: next, stage: `Uploading (${completed}/${total})...`, status: 'uploading' };
                  }
                  // Before files complete: small stage-based progress
                  const stagePct = progress.stage === 'uploading' ? 5 : progress.stage === 'preparing' ? 3 : 2;
                  const next = Math.max(f.progress || 0, stagePct);
                  return { ...f, progress: next, stage: progress.message || 'Preparing...', status: 'uploading' };
                }
                return f;
              }));
            },
            null // categoryId - none selected
          );

          // Upload complete — track processing until all docs are ready
          const uploadedDocIds = (results.succeeded || []).map(r => r.documentId).filter(Boolean);

          if (uploadedDocIds.length > 0) {
            // Register for processing polling (ref-based, no re-render loops)
            processingFoldersRef.current.set(item.folderName, {
              documentIds: uploadedDocIds,
              totalFiles: uploadedDocIds.length,
              uploadEndProgress: 60
            });
            // Set status to processing — polling fills from 60% to 100%
            setUploadingFiles(prev => prev.map((f) =>
              (f.isFolder && f.folderName === item.folderName)
                ? { ...f, status: 'processing', progress: Math.max(f.progress || 0, 60), stage: 'Processing...' }
                : f
            ));
          } else {
            // No documents — complete immediately
            setUploadingFiles(prev => prev.map((f) =>
              (f.isFolder && f.folderName === item.folderName)
                ? { ...f, status: 'completed', progress: 100, stage: null }
                : f
            ));
            setTimeout(() => {
              setUploadingFiles(prev => prev.filter((f) => !(f.isFolder && f.folderName === item.folderName)));
            }, 1500);
          }

          // Force refresh to ensure documents appear
          invalidateCache();
          await fetchAllData(true);

        } catch (error) {
          // ERROR: Mark folder as failed with detailed error message
          // Extract detailed error message
          let errorMessage = 'Upload failed';
          let errorDetails = null;

          // Parse specific error types for better user feedback
          const errorMsg = error.message || '';
          if (errorMsg.includes('No valid files') || errorMsg.includes('filtered out')) {
            errorMessage = 'No valid files in folder';
            errorDetails = 'All files were filtered out (hidden files, unsupported types, or empty files)';
          } else if (errorMsg.includes('webkitRelativePath')) {
            errorMessage = 'Folder upload not supported';
            errorDetails = 'Please use Chrome, Edge, or Firefox for folder uploads';
          } else if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT')) {
            errorMessage = 'Upload timeout';
            errorDetails = 'Connection lost. Please check your internet and try again.';
          } else if (errorMsg.includes('Unauthorized') || errorMsg.includes('401')) {
            errorMessage = 'Authentication failed';
            errorDetails = 'Your session may have expired. Please refresh the page and try again.';
          } else if (errorMsg.includes('413') || errorMsg.includes('too large')) {
            errorMessage = 'Files too large';
            errorDetails = 'Maximum file size is 500MB. Please reduce file size and try again.';
          } else if (errorMsg.includes('Network') || errorMsg.includes('fetch')) {
            errorMessage = 'Network error';
            errorDetails = 'Unable to connect to server. Please check your connection.';
          } else if (errorMsg) {
            errorMessage = 'Upload failed';
            errorDetails = errorMsg;
          }

          // Show error notification with retry option
          showUploadError(errorMessage, errorDetails, () => {
            // Retry handler - reset the folder status and re-queue
            setUploadingFiles(prev => prev.map((f) =>
              (f.isFolder && f.folderName === item.folderName) ? {
                ...f,
                status: 'uploading',
                error: null,
                progress: 0,
                stage: t('upload.preparingRetry')
              } : f
            ));
            // Note: The actual retry will happen on next processUploadQueue cycle
          });

          // Mark as failed in UI (but keep visible for retry)
          setUploadingFiles(prev => prev.map((f) =>
            (f.isFolder && f.folderName === item.folderName) ? {
              ...f,
              status: 'failed',
              error: errorMessage,
              errorDetails: errorDetails
            } : f
          ));

          // Remove failed uploads after longer delay (give user time to see error)
          setTimeout(() => {
            setUploadingFiles(prev => prev.filter((f) => !(f.isFolder && f.folderName === item.folderName && f.status === 'failed')));
          }, 10000);
        }
      } else {
        // Handle individual file upload - DIRECT TO GCS!
        const file = item.file;
      try {
        // Create folder structure if file has a folder path
        let targetFolderId = item.folderId;
        if (item.folderPath) {
          // Helper function to create folder hierarchy
          const getOrCreateFolder = async (folderPath) => {
            if (!folderPath || folderPath === '/' || folderPath === '') {
              return targetFolderId;
            }

            // Split path into parts and filter out invalid folder names
            const parts = folderPath.split('/').filter(p => {
              const trimmed = p?.trim();
              return trimmed && trimmed !== '.' && trimmed !== '..';
            });
            let currentParentId = targetFolderId;

            // Create each folder in the hierarchy
            for (const folderName of parts) {
              try {
                const response = await api.post('/api/folders', {
                  name: folderName,
                  parentId: currentParentId || undefined
                });
                currentParentId = response.data?.id || response.data?.folder?.id;
              } catch (error) {
              }
            }

            return currentParentId;
          };

          targetFolderId = await getOrCreateFolder(item.folderPath);
        }

        // Calculate file hash first
        const fileHash = await calculateFileHash(file);

        // Update to show starting
        setUploadingFiles(prev => prev.map((f, idx) =>
          idx === i ? { ...f, progress: 5, processingStage: 'Preparing...' } : f
        ));

        // ⚡ STEP 1: Extract text from file BEFORE encryption
        let extractedText = '';
        if (encryptionPassword) {
          setUploadingFiles(prev => prev.map((f, idx) =>
            idx === i ? { ...f, progress: 5, processingStage: 'Extracting text...' } : f
          ));

          try {
            extractedText = await extractText(file);
          } catch (extractionError) {
            // Continue anyway - text extraction failure shouldn't block upload
          }
        }

        // ⚡ STEP 2: ZERO-KNOWLEDGE ENCRYPTION: Encrypt file before upload
        let fileToUpload = file;
        let encryptionMetadata = null;
        let encryptedFilename = null;
        let encryptedText = null;

        if (encryptionPassword) {
          setUploadingFiles(prev => prev.map((f, idx) =>
            idx === i ? { ...f, progress: 10, processingStage: 'Encrypting file...' } : f
          ));

          try {
            // Read file as ArrayBuffer for Web Worker
            const fileBuffer = await file.arrayBuffer();
            const fileUint8Array = new Uint8Array(fileBuffer);

            // ⚡ WEB WORKER: Encrypt file contents off the main thread
            const encrypted = await encryptionWorkerManager.encryptFile(
              fileUint8Array,
              encryptionPassword,
              (operation, progress, message) => {
                setUploadingFiles(prev => prev.map((f, idx) =>
                  idx === i ? {
                    ...f,
                    progress: 10 + (progress * 0.15),
                    processingStage: `${message} ${Math.round(progress)}%`
                  } : f
                ));
              }
            );
            // ⚡ WEB WORKER: Encrypt filename
            const filenameEncrypted = await encryptionWorkerManager.encryptData(
              file.name,
              encryptionPassword
            );

            // ⚡ WEB WORKER: Encrypt extracted text
            if (extractedText) {
              encryptedText = await encryptionWorkerManager.encryptData(
                extractedText,
                encryptionPassword
              );
            }

            // Create encrypted file blob
            fileToUpload = new File([encrypted.ciphertext], `encrypted_${Date.now()}`, {
              type: 'application/octet-stream' // Encrypted files are binary blobs
            });

            encryptionMetadata = {
              salt: encrypted.salt,
              iv: encrypted.iv,
              authTag: encrypted.authTag,
              filenameEncrypted: filenameEncrypted,
              encryptedText: encryptedText, // Encrypted extracted text
              originalMimeType: file.type
            };
          } catch (encryptionError) {
            setUploadingFiles(prev => prev.map((f, idx) =>
              idx === i ? {
                ...f,
                status: 'failed',
                error: 'Encryption failed: ' + encryptionError.message
              } : f
            ));
            return; // Exit this upload function early
          }
        }

        // Thumbnail generation disabled
        const thumbnailBase64 = null;

        // Update progress
        setUploadingFiles(prev => prev.map((f, idx) =>
          idx === i ? { ...f, progress: 30, processingStage: 'Uploading to cloud...' } : f
        ));

        // Upload via backend with multipart form data
        const formData = new FormData();
        formData.append('files', fileToUpload); // Upload encrypted file
        formData.append('fileHash', fileHash);
        if (targetFolderId) {
          formData.append('folderId', targetFolderId);
        }

        // ⚡ ZERO-KNOWLEDGE ENCRYPTION: Append encryption metadata
        if (encryptionMetadata) {
          formData.append('isEncrypted', 'true');
          formData.append('encryptionSalt', encryptionMetadata.salt);
          formData.append('encryptionIV', encryptionMetadata.iv);
          formData.append('encryptionAuthTag', encryptionMetadata.authTag);
          formData.append('filenameEncrypted', JSON.stringify(encryptionMetadata.filenameEncrypted));
          formData.append('originalMimeType', encryptionMetadata.originalMimeType);
          formData.append('originalFilename', file.name); // Send original filename for backend logging

          // ⚡ IMPORTANT: Send both encrypted text (for storage) and plaintext (for embeddings)
          if (encryptionMetadata.encryptedText) {
            formData.append('extractedTextEncrypted', JSON.stringify(encryptionMetadata.encryptedText));
          }
          if (extractedText) {
            formData.append('plaintextForEmbeddings', extractedText); // Backend uses this, then deletes
          }
        }

        const uploadResponse = await api.post('/api/documents/upload', formData, {
          onUploadProgress: (progressEvent) => {
            // Show upload progress (this is just the HTTP upload, very fast)
            const uploadProgress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadingFiles(prev => prev.map((f, idx) =>
              idx === i ? { ...f, progress: uploadProgress, processingStage: 'Uploading to cloud...' } : f
            ));
          }
        });

        const document = uploadResponse.data.document ?? uploadResponse.data.data ?? uploadResponse.data;
        const isExisting = uploadResponse.data.isExisting === true;
        let documentAdded = false;

        // Guard: if backend didn't return a valid document object, bail gracefully
        if (!document || !document.id) {
          console.error('[UploadHub] Backend returned no document object:', uploadResponse.data);
          setUploadingFiles(prev => prev.map((f, idx) =>
            idx === i ? { ...f, status: 'completed', progress: 100, processingStage: null } : f
          ));
          setTimeout(() => {
            setUploadingFiles(prev => prev.filter((f, idx) => idx !== i));
          }, 1500);
          await fetchDocuments();
          return;
        }

        // Handle file already exists case
        if (isExisting) {
          // Show friendly notification instead of treating as error
          showFileExists(file.name);

          // Mark as completed (file exists, no further processing needed)
          setUploadingFiles(prev => prev.map((f, idx) =>
            idx === i ? {
              ...f,
              status: 'completed',
              progress: 100,
              processingStage: null
            } : f
          ));

          // Remove from upload list after short delay
          setTimeout(() => {
            setUploadingFiles(prev => prev.filter((f, idx) => idx !== i));
          }, 1500);
          return; // Exit early, don't process further
        }

        try {
          // ⚡ OPTIMISTIC UPDATE: Add document to UI immediately (instant feedback!)
          setDocuments(prev => [{
            ...document,
            // Add processing indicator
            processingStatus: 'embeddings-pending',
            aiChatReady: false
          }, ...prev]);
          documentAdded = true;

          // ⚡ EDGE CASE: Set timeout warning for slow embeddings (30 seconds)
          const timeoutId = setTimeout(() => {
            showSuccess(t('upload.processingTakingLonger'), 'warning');
          }, 60000); // 60 seconds

          embeddingTimeoutsRef.current[document.id] = timeoutId;

          // Also update global context for other components to see the document
          await fetchDocuments();

          // ⚡ SUCCESS: Mark as completed immediately after upload finishes
          // Don't reset to 0% - that causes visual bugs
          setUploadingFiles(prev => prev.map((f, idx) =>
            idx === i ? {
              ...f,
              documentId: document.id, // Link to backend document
              status: 'completed',
              progress: 100, // Keep at 100% - upload is done
              processingStage: null
            } : f
          ));

          // Remove from upload list after short delay to show success
          setTimeout(() => {
            setUploadingFiles(prev => prev.filter((f, idx) => idx !== i));
          }, 1500);
        } catch (postUploadError) {
          // ⚡ EDGE CASE: Rollback optimistic update if post-processing failed
          if (documentAdded && document?.id) {
            setDocuments(prev => prev.filter(doc => doc?.id !== document.id));

            // Clear timeout if it exists
            if (embeddingTimeoutsRef.current[document.id]) {
              clearTimeout(embeddingTimeoutsRef.current[document.id]);
              delete embeddingTimeoutsRef.current[document.id];
            }
          }

          setUploadingFiles(prev => prev.map((f, idx) =>
            idx === i ? {
              ...f,
              status: 'failed',
              progress: f.progress,
              error: postUploadError.message
            } : f
          ));
        }

        // Note: The success notification and item removal will happen when:
        // 1. WebSocket emits 'document-processing-update' with progress: 100
        // 2. We verify the document is in the frontend state
        // 3. We remove the item from uploadingFiles
        // 4. We show the success notification
        } catch (error) {
          const status = error?.response?.status;
          const data = error?.response?.data;
          const backendMsg =
            typeof data?.error === 'string' ? data.error :
            typeof data?.error?.message === 'string' ? data.error.message :
            typeof data?.message === 'string' ? data.message :
            null;

          console.error('[UploadHub] Upload failed:', { status, data, message: error?.message });

          setUploadingFiles(prev => prev.map((f, idx) =>
            idx === i ? {
              ...f,
              status: 'failed',
              progress: f.progress,
              error: backendMsg || error.message
            } : f
          ));
        }
      } // Close the else block for individual file upload
      }); // Close the limit(async () => {})
    }); // Close the .map((item, i) => {})

    // ⚡ PARALLEL UPLOAD OPTIMIZATION: Wait for all uploads to complete
    await Promise.all(uploadPromises);
    // After all uploads complete, show notification
    const newCompletedCount = completedFilesCountRef.current;
    const totalFilesCount = totalFilesToUploadRef.current;

    if (newCompletedCount === totalFilesCount && totalFilesCount > 0) {
      // Show success notification using unified toast
      showUploadSuccess(newCompletedCount);

      // Reload documents and folders using DocumentsContext
      const loadData = async () => {
        await fetchDocuments(); // Update global context
        await fetchFolders();   // Update global context
      };
      loadData();
    }
  };

  const removeUploadingFile = (identifier) => {
    setUploadingFiles(prev => prev.filter(f => {
      if (f.isFolder) {
        return f.folderName !== identifier;
      } else {
        return f.file.name !== identifier;
      }
    }));
  };

  const handleFolderSelect = (event) => {
    const rawFiles = Array.from(event.target.files);

    // ✅ CRITICAL: Filter Mac hidden files (.DS_Store, __MACOSX, etc.)
    const files = filterMacHiddenFiles(rawFiles);

    if (files.length === 0) {
      return;
    }
    // Extract folder structure from file paths
    const folderStructure = new Map(); // Map<rootFolderName, {name, files}>

    files.forEach(file => {
      // webkitRelativePath gives us the full path like "MyFolder/Subfolder/file.pdf"
      const relativePath = file.webkitRelativePath || file.name;
      const pathParts = relativePath.split('/');

      // If there are path parts, we have a folder
      if (pathParts.length > 1) {
        const rootFolderName = pathParts[0];

        if (!folderStructure.has(rootFolderName)) {
          folderStructure.set(rootFolderName, {
            name: rootFolderName,
            files: [],
            isFolder: true
          });
        }

        folderStructure.get(rootFolderName).files.push({
          file,
          relativePath
        });
      }
    });

    // Create folder entries (ONE entry per folder, not per file)
    const destIdFolder = selectedDestinationRef.current || null;
    const destNameFolder = getDestinationName(destIdFolder);
    const folderEntries = [];
    for (const folder of folderStructure.values()) {
      if (folder.files.length > UPLOAD_CONFIG.MAX_FOLDER_FILES) {
        showError(`Folder "${folder.name}" has ${folder.files.length} files. Maximum is ${UPLOAD_CONFIG.MAX_FOLDER_FILES} files per folder.`);
        continue;
      }
      const totalSize = folder.files.reduce((sum, f) => sum + f.file.size, 0);
      folderEntries.push({
        isFolder: true,
        folderName: folder.name,
        files: folder.files,
        status: 'pending',
        progress: 0,
        error: null,
        folderId: destIdFolder,
        category: destNameFolder,
        fileCount: folder.files.length,
        totalSize: totalSize
      });
    }

    if (folderEntries.length > 0) {
      setUploadingFiles(prev => [...folderEntries, ...prev]);
    }
  };

  const handleFileSelect = (event) => {
    const rawFiles = Array.from(event.target.files);
    const filteredFiles = filterMacHiddenFiles(rawFiles);
    if (filteredFiles.length === 0) return;

    const analysis = analyzeFileBatch(filteredFiles);
    const notifications = determineNotifications(analysis);
    notifications.forEach(notif => {
      if (notif.type === 'unsupportedFiles') {
        showUnsupportedFiles(notif.data);
      } else if (notif.type === 'limitedSupportFiles') {
        showLimitedSupportFiles(notif.data);
      } else if (notif.type === 'fileTypeDetected') {
        showFileTypeDetected(notif.data);
      }
    });

    const supportedFiles = filteredFiles.filter(file => {
      const isUnsupported = analysis.unsupportedFiles.some(uf => uf.name === file.name);
      return !isUnsupported;
    });

    if (supportedFiles.length === 0) return;

    const destId3 = selectedDestinationRef.current || null;
    const destName3 = getDestinationName(destId3);
    const pendingFiles = supportedFiles.map(file => ({
      file,
      status: 'pending',
      progress: 0,
      error: null,
      folderId: destId3,
      category: destName3,
      path: file.path || file.name,
      folderPath: file.path ? file.path.substring(0, file.path.lastIndexOf('/')) : null
    }));

    startTransition(() => {
      setUploadingFiles(prev => [...pendingFiles, ...prev]);
    });

    // Reset input so the same file can be re-selected
    event.target.value = '';
  };

  // Handle scanned document completion (mobile scanner)
  const handleScanComplete = (pdfFile) => {
    if (!pdfFile) return;

    const destIdScan = selectedDestinationRef.current || null;
    const destNameScan = getDestinationName(destIdScan);
    const pendingFile = {
      file: pdfFile,
      status: 'pending',
      progress: 0,
      error: null,
      folderId: destIdScan,
      category: destNameScan,
      path: pdfFile.name
    };

    startTransition(() => {
      setUploadingFiles(prev => [pendingFile, ...prev]);
    });
  };

  // Removed toggleCategorySelection - using MoveToCategoryModal's built-in selection now

  const handleDeleteDocument = async (documentId) => {
    // Save document for potential rollback
    const documentToDelete = documents.find(doc => doc.id === documentId);

    try {
      // Remove from UI IMMEDIATELY (optimistic update)
      setDocuments(prev => prev.filter(doc => doc.id !== documentId));
      setOpenDropdownId(null);

      // Show notification immediately for instant feedback
      showDeleteSuccess('file');

      // Delete on server in background
      await api.delete(`/api/documents/${documentId}`);
    } catch (error) {
      // Restore document on error (rollback)
      if (documentToDelete) {
        setDocuments(prev => [documentToDelete, ...prev]);
      }

      showError(t('alerts.failedToDeleteDocument'));
    }
  };

  const handleDeleteFolder = async (folderId) => {
    // ✅ FIX: Recursively find all subfolders and their documents
    const getAllSubfolderIds = (parentId) => {
      const subfolders = folders.filter(f => f.parentFolderId === parentId);
      let allIds = [parentId];

      subfolders.forEach(subfolder => {
        allIds = [...allIds, ...getAllSubfolderIds(subfolder.id)];
      });

      return allIds;
    };

    // Get all folder IDs that will be deleted (parent + all descendants)
    const allFolderIdsToDelete = getAllSubfolderIds(folderId);
    // Save folder, subfolders, and ALL related documents for potential rollback
    const foldersToDelete = folders.filter(f => allFolderIdsToDelete.includes(f.id));
    const docsInFolders = documents.filter(doc => allFolderIdsToDelete.includes(doc.folderId));

    try {
      // Remove from UI IMMEDIATELY (optimistic update)
      setFolders(prev => prev.filter(f => !allFolderIdsToDelete.includes(f.id)));
      setDocuments(prev => prev.filter(doc => !allFolderIdsToDelete.includes(doc.folderId)));
      setOpenDropdownId(null);

      // Show notification immediately for instant feedback
      showDeleteSuccess('folder');

      // Delete on server in background
      await api.delete(`/api/folders/${folderId}`);
    } catch (error) {
      // Restore folders and documents on error (rollback)
      if (foldersToDelete.length > 0) {
        setFolders(prev => [...foldersToDelete, ...prev]);
      }
      if (docsInFolders.length > 0) {
        setDocuments(prev => [...docsInFolders, ...prev]);
      }

      showError(t('alerts.failedToDeleteFolder'));
    }
  };

  const handleCreateCategory = async (categoryData) => {
    const { name, emoji, selectedDocuments } = categoryData;

    try {
      const response = await api.post('/api/folders', { name, emoji });
      const folderId = response.data?.id || response.data?.folder?.id;

      // Add selected documents to the created category
      if (selectedDocuments && selectedDocuments.length > 0) {
        for (const docId of selectedDocuments) {
          try {
            await api.patch(`/api/documents/${docId}`, {
              folderId: folderId
            });
          } catch (docError) {
          }
        }
      }

      // Refresh folders list
      const foldersResponse = await api.get('/api/folders');
      const allFolders = foldersResponse.data?.items || foldersResponse.data?.folders || [];
      setFolders(allFolders.filter(f =>
        !f.parentFolderId && !f.parentId && f.name.toLowerCase() !== 'recently added'
      ));
      // ✅ No need to setCategories - computed automatically from folders via useMemo

      // Refresh documents to show they're now in the category
      const docsResponse = await api.get('/api/documents');
      setDocuments(docsResponse.data?.items || docsResponse.data?.documents || []);

      setShowNewCategoryModal(false);
    } catch (error) {
      showError(t('alerts.failedToCreateFolder'));
    }
  };

  /**
   * STANDARDIZED: Handle moving item to selected category
   * Called from MoveToCategoryModal onConfirm with selectedCategoryId
   */
  const handleAddCategory = async (categoryId) => {
    if (!categoryId) return;

    const identifier = showCategoryModal;
    if (!identifier) return;

    // Find the target category
    const targetCategory = folders.find(f => f.id === categoryId);
    if (!targetCategory) {
      showError(t('alerts.categoryNotFound'));
      return;
    }

    // Check if identifier is a folder ID
    const isFolder = folders.some(f => f.id === identifier);

    if (isFolder) {
      // Moving an entire folder to a category (make it a subfolder)
      try {
        await api.patch(`/api/folders/${identifier}`, {
          name: folders.find(f => f.id === identifier)?.name || 'Folder',
          parentId: categoryId
        });

        // Reload both documents and folders
        const [docsResponse, foldersResponse] = await Promise.all([
          api.get('/api/documents'),
          api.get('/api/folders')
        ]);

        setDocuments(docsResponse.data?.items || docsResponse.data?.documents || []);
        const allFolders = foldersResponse.data?.items || foldersResponse.data?.folders || [];
        setFolders(allFolders.filter(f =>
          !f.parentFolderId && !f.parentId && f.name.toLowerCase() !== 'recently added'
        ));

        showSuccess(t('alerts.folderMovedSuccessfully'));
      } catch (error) {
        showError(t('alerts.failedToMoveFolder'));
      }
    } else {
      // It's a document or pending/completed upload
      const pendingFile = uploadingFiles.find(f =>
        f.status === 'pending' && (
          (f.isFolder && f.folderName === identifier) ||
          (!f.isFolder && f.file.name === identifier)
        )
      );
      const completedFile = uploadingFiles.find(f =>
        (f.documentId === identifier || f.file?.name === identifier) && f.status === 'completed'
      );

      if (pendingFile) {
        // Update pending file/folder - will be uploaded to this category
        setUploadingFiles(prev => prev.map(f => {
          const matches = f.isFolder ? f.folderName === identifier : f.file.name === identifier;
          return matches ? {
            ...f,
            category: targetCategory.name,
            folderId: categoryId
          } : f;
        }));
        showSuccess(t('alerts.categoryWillBeAppliedOnUpload'));
      } else if (completedFile) {
        // Update completed uploaded file using CONTEXT moveToFolder
        try {
          await moveToFolder(completedFile.documentId, categoryId);
          showSuccess(t('alerts.documentMovedSuccessfully'));

          // Update uploadingFiles list to reflect the category
          setUploadingFiles(prev => prev.map(f =>
            f.documentId === completedFile.documentId ? {
              ...f,
              category: targetCategory.name,
              folderId: categoryId
            } : f
          ));
        } catch (error) {
          showError(t('alerts.failedToMoveDocument'));
        }
      } else {
        // This is an existing document from the library (identifier is doc ID)
        try {
          await moveToFolder(identifier, categoryId);
          showSuccess(t('alerts.documentMovedSuccessfully'));

          // Context will handle document refresh automatically
        } catch (error) {
          showError(t('alerts.failedToMoveDocument'));
        }
      }
    }

    // Close modal and reset state
    setShowCategoryModal(null);
    setSelectedCategoryId(null);
  };

  // Group documents by time for search modal
  const groupDocumentsByTime = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const groups = {
      TODAY: [],
      YESTERDAY: [],
      OLDER: []
    };

    // Filter combined items based on modal search query
    const query = modalSearchQuery.toLowerCase();
    const filtered = combinedItems.filter(item => {
      if (item.isFolder) {
        return (item.name || '').toLowerCase().includes(query);
      } else {
        return (item.filename || item.displayTitle || '').toLowerCase().includes(query);
      }
    });

    filtered.forEach(item => {
      const itemDate = new Date(item.createdAt || item.uploadedAt);

      if (itemDate >= today) {
        groups.TODAY.push(item);
      } else if (itemDate >= yesterday) {
        groups.YESTERDAY.push(item);
      } else {
        groups.OLDER.push(item);
      }
    });

    return groups;
  };

  // Search Modal Component
  const SearchModal = () => {
    const groupedDocuments = groupDocumentsByTime();

    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: showSearchModal ? 'flex' : 'none',
          justifyContent: 'center',
          alignItems: 'flex-start',
          paddingTop: '10vh',
          zIndex: 1000,
        }}
        onClick={() => setShowSearchModal(false)}
      >
        <div
          style={{
            width: 600,
            maxHeight: '80vh',
            background: 'white',
            borderRadius: 16,
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.15)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search Header */}
          <div style={{
            padding: '20px 20px 16px',
            borderBottom: '1px solid #E6E6EC',
          }}>
            <div
                style={{
                  position: 'relative',
                  transition: 'transform 0.15s ease',
                  cursor: 'text'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              >
              <input
                type="text"
                placeholder={t('common.searchPlaceholder')}
                value={modalSearchQuery}
                onChange={(e) => setModalSearchQuery(e.target.value)}
                autoFocus
                style={{
                  width: '100%',
                  height: 44,
                  padding: '10px 40px 10px 40px',
                  background: '#F5F5F5',
                  borderRadius: 100,
                  border: '1px solid #E6E6EC',
                  outline: 'none',
                  fontSize: 14,
                  fontFamily: 'Plus Jakarta Sans',
                  transition: 'box-shadow 0.15s ease, border-color 0.15s ease'
                }}
                onFocus={(e) => { e.target.style.boxShadow = '0 0 0 2px rgba(50, 48, 44, 0.1)'; e.target.style.borderColor = '#A2A2A7'; }}
                onBlur={(e) => { e.target.style.boxShadow = 'none'; e.target.style.borderColor = '#E6E6EC'; }}
              />
              <SearchIcon style={{
                width: 20,
                height: 20,
                position: 'absolute',
                left: 12,
                top: 12,
                filter: 'brightness(0) invert(0.2)'
              }} />
              <div
                onClick={() => setShowSearchModal(false)}
                style={{
                  position: 'absolute',
                  right: 12,
                  top: 10,
                  width: 24,
                  height: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  borderRadius: 4,
                  transition: 'background 200ms ease-in-out',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#F5F5F5'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M13 1L1 13M1 1L13 13" stroke="#6C6B6E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
          </div>

          {/* Documents List */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 20px',
          }}>
            {Object.entries(groupedDocuments).map(([day, list]) => {
              if (list.length === 0) return null;

              return (
                <div key={day} style={{marginBottom: 20}}>
                  <div style={{
                    color: '#32302C',
                    fontSize: 12,
                    fontFamily: 'Plus Jakarta Sans',
                    fontWeight: '700',
                    textTransform: 'uppercase',
                    marginBottom: 12
                  }}>
                    {day}
                  </div>
                  <div>
                    {list.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => {
                          if (item.isFolder) {
                            // Toggle folder expansion
                            const newExpanded = new Set(expandedFolders);
                            if (newExpanded.has(item.id)) {
                              newExpanded.delete(item.id);
                            } else {
                              newExpanded.add(item.id);
                            }
                            setExpandedFolders(newExpanded);
                          }
                          setShowSearchModal(false);
                        }}
                        style={{
                          padding: '12px 14px',
                          background: 'transparent',
                          borderRadius: 12,
                          color: '#6C6B6E',
                          fontSize: 14,
                          fontFamily: 'Plus Jakarta Sans',
                          fontWeight: '600',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          transition: 'background 200ms ease-in-out',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#F5F5F5'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <img
                          src={item.isFolder ? folderIcon : getFileIcon(item.filename)}
                          alt={item.isFolder ? 'Folder' : 'File'}
                          style={{
                            width: 48,
                            height: 48,
                            flexShrink: 0,
                            objectFit: 'contain'
                          }}
                        />
                        <div style={{
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {cleanDocumentName(item.isFolder ? item.name : item.filename)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {combinedItems.length === 0 && (
              <div style={{
                textAlign: 'center',
                color: '#6C6B6E',
                fontSize: 14,
                marginTop: 20
              }}>
                No documents yet. Upload some documents!
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const pendingCount = uploadingFiles.filter(f => f.status === 'pending').length;
  const uploadingCount = uploadingFiles.filter(f => f.status === 'uploading' || f.status === 'processing').length;
  const completedCount = uploadingFiles.filter(f => f.status === 'completed').length;
  const hasFiles = uploadingFiles.length > 0;

  // Destination selection — null means no category selected yet
  const [selectedDestination, setSelectedDestination] = useState(null);
  const selectedDestinationRef = useRef(null);
  selectedDestinationRef.current = selectedDestination; // always fresh for closures
  const destinationInitRef = useRef(false);
  if (!destinationInitRef.current && categories.length > 0 && !selectedDestination) {
    const allybiSpecifics = categories.find(c => c.name.toLowerCase() === 'allybi specifics');
    if (allybiSpecifics) {
      destinationInitRef.current = true;
      Promise.resolve().then(() => setSelectedDestination(allybiSpecifics.id));
    } else {
      destinationInitRef.current = true;
    }
  }

  // ── Shared recursive renderer for destination folder tree ──
  const renderDestinationRow = (folder, depth, expandedSet, expandSetter, opts = {}) => {
    const isSelected = selectedDestination === folder.id;
    const subs = getSubfolders(folder.id);
    const hasSubs = subs.length > 0;
    const isExpanded = expandedSet.has(folder.id);
    const isRoot = depth === 0;
    const leftPad = isRoot ? 12 : 12 + (depth * 28);
    const iconSize = isRoot ? 28 : 20;
    const rowHeight = isRoot ? 48 : 40;
    const fSize = isRoot ? 14 : 13;

    return (
      <React.Fragment key={folder.id}>
        <button
          onClick={() => {
            const newId = isSelected ? null : folder.id;
            setSelectedDestination(newId);
            setUploadingFiles(prev => prev.map(f =>
              f.status === 'pending' ? { ...f, folderId: newId, category: newId ? folder.name : 'No category' } : f
            ));
            if (opts.closeModal) opts.closeModal();
          }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, height: rowHeight,
            paddingLeft: leftPad, paddingRight: 12,
            background: isSelected ? '#F5F5F5' : 'transparent',
            border: isSelected ? '1px solid #E6E6EC' : '1px solid transparent',
            borderRadius: 12, cursor: 'pointer', transition: 'all 150ms ease',
            textAlign: 'left', width: '100%', flexShrink: 0,
          }}
          onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#F5F5F5'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = isSelected ? '#F5F5F5' : 'transparent'; }}>
          {/* Chevron or spacer */}
          {hasSubs ? (
            <span
              role="button"
              aria-label={isExpanded ? 'Collapse subfolders' : 'Expand subfolders'}
              onClick={(e) => { e.stopPropagation(); toggleCategoryExpand(folder.id, expandSetter); }}
              style={{
                width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, cursor: 'pointer', borderRadius: 4,
                transition: 'background 120ms ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#E6E6EC'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
                style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 150ms ease' }}>
                <path d="M6 4l4 4-4 4" stroke="#A2A2A7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
          ) : (
            <span style={{ width: 16, flexShrink: 0 }} />
          )}
          {/* Icon: CategoryIcon for root, folder icon for nested */}
          {isRoot ? (
            <CategoryIcon emoji={folder.emoji} size={iconSize} />
          ) : (
            <img src={folderIcon} alt="" aria-hidden="true" style={{ width: iconSize, height: iconSize, flexShrink: 0, filter: 'brightness(0) invert(0.35)' }} />
          )}
          <span style={{
            fontSize: fSize, fontWeight: '500', color: '#32302C',
            fontFamily: 'Plus Jakarta Sans, sans-serif', flex: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            lineHeight: '20px', marginLeft: isRoot ? 4 : 2,
          }}>
            {folder.name}
          </span>
          {isSelected && (
            <CheckIcon style={{ width: 16, height: 16, flexShrink: 0, filter: 'brightness(0) invert(0.2)' }} />
          )}
        </button>
        {/* Recursive children */}
        {hasSubs && isExpanded && subs.map(sub =>
          renderDestinationRow(sub, depth + 1, expandedSet, expandSetter, opts)
        )}
      </React.Fragment>
    );
  };

  return (
    <div data-page="upload-hub" className="upload-hub-page" style={{
      width: '100%',
      height: isMobile ? 'auto' : '100vh',
      minHeight: isMobile ? '100vh' : 'auto',
      background: '#F1F0EF',
      overflow: isMobile ? 'visible' : 'hidden',
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
    }}>
      <LeftNav onNotificationClick={() => setShowNotificationsPopup(true)} />

      {/* Dead library sidebar hidden */}
      {false && <div style={{
        width: isLibraryExpanded ? 314 : 64,
        background: 'white',
        borderRight: '1px solid #E6E6EC',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflowY: 'auto',
        transition: 'width 0.3s ease'
      }}>
        <div style={{padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
          {isLibraryExpanded && (
            <h3 style={{fontSize: 20, fontWeight: '700', color: '#32302C', margin: 0, fontFamily: 'Plus Jakarta Sans', lineHeight: '30px', textTransform: 'capitalize', textShadow: '0 4px 8px rgba(0, 0, 0, 0.12), 0 2px 4px rgba(0, 0, 0, 0.08)'}}>{t('uploadHub.library')}</h3>
          )}
          <button
            onClick={() => setIsLibraryExpanded(!isLibraryExpanded)}
            style={{
              width: 44,
              height: 44,
              background: 'transparent',
              border: 'none',
              borderRadius: 12,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              transition: 'background 0.15s, transform 0.15s ease',
              marginLeft: isLibraryExpanded ? 0 : 'auto',
              marginRight: isLibraryExpanded ? 0 : 'auto'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; e.currentTarget.style.transform = 'scale(1.08)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <ExpandIcon
              style={{
                width: 26,
                height: 26,
                transform: isLibraryExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.3s ease',
                filter: 'brightness(0) invert(0.2)'
              }}
            />
          </button>
        </div>

        <div style={{padding: 16, display: 'flex', justifyContent: 'center'}}>
          {isLibraryExpanded ? (
            <div
                style={{
                  position: 'relative',
                  height: 52,
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  transition: 'transform 0.15s ease',
                  cursor: 'text'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              >
              <SearchIcon style={{position: 'absolute', left: 16, width: 20, height: 20, zIndex: 1, filter: 'brightness(0) invert(0.2)'}} />
              <input
                type="text"
                placeholder={t('common.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  height: '100%',
                  paddingLeft: 46,
                  paddingRight: 16,
                  background: '#F5F5F5',
                  border: '1px #E6E6EC solid',
                  borderRadius: 100,
                  fontSize: 16,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '500',
                  lineHeight: '24px',
                  color: '#32302C',
                  outline: 'none',
                  transition: 'box-shadow 0.15s ease, border-color 0.15s ease'
                }}
                onFocus={(e) => { e.target.style.boxShadow = '0 0 0 2px rgba(50, 48, 44, 0.1)'; e.target.style.borderColor = '#A2A2A7'; }}
                onBlur={(e) => { e.target.style.boxShadow = 'none'; e.target.style.borderColor = '#E6E6EC'; }}
              />
            </div>
          ) : (
            <div
              onClick={() => setShowSearchModal(true)}
              style={{
                width: 44,
                height: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 12,
                cursor: 'pointer',
                transition: 'background 200ms ease-in-out, transform 0.15s ease'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; e.currentTarget.style.transform = 'scale(1.08)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'scale(1)'; }}
            >
              <SearchIcon style={{width: 20, height: 20, filter: 'brightness(0) invert(0.2)'}} />
            </div>
          )}
        </div>

        {isLibraryExpanded && (
          <div style={{flex: 1, overflowY: 'auto', padding: 8}}>
            {combinedItems.map((item) => (
            <div key={item.id}>
              {/* Render folder */}
              {item.isFolder && (
                <div>
                  <div
                    onClick={() => {
                      const newExpanded = new Set(expandedFolders);
                      if (newExpanded.has(item.id)) {
                        newExpanded.delete(item.id);
                      } else {
                        newExpanded.add(item.id);
                      }
                      setExpandedFolders(newExpanded);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: 12,
                      borderRadius: 8,
                      marginBottom: 4,
                      cursor: 'pointer',
                      transition: 'background 0.15s',
                      background: expandedFolders.has(item.id) ? '#F3F4F6' : 'transparent'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#F3F4F6'}
                    onMouseLeave={(e) => {
                      if (!expandedFolders.has(item.id)) {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    <img src={folderIcon} alt="Folder" style={{width: 48, height: 48, flexShrink: 0, filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))'}} />
                    <div style={{flex: 1, minWidth: 0}}>
                      <p style={{
                        fontSize: 14,
                        fontWeight: '600',
                        color: '#111827',
                        margin: '0 0 4px 0',
                        fontFamily: 'Plus Jakarta Sans',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}>{cleanDocumentName(item.name)}</p>
                      <p style={{
                        fontSize: 12,
                        color: '#6B7280',
                        margin: 0,
                        fontFamily: 'Plus Jakarta Sans'
                      }}>{(() => { const c = item._count?.totalDocuments ?? item._count?.documents ?? item.counts?.docs ?? 0; return `${c} document${c !== 1 ? 's' : ''}`; })()}</p>
                    </div>
                    <div style={{fontSize: 16, color: '#9CA3AF', transform: expandedFolders.has(item.id) ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s'}}>
                      ›
                    </div>
                    <div style={{position: 'relative'}}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenDropdownId(openDropdownId === item.id ? null : item.id);
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#E6E6EC'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                        style={{
                          width: 32,
                          height: 32,
                          background: 'white',
                          borderRadius: '50%',
                          border: '1px solid #E6E6EC',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          fontSize: 18,
                          fontWeight: '700',
                          color: '#32302C',
                          transition: 'background 0.2s ease'
                        }}
                      >
                        ⋯
                      </button>

                      {openDropdownId === item.id && (
                        <div
                          data-dropdown
                          style={{
                            position: 'absolute',
                            top: '100%',
                            right: 0,
                            marginTop: 4,
                            background: 'white',
                            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
                            borderRadius: 12,
                            border: '1px solid #E6E6EC',
                            zIndex: 1001,
                            minWidth: 160,
                            overflow: 'hidden',
                            padding: 8
                          }}
                        >
                          <div style={{display: 'flex', flexDirection: 'column', gap: 1}}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenDropdownId(null);
                                setShowCategoryModal(item.id);
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                width: '100%',
                                padding: '10px 14px',
                                background: 'transparent',
                                border: 'none',
                                borderRadius: 6,
                                cursor: 'pointer',
                                fontSize: 14,
                                fontFamily: 'Plus Jakarta Sans',
                                fontWeight: '500',
                                color: '#32302C',
                                transition: 'background 0.2s ease',
                                textAlign: 'left'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = '#F5F5F5'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                              {t('modals.moveToCategory.title')}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setItemToRename({ type: 'folder', id: item.id, name: item.name });
                                setShowRenameModal(true);
                                setOpenDropdownId(null);
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                width: '100%',
                                padding: '10px 14px',
                                background: 'transparent',
                                border: 'none',
                                borderRadius: 6,
                                cursor: 'pointer',
                                fontSize: 14,
                                fontFamily: 'Plus Jakarta Sans',
                                fontWeight: '500',
                                color: '#32302C',
                                transition: 'background 0.2s ease',
                                textAlign: 'left'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = '#F5F5F5'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                              <RenameIcon style={{ width: 20, height: 20, filter: 'brightness(0) invert(0.2)' }} />
                              Rename Folder
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setItemToDelete({ type: 'folder', id: item.id, name: item.name });
                                setShowDeleteModal(true);
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                width: '100%',
                                padding: '10px 14px',
                                background: 'transparent',
                                border: 'none',
                                borderRadius: 6,
                                cursor: 'pointer',
                                fontSize: 14,
                                fontFamily: 'Plus Jakarta Sans',
                                fontWeight: '500',
                                color: '#D92D20',
                                transition: 'background 0.2s ease',
                                textAlign: 'left'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.background = '#FEE2E2'}
                              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            >
                              <DeleteIcon style={{ width: 20, height: 20, filter: 'brightness(0) saturate(100%) invert(19%) sepia(93%) saturate(3000%) hue-rotate(352deg) brightness(93%) contrast(90%)' }} />
                              Delete Folder
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Show documents inside folder when expanded */}
                  {expandedFolders.has(item.id) && (
                    <div style={{paddingLeft: 24, borderLeft: '2px solid #E5E7EB', marginLeft: 32, marginBottom: 8}}>
                      {(() => {
                        const folderDocs = documents.filter(doc => doc.folderId === item.id);

                        if (folderDocs.length === 0) {
                          return (
                            <div style={{
                              padding: 16,
                              textAlign: 'center',
                              color: '#9CA3AF',
                              fontSize: 13,
                              fontFamily: 'Plus Jakarta Sans'
                            }}>
                              No documents in this folder
                            </div>
                          );
                        }

                        return folderDocs.map(doc => (
                          <div
                            key={doc.id}
                            onClick={() => navigate(buildRoute.document(doc.id))}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              padding: 12,
                              borderRadius: 8,
                              marginBottom: 4,
                              cursor: 'pointer',
                              transition: 'background 0.15s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#F3F4F6'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <img
                              src={getFileIcon(doc.filename)}
                              alt="File icon"
                              style={{
                                width: 48,
                                height: 48,
                                imageRendering: 'auto',
                                objectFit: 'contain',
                                shapeRendering: 'geometricPrecision',
                                flexShrink: 0,
                                filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))'
                              }}
                            />
                            <div style={{flex: 1, minWidth: 0}}>
                              <p style={{
                                fontSize: 13,
                                fontWeight: '500',
                                color: '#111827',
                                margin: '0 0 2px 0',
                                fontFamily: 'Plus Jakarta Sans',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}>{cleanDocumentName(doc.filename)}</p>
                              <p style={{
                                fontSize: 11,
                                color: '#6B7280',
                                margin: 0,
                                fontFamily: 'Plus Jakarta Sans'
                              }}>{formatFileSize(doc.fileSize)}</p>
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </div>
              )}

              {/* Render document */}
              {item.isDocument && (
                <div
                  onClick={() => navigate(buildRoute.document(item.id))}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: 12,
                    borderRadius: 8,
                    marginBottom: 4,
                    cursor: 'pointer',
                    transition: 'background 0.15s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#F3F4F6'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ position: 'relative' }}>
                    <img
                      src={getFileIcon(item.filename)}
                      alt="File icon"
                      style={{
                        width: 56,
                        height: 56,
                        imageRendering: 'auto',
                        objectFit: 'contain',
                        shapeRendering: 'geometricPrecision',
                        flexShrink: 0,
                        filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))'
                      }}
                    />
                    {/* ✅ Processing badge */}
                    {item.status === 'processing' && (
                      <div style={{
                        position: 'absolute',
                        bottom: -4,
                        right: -4,
                        background: '#3B82F6',
                        color: 'white',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '9px',
                        fontWeight: '600',
                        fontFamily: 'Plus Jakarta Sans',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                      }}>
                        <div style={{
                          width: 6,
                          height: 6,
                          border: '1.5px solid white',
                          borderTopColor: 'transparent',
                          borderRadius: '50%',
                          animation: 'spin 0.8s linear infinite'
                        }} />
                        {item.processingProgress ? `${item.processingProgress}%` : '...'}
                      </div>
                    )}
                    {/* ✅ Failed badge */}
                    {item.status === 'failed' && (
                      <div style={{
                        position: 'absolute',
                        bottom: -4,
                        right: -4,
                        background: '#EF4444',
                        color: 'white',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '9px',
                        fontWeight: '600',
                        fontFamily: 'Plus Jakarta Sans',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                      }}>
                        ⚠️ Failed
                      </div>
                    )}
                  </div>
                  <div style={{flex: 1, minWidth: 0}}>
                    <p style={{
                      fontSize: 14,
                      fontWeight: '500',
                      color: '#111827',
                      margin: '0 0 4px 0',
                      fontFamily: 'Plus Jakarta Sans',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>{cleanDocumentName(item.filename)}</p>
                    <p style={{
                      fontSize: 12,
                      color: '#6B7280',
                      margin: 0,
                      fontFamily: 'Plus Jakarta Sans'
                    }}>{formatFileSize(item.fileSize)}</p>
                  </div>
                  <div style={{position: 'relative'}}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenDropdownId(openDropdownId === item.id ? null : item.id);
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#E6E6EC'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
                      style={{
                        width: 32,
                        height: 32,
                        background: 'white',
                        borderRadius: '50%',
                        border: '1px solid #E6E6EC',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        fontSize: 18,
                        fontWeight: '700',
                        color: '#32302C',
                        transition: 'background 0.2s ease'
                      }}
                    >
                      ⋯
                    </button>

                    {openDropdownId === item.id && (
                      <div
                        data-dropdown
                        style={{
                          position: 'absolute',
                          top: '100%',
                          right: 0,
                          marginTop: 4,
                          background: 'white',
                          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
                          borderRadius: 12,
                          border: '1px solid #E6E6EC',
                          zIndex: 1001,
                          minWidth: 160,
                          overflow: 'hidden',
                          padding: 8
                        }}
                      >
                        <div style={{display: 'flex', flexDirection: 'column', gap: 1}}>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                const response = await api.get(`/api/documents/${item.id}/stream?download=true`, {
                                  responseType: 'blob'
                                });
                                const url = window.URL.createObjectURL(new Blob([response.data]));
                                const link = document.createElement('a');
                                link.href = url;
                                link.setAttribute('download', item.filename);
                                document.body.appendChild(link);
                                link.click();
                                link.remove();
                                setOpenDropdownId(null);
                              } catch (error) {
                                showError(t('alerts.failedToDownloadFile'));
                              }
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              width: '100%',
                              padding: '10px 14px',
                              background: 'transparent',
                              border: 'none',
                              borderRadius: 6,
                              cursor: 'pointer',
                              fontSize: 14,
                              fontFamily: 'Plus Jakarta Sans',
                              fontWeight: '500',
                              color: '#32302C',
                              transition: 'background 0.2s ease',
                              textAlign: 'left'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#F5F5F5'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <DownloadIcon style={{ width: 20, height: 20, filter: 'brightness(0) invert(0.2)' }} />
                            Download
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setItemToRename({ type: 'document', id: item.id, name: item.filename });
                              setShowRenameModal(true);
                              setOpenDropdownId(null);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              width: '100%',
                              padding: '10px 14px',
                              background: 'transparent',
                              border: 'none',
                              borderRadius: 6,
                              cursor: 'pointer',
                              fontSize: 14,
                              fontFamily: 'Plus Jakarta Sans',
                              fontWeight: '500',
                              color: '#32302C',
                              transition: 'background 0.2s ease',
                              textAlign: 'left'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#F5F5F5'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <RenameIcon style={{ width: 20, height: 20, filter: 'brightness(0) invert(0.2)' }} />
                            Rename
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenDropdownId(null);
                              setShowCategoryModal(item.id);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              width: '100%',
                              padding: '10px 14px',
                              background: 'transparent',
                              border: 'none',
                              borderRadius: 6,
                              cursor: 'pointer',
                              fontSize: 14,
                              fontFamily: 'Plus Jakarta Sans',
                              fontWeight: '500',
                              color: '#32302C',
                              transition: 'background 0.2s ease',
                              textAlign: 'left'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#F5F5F5'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <MoveIcon style={{ width: 20, height: 20 }} />
                            Move
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setItemToDelete({ type: 'document', id: item.id, name: item.filename });
                              setShowDeleteModal(true);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              width: '100%',
                              padding: '10px 14px',
                              background: 'transparent',
                              border: 'none',
                              borderRadius: 6,
                              cursor: 'pointer',
                              fontSize: 14,
                              fontFamily: 'Plus Jakarta Sans',
                              fontWeight: '500',
                              color: '#D92D20',
                              transition: 'background 0.2s ease',
                              textAlign: 'left'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#FEE2E2'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <DeleteIcon style={{ width: 20, height: 20, filter: 'brightness(0) saturate(100%) invert(19%) sepia(93%) saturate(3000%) hue-rotate(352deg) brightness(93%) contrast(90%)' }} />
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          </div>
        )}
      </div>}

      {/* ═══ MAIN CONTENT ═══ */}
      <div
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          background: '#F1F0EF', position: 'relative', overflowY: 'auto',
        }}
      >
        {/* Header — 72px, matches Home */}
        <div data-upload-header="true" className="mobile-sticky-header" style={{
          height: isMobile ? 56 : 72,
          paddingLeft: isMobile ? 16 : 48, paddingRight: isMobile ? 16 : 48,
          background: 'white', borderBottom: '1px solid #E6E6EC',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
          position: isMobile ? 'sticky' : 'relative',
          top: isMobile ? 0 : 'auto', zIndex: isMobile ? 10 : 'auto',
        }}>
          <h2 style={{
            fontSize: isMobile ? 18 : 20, fontWeight: '600', color: '#32302C', margin: 0,
            fontFamily: 'Plus Jakarta Sans, sans-serif', lineHeight: '30px',
          }}>
            {t('uploadHub.title')}
          </h2>
        </div>

        {/* Content rail — max 1440px, padding 48px */}
        <div className="upload-hub-content scrollable-content" style={{
          flex: 1, overflowY: 'auto',
          padding: isMobile ? 16 : '24px 48px',
          paddingBottom: isMobile ? 'calc(var(--tabbar-h, 70px) + env(safe-area-inset-bottom) + 24px)' : 120,
          maxWidth: 1440, width: '100%', margin: '0 auto',
          WebkitOverflowScrolling: 'touch',
        }}>
          {/* Row 1: Add files (2fr) + Destination (1fr) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr',
            gridTemplateRows: isMobile ? 'auto auto' : '440px',
            gap: 24,
          }}>

            {/* ═══ LEFT: Add files Card (span 8) ═══ */}
            <div style={{
              background: 'white', borderRadius: 16, border: '1px solid #E6E6EC',
              boxShadow: '0 1px 2px rgba(24,24,24,0.06), 0 12px 24px rgba(24,24,24,0.08)',
              padding: 24, display: 'flex', flexDirection: 'column',
              transition: 'border-color 120ms ease-out, background 120ms ease-out',
              cursor: 'default', overflow: 'hidden',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#D0D0D5'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E6E6EC'; }}
            >

              {/* Card header */}
              <h3 style={{
                margin: 0, fontSize: 16, fontWeight: '600', color: '#32302C',
                fontFamily: 'Plus Jakarta Sans, sans-serif', lineHeight: '24px',
              }}>{t('uploadHub.addFiles')}</h3>
              <p style={{
                margin: '4px 0 0', fontSize: 13, color: '#6C6B6E',
                fontFamily: 'Plus Jakarta Sans, sans-serif', lineHeight: '20px',
              }}>
                {t('uploadHub.dragDropDescription')}
              </p>

              {isMobile ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, width: '100%', marginTop: 20 }}>
                  <div style={{ display: 'flex', gap: 8, flexDirection: 'column', width: '100%', maxWidth: 220 }}>
                    <button onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                      style={{ height: 44, background: '#181818', border: 'none', borderRadius: 9999, fontSize: 14, fontWeight: '600', color: 'white', cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', width: '100%' }}>
                      {t('uploadHub.selectFiles')}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setShowScanner(true); }}
                      style={{ height: 44, background: 'white', border: '1px solid #E6E6EC', borderRadius: 9999, fontSize: 14, fontWeight: '600', color: '#32302C', cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/>
                        <path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
                        <rect x="7" y="7" width="10" height="10" rx="1"/>
                      </svg>
                      {t('uploadHub.scan')}
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Dropzone surface — fills remaining card height ── */
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={t('uploadHub.dropFilesAria')}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); fileInputRef.current?.click(); } }}
                  style={{
                    flex: 1, marginTop: 16, borderRadius: 12,
                    background: '#F5F5F5', border: '1px dashed #E6E6EC',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    position: 'relative', minHeight: 0,
                    transition: 'border-color 180ms ease, background 180ms ease',
                    outline: 'none',
                  }}
                  onFocus={(e) => { e.currentTarget.style.boxShadow = '0 0 0 2px rgba(50,48,44,0.12)'; }}
                  onBlur={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
                >
                  {/* File type illustration */}
                  <img src={dropzoneIllustration} alt="" style={{ width: 180, height: 86, objectFit: 'contain', marginBottom: 16 }} />

                  {/* Headline */}
                  <p style={{
                    margin: 0, fontSize: 15, fontWeight: '600', color: '#32302C',
                    fontFamily: 'Plus Jakarta Sans, sans-serif', lineHeight: '22px',
                  }}>
                    {t('uploadHub.dropFilesHere')}
                  </p>
                  <p style={{
                    margin: '4px 0 0', fontSize: 13, color: '#6C6B6E',
                    fontFamily: 'Plus Jakarta Sans, sans-serif', lineHeight: '20px',
                  }}>
                    {t('uploadHub.orChooseFromComputer')}
                  </p>

                  {/* Buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
                    <button onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                      style={{
                        height: 40, padding: '0 20px', background: '#181818', border: 'none',
                        borderRadius: 9999, fontSize: 14, fontWeight: '600', color: 'white',
                        cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'background 120ms ease', flexShrink: 0,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#0F0F0F'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = '#181818'; }}>
                      {t('uploadHub.selectFiles')}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click(); }}
                      style={{
                        height: 40, padding: '0 20px', background: 'white', border: '1px solid #E6E6EC',
                        borderRadius: 9999, fontSize: 14, fontWeight: '600', color: '#32302C',
                        cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'background 120ms ease', flexShrink: 0,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#ECECEC'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'white'; }}>
                      {t('uploadHub.selectFolder')}
                    </button>
                  </div>

                  {/* Supported formats footer — bottom of dropzone */}
                  <div style={{
                    position: 'absolute', bottom: 12, left: 0, right: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                  }}>
                    <span style={{ fontSize: 11, color: '#A2A2A7', fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: '500', lineHeight: '16px' }}>
                      {t('uploadHub.supportedFormatsList')}
                    </span>
                    <span style={{ fontSize: 11, color: '#A2A2A7', lineHeight: '16px' }}>·</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowFormatsModal(true); }}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                        fontSize: 11, fontWeight: '600', color: '#6C6B6E',
                        fontFamily: 'Plus Jakarta Sans, sans-serif',
                        transition: 'color 120ms ease', lineHeight: '16px',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = '#32302C'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = '#6C6B6E'; }}
                    >
                      {t('uploadHub.viewAll')}
                    </button>
                  </div>
                </div>
              )}

              {/* Hidden inputs */}
              <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} style={{ display: 'none' }} />
              <input ref={folderInputRef} type="file" webkitdirectory="" directory="" multiple onChange={handleFolderSelect} style={{ display: 'none' }} />
            </div>

            {/* ═══ RIGHT: Destination Card (span 4) ═══ */}
            <div style={{
              background: 'white', borderRadius: 16, border: '1px solid #E6E6EC',
              boxShadow: '0 1px 2px rgba(24,24,24,0.06), 0 12px 24px rgba(24,24,24,0.08)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0,
            }}>
              {/* ── Header ── */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 24px 0', flexShrink: 0 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: '600', color: '#32302C', fontFamily: 'Plus Jakarta Sans, sans-serif', lineHeight: '24px' }}>
                  {t('uploadHub.destination')}
                </h3>
                {categories.length > 0 && (
                  <button onClick={() => setShowNewCategoryModal(true)}
                    aria-label={t('uploadHub.createNewCategory')}
                    style={{
                      height: 36, padding: '0 14px', background: '#F5F5F5', border: '1px solid #E6E6EC',
                      borderRadius: 9999, cursor: 'pointer', fontSize: 13, fontWeight: '600',
                      color: '#32302C', fontFamily: 'Plus Jakarta Sans, sans-serif',
                      transition: 'background 120ms ease',
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#ECECEC'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="#32302C" strokeWidth="1.8" strokeLinecap="round"/></svg>
                    {t('uploadHub.new')}
                  </button>
                )}
              </div>

              {categories.length === 0 ? (
                /* ── State A: No categories — empty state ── */
                <div style={{ padding: '32px 24px 24px', textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: '600', color: '#32302C', fontFamily: 'Plus Jakarta Sans, sans-serif', lineHeight: '22px' }}>
                    {t('uploadHub.noCategoriesYet')}
                  </p>
                  <p style={{ margin: '6px 0 0', fontSize: 13, color: '#6C6B6E', fontFamily: 'Plus Jakarta Sans, sans-serif', lineHeight: '20px' }}>
                    {t('uploadHub.createOneToOrganize')}
                  </p>
                  <button
                    onClick={() => setShowNewCategoryModal(true)}
                    style={{
                      marginTop: 20, height: 44, padding: '0 24px', width: '100%',
                      background: '#181818', border: 'none', borderRadius: 9999,
                      cursor: 'pointer', fontSize: 14, fontWeight: '600', color: 'white',
                      fontFamily: 'Plus Jakarta Sans, sans-serif',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      transition: 'background 120ms ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#333'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#181818'; }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="white" strokeWidth="1.8" strokeLinecap="round"/></svg>
                    {t('uploadHub.createCategory')}
                  </button>
                  <p style={{
                    marginTop: 12, fontSize: 12, color: '#A2A2A7',
                    fontFamily: 'Plus Jakarta Sans, sans-serif', lineHeight: '18px',
                  }}>
                    {t('uploadHub.uploadWithoutCategory')}
                  </p>
                </div>
              ) : (
                /* ── State B: Has categories — search + list ── */
                <>
                  {/* ── Search input ── */}
                  <div style={{ padding: '16px 24px 0' }}>
                      <div style={{ position: 'relative' }}>
                        <SearchIcon style={{
                          width: 16, height: 16, position: 'absolute', left: 14, top: 12,
                          filter: 'brightness(0) invert(0.4)', pointerEvents: 'none',
                        }} />
                        <input
                          type="text"
                          placeholder={t('uploadHub.searchCategories')}
                          value={destinationSearchQuery}
                          onChange={(e) => setDestinationSearchQuery(e.target.value)}
                          style={{
                            width: '100%', height: 40, padding: '0 14px 0 38px',
                            background: '#F5F5F5', border: '1px solid #E6E6EC',
                            borderRadius: 9999, outline: 'none', fontSize: 14,
                            fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: '500',
                            color: '#32302C', boxSizing: 'border-box',
                            transition: 'border-color 150ms ease, box-shadow 150ms ease',
                          }}
                          onFocus={(e) => { e.target.style.borderColor = '#A2A2A7'; e.target.style.boxShadow = '0 0 0 2px rgba(50,48,44,0.1)'; }}
                          onBlur={(e) => { e.target.style.borderColor = '#E6E6EC'; e.target.style.boxShadow = 'none'; }}
                        />
                      </div>
                    </div>

                  {/* ── Category list (recursive expandable tree) ── */}
                  <div style={{ padding: '12px 24px 0', flex: 1, minHeight: 0, overflowY: 'auto' }}>
                    {filteredCategories.length === 0 ? (
                      <div style={{ padding: '20px 0', textAlign: 'center' }}>
                        <p style={{ margin: 0, fontSize: 14, color: '#6C6B6E', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>{t('uploadHub.noMatchingCategories')}</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {filteredCategories.map(cat =>
                          renderDestinationRow(cat, 0, expandedCategories, setExpandedCategories)
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── "See all" link ── */}
                  {!destinationSearchQuery.trim() && categories.length > MAX_VISIBLE_DESTINATIONS && (
                    <div style={{ padding: '8px 24px 12px', flexShrink: 0 }}>
                      <button
                        onClick={() => { setAllDestModalSearch(''); setShowAllDestinationsModal(true); }}
                        style={{
                          background: 'none', border: 'none', padding: 0,
                          cursor: 'pointer', fontSize: 12, fontWeight: '600',
                          color: '#6C6B6E', fontFamily: 'Plus Jakarta Sans, sans-serif',
                          transition: 'color 120ms ease',
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          lineHeight: '18px',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = '#32302C'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = '#6C6B6E'; }}>
                        {t('uploadHub.seeAllCategories')}
                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M4.5 2.5l3.5 3.5-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </button>
                    </div>
                  )}

                  {/* ── Keep folder structure toggle ── */}
                  {uploadingFiles.some(f => f.isFolder) && (
                    <div style={{ borderTop: '1px solid #E6E6EC', margin: '0 24px', paddingTop: 12, paddingBottom: 8, flexShrink: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 14, fontWeight: '500', color: '#32302C', fontFamily: 'Plus Jakarta Sans, sans-serif', lineHeight: '20px' }}>
                          Keep folder structure
                        </span>
                        <div style={{
                          width: 36, height: 20, borderRadius: 10,
                          background: '#E6E6EC', cursor: 'pointer',
                          position: 'relative', transition: 'background 150ms ease',
                        }}>
                          <div style={{
                            width: 16, height: 16, borderRadius: '50%', background: 'white',
                            position: 'absolute', top: 2, left: 2,
                            transition: 'left 150ms ease',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                          }} />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Footer: contextual helper text ── */}
                  <div style={{
                    borderTop: '1px solid #E6E6EC', marginTop: 'auto',
                    padding: '12px 24px 16px', flexShrink: 0,
                  }}>
                    <p style={{
                      margin: 0, fontSize: 12, color: '#6C6B6E',
                      fontFamily: 'Plus Jakarta Sans, sans-serif', lineHeight: '18px',
                    }}>
                      {selectedDestination
                        ? t('uploadHub.uploadingTo', { name: getDestinationName(selectedDestination) })
                        : t('uploadHub.noCategorySelected')}
                    </p>
                  </div>
                </>
              )}
            </div>

          </div>

          {/* Row 2: Files card (span 12, full width) */}
          <div style={{
            background: 'white', borderRadius: 16, border: '1px solid #E6E6EC',
            boxShadow: '0 1px 2px rgba(24,24,24,0.06), 0 12px 24px rgba(24,24,24,0.08)',
            padding: 24, marginTop: 24,
          }}>
            {/* Files header */}
            {(() => {
              const isUploading = uploadingFiles.some(f => f.status === 'uploading' || f.status === 'processing');
              const isAllDone = hasFiles && uploadingFiles.every(f => f.status === 'completed' || f.status === 'failed');

              // Subtitle copy
              let subtitle = '';
              if (isUploading) subtitle = t('uploadHub.uploading');
              else if (isAllDone) subtitle = t('uploadHub.uploaded');
              else if (pendingCount > 0 && selectedDestination) subtitle = t('uploadHub.uploadingToName', { name: getDestinationName(selectedDestination) });
              else if (pendingCount > 0) subtitle = t('uploadHub.noCategorySelected');

              return (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: hasFiles ? 16 : 0 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: '600', color: '#32302C', fontFamily: 'Plus Jakarta Sans, sans-serif', lineHeight: '24px' }}>
                      {hasFiles ? t('uploadHub.filesCount', { count: uploadingFiles.length }) : t('uploadHub.files')}
                    </h3>
                    {subtitle && (
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6C6B6E', fontFamily: 'Plus Jakarta Sans, sans-serif', lineHeight: '18px' }}>
                        {subtitle}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isAllDone && (
                      <button onClick={() => setUploadingFiles([])}
                        style={{
                          height: 36, padding: '0 16px', background: 'white', border: '1px solid #E6E6EC',
                          borderRadius: 9999, cursor: 'pointer', fontSize: 13, fontWeight: '600',
                          color: '#32302C', fontFamily: 'Plus Jakarta Sans, sans-serif',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'background 120ms ease',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'white'; }}>
                        {t('uploadHub.clear')}
                      </button>
                    )}
                    {(() => {
                      const canUpload = pendingCount > 0;
                      return (
                        <button
                          disabled={!canUpload}
                          onClick={canUpload ? handleConfirmUpload : undefined}
                          style={{
                            height: 36, padding: '0 18px',
                            background: '#181818',
                            opacity: canUpload ? 1 : 0.4,
                            border: 'none', borderRadius: 9999, cursor: canUpload ? 'pointer' : 'not-allowed',
                            fontSize: 13, fontWeight: '600', color: 'white',
                            fontFamily: 'Plus Jakarta Sans, sans-serif',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'opacity 120ms ease, background 120ms ease',
                          }}
                          onMouseEnter={(e) => { if (canUpload) e.currentTarget.style.background = '#333'; }}
                          onMouseLeave={(e) => { if (canUpload) e.currentTarget.style.background = '#181818'; }}>
                          {canUpload ? t('uploadHub.uploadCount', { count: pendingCount }) : t('uploadHub.upload')}
                        </button>
                      );
                    })()}
                  </div>
                </div>
              );
            })()}

            {/* Empty state — table rhythm */}
            {!hasFiles && (
              <div style={{ marginTop: 8 }}>
                <p style={{
                  margin: '0 0 16px', fontSize: 13, color: '#6C6B6E',
                  fontFamily: 'Plus Jakarta Sans, sans-serif', lineHeight: '20px',
                }}>
                  {t('uploadHub.selectedFilesAppear')}
                </p>
                {/* Table header */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 200px 100px 80px 44px',
                  gap: 12, padding: '0 12px', marginBottom: 4,
                }}>
                  {[t('uploadHub.tableHeaders.name'), t('uploadHub.tableHeaders.destination'), t('uploadHub.tableHeaders.status'), t('uploadHub.tableHeaders.size'), ''].map((col, ci) => (
                    <span key={ci} style={{
                      fontSize: 12, fontWeight: '600', color: '#6C6B6E',
                      fontFamily: 'Plus Jakarta Sans, sans-serif', lineHeight: '18px',
                      textAlign: ci === 3 ? 'right' : 'left',
                    }}>{col}</span>
                  ))}
                </div>
                {/* Skeleton rows */}
                {[
                  { nameW: 160, destW: 100, statusW: 56, sizeW: 40 },
                  { nameW: 130, destW: 80, statusW: 56, sizeW: 36 },
                  { nameW: 180, destW: 90, statusW: 56, sizeW: 44 },
                  { nameW: 110, destW: 110, statusW: 56, sizeW: 32 },
                ].map((row, i) => (
                  <div key={i} style={{
                    display: 'grid', gridTemplateColumns: '1fr 200px 100px 80px 44px',
                    gap: 12, height: 48, padding: '0 12px', alignItems: 'center',
                    opacity: 0.22 - i * 0.04, pointerEvents: 'none',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 24, height: 24, background: '#E6E6EC', borderRadius: 4, flexShrink: 0 }} />
                      <div style={{ height: 10, width: row.nameW, background: '#E6E6EC', borderRadius: 4 }} />
                    </div>
                    <div style={{ height: 10, width: row.destW, background: '#E6E6EC', borderRadius: 4 }} />
                    <div style={{ height: 10, width: row.statusW, background: '#E6E6EC', borderRadius: 4 }} />
                    <div style={{ height: 10, width: row.sizeW, background: '#E6E6EC', borderRadius: 4, marginLeft: 'auto' }} />
                    <div />
                  </div>
                ))}
              </div>
            )}

            {/* Populated rows */}
            {hasFiles && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {uploadingFiles.map((f, index) => {
                  const isError = f.status === 'failed';
                  const isComplete = f.status === 'completed';
                  const isUploading = f.status === 'uploading' || f.status === 'processing';
                  const isPending = f.status === 'pending';
                  const progressWidth = isComplete ? 100 : (f.progress || 0);

                  let chipLabel = t('uploadHub.ready');
                  let chipColor = '#6C6B6E';
                  let chipBg = '#F5F5F5';
                  if (isError) { chipLabel = t('uploadHub.error'); chipColor = '#D92D20'; chipBg = '#FEF3F2'; }
                  else if (isComplete) { chipLabel = t('uploadHub.done'); chipColor = '#34A853'; chipBg = '#F0FDF4'; }
                  else if (isUploading) { chipLabel = `${Math.round(progressWidth)}%`; chipColor = '#181818'; chipBg = '#F5F5F5'; }

                  return (
                    <div key={index}
                      onClick={() => f.isFolder && isPending && handleOpenFolderBrowser(index)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        height: 48, padding: '0 12px',
                        borderRadius: 12, position: 'relative', overflow: 'hidden',
                        cursor: f.isFolder && isPending ? 'pointer' : 'default',
                        transition: 'background 150ms ease',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      {isUploading && (
                        <div style={{
                          position: 'absolute', top: 0, left: 0, height: '100%',
                          width: `${progressWidth}%`, background: 'rgba(24,24,24,0.04)',
                          borderRadius: 12, transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)', zIndex: 0,
                        }} />
                      )}

                      <div style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative', zIndex: 1 }}>
                        {f.isFolder ? (
                          <CategoryIcon emoji={null} size={28} />
                        ) : (
                          <img src={getFileIcon(f.file.name)} alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} />
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
                        <p style={{
                          fontSize: 14, fontWeight: '500', color: '#32302C', margin: 0,
                          fontFamily: 'Plus Jakarta Sans, sans-serif', lineHeight: '20px',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {cleanDocumentName(f.isFolder ? f.folderName : f.file.name)}
                        </p>
                        <p style={{
                          fontSize: 12, color: isError ? '#D92D20' : '#6C6B6E', margin: '1px 0 0',
                          fontFamily: 'Plus Jakarta Sans, sans-serif', lineHeight: '18px',
                        }}>
                          {isError ? t('uploadHub.uploadFailed') : f.isFolder
                            ? `${f.fileCount} file${f.fileCount !== 1 ? 's' : ''} \u00B7 ${formatFileSize(f.totalSize)}`
                            : formatFileSize(f.file?.size)}
                        </p>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, position: 'relative', zIndex: 1 }}>
                        <span style={{
                          fontSize: 11, fontWeight: '600', color: chipColor, background: chipBg,
                          padding: '2px 8px', borderRadius: 9999, fontFamily: 'Plus Jakarta Sans, sans-serif',
                          lineHeight: '18px', whiteSpace: 'nowrap',
                        }}>
                          {chipLabel}
                        </span>

                        {isError && (
                          <button onClick={(e) => {
                            e.stopPropagation();
                            setUploadingFiles(prev => prev.map((file, idx) => idx === index ? { ...file, status: 'pending', progress: 0, error: null } : file));
                          }}
                          style={{ padding: '2px 8px', background: 'none', border: '1px solid #D92D20', borderRadius: 9999, cursor: 'pointer', fontSize: 11, fontWeight: '600', color: '#D92D20', fontFamily: 'Plus Jakarta Sans, sans-serif', transition: 'background 150ms ease' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = '#FEF3F2'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                            {t('uploadHub.retry')}
                          </button>
                        )}

                        {isComplete && (
                          <div style={{ position: 'relative' }}>
                            <button onClick={(e) => { e.stopPropagation(); const id = f.isFolder ? f.folderName : f.file.name; setOpenDropdownId(openDropdownId === id ? null : id); }}
                              style={{ width: 28, height: 28, background: 'transparent', borderRadius: '50%', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 16, color: '#6C6B6E', transition: 'background 150ms ease' }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = '#E6E6EC'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                              &#x22EF;
                            </button>
                            {openDropdownId === (f.isFolder ? f.folderName : f.file.name) && (
                              <div data-dropdown style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: 'white', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', borderRadius: 12, border: '1px solid #E6E6EC', zIndex: 1001, minWidth: 160, padding: 8 }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                  {[
                                    { label: t('common.download'), icon: <DownloadIcon style={{ width: 16, height: 16, filter: 'brightness(0) invert(0.2)' }} />, color: '#32302C', action: async (e) => { e.stopPropagation(); try { const response = await api.get(`/api/documents/${f.documentId}/stream?download=true`, { responseType: 'blob' }); const url = window.URL.createObjectURL(new Blob([response.data])); const link = document.createElement('a'); link.href = url; link.setAttribute('download', f.file.name); document.body.appendChild(link); link.click(); link.remove(); setOpenDropdownId(null); } catch (error) { showError(t('alerts.failedToDownloadFile')); } }},
                                    { label: t('common.rename'), icon: <RenameIcon style={{ width: 16, height: 16, filter: 'brightness(0) invert(0.2)' }} />, color: '#32302C', action: (e) => { e.stopPropagation(); setItemToRename({ type: 'document', id: f.documentId, name: f.file.name }); setShowRenameModal(true); setOpenDropdownId(null); }},
                                    { label: t('common.move'), icon: <MoveIcon style={{ width: 16, height: 16 }} />, color: '#32302C', action: (e) => { e.stopPropagation(); setOpenDropdownId(null); setShowCategoryModal(f.documentId || (f.isFolder ? f.folderName : f.file.name)); }},
                                    { label: t('common.delete'), icon: <DeleteIcon style={{ width: 16, height: 16, filter: 'brightness(0) saturate(100%) invert(19%) sepia(93%) saturate(7149%) hue-rotate(355deg) brightness(91%) contrast(89%)' }} />, color: '#D92D20', action: (e) => { e.stopPropagation(); setItemToDelete({ type: 'uploadedFile', documentId: f.documentId, name: f.file.name, folderName: f.isFolder ? f.folderName : null, isFolder: f.isFolder }); setShowDeleteModal(true); }},
                                  ].map(item => (
                                    <button key={item.label} onClick={item.action}
                                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: '500', color: item.color, transition: 'background 150ms ease', textAlign: 'left' }}
                                      onMouseEnter={(e) => { e.currentTarget.style.background = item.color === '#D92D20' ? '#FEF3F2' : '#F5F5F5'; }}
                                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                                      {item.icon}{item.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {isPending && (
                          <button onClick={(e) => { e.stopPropagation(); removeUploadingFile(f.isFolder ? f.folderName : f.file.name); }}
                            aria-label={t('uploadHub.removeFile')}
                            style={{
                              width: 44, height: 44, border: 'none', background: 'transparent',
                              borderRadius: '50%', cursor: 'pointer', fontSize: 14, color: '#6C6B6E',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              transition: 'background 150ms ease',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = '#E6E6EC'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                            &#x2715;
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Drag overlay */}
        {isDraggingOver && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(255,255,255,0.95)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, zIndex: 9999, pointerEvents: 'none', animation: 'fadeIn 0.2s ease-in' }}>
            <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
            <img src={filesIcon} alt="" style={{ width: 300, height: 'auto' }} />
            <div style={{ color: '#32302C', fontSize: 30, fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: '600', textAlign: 'center', lineHeight: '40px' }}>
              {t('upload.dropFilesHere')}
            </div>
            <div style={{ color: '#6C6B6E', fontSize: 16, fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: '500', textAlign: 'center', lineHeight: '24px' }}>
              {t('upload.releaseToUpload')}
            </div>
          </div>
        )}
      </div>

      {/* Supported Formats Modal */}
      {showFormatsModal && (
        <div
          onClick={() => setShowFormatsModal(false)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10000, animation: 'fadeIn 0.15s ease-in',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white', borderRadius: 16, width: '100%', maxWidth: 560,
              maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
              boxShadow: '0 4px 12px rgba(0,0,0,0.12), 0 24px 48px rgba(0,0,0,0.16)',
              margin: isMobile ? 16 : 0,
            }}
          >
            {/* Modal header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '20px 24px', borderBottom: '1px solid #E6E6EC',
            }}>
              <div>
                <h3 style={{
                  margin: 0, fontSize: 18, fontWeight: '600', color: '#32302C',
                  fontFamily: 'Plus Jakarta Sans, sans-serif',
                }}>
                  {t('uploadHub.supportedFormatsTitle')}
                </h3>
                <p style={{
                  margin: '2px 0 0', fontSize: 12, color: '#6C6B6E',
                  fontFamily: 'Plus Jakarta Sans, sans-serif', lineHeight: '18px',
                }}>
                  {t('uploadHub.maxFileSize')}
                </p>
              </div>
              <button
                onClick={() => setShowFormatsModal(false)}
                aria-label="Close"
                style={{
                  width: 32, height: 32, border: 'none', background: 'transparent',
                  borderRadius: '50%', cursor: 'pointer', fontSize: 18, color: '#6C6B6E',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 120ms ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                &#x2715;
              </button>
            </div>
            {/* Modal body — 2-column grid */}
            <div style={{ padding: 24, overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '20px 32px' }}>
                {[
                  { title: t('uploadHub.formatGroups.documents'), formats: SUPPORTED_FORMATS.filter(f => f.kind === 'doc') },
                  { title: t('uploadHub.formatGroups.presentations'), formats: SUPPORTED_FORMATS.filter(f => f.kind === 'presentation') },
                  { title: t('uploadHub.formatGroups.spreadsheets'), formats: SUPPORTED_FORMATS.filter(f => f.kind === 'sheet') },
                  { title: t('uploadHub.formatGroups.images'), formats: SUPPORTED_FORMATS.filter(f => f.kind === 'image') },
                  { title: t('uploadHub.formatGroups.media'), formats: SUPPORTED_FORMATS.filter(f => f.kind === 'media') },
                ].map((group) => (
                  <div key={group.title}>
                    <h4 style={{
                      margin: '0 0 10px', fontSize: 13, fontWeight: '600', color: '#32302C',
                      fontFamily: 'Plus Jakarta Sans, sans-serif', lineHeight: '20px',
                    }}>
                      {group.title}
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {group.formats.map((fmt) => (
                        <div key={fmt.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <img src={fmt.icon} alt="" style={{ width: 24, height: 24, objectFit: 'contain', flexShrink: 0 }} />
                          <span style={{
                            fontSize: 14, fontWeight: '500', color: '#32302C',
                            fontFamily: 'Plus Jakarta Sans, sans-serif',
                          }}>
                            {fmt.label}
                          </span>
                          {fmt.exts && (
                            <span style={{ fontSize: 12, color: '#A2A2A7', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                              {fmt.exts.join(', ')}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* See All Destinations Modal */}
      {showAllDestinationsModal && (
        <div
          onClick={() => setShowAllDestinationsModal(false)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)', display: 'flex',
            justifyContent: 'center', alignItems: 'center',
            zIndex: 10000, animation: 'fadeIn 0.15s ease-in',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white', borderRadius: 16, width: '100%',
              maxWidth: 480, maxHeight: '80vh', overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
              boxShadow: '0 4px 12px rgba(0,0,0,0.12), 0 24px 48px rgba(0,0,0,0.16)',
              margin: isMobile ? 16 : 0,
            }}
          >
            {/* Modal header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '20px 24px 0',
            }}>
              <h3 style={{
                margin: 0, fontSize: 18, fontWeight: '600', color: '#32302C',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
              }}>
                {t('uploadHub.seeAllCategories')}
              </h3>
              <button
                onClick={() => setShowAllDestinationsModal(false)}
                aria-label="Close"
                style={{
                  width: 32, height: 32, border: 'none', background: 'transparent',
                  borderRadius: '50%', cursor: 'pointer', fontSize: 18, color: '#6C6B6E',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 120ms ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                &#x2715;
              </button>
            </div>

            {/* Modal search */}
            <div style={{ padding: '16px 24px' }}>
              <div style={{ position: 'relative' }}>
                <SearchIcon style={{
                  width: 16, height: 16, position: 'absolute', left: 14, top: 12,
                  filter: 'brightness(0) invert(0.4)', pointerEvents: 'none',
                }} />
                <input
                  type="text"
                  placeholder={t('uploadHub.searchCategories')}
                  value={allDestModalSearch}
                  onChange={(e) => setAllDestModalSearch(e.target.value)}
                  autoFocus
                  style={{
                    width: '100%', height: 40, padding: '0 14px 0 38px',
                    background: '#F5F5F5', border: '1px solid #E6E6EC',
                    borderRadius: 9999, outline: 'none', fontSize: 14,
                    fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: '500',
                    color: '#32302C', boxSizing: 'border-box',
                    transition: 'border-color 150ms ease, box-shadow 150ms ease',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = '#A2A2A7'; e.target.style.boxShadow = '0 0 0 2px rgba(50,48,44,0.1)'; }}
                  onBlur={(e) => { e.target.style.borderColor = '#E6E6EC'; e.target.style.boxShadow = 'none'; }}
                />
              </div>
            </div>

            {/* Modal category list (recursive expandable tree) */}
            <div style={{
              flex: 1, overflowY: 'auto', padding: '0 24px',
              display: 'flex', flexDirection: 'column', gap: 2,
            }}>
              {(() => {
                const mq = allDestModalSearch.trim().toLowerCase();
                const modalFiltered = mq
                  ? categories.filter(c => {
                      if (c.name.toLowerCase().includes(mq)) return true;
                      return hasMatchingDescendant(c.id, mq);
                    })
                  : categories;

                if (modalFiltered.length === 0) {
                  return (
                    <div style={{ padding: '20px 0', textAlign: 'center' }}>
                      <p style={{ margin: 0, fontSize: 14, color: '#6C6B6E', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                        {t('uploadHub.noMatchingCategories')}
                      </p>
                    </div>
                  );
                }

                // Auto-expand ancestors of matching folders (recursive)
                if (mq) {
                  const toExpand = [];
                  const findModal = (parentId) => {
                    const children = folders.filter(f => f.parentFolderId === parentId);
                    let anyMatch = false;
                    children.forEach(child => {
                      const childMatches = child.name.toLowerCase().includes(mq);
                      const descendantMatches = findModal(child.id);
                      if (childMatches || descendantMatches) {
                        if (!expandedModalCategories.has(parentId)) toExpand.push(parentId);
                        anyMatch = true;
                      }
                    });
                    return anyMatch;
                  };
                  modalFiltered.forEach(cat => findModal(cat.id));
                  if (toExpand.length > 0) {
                    Promise.resolve().then(() => setExpandedModalCategories(prev => new Set([...prev, ...toExpand])));
                  }
                }

                return modalFiltered.map(cat =>
                  renderDestinationRow(cat, 0, expandedModalCategories, setExpandedModalCategories, { closeModal: () => setShowAllDestinationsModal(false) })
                );
              })()}
            </div>

            {/* Modal footer: Create new category */}
            <div style={{
              borderTop: '1px solid #E6E6EC', padding: '16px 24px',
              flexShrink: 0,
            }}>
              <button
                onClick={() => { setShowAllDestinationsModal(false); setShowNewCategoryModal(true); }}
                style={{
                  width: '100%', height: 44, background: '#F5F5F5',
                  border: '1px solid #E6E6EC', borderRadius: 9999,
                  cursor: 'pointer', fontSize: 14, fontWeight: '600',
                  color: '#32302C', fontFamily: 'Plus Jakarta Sans, sans-serif',
                  transition: 'background 120ms ease',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#ECECEC'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#F5F5F5'; }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="#32302C" strokeWidth="1.8" strokeLinecap="round"/></svg>
                {t('uploadHub.createNewCategory')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notifications are now handled by the unified ToastProvider */}

      <NotificationPanel
        showNotificationsPopup={showNotificationsPopup}
        setShowNotificationsPopup={setShowNotificationsPopup}
      />

      {/* STANDARDIZED: Move to Category Modal */}
      {showCategoryModal && (() => {
        const identifier = showCategoryModal;

        // Determine what we're moving
        const isFolder = folders.some(f => f.id === identifier);
        const pendingFile = uploadingFiles.find(f =>
          f.status === 'pending' && (
            (f.isFolder && f.folderName === identifier) ||
            (!f.isFolder && f.file?.name === identifier)
          )
        );
        const completedFile = uploadingFiles.find(f =>
          (f.documentId === identifier || f.file?.name === identifier) && f.status === 'completed'
        );
        const existingDoc = documents.find(d => d.id === identifier);

        // Determine uploadedDocuments for pre-selection
        let uploadedDocuments = [];
        let showFilesSection = false;

        if (existingDoc) {
          uploadedDocuments = [existingDoc];
          showFilesSection = true;
        } else if (completedFile && completedFile.documentId) {
          // Find the document from documents list by documentId
          const doc = documents.find(d => d.id === completedFile.documentId);
          if (doc) {
            uploadedDocuments = [doc];
            showFilesSection = true;
          }
        } else if (pendingFile && !pendingFile.isFolder) {
          // For pending files, construct a minimal doc object
          uploadedDocuments = [{
            id: identifier,
            filename: pendingFile.file.name,
            fileSize: pendingFile.file.size
          }];
          showFilesSection = true;
        }
        // For folders and pending folder uploads, don't show FILES section

        return (
          <MoveToCategoryModal
            isOpen={true}
            onClose={() => {
              setShowCategoryModal(null);
              setSelectedCategoryId(null);
            }}
            uploadedDocuments={uploadedDocuments}
            showFilesSection={showFilesSection}
            categories={getRootFolders().filter(f => f.name.toLowerCase() !== 'recently added').map(f => ({
              ...f,
              fileCount: getDocumentCountByFolder(f.id)
            }))}
            selectedCategoryId={selectedCategoryId}
            onCategorySelect={setSelectedCategoryId}
            onCreateNew={() => {
              setShowCategoryModal(null);
              setShowNewCategoryModal(true);
            }}
            onConfirm={async () => {
              if (!selectedCategoryId) return;
              await handleAddCategory(selectedCategoryId);
            }}
          />
        );
      })()}

      {/* Create Category Modal */}
      <CreateCategoryModal
        isOpen={showNewCategoryModal}
        onClose={async () => {
          // Fetch ALL documents to check backend response
          try {
            const response = await api.get('/api/documents');
          } catch (error) {
          }

          setShowNewCategoryModal(false);
        }}
        onCreateCategory={handleCreateCategory}
        uploadedDocuments={[]}
        allDocuments={contextDocuments}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setItemToDelete(null);
        }}
        onConfirm={() => {
          if (!itemToDelete) return;

          // Save reference before clearing state
          const itemToDeleteCopy = itemToDelete;

          // Close modal AND clear state IMMEDIATELY for instant feedback
          setShowDeleteModal(false);
          setItemToDelete(null);

          // Delete in background
          (async () => {
            try {
              if (itemToDeleteCopy.type === 'folder') {
                await handleDeleteFolder(itemToDeleteCopy.id);
              } else if (itemToDeleteCopy.type === 'document') {
                await handleDeleteDocument(itemToDeleteCopy.id);
              } else if (itemToDeleteCopy.type === 'uploadedFile') {
                await api.delete(`/api/documents/${itemToDeleteCopy.documentId}`);
                setOpenDropdownId(null);
                removeUploadingFile(itemToDeleteCopy.isFolder ? itemToDeleteCopy.folderName : itemToDeleteCopy.name);
                setDocuments(prev => prev.filter(doc => doc.id !== itemToDeleteCopy.documentId));
                showDeleteSuccess('file');
              }
            } catch (error) {
              showError(t('alerts.failedToDeleteItem', { error: error.response?.data?.error || error.message }));
            }
          })();
        }}
        itemName={itemToDelete?.name || 'this item'}
        itemType={itemToDelete?.type || 'item'}
      />

      {/* Rename Modal */}
      <RenameModal
        isOpen={showRenameModal}
        onClose={() => {
          setShowRenameModal(false);
          setItemToRename(null);
        }}
        onConfirm={async (newName) => {
          if (!itemToRename) return;

          try {
            if (itemToRename.type === 'folder') {
              // Update folder name via API
              await api.patch(`/api/folders/${itemToRename.id}`, { name: newName });

              // Update folders list
              setFolders(prev => prev.map(folder =>
                folder.id === itemToRename.id ? { ...folder, name: newName } : folder
              ));
            } else {
              // Update document name via API
              await api.patch(`/api/documents/${itemToRename.id}`, { filename: newName });

              // Update local state for uploading files
              setUploadingFiles(prev => prev.map(file =>
                file.documentId === itemToRename.id ? { ...file, file: { ...file.file, name: newName } } : file
              ));

              // Update documents list
              setDocuments(prev => prev.map(doc =>
                doc.id === itemToRename.id ? { ...doc, filename: newName } : doc
              ));
            }

            setShowRenameModal(false);
            setItemToRename(null);
          } catch (error) {
            showError(t('alerts.failedToRenameItem', { type: itemToRename.type === 'folder' ? t('common.folder') : t('common.file') }));
          }
        }}
        itemName={itemToRename?.name}
        itemType={itemToRename?.type}
      />

      {/* Create Folder Modal */}
      <CreateFolderModal
        isOpen={showCreateFolderModal}
        onClose={() => setShowCreateFolderModal(false)}
        onConfirm={async (folderName) => {
          try {
            // Create folder via API
            const response = await api.post('/api/folders', { name: folderName });
            const newFolder = response.data?.folder || response.data;

            // Add to folders list
            setFolders(prev => [...prev, newFolder]);
            setShowCreateFolderModal(false);
          } catch (error) {
            showError(t('alerts.failedToCreateFolder', { error: error.response?.data?.error || error.message }));
          }
        }}
      />

      {/* Search Modal */}
      <SearchModal />

      {/* Folder Browser Modal */}
      <FolderBrowserModal
        isOpen={folderBrowserModal.isOpen}
        onClose={handleCloseFolderBrowser}
        folderName={folderBrowserModal.folderName}
        files={folderBrowserModal.files}
        onRemoveFile={handleRemoveFileFromFolder}
      />

      {/* Document Scanner (mobile only) */}
      <DocumentScanner
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScanComplete={handleScanComplete}
      />

      {/* Animation Keyframes */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes slideDown {
          from {
            transform: translateX(-50%) translateY(-20px);
            opacity: 0;
          }
          to {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
          }
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes progress-shimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }

        /* Mobile Responsiveness */
        @media (max-width: 768px) {
          .upload-modal {
            width: 100% !important;
            height: 100vh !important;
            border-radius: 0 !important;
            flex-direction: column !important;
          }
        }
      `}} />
    </div>
  );
};

export default UploadHub;
