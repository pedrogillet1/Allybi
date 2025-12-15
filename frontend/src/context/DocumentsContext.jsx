import React, { createContext, useContext, useState, useCallback, useEffect, useRef, startTransition } from 'react';
import { io } from 'socket.io-client';
import api from '../services/api';
import { encryptData, decryptData } from '../utils/encryption';
import { useAuth } from './AuthContext';

const DocumentsContext = createContext();

export const useDocuments = () => {
  const context = useContext(DocumentsContext);
  if (!context) {
    throw new Error('useDocuments must be used within DocumentsProvider');
  }
  return context;
};

export const DocumentsProvider = ({ children }) => {
  const { encryptionPassword, isAuthenticated } = useAuth(); // ⚡ ZERO-KNOWLEDGE ENCRYPTION + Auth check
  const [documents, setDocuments] = useState([]);
  const [folders, setFolders] = useState([]);
  const [recentDocuments, setRecentDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // ✅ OPTIMIZATION: Frontend caching with 30s TTL (5s → <500ms for screen switches)
  const cacheRef = useRef({
    data: null,
    timestamp: 0
  });
  const CACHE_TTL = 30000; // 30 seconds

  // ✅ FIX #1: Upload Registry - Protects uploads for 30 seconds (not 5)
  // This prevents race conditions where refetches remove recently uploaded docs
  const uploadRegistryRef = useRef(new Map());
  const UPLOAD_PROTECTION_WINDOW = 30000; // 30 seconds protection

  // ✅ FIX #2: Refetch Coordinator - Batches and deduplicates refetch requests
  const refetchCoordinatorRef = useRef({
    pending: false,
    types: new Set(),
    timeout: null,
    lastRefetch: 0
  });
  const REFETCH_BATCH_DELAY = 1500; // ✅ FIX: Wait 1.5s to batch requests (was 500ms) - allows all documents to be created
  const REFETCH_COOLDOWN = 3000; // ✅ FIX: Minimum 3s between refetches (was 2s) - prevents count fluctuation

  // Fetch all documents
  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const timestamp = new Date().getTime();
      const response = await api.get(`/api/documents?_t=${timestamp}`);
      const fetchedDocs = response.data.documents || [];


      const docsByFolder = {};
      fetchedDocs.forEach(d => {
        const folderId = d.folderId || 'NO_FOLDER';
        if (!docsByFolder[folderId]) {
          docsByFolder[folderId] = [];
        }
        docsByFolder[folderId].push(d.filename);
      });
      Object.keys(docsByFolder).forEach(fId => {

      });

      // ✅ FIX #1: Use Upload Registry to protect recently uploaded documents (30s window)
      setDocuments(prev => {
        const now = Date.now();

        // Keep temp docs (status='uploading' or id starts with 'temp-')
        const tempDocs = prev.filter(doc => doc.status === 'uploading' || doc.id?.startsWith('temp-'));

        // ✅ FIX: Check Upload Registry for protected documents (30 second window)
        const registryProtectedDocs = prev.filter(doc => {
          if (doc.id?.startsWith('temp-')) return false; // Already in tempDocs

          const registryEntry = uploadRegistryRef.current.get(doc.id);
          if (!registryEntry) return false;

          const age = now - registryEntry.uploadedAt;
          const isProtected = age < UPLOAD_PROTECTION_WINDOW;
          const notInFetched = !fetchedDocs.find(fd => fd.id === doc.id);

          if (isProtected && notInFetched) {
            return true;
          }

          // Clean up expired entries
          if (!isProtected) {
            uploadRegistryRef.current.delete(doc.id);
          }

          return false;
        });

        // Also keep recently uploaded docs that might not be in registry (fallback)
        const recentDocs = prev.filter(doc => {
          if (doc.id?.startsWith('temp-')) return false;
          if (uploadRegistryRef.current.has(doc.id)) return false; // Already in registry
          if (!doc.createdAt) return false;

          const docAge = now - new Date(doc.createdAt).getTime();
          const isRecent = docAge < UPLOAD_PROTECTION_WINDOW; // Use 30s window
          const isProcessing = doc.status === 'processing' || doc.status === 'completed' || doc.status === 'uploading';
          const notInFetched = !fetchedDocs.find(fd => fd.id === doc.id);

          if (isRecent && isProcessing && notInFetched) {
          }

          return isRecent && isProcessing && notInFetched;
        });

        // Merge: temp docs + registry protected + recent docs + fetched docs (deduplicated)
        const fetchedIds = new Set(fetchedDocs.map(d => d.id));
        const protectedDocs = [...tempDocs, ...registryProtectedDocs, ...recentDocs].filter(d => !fetchedIds.has(d.id));
        const mergedDocs = [...protectedDocs, ...fetchedDocs];

        const protectedCount = tempDocs.length + registryProtectedDocs.length + recentDocs.length;
        if (protectedCount > 0) {

        }
        return mergedDocs;
      });
    } catch (error) {

      // If auth error or rate limit, stop making more requests
      if (error.response?.status === 401 ||
          error.response?.status === 429 ||
          error.message?.includes('refresh')) {
        return;
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch all folders
  const fetchFolders = useCallback(async () => {
    try {
      const timestamp = new Date().getTime();
      // IMPORTANT: Pass includeAll=true to get ALL folders (including subfolders) in flat list
      // Backend will calculate totalDocuments for each folder recursively
      const response = await api.get(`/api/folders?includeAll=true&_t=${timestamp}`);
      let fetchedFolders = response.data.folders || [];

      // ⚡ ZERO-KNOWLEDGE ENCRYPTION: Decrypt folder names
      if (encryptionPassword && fetchedFolders.length > 0) {
        fetchedFolders = await Promise.all(
          fetchedFolders.map(async (folder) => {
            if (folder.nameEncrypted && folder.encryptionSalt) {
              try {
                const encryptedData = {
                  salt: folder.encryptionSalt,
                  iv: folder.encryptionIV,
                  ciphertext: folder.nameEncrypted,
                  authTag: folder.encryptionAuthTag,
                };
                const decryptedName = await decryptData(encryptedData, encryptionPassword);
                return { ...folder, name: decryptedName };
              } catch (error) {

                return folder; // Return original if decryption fails
              }
            }
            return folder;
          })
        );
      }

      fetchedFolders.forEach(f => {

      });

      // ✅ FIX: Preserve optimistic counts if they're higher than backend counts
      // This prevents count fluctuation during bulk uploads where documents are still being created
      setFolders(prevFolders => {
        return fetchedFolders.map(fetchedFolder => {
          const prevFolder = prevFolders.find(pf => pf.id === fetchedFolder.id);
          if (prevFolder && prevFolder._count) {
            const prevTotal = prevFolder._count.totalDocuments || 0;
            const fetchedTotal = fetchedFolder._count?.totalDocuments || 0;

            // If previous optimistic count is higher, preserve it temporarily
            // This happens when documents are being uploaded but haven't all committed to DB yet
            if (prevTotal > fetchedTotal) {

              return {
                ...fetchedFolder,
                _count: {
                  ...fetchedFolder._count,
                  documents: Math.max(prevFolder._count.documents || 0, fetchedFolder._count?.documents || 0),
                  totalDocuments: prevTotal
                }
              };
            }
          }
          return fetchedFolder;
        });
      });
    } catch (error) {

      // If auth error or rate limit, stop making more requests
      if (error.response?.status === 401 ||
          error.response?.status === 429 ||
          error.message?.includes('refresh')) {
        return;
      }
    }
  }, [encryptionPassword]);

  // Fetch recent documents (use existing endpoint with limit)
  const fetchRecentDocuments = useCallback(async () => {
    try {
      const response = await api.get('/api/documents?limit=5');
      setRecentDocuments(response.data.documents || []);
    } catch (error) {

      // If auth error or rate limit, stop making more requests
      if (error.response?.status === 401 ||
          error.response?.status === 429 ||
          error.message?.includes('refresh')) {
        return;
      }
    }
  }, []);

  // ✅ OPTIMIZATION: Fetch all initial data in a single batched request with caching
  const fetchAllData = useCallback(async (forceRefresh = false) => {
    const now = Date.now();

    // ✅ Check cache first (unless force refresh)
    if (!forceRefresh && cacheRef.current.data && (now - cacheRef.current.timestamp) < CACHE_TTL) {
      const cacheAge = Math.round((now - cacheRef.current.timestamp) / 1000);

      const { documents: cachedDocs, folders: cachedFolders, recentDocuments: cachedRecent } = cacheRef.current.data;

      // ✅ OPTIMIZATION: Use startTransition for cached data too
      startTransition(() => {
        setDocuments(cachedDocs);
        setFolders(cachedFolders);
        setRecentDocuments(cachedRecent);
      });
      return;
    }

    setLoading(true);
    try {

      const startTime = Date.now();

      const response = await api.get('/api/batch/initial-data');
      const { documents: fetchedDocs, folders: fetchedFolders, recentDocuments: fetchedRecent, meta } = response.data;

      const duration = Date.now() - startTime;


      // Decrypt folder names if encryption is enabled
      let decryptedFolders = fetchedFolders;
      if (encryptionPassword && fetchedFolders.length > 0) {
        const decryptStart = Date.now();
        decryptedFolders = await Promise.all(
          fetchedFolders.map(async (folder) => {
            if (folder.nameEncrypted && folder.encryptionSalt) {
              try {
                const encryptedData = {
                  salt: folder.encryptionSalt,
                  iv: folder.encryptionIV,
                  ciphertext: folder.nameEncrypted,
                  authTag: folder.encryptionAuthTag,
                };
                const decryptedName = await decryptData(encryptedData, encryptionPassword);
                return { ...folder, name: decryptedName };
              } catch (error) {

                return folder;
              }
            }
            return folder;
          })
        );
        const decryptTime = Date.now() - decryptStart;

      }

      // ✅ Cache the result
      cacheRef.current = {
        data: {
          documents: fetchedDocs,
          folders: decryptedFolders,
          recentDocuments: fetchedRecent
        },
        timestamp: now
      };

      // ✅ OPTIMIZATION: Use startTransition for non-urgent state updates (save 500ms-1s)
      // This allows React to prioritize urgent updates like user input
      startTransition(() => {
        setDocuments(fetchedDocs);
        setFolders(decryptedFolders);
        setRecentDocuments(fetchedRecent);
      });

    } catch (error) {

      // Fallback to individual requests if batch fails

      await Promise.all([
        fetchDocuments(),
        fetchFolders(),
        fetchRecentDocuments()
      ]);
    } finally {
      setLoading(false);
    }
  }, [encryptionPassword, fetchDocuments, fetchFolders, fetchRecentDocuments]);

  // ✅ Cache invalidation function
  const invalidateCache = useCallback(() => {
    cacheRef.current = { data: null, timestamp: 0 };

  }, []);

  // ✅ FIX #2: Smart Refetch Coordinator - Batches multiple refetch requests
  const smartRefetch = useCallback((types = ['all']) => {
    const coordinator = refetchCoordinatorRef.current;
    const now = Date.now();

    // Add requested types to pending set
    types.forEach(type => coordinator.types.add(type));

    // Check cooldown
    if (now - coordinator.lastRefetch < REFETCH_COOLDOWN) {
      return;
    }

    // If already pending, just let it batch
    if (coordinator.pending) {

      return;
    }

    coordinator.pending = true;

    // Clear any existing timeout
    if (coordinator.timeout) {
      clearTimeout(coordinator.timeout);
    }

    // Wait for batch delay, then execute
    coordinator.timeout = setTimeout(async () => {
      const typesToFetch = Array.from(coordinator.types);

      // Reset coordinator state
      coordinator.types.clear();
      coordinator.pending = false;
      coordinator.lastRefetch = Date.now();

      // Execute appropriate fetches
      if (typesToFetch.includes('all')) {
        await fetchAllData(true); // Force refresh
      } else {
        const promises = [];
        if (typesToFetch.includes('documents')) {
          promises.push(fetchDocuments());
          promises.push(fetchRecentDocuments());
        }
        if (typesToFetch.includes('folders')) {
          promises.push(fetchFolders());
        }
        await Promise.all(promises);
      }
    }, REFETCH_BATCH_DELAY);
  }, [fetchAllData, fetchDocuments, fetchFolders, fetchRecentDocuments]);

  // Initialize data on mount
  useEffect(() => {
    // ✅ FIX: Only load data if user is authenticated
    if (!initialized && isAuthenticated) {
      // ✅ OPTIMIZATION: Use batched endpoint (1 request instead of 3)
      fetchAllData();
      setInitialized(true);
    }
  }, [initialized, isAuthenticated, fetchAllData]);

  // ✅ FIX: Flag to pause auto-refresh during file selection/upload
  const pauseAutoRefreshRef = useRef(false);

  // Function to pause auto-refresh (call this when opening file picker)
  const pauseAutoRefresh = useCallback(() => {

    pauseAutoRefreshRef.current = true;
    // Auto-resume after 10 seconds in case something goes wrong
    setTimeout(() => {
      if (pauseAutoRefreshRef.current) {

        pauseAutoRefreshRef.current = false;
      }
    }, 10000);
  }, []);

  // Function to resume auto-refresh (call this after file selection completes)
  const resumeAutoRefresh = useCallback(() => {

    pauseAutoRefreshRef.current = false;
  }, []);

  // Auto-refresh data when window regains focus or becomes visible (with debounce)
  useEffect(() => {
    let refreshTimeout = null;
    let lastRefresh = 0;
    const REFRESH_COOLDOWN = 5000; // ⚡ FIX: 5 seconds to prevent overwriting optimistic updates
    const REFRESH_DELAY = 1000; // ⚡ FIX: Wait 1 second before refreshing to allow database replication

    const debouncedRefresh = () => {
      // ✅ FIX: Skip refresh if paused (during file selection)
      if (pauseAutoRefreshRef.current) {

        return;
      }

      const now = Date.now();
      if (now - lastRefresh < REFRESH_COOLDOWN) {

        return;
      }

      // ⚡ FIX: Delay refresh to give database time to replicate data
      if (refreshTimeout) clearTimeout(refreshTimeout);
      refreshTimeout = setTimeout(() => {
        // Double-check pause state after delay
        if (pauseAutoRefreshRef.current) {

          return;
        }
        lastRefresh = Date.now();

        // ✅ OPTIMIZATION: Use batched endpoint for refresh
        fetchAllData();
      }, REFRESH_DELAY);
    };

    const handleVisibilityChange = () => {
      // ✅ FIX: Only refresh if authenticated and initialized
      if (!document.hidden && initialized && isAuthenticated) {

        debouncedRefresh();
      }
    };

    const handleFocus = () => {
      // ✅ FIX: Only refresh if authenticated and initialized
      if (initialized && isAuthenticated) {

        debouncedRefresh();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      if (refreshTimeout) clearTimeout(refreshTimeout);
    };
  }, [initialized, isAuthenticated, fetchAllData]);

  // WebSocket real-time auto-refresh
  const socketRef = useRef(null);

  useEffect(() => {
    // ✅ FIX: Only initialize WebSocket if authenticated and initialized
    if (!initialized || !isAuthenticated) return;

    // Get auth token
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    // Get user ID from localStorage (set during login)
    const userStr = localStorage.getItem('user');
    let userId = null;
    if (userStr && userStr !== 'undefined') {
      try {
        userId = JSON.parse(userStr).id;
      } catch (e) {

      }
    }
    if (!userId) {

      return;
    }

    const apiUrl = process.env.REACT_APP_API_URL || 'https://getkoda.ai';

    // Initialize socket connection
    const socket = io(apiUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      timeout: 20000,
      forceNew: false
    });

    socketRef.current = socket;

    socket.on('connect', () => {

      // Join user-specific room for targeted events
      socket.emit('join-user-room', userId);

    });

    socket.on('disconnect', () => {

    });

    // Debounced refresh to prevent multiple rapid refreshes
    let documentRefreshTimeout = null;
    let folderRefreshTimeout = null;

    const debouncedDocumentRefresh = () => {
      if (documentRefreshTimeout) clearTimeout(documentRefreshTimeout);
      documentRefreshTimeout = setTimeout(() => {

        fetchDocuments();
        fetchRecentDocuments();
      }, 100); // Wait 100ms before refreshing (reduced from 500ms for instant feel)
    };

    const debouncedFolderRefresh = () => {
      if (folderRefreshTimeout) clearTimeout(folderRefreshTimeout);
      folderRefreshTimeout = setTimeout(() => {

        fetchFolders();
      }, 100); // Wait 100ms before refreshing (reduced from 500ms for instant feel)
    };

    // Listen for document processing updates
    // 🔥 FIX: This is the ONLY event needed for progress tracking
    // Backend emits document-processing-update for ALL stages including completion and failure
    socket.on('document-processing-update', (data) => {

      // ✅ Update document with progress information
      setDocuments((prevDocs) => {
        return prevDocs.map((doc) => {
          if (doc.id === data.documentId) {

            return {
              ...doc,
              status: data.status || doc.status,
              processingProgress: data.progress,
              processingStage: data.stage,
              processingMessage: data.message,
              // 🔥 FIX: Include error message for failed documents
              errorMessage: data.status === 'failed' ? (data.error || data.message) : doc.errorMessage,
              // Remove temporary flag if completed or failed
              isTemporary: (data.status === 'completed' || data.status === 'failed') ? false : doc.isTemporary,
            };
          }
          return doc;
        });
      });

      // Also update recent documents if they're loaded
      setRecentDocuments((prevRecent) => {
        return prevRecent.map((doc) => {
          if (doc.id === data.documentId) {
            return {
              ...doc,
              status: data.status || doc.status,
              processingProgress: data.progress,
              processingStage: data.stage,
              processingMessage: data.message,
              // 🔥 FIX: Include error message for failed documents
              errorMessage: data.status === 'failed' ? (data.error || data.message) : doc.errorMessage,
            };
          }
          return doc;
        });
      });

      // ✅ FIX #2: Use Smart Refetch Coordinator for batched, rate-limited refetching
      // 🔥 FIX: Also refresh on failure to ensure UI reflects final state
      if (data.progress === 100 || data.stage === 'complete' || data.stage === 'completed' || data.status === 'failed') {
        // Use smartRefetch to batch and rate-limit
        setTimeout(() => smartRefetch(['documents']), 500);
      }
    });

    // 🔥 DEPRECATED: These events are no longer emitted by backend
    // Backend now uses document-processing-update with terminal stages (status='completed' or 'failed')
    // Kept for backward compatibility but these handlers will never be called
    socket.on('document-processing-complete', (data) => {
      // Legacy handler - backend no longer emits this event
      smartRefetch(['documents']);
    });

    socket.on('document-processing-failed', (data) => {
      // Legacy handler - backend no longer emits this event
      // If somehow received, update document status
      setDocuments((prevDocs) =>
        prevDocs.map((doc) =>
          doc.id === data.documentId
            ? { ...doc, status: 'failed', errorMessage: data.error }
            : doc
        )
      );

      setRecentDocuments((prevRecent) =>
        prevRecent.map((doc) =>
          doc.id === data.documentId
            ? { ...doc, status: 'failed', errorMessage: data.error }
            : doc
        )
      );
    });

    // ⚡ OPTIMIZED: Removed debounced refreshes - we use optimistic updates instead
    // These WebSocket events are kept for logging but don't trigger refetches
    socket.on('documents-changed', () => {

      // No refresh - optimistic update already happened
    });

    socket.on('folders-changed', () => {

      // No refresh - optimistic update already happened
    });

    socket.on('document-created', (newDocument) => {

      // ✅ FIX: Add the new document to the state immediately
      // This ensures that the document appears in the UI without a full refresh
      if (newDocument && newDocument.id) {
        setDocuments(prev => {
          // Avoid duplicates
          if (prev.find(d => d.id === newDocument.id)) {
            return prev;
          }
          return [newDocument, ...prev];
        });

        // ✅ FIX: Update folder document count when document is added
        if (newDocument.folderId) {
          setFolders(prev => prev.map(folder => {
            if (folder.id === newDocument.folderId) {
              return {
                ...folder,
                _count: {
                  ...folder._count,
                  documents: (folder._count?.documents || 0) + 1,
                  totalDocuments: (folder._count?.totalDocuments || 0) + 1,
                }
              };
            }
            return folder;
          }));
        }
      }

      // ✅ Invalidate cache so next fetchAllData() gets fresh data
      invalidateCache();
    });

    socket.on('document-deleted', () => {

      // No refresh - optimistic update already happened
      invalidateCache();
    });

    socket.on('document-moved', () => {

      // No refresh - optimistic update already happened in moveToFolder()
      invalidateCache();
    });

    socket.on('folder-created', () => {

      // ✅ FIX: Invalidate cache AND use smartRefetch to batch folder updates
      // This prevents race conditions when multiple folders/documents are created
      invalidateCache();
      smartRefetch(['folders']);
    });

    socket.on('folder-deleted', () => {

      // ✅ FIX: Invalidate cache only, no immediate refetch
      // Optimistic updates already handled deletion in the originating tab
      // For other tabs, the next natural fetch will get fresh data
      invalidateCache();
    });

    // ⚡ NEW: Listen for folder tree updates (emitted after cache invalidation completes)
    socket.on('folder-tree-updated', (data) => {

      invalidateCache();
      // ✅ FIX: Use smartRefetch to batch folder updates and prevent race conditions
      smartRefetch(['folders']);
    });

    // ⚡ NEW: Listen for processing complete events (emitted after database commit completes)
    socket.on('processing-complete', (data) => {
      // ✅ FIX: Backend sends 'documentId', not 'id' - handle both for compatibility
      const docId = data?.documentId || data?.id;

      // ✅ FIX: Update the document in the state to 'completed'
      if (docId) {
        setDocuments(prev => prev.map(doc =>
          doc.id === docId ? { ...doc, ...data, id: docId, status: 'completed' } : doc
        ));
      }

      // ✅ FIX: Use smartRefetch to batch folder updates - prevents count fluctuation
      // when multiple documents complete processing simultaneously
      smartRefetch(['folders']);
    });

    // Listen for document uploads from FileContext
    const handleDocumentUploaded = () => {

      // ✅ INSTANT UPLOAD FIX: Don't fetch - optimistic update already added the document!
      // The addDocument() function already handles optimistic updates
      // Fetching here would overwrite the optimistic update and make the document disappear

    };

    window.addEventListener('document-uploaded', handleDocumentUploaded);

    return () => {

      socket.off('document-processing-update');
      socket.off('document-processing-complete');
      socket.off('document-processing-failed');
      socket.off('documents-changed');
      socket.off('folders-changed');
      socket.off('document-created');
      socket.off('document-deleted');
      socket.off('document-moved');
      socket.off('folder-created');
      socket.off('folder-deleted');
      socket.off('folder-tree-updated');
      socket.off('processing-complete');
      socket.disconnect();
      window.removeEventListener('document-uploaded', handleDocumentUploaded);
    };
  }, [initialized, isAuthenticated, fetchDocuments, fetchFolders, fetchRecentDocuments, fetchAllData, smartRefetch, invalidateCache]);

  // ✅ FIX #3: Upload Verification - Polls backend to verify document exists
  const startUploadVerification = useCallback((documentId, filename) => {
    let retries = 0;
    const maxRetries = 10;
    const baseDelay = 2000; // Start polling after 2s

    const verify = async () => {
      try {
        const response = await api.get(`/api/documents/${documentId}`);
        if (response.data && response.data.id) {

          // Update registry status
          const entry = uploadRegistryRef.current.get(documentId);
          if (entry) {
            entry.status = 'verified';
            entry.verified = true;
          }

          // Ensure document is in state (in case it was removed by race condition)
          setDocuments(prev => {
            const exists = prev.some(d => d.id === documentId);
            if (!exists) {

              return [response.data, ...prev];
            }
            // Update with latest data from server
            return prev.map(d => d.id === documentId ? { ...d, ...response.data } : d);
          });

          return true;
        }
      } catch (error) {
        // Document not found yet - this is expected during replication lag
        if (error.response?.status === 404) {
          retries++;
          if (retries < maxRetries) {
            const delay = Math.min(baseDelay * Math.pow(1.5, retries), 10000); // Exponential backoff, max 10s

            setTimeout(verify, delay);
            return;
          }

        } else {

        }
      }
    };

    // Start verification after initial delay (allow for replication)
    setTimeout(verify, baseDelay);
  }, []);

  // Add document (optimistic)
  const addDocument = useCallback(async (file, folderId = null) => {

    // Create temporary document object (matches backend Document schema)
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    const tempDocument = {
      id: tempId,
      filename: file.name, // ⚡ FIX: Use 'filename' to match backend schema
      fileSize: file.size, // ⚡ FIX: Use 'fileSize' to match backend schema
      mimeType: file.type || 'application/octet-stream', // ⚡ FIX: Use 'mimeType'
      folderId: folderId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'uploading',
      // Legacy fields for backward compatibility (in case UI uses them)
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream'
    };

    // Add to UI IMMEDIATELY (optimistic update)
    setDocuments(prev => {

      return [tempDocument, ...prev];
    });
    setRecentDocuments(prev => [tempDocument, ...prev.slice(0, 4)]);

    try {
      // Get upload URL from backend

      const uploadUrlResponse = await api.post('/api/documents/upload-url', {
        fileName: file.name,
        fileType: file.type,
        folderId: folderId
      });

      const { uploadUrl, documentId, encryptedFilename } = uploadUrlResponse.data;

      // Calculate file hash
      const calculateFileHash = async (file) => {
        const arrayBuffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      };

      const fileHash = await calculateFileHash(file);

      // Upload directly to S3

      const s3Response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
          'x-amz-server-side-encryption': 'AES256' // Required by S3 presigned URL signature
        },
        body: file
      });

      if (!s3Response.ok) {
        throw new Error(`S3 upload failed: ${s3Response.status} ${s3Response.statusText}`);
      }

      // Confirm upload with backend - send required metadata

      const confirmResponse = await api.post(`/api/documents/${documentId}/confirm-upload`, {
        encryptedFilename,
        filename: file.name,
        mimeType: file.type,
        fileSize: file.size,
        fileHash,
        folderId
      });

      const newDocument = confirmResponse.data.document;

      // ✅ FIX #1: Add to Upload Registry for 30s protection
      uploadRegistryRef.current.set(newDocument.id, {
        uploadedAt: Date.now(),
        filename: newDocument.filename,
        status: 'processing',
        verified: false
      });

      // Replace temp document with real one
      setDocuments(prev => {
        const updated = prev.map(doc => doc.id === tempId ? newDocument : doc);

        return updated;
      });
      setRecentDocuments(prev =>
        prev.map(doc => doc.id === tempId ? newDocument : doc)
      );

      // ⚡ INSTANT UPDATE: Increment folder count immediately
      if (newDocument.folderId) {
        setFolders(prev => prev.map(folder => {
          if (folder.id === newDocument.folderId) {
            return {
              ...folder,
              _count: {
                ...folder._count,
                documents: (folder._count?.documents || 0) + 1,
                totalDocuments: (folder._count?.totalDocuments || 0) + 1
              }
            };
          }
          return folder;
        }));

      }

      // ✅ FIX #3: Start background verification
      startUploadVerification(newDocument.id, newDocument.filename);

      // Invalidate settings cache (storage stats need to be recalculated)
      sessionStorage.removeItem('koda_settings_documents');
      sessionStorage.removeItem('koda_settings_fileData');
      sessionStorage.removeItem('koda_settings_totalStorage');

      return newDocument;
    } catch (error) {


      // Remove temp document on error
      setDocuments(prev => {
        const updated = prev.filter(doc => doc.id !== tempId);

        return updated;
      });
      setRecentDocuments(prev => prev.filter(doc => doc.id !== tempId));

      throw error;
    }
  }, [startUploadVerification]);

  // Delete document (optimistic with proper error handling)
  const deleteDocument = useCallback(async (documentId) => {

    // Store document for potential rollback
    const documentToDelete = documents.find(d => d.id === documentId);

    if (!documentToDelete) {

      throw new Error('Document not found');
    }

    // ⚡ PREVENT DUPLICATE DELETES: Check if document is already being deleted
    if (documentToDelete.isDeleting) {

      return { success: false, message: 'Delete already in progress' };
    }

    // Mark as deleting to prevent duplicate attempts
    setDocuments(prev => prev.map(doc =>
      doc.id === documentId ? { ...doc, isDeleting: true } : doc
    ));

    // Remove from UI IMMEDIATELY (optimistic update)
    setDocuments(prev => {
      const updated = prev.filter(doc => doc.id !== documentId);

      return updated;
    });
    setRecentDocuments(prev => {
      const updated = prev.filter(doc => doc.id !== documentId);

      return updated;
    });

    // ⚡ INSTANT UPDATE: Decrement folder count immediately
    if (documentToDelete.folderId) {
      setFolders(prev => prev.map(folder => {
        if (folder.id === documentToDelete.folderId) {
          return {
            ...folder,
            _count: {
              ...folder._count,
              documents: Math.max(0, (folder._count?.documents || 0) - 1),
              totalDocuments: Math.max(0, (folder._count?.totalDocuments || 0) - 1)
            }
          };
        }
        return folder;
      }));

    }

    try {
      // Delete on server

      const response = await api.delete(`/api/documents/${documentId}`);

      // Invalidate settings cache (storage stats need to be recalculated)
      sessionStorage.removeItem('koda_settings_documents');
      sessionStorage.removeItem('koda_settings_fileData');
      sessionStorage.removeItem('koda_settings_totalStorage');

      // ✅ FIX: Invalidate data cache to prevent stale data from reappearing on window focus
      invalidateCache();

      // Return success
      return { success: true, document: documentToDelete };
    } catch (error) {

      // Rollback: Restore document to UI (clear isDeleting flag)

      setDocuments(prev => {
        // Insert document back in its original position (at the beginning for simplicity)
        // Clear isDeleting flag so user can retry
        const restoredDoc = { ...documentToDelete, isDeleting: false };
        const restored = [restoredDoc, ...prev];

        return restored;
      });
      setRecentDocuments(prev => {
        const restored = [documentToDelete, ...prev].slice(0, 5);

        return restored;
      });

      // ⚡ ROLLBACK: Restore folder count
      if (documentToDelete.folderId) {
        setFolders(prev => prev.map(folder => {
          if (folder.id === documentToDelete.folderId) {
            return {
              ...folder,
              _count: {
                ...folder._count,
                documents: (folder._count?.documents || 0) + 1,
                totalDocuments: (folder._count?.totalDocuments || 0) + 1
              }
            };
          }
          return folder;
        }));

      }

      // Throw error with user-friendly message
      const errorMessage = error.response?.data?.error || error.message || 'Failed to delete document';
      const userError = new Error(errorMessage);
      userError.originalError = error;
      userError.documentId = documentId;
      userError.filename = documentToDelete.filename;

      throw userError;
    }
  }, [documents, invalidateCache]);

  // Move document to folder (optimistic)
  const moveToFolder = useCallback(async (documentId, newFolderId) => {
    // Store old document for rollback
    const oldDocument = documents.find(d => d.id === documentId);
    const oldFolderId = oldDocument?.folderId;

    // Update UI IMMEDIATELY
    setDocuments(prev =>
      prev.map(doc =>
        doc.id === documentId
          ? { ...doc, folderId: newFolderId }
          : doc
      )
    );
    setRecentDocuments(prev =>
      prev.map(doc =>
        doc.id === documentId
          ? { ...doc, folderId: newFolderId }
          : doc
      )
    );

    // ⚡ INSTANT UPDATE: Update folder counts for both source and destination
    if (oldFolderId !== newFolderId) {
      setFolders(prev => prev.map(folder => {
        // Decrement count from old folder
        if (folder.id === oldFolderId) {
          const newCount = Math.max(0, (folder._count?.documents || 0) - 1);
          const newTotalCount = Math.max(0, (folder._count?.totalDocuments || 0) - 1);

          return {
            ...folder,
            _count: {
              ...folder._count,
              documents: newCount,
              totalDocuments: newTotalCount
            }
          };
        }

        // Increment count in new folder
        if (folder.id === newFolderId) {
          const newCount = (folder._count?.documents || 0) + 1;
          const newTotalCount = (folder._count?.totalDocuments || 0) + 1;

          return {
            ...folder,
            _count: {
              ...folder._count,
              documents: newCount,
              totalDocuments: newTotalCount
            }
          };
        }

        return folder;
      }));
    }

    try {
      // Update on server in background
      await api.patch(`/api/documents/${documentId}`, {
        folderId: newFolderId
      });

      // ✅ FIX: Invalidate cache after successful move
      invalidateCache();

    } catch (error) {

      // Revert on error
      if (oldDocument) {
        setDocuments(prev =>
          prev.map(doc =>
            doc.id === documentId ? oldDocument : doc
          )
        );
        setRecentDocuments(prev =>
          prev.map(doc =>
            doc.id === documentId ? oldDocument : doc
          )
        );

        // ⚡ ROLLBACK: Restore folder counts
        if (oldFolderId !== newFolderId) {
          setFolders(prev => prev.map(folder => {
            // Restore old folder count (increment back)
            if (folder.id === oldFolderId) {
              return {
                ...folder,
                _count: {
                  ...folder._count,
                  documents: (folder._count?.documents || 0) + 1,
                  totalDocuments: (folder._count?.totalDocuments || 0) + 1
                }
              };
            }

            // Restore new folder count (decrement back)
            if (folder.id === newFolderId) {
              return {
                ...folder,
                _count: {
                  ...folder._count,
                  documents: Math.max(0, (folder._count?.documents || 0) - 1),
                  totalDocuments: Math.max(0, (folder._count?.totalDocuments || 0) - 1)
                }
              };
            }

            return folder;
          }));

        }
      }

      throw error;
    }
  }, [documents, folders, invalidateCache]); // Add folders and invalidateCache to dependencies

  // Rename document (optimistic)
  const renameDocument = useCallback(async (documentId, newName) => {
    // Store old document for rollback
    const oldDocument = documents.find(d => d.id === documentId);

    // Update UI IMMEDIATELY
    setDocuments(prev =>
      prev.map(doc =>
        doc.id === documentId
          ? { ...doc, filename: newName }
          : doc
      )
    );
    setRecentDocuments(prev =>
      prev.map(doc =>
        doc.id === documentId
          ? { ...doc, filename: newName }
          : doc
      )
    );

    try {
      // Update on server in background
      await api.patch(`/api/documents/${documentId}`, {
        filename: newName
      });
    } catch (error) {

      // Revert on error
      if (oldDocument) {
        setDocuments(prev =>
          prev.map(doc =>
            doc.id === documentId ? oldDocument : doc
          )
        );
        setRecentDocuments(prev =>
          prev.map(doc =>
            doc.id === documentId ? oldDocument : doc
          )
        );
      }

      throw error;
    }
  }, [documents]);

  // Create folder (optimistic)
  const createFolder = useCallback(async (name, emoji, parentFolderId = null) => {
    const tempId = `temp-folder-${Date.now()}`;
    const tempFolder = {
      id: tempId,
      name,
      emoji,
      parentFolderId,
      createdAt: new Date().toISOString(),
      status: 'creating',
      // ⚡ Add empty counts for instant display
      _count: {
        documents: 0,
        totalDocuments: 0,
        subfolders: 0
      }
    };

    // Add to UI IMMEDIATELY

    setFolders(prev => [tempFolder, ...prev]);

    try {
      // ⚡ ZERO-KNOWLEDGE ENCRYPTION: Encrypt folder name
      let requestData = {
        name,
        emoji,
        parentFolderId
      };

      if (encryptionPassword) {

        const encryptedName = await encryptData(name, encryptionPassword);

        requestData = {
          name, // Send plaintext for backward compatibility
          nameEncrypted: encryptedName.ciphertext,
          encryptionSalt: encryptedName.salt,
          encryptionIV: encryptedName.iv,
          encryptionAuthTag: encryptedName.authTag,
          isEncrypted: true,
          emoji,
          parentFolderId
        };

      }

      const response = await api.post('/api/folders', requestData);

      const newFolder = response.data.folder;

      // Replace temp folder with real one

      setFolders(prev =>
        prev.map(folder => folder.id === tempId ? newFolder : folder)
      );

      return newFolder;
    } catch (error) {

      // Remove temp folder on error
      setFolders(prev => prev.filter(folder => folder.id !== tempId));

      throw error;
    }
  }, [encryptionPassword]); // Add dependency for encryptionPassword

  // ✅ BUG FIX #5: Deletion lock to prevent race conditions
  const deletionInProgressRef = useRef(new Set());

  // Delete folder (optimistic)
  const deleteFolder = useCallback(async (folderId) => {
    // ✅ BUG FIX #3: Prevent duplicate deletions and race conditions
    if (deletionInProgressRef.current.has(folderId)) {

      return;
    }
    deletionInProgressRef.current.add(folderId);

    // Helper function to get all subfolder IDs recursively
    const getAllSubfolderIds = (parentId) => {
      const subfolderIds = [parentId];
      const directSubfolders = folders.filter(f => f.parentFolderId === parentId);

      directSubfolders.forEach(subfolder => {
        const nestedIds = getAllSubfolderIds(subfolder.id);
        subfolderIds.push(...nestedIds);
      });

      return subfolderIds;
    };

    // Get all folder IDs that will be deleted (parent + all subfolders)
    const allFolderIdsToDelete = getAllSubfolderIds(folderId);

    // Store deleted items for potential rollback
    const folderToDelete = folders.find(f => f.id === folderId);
    const foldersToDelete = folders.filter(f => allFolderIdsToDelete.includes(f.id));
    const documentsToDelete = documents.filter(d => allFolderIdsToDelete.includes(d.folderId));

    // Remove folder and all subfolders from UI IMMEDIATELY
    setFolders(prev => prev.filter(folder => !allFolderIdsToDelete.includes(folder.id)));

    // Remove all documents in the folder and subfolders from UI IMMEDIATELY
    setDocuments(prev => prev.filter(doc => !allFolderIdsToDelete.includes(doc.folderId)));
    setRecentDocuments(prev => prev.filter(doc => !allFolderIdsToDelete.includes(doc.folderId)));

    try {
      await api.delete(`/api/folders/${folderId}`);

      // ✅ Invalidate cache to ensure fresh data on next fetch
      invalidateCache();

      // ✅ FIX: DO NOT refetch immediately after delete
      // The optimistic update already removed items from UI
      // Refetching can cause race conditions where stale cached data reappears
      // Socket events (folder-deleted, folder-tree-updated) will handle updates from other tabs

    } catch (error) {

      // Restore folders and documents on error
      if (foldersToDelete.length > 0) {
        setFolders(prev => [...foldersToDelete, ...prev]);
      }
      if (documentsToDelete.length > 0) {
        setDocuments(prev => [...documentsToDelete, ...prev]);
        setRecentDocuments(prev => [...documentsToDelete, ...prev].slice(0, 5));
      }

      throw error;
    } finally {
      // ✅ BUG FIX #3: Always clean up deletion lock
      deletionInProgressRef.current.delete(folderId);
    }
  }, [folders, documents, invalidateCache, fetchAllData]);

  // ⚡ OPTIMIZED: Get document count by folder using backend-provided count
  // Backend already calculated this recursively - no need to recount on frontend!
  const getDocumentCountByFolder = useCallback((folderId) => {
    // Find the folder
    const folder = folders.find(f => f.id === folderId);

    if (!folder) {

      return 0;
    }

    // Use backend-provided totalDocuments count if available
    if (folder._count?.totalDocuments !== undefined) {

      return folder._count.totalDocuments;
    }

    // Fallback: Use direct document count
    if (folder._count?.documents !== undefined) {

      return folder._count.documents;
    }

    // Last resort fallback: Count manually (should rarely happen)
    const count = documents.filter(doc => doc.folderId === folderId).length;

    return count;
  }, [folders, documents]);

  // Get file breakdown
  const getFileBreakdown = useCallback(() => {
    const breakdown = {
      total: documents.length,
      byType: {},
      byFolder: {}
    };

    documents.forEach(doc => {
      // Count by file type
      const ext = doc.name.split('.').pop().toLowerCase();
      breakdown.byType[ext] = (breakdown.byType[ext] || 0) + 1;

      // Count by folder
      const folderId = doc.folderId || 'uncategorized';
      breakdown.byFolder[folderId] = (breakdown.byFolder[folderId] || 0) + 1;
    });

    return breakdown;
  }, [documents]);

  // Get documents by folder
  const getDocumentsByFolder = useCallback((folderId) => {
    return documents.filter(doc => doc.folderId === folderId);
  }, [documents]);

  // Get root folders (categories)
  const getRootFolders = useCallback(() => {
    return folders.filter(folder => folder.parentFolderId === null);
  }, [folders]);

  // Refresh all data
  const refreshAll = useCallback(async () => {

    // ✅ FIX: Wait for all promises to complete before returning
    // This ensures that when refreshAll() is called, it waits for all data to be loaded
    await Promise.all([
      fetchFolders(),
      fetchDocuments(),
      fetchRecentDocuments(),
    ]).catch(() => {});
  }, [fetchDocuments, fetchFolders, fetchRecentDocuments]);

  const value = {
    // State
    documents,
    folders,
    recentDocuments,
    loading,
    socket: socketRef.current, // ⚡ Expose socket for other components

    // Document operations
    addDocument,
    deleteDocument,
    moveToFolder,
    renameDocument,

    // Folder operations
    createFolder,
    deleteFolder,

    // Queries
    getDocumentCountByFolder,
    getFileBreakdown,
    getDocumentsByFolder,
    getRootFolders,

    // Fetch operations
    fetchDocuments,
    fetchFolders,
    fetchRecentDocuments,
    fetchAllData, // ✅ Expose fetchAllData for manual cache refresh
    refreshAll,
    invalidateCache, // ✅ Expose cache invalidation

    // ✅ Auto-refresh control (for pausing during file selection)
    pauseAutoRefresh,
    resumeAutoRefresh
  };

  return (
    <DocumentsContext.Provider value={value}>
      {children}
    </DocumentsContext.Provider>
  );
};
