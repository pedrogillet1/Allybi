import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { getApiBaseUrl } from '../services/runtimeConfig';
import api from '../services/api';
// ✅ UNIFIED: Use unifiedUploadService for all uploads
import unifiedUploadService from '../services/unifiedUploadService';
import { UPLOAD_CONFIG } from '../config/upload.config';
import { encryptData, decryptData } from '../utils/security/encryption';
import { useAuth } from './AuthContext';
const SKIPPED_PROBE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

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
  const CACHE_TTL = 10000; // 10 seconds - reduced from 30s to prevent stale data on refresh

  // ✅ FIX #1: Upload Registry - Protects uploads for 30 seconds (not 5)
  // This prevents race conditions where refetches remove recently uploaded docs
  const uploadRegistryRef = useRef(new Map());
  const UPLOAD_PROTECTION_WINDOW = 30000; // 30 seconds protection

  // 🗑️ PERFECT DELETE: Tombstone set for documents pending deletion
  // This is a frontend safety net to prevent deleted docs from reappearing via refetch
  // Backend already filters these out, but this provides defense-in-depth
  const pendingDeletionIdsRef = useRef(new Set());

  // 🗑️ PERFECT DELETE: jobId→docId mapping for signal-based tombstone clearing
  // Tombstones are ONLY cleared by real signals (WebSocket events), NOT timeouts
  const jobIdToDocIdRef = useRef(new Map());

  // 🗑️ PERFECT DELETE: Tombstone set for FOLDERS pending deletion
  // This prevents deleted folders from reappearing on refetch before worker completes
  const pendingDeletionFolderIdsRef = useRef(new Set());

  // 🗑️ PERFECT DELETE: jobId→folderId mapping for folder tombstone clearing
  const folderJobIdToFolderIdRef = useRef(new Map());
  const documentsRef = useRef([]);
  const skippedNotifiedRef = useRef(new Set());
  const skippedProbeInFlightRef = useRef(new Set());

  // ✅ FIX #2: Refetch Coordinator - Batches and deduplicates refetch requests
  const refetchCoordinatorRef = useRef({
    pending: false,
    types: new Set(),
    timeout: null,
    lastRefetch: 0
  });
  const REFETCH_BATCH_DELAY = 1500; // ✅ FIX: Wait 1.5s to batch requests (was 500ms) - allows all documents to be created
  const REFETCH_COOLDOWN = 3000; // ✅ FIX: Minimum 3s between refetches (was 2s) - prevents count fluctuation

  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);

  const notifySkippedDocument = useCallback((payload = {}) => {
    const rawId = typeof payload.documentId === 'string' ? payload.documentId.trim() : '';
    const rawFilename = typeof payload.filename === 'string' ? payload.filename.trim() : '';
    const dedupeKey = rawId || (rawFilename ? `name:${rawFilename}` : '');

    if (dedupeKey && skippedNotifiedRef.current.has(dedupeKey)) {
      return;
    }
    if (dedupeKey) {
      skippedNotifiedRef.current.add(dedupeKey);
    }
    if (rawId) {
      uploadRegistryRef.current.delete(rawId);
    }

    window.dispatchEvent(new CustomEvent('koda:document-skipped', {
      detail: {
        documentId: rawId || null,
        filename: rawFilename || 'This file',
        reason: typeof payload.reason === 'string' ? payload.reason : 'No extractable text content',
      },
    }));
  }, []);

  const markDocumentSkipped = useCallback((payload = {}) => {
    const rawId = typeof payload.documentId === 'string' ? payload.documentId.trim() : '';

    if (rawId) {
      setDocuments(prev => prev.filter(doc => doc.id !== rawId));
      setRecentDocuments(prev => prev.filter(doc => doc.id !== rawId));
    }

    notifySkippedDocument(payload);
  }, [notifySkippedDocument]);

  const probeForSkippedDocuments = useCallback(async (previousDocs = [], fetchedDocs = []) => {
    const fetchedIds = new Set((fetchedDocs || []).map(doc => doc?.id).filter(Boolean));
    const now = Date.now();
    const candidates = (previousDocs || []).filter((doc) => {
      const docId = typeof doc?.id === 'string' ? doc.id.trim() : '';
      if (!docId || docId.startsWith('temp-')) return false;
      if (fetchedIds.has(docId)) return false;
      if (pendingDeletionIdsRef.current.has(docId)) return false;
      if (skippedProbeInFlightRef.current.has(docId)) return false;
      if (skippedNotifiedRef.current.has(docId)) return false;

      const status = String(doc?.status || '').toLowerCase();
      const isProcessingLike = ['uploading', 'processing', 'completed', 'uploaded', 'enriching', 'indexed'].includes(status);
      const updatedAtMs = Date.parse(doc?.updatedAt || doc?.createdAt || '');
      const isRecent = Number.isFinite(updatedAtMs) && (now - updatedAtMs) < SKIPPED_PROBE_WINDOW_MS;
      const isProtectedByRegistry = uploadRegistryRef.current.has(docId);

      return isProcessingLike || isRecent || isProtectedByRegistry;
    }).slice(0, 12);

    if (!candidates.length) return;

    await Promise.allSettled(candidates.map(async (doc) => {
      const docId = doc.id;
      skippedProbeInFlightRef.current.add(docId);
      try {
        const response = await api.get(`/api/documents/${docId}`);
        const body = response?.data?.ok && response?.data?.data ? response.data.data : response?.data;
        const status = String(body?.status || '').toLowerCase();
        if (status === 'skipped') {
          markDocumentSkipped({
            documentId: docId,
            filename: body?.filename || doc?.filename || 'This file',
            reason: body?.error || doc?.errorMessage || 'No extractable text content',
          });
        }
      } catch (error) {
        if (error?.response?.status !== 404) {
          console.warn('[DocumentsContext] Failed probing skipped status', { documentId: docId, error: error?.message });
        }
      } finally {
        skippedProbeInFlightRef.current.delete(docId);
      }
    }));
  }, [markDocumentSkipped]);

  // Fetch all documents
  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const timestamp = new Date().getTime();
      const response = await api.get(`/api/documents?limit=10000&_t=${timestamp}`);
      const fetchedDocs = response.data.documents || [];
      const previousDocs = documentsRef.current;


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

      void probeForSkippedDocuments(previousDocs, fetchedDocs);

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
  }, [probeForSkippedDocuments]);

  // Fetch all folders
  const fetchFolders = useCallback(async () => {
    try {
      const timestamp = new Date().getTime();
      // IMPORTANT: Pass includeAll=true to get ALL folders (including subfolders) in flat list
      // Backend will calculate totalDocuments for each folder recursively
      const response = await api.get(`/api/folders?includeAll=true&_t=${timestamp}`);
      let fetchedFolders = response.data?.items || response.data?.folders || [];

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

      // 🗑️ PERFECT DELETE: Filter out folders in tombstone set (defense-in-depth)
      // Backend already filters these, but frontend tombstone provides extra safety
      if (pendingDeletionFolderIdsRef.current.size > 0) {
        const tombstoneIds = pendingDeletionFolderIdsRef.current;
        const originalCount = fetchedFolders.length;
        fetchedFolders = fetchedFolders.filter(f => !tombstoneIds.has(f.id));
        const filteredCount = originalCount - fetchedFolders.length;
        if (filteredCount > 0) {
          console.log(`🗑️ [PERFECT DELETE] Frontend tombstone filtered ${filteredCount} folder(s) from fetch results`);
        }
      }

      // 🔧 GOOGLE DRIVE STYLE: Backend now includes 'failed' status in counts
      // No need to preserve optimistic counts - server counts are now accurate
      // Failed documents remain visible, so counts stay consistent after refresh
      setFolders(fetchedFolders);
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

      let { documents: cachedDocs = [], folders: cachedFolders = [], recentDocuments: cachedRecent = [] } = cacheRef.current.data;

      // 🗑️ PERFECT DELETE: Also filter tombstones from cached data
      if (pendingDeletionIdsRef.current.size > 0) {
        const tombstoneIds = pendingDeletionIdsRef.current;
        cachedDocs = cachedDocs.filter(doc => !tombstoneIds.has(doc.id));
        cachedRecent = cachedRecent.filter(doc => !tombstoneIds.has(doc.id));
      }

      // ✅ FIX: Apply cached data immediately (startTransition can defer updates
      // causing stale data to persist across page navigations)
      setDocuments(cachedDocs);
      setFolders(cachedFolders);
      setRecentDocuments(cachedRecent);
      return;
    }

    setLoading(true);
    try {

      const startTime = Date.now();

      const response = await api.get(`/api/batch/initial-data?_t=${Date.now()}`);
      // Backend may return either:
      // 1) legacy shape: { documents, folders, recentDocuments, meta }
      // 2) controller shape: { ok: true, data: { documents, folders, ... } }
      const raw = response.data || {};
      const payload = raw?.data && typeof raw.data === 'object' ? raw.data : raw;
      const fetchedDocs = payload?.documents || [];
      const fetchedFolders = payload?.folders || [];
      const fetchedRecent = payload?.recentDocuments || [];
      const meta = payload?.meta || payload?.stats || raw?.meta || raw?.stats;
      const previousDocs = documentsRef.current;

      const duration = Date.now() - startTime;


      void probeForSkippedDocuments(previousDocs, fetchedDocs);

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

      // 🗑️ PERFECT DELETE: Filter out documents in tombstone set (safety net)
      // Backend already filters these, but this provides defense-in-depth
      // to handle race conditions with cached/stale data
      let filteredDocs = fetchedDocs;
      let filteredRecent = fetchedRecent;
      if (pendingDeletionIdsRef.current.size > 0) {
        const tombstoneIds = pendingDeletionIdsRef.current;
        const beforeCount = filteredDocs.length;
        filteredDocs = fetchedDocs.filter(doc => !tombstoneIds.has(doc.id));
        filteredRecent = fetchedRecent.filter(doc => !tombstoneIds.has(doc.id));
        const filteredCount = beforeCount - filteredDocs.length;
        if (filteredCount > 0) {
          console.log(`🗑️ [PERFECT DELETE] Frontend tombstone filtered ${filteredCount} doc(s) from fetched data`);
        }
      }

      // ✅ Cache the result (with filtered data)
      cacheRef.current = {
        data: {
          documents: filteredDocs,
          folders: decryptedFolders,
          recentDocuments: filteredRecent
        },
        timestamp: now
      };

      // ✅ FIX: Apply state immediately to avoid stale data across page navigations.
      // startTransition deferrals caused the Home screen to show outdated documents
      // when the Documents page had already fetched fresh data.
      setDocuments(filteredDocs);
      setFolders(decryptedFolders);
      setRecentDocuments(filteredRecent);

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
  }, [encryptionPassword, fetchDocuments, fetchFolders, fetchRecentDocuments, probeForSkippedDocuments]);

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

  // 🗑️ PERFECT DELETE: Cleanup orphan tombstones on app load
  // Checks if any tombstones have jobs that are no longer active (completed/failed)
  const cleanupOrphanTombstones = useCallback(async () => {
    if (pendingDeletionIdsRef.current.size === 0) {
      return; // No tombstones to check
    }

    console.log(`🗑️ [PERFECT DELETE] Checking ${pendingDeletionIdsRef.current.size} orphan tombstones...`);

    try {
      // Get all active deletion jobs for the user
      const response = await api.get('/api/delete-jobs?status=queued,running');
      const activeJobs = response.data?.jobs || [];
      const activeTargetIds = new Set(activeJobs.map(job => job.targetId));

      // Find tombstones that don't have active jobs
      const orphanTombstones = [];
      for (const docId of pendingDeletionIdsRef.current) {
        if (!activeTargetIds.has(docId)) {
          orphanTombstones.push(docId);
        }
      }

      // Clear orphan tombstones
      if (orphanTombstones.length > 0) {
        for (const docId of orphanTombstones) {
          pendingDeletionIdsRef.current.delete(docId);
        }
        console.log(`🗑️ [PERFECT DELETE] Cleared ${orphanTombstones.length} orphan tombstones: ${orphanTombstones.join(', ')}`);
      } else {
        console.log(`🗑️ [PERFECT DELETE] All tombstones have active jobs - no orphans found`);
      }
    } catch (error) {
      console.warn(`⚠️ [PERFECT DELETE] Failed to check orphan tombstones:`, error.message);
      // On error, don't clear tombstones - safer to keep them
    }
  }, []);

  // Initialize data on mount
  useEffect(() => {
    // ✅ FIX: Only load data if user is authenticated
    if (!initialized && isAuthenticated) {
      // ✅ OPTIMIZATION: Use batched endpoint (1 request instead of 3)
      fetchAllData();
      setInitialized(true);

      // 🗑️ PERFECT DELETE: Clean up any orphan tombstones from previous session
      // (e.g., if browser was closed before job completed)
      setTimeout(() => {
        cleanupOrphanTombstones();
      }, 2000); // Wait 2s for initial data load to complete
    }
  }, [initialized, isAuthenticated, fetchAllData, cleanupOrphanTombstones]);

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

        // ✅ FIX: Force refresh to avoid stale cached data overwriting fresh state
        fetchAllData(true);
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

    // Cookie-first auth: only use localStorage token in explicit compat mode.
    const token = null;

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

    const apiUrl = getApiBaseUrl();

    // Initialize socket connection
    const socket = io(apiUrl, {
      auth: token ? { token } : {},
      withCredentials: true,
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
      // Return same array reference if no document matched to avoid unnecessary re-renders
      setDocuments((prevDocs) => {
        let changed = false;
        const next = prevDocs.map((doc) => {
          if (doc.id === data.documentId) {
            changed = true;
            return {
              ...doc,
              status: data.status || doc.status,
              processingProgress: data.progress,
              processingStage: data.stage,
              processingMessage: data.message,
              errorMessage: data.status === 'failed' ? (data.error || data.message) : doc.errorMessage,
              isTemporary: (data.status === 'completed' || data.status === 'failed') ? false : doc.isTemporary,
            };
          }
          return doc;
        });
        return changed ? next : prevDocs;
      });

      // Also update recent documents if they're loaded
      setRecentDocuments((prevRecent) => {
        let changed = false;
        const next = prevRecent.map((doc) => {
          if (doc.id === data.documentId) {
            changed = true;
            return {
              ...doc,
              status: data.status || doc.status,
              processingProgress: data.progress,
              processingStage: data.stage,
              processingMessage: data.message,
              errorMessage: data.status === 'failed' ? (data.error || data.message) : doc.errorMessage,
            };
          }
          return doc;
        });
        return changed ? next : prevRecent;
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
      setDocuments((prevDocs) => {
        const idx = prevDocs.findIndex((d) => d.id === data.documentId);
        if (idx === -1) return prevDocs;
        const next = [...prevDocs];
        next[idx] = { ...next[idx], status: 'failed', errorMessage: data.error };
        return next;
      });

      setRecentDocuments((prevRecent) => {
        const idx = prevRecent.findIndex((d) => d.id === data.documentId);
        if (idx === -1) return prevRecent;
        const next = [...prevRecent];
        next[idx] = { ...next[idx], status: 'failed', errorMessage: data.error };
        return next;
      });
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

    socket.on('document-deleted', (data) => {
      // ✅ FIX: Only invalidate cache - DO NOT refetch!
      // Refetching during delete causes the document to temporarily reappear
      // because the delete hasn't completed on the server yet.
      // Optimistic update already removed the document from UI.
      // If another tab deletes a document, the user can refresh to see updates.
      invalidateCache();

      // If we have a documentId, ensure it's removed from local state (cross-tab safety)
      if (data?.documentId) {
        setDocuments(prev => {
          const next = prev.filter(doc => doc.id !== data.documentId);
          return next.length === prev.length ? prev : next;
        });
        setRecentDocuments(prev => {
          const next = prev.filter(doc => doc.id !== data.documentId);
          return next.length === prev.length ? prev : next;
        });
      }
    });

    socket.on('document-skipped', (data) => {
      markDocumentSkipped({
        documentId: data?.documentId,
        filename: data?.filename,
        reason: data?.reason || 'No extractable text content',
      });
      invalidateCache();
    });

    socket.on('document-moved', () => {

      // ✅ FIX: Invalidate cache AND trigger refetch for consistency across tabs
      invalidateCache();
      smartRefetch(['documents', 'folders']);
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

    // ✅ PERFECT DELETE: Listen for deletion job progress updates
    socket.on('deletion-job-progress', (data) => {
      console.log(`📊 [PERFECT DELETE] Job ${data.jobId} progress: ${data.docsDone}/${data.docsTotal} docs, ${data.foldersDone}/${data.foldersTotal} folders`);

      setDeletionJobs(prev => {
        const updated = new Map(prev);
        const existing = updated.get(data.jobId);
        if (existing) {
          updated.set(data.jobId, {
            ...existing,
            status: data.status,
            docsDone: data.docsDone,
            docsTotal: data.docsTotal,
            foldersDone: data.foldersDone,
            foldersTotal: data.foldersTotal,
            lastUpdate: Date.now()
          });
        }
        return updated;
      });
    });

    // ✅ PERFECT DELETE: Listen for deletion job completion
    socket.on('deletion-job-completed', (data) => {
      console.log(`✅ [PERFECT DELETE] Job ${data.jobId} completed successfully`);

      // 🗑️ SIGNAL-BASED TOMBSTONE CLEARING: Clear tombstone for this job's document
      const docId = jobIdToDocIdRef.current.get(data.jobId);
      if (docId) {
        pendingDeletionIdsRef.current.delete(docId);
        jobIdToDocIdRef.current.delete(data.jobId);
        console.log(`🗑️ [PERFECT DELETE] Cleared tombstone for doc ${docId} (job ${data.jobId} completed)`);
      }

      // 🗑️ SIGNAL-BASED TOMBSTONE CLEARING: Clear tombstone for this job's folder
      const folderId = folderJobIdToFolderIdRef.current.get(data.jobId);
      if (folderId) {
        pendingDeletionFolderIdsRef.current.delete(folderId);
        folderJobIdToFolderIdRef.current.delete(data.jobId);
        console.log(`🗑️ [PERFECT DELETE] Cleared tombstone for folder ${folderId} (job ${data.jobId} completed)`);
      }

      setDeletionJobs(prev => {
        const updated = new Map(prev);
        const existing = updated.get(data.jobId);
        if (existing) {
          // Also clear tombstone using targetId from job tracking
          if (existing.targetType === 'document' && existing.targetId) {
            pendingDeletionIdsRef.current.delete(existing.targetId);
            console.log(`🗑️ [PERFECT DELETE] Cleared tombstone for doc ${existing.targetId} via job tracking`);
          }
          // 🗑️ PERFECT DELETE: Clear folder tombstones via job tracking
          if (existing.targetType === 'folder') {
            // Clear main folder tombstone
            if (existing.targetId) {
              pendingDeletionFolderIdsRef.current.delete(existing.targetId);
              console.log(`🗑️ [PERFECT DELETE] Cleared tombstone for folder ${existing.targetId} via job tracking`);
            }
            // Clear ALL folder IDs in tree (subfolders)
            if (existing.allFolderIds && Array.isArray(existing.allFolderIds)) {
              existing.allFolderIds.forEach(id => {
                pendingDeletionFolderIdsRef.current.delete(id);
              });
              console.log(`🗑️ [PERFECT DELETE] Cleared ${existing.allFolderIds.length} folder tombstone(s) via job tracking`);
            }
          }
          updated.set(data.jobId, {
            ...existing,
            status: 'completed',
            completedAt: Date.now()
          });
        }
        return updated;
      });

      // Remove completed jobs from tracking after 5 seconds
      setTimeout(() => {
        setDeletionJobs(prev => {
          const updated = new Map(prev);
          updated.delete(data.jobId);
          return updated;
        });
      }, 5000);
    });

    // ✅ PERFECT DELETE: Listen for deletion job failures
    socket.on('deletion-job-failed', (data) => {
      console.error(`❌ [PERFECT DELETE] Job ${data.jobId} failed:`, data.error);

      // 🗑️ SIGNAL-BASED TOMBSTONE CLEARING: Clear tombstone on failure (rollback needed)
      const docId = jobIdToDocIdRef.current.get(data.jobId);
      if (docId) {
        pendingDeletionIdsRef.current.delete(docId);
        jobIdToDocIdRef.current.delete(data.jobId);
        console.log(`🗑️ [PERFECT DELETE] Cleared tombstone for doc ${docId} (job ${data.jobId} failed - rollback)`);
      }

      // 🗑️ SIGNAL-BASED TOMBSTONE CLEARING: Clear folder tombstone on failure (rollback needed)
      const folderId = folderJobIdToFolderIdRef.current.get(data.jobId);
      if (folderId) {
        pendingDeletionFolderIdsRef.current.delete(folderId);
        folderJobIdToFolderIdRef.current.delete(data.jobId);
        console.log(`🗑️ [PERFECT DELETE] Cleared tombstone for folder ${folderId} (job ${data.jobId} failed - rollback)`);
      }

      setDeletionJobs(prev => {
        const updated = new Map(prev);
        const existing = updated.get(data.jobId);
        if (existing) {
          // Also clear tombstone using targetId from job tracking
          if (existing.targetType === 'document' && existing.targetId) {
            pendingDeletionIdsRef.current.delete(existing.targetId);
            console.log(`🗑️ [PERFECT DELETE] Cleared tombstone for doc ${existing.targetId} via job tracking (failed)`);
          }
          // 🗑️ PERFECT DELETE: Clear folder tombstones via job tracking on failure
          if (existing.targetType === 'folder') {
            // Clear main folder tombstone
            if (existing.targetId) {
              pendingDeletionFolderIdsRef.current.delete(existing.targetId);
              console.log(`🗑️ [PERFECT DELETE] Cleared tombstone for folder ${existing.targetId} via job tracking (failed)`);
            }
            // Clear ALL folder IDs in tree (subfolders)
            if (existing.allFolderIds && Array.isArray(existing.allFolderIds)) {
              existing.allFolderIds.forEach(id => {
                pendingDeletionFolderIdsRef.current.delete(id);
              });
              console.log(`🗑️ [PERFECT DELETE] Cleared ${existing.allFolderIds.length} folder tombstone(s) via job tracking (failed)`);
            }
          }
          updated.set(data.jobId, {
            ...existing,
            status: 'failed',
            error: data.error,
            failedAt: Date.now()
          });
        }
        return updated;
      });
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
      socket.off('document-skipped');
      socket.off('document-moved');
      socket.off('folder-created');
      socket.off('folder-deleted');
      socket.off('folder-tree-updated');
      socket.off('processing-complete');
      // ✅ PERFECT DELETE: Clean up deletion job listeners
      socket.off('deletion-job-progress');
      socket.off('deletion-job-completed');
      socket.off('deletion-job-failed');
      socket.disconnect();
      window.removeEventListener('document-uploaded', handleDocumentUploaded);
    };
  }, [initialized, isAuthenticated, fetchDocuments, fetchFolders, fetchRecentDocuments, fetchAllData, smartRefetch, invalidateCache, markDocumentSkipped]);

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
  // ✅ UNIFIED: Use unifiedUploadService for single file uploads (with optimistic UI)
  const addDocument = useCallback(async (file, folderId = null) => {
    // Validate file size upfront
    if (file.size > UPLOAD_CONFIG.MAX_FILE_SIZE_BYTES) {
      throw new Error(`File too large. Maximum size is ${UPLOAD_CONFIG.MAX_FILE_SIZE_BYTES / 1024 / 1024}MB`);
    }

    // Create temporary document object for optimistic update
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    const tempDocument = {
      id: tempId,
      filename: file.name,
      fileSize: file.size,
      mimeType: file.type || 'application/octet-stream',
      folderId: folderId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'uploading',
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream'
    };

    // Add to UI IMMEDIATELY (optimistic update)
    setDocuments(prev => [tempDocument, ...prev]);
    setRecentDocuments(prev => [tempDocument, ...prev.slice(0, 4)]);

    try {
      // Use unified upload service
      const result = await unifiedUploadService.uploadSingleFile(
        file,
        folderId,
        (progress) => {
          // Update the temp document's progress
          setDocuments(prev => prev.map(doc => 
            doc.id === tempId 
              ? { ...doc, uploadProgress: progress.percentage, stage: progress.message }
              : doc
          ));
        }
      );

      if (!result.success) {
        throw new Error(result.error || 'Upload failed');
      }

      // Fetch the full document to get all fields
      const docResponse = await api.get(`/api/documents/${result.documentId}`);
      const newDocument = docResponse.data;

      // Add to Upload Registry for protection
      uploadRegistryRef.current.set(newDocument.id, {
        uploadedAt: Date.now(),
        filename: newDocument.filename,
        status: 'processing',
        verified: false
      });

      // Replace temp document with real one
      setDocuments(prev => prev.map(doc => doc.id === tempId ? newDocument : doc));
      setRecentDocuments(prev => prev.map(doc => doc.id === tempId ? newDocument : doc));

      // Update folder count if uploaded to folder
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

      // Start background verification
      startUploadVerification(newDocument.id, newDocument.filename);

      // Invalidate settings cache
      sessionStorage.removeItem('koda_settings_documents');
      sessionStorage.removeItem('koda_settings_fileData');
      sessionStorage.removeItem('koda_settings_totalStorage');

      return newDocument;
    } catch (error) {
      console.error('❌ [DocumentsContext] Upload failed:', error);

      // Remove temp document on error
      setDocuments(prev => prev.filter(doc => doc.id !== tempId));
      setRecentDocuments(prev => prev.filter(doc => doc.id !== tempId));

      throw error;
    }
  }, [startUploadVerification]);


  // ✅ PERFECT DELETE: Track active deletion jobs for progress UI
  const [deletionJobs, setDeletionJobs] = useState(new Map());

  // Delete document (optimistic with PERFECT DELETE job-based approach)
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

    // 🗑️ PERFECT DELETE: Add to tombstone set BEFORE removing from UI
    // This ensures the document won't reappear even if a refetch races with deletion
    pendingDeletionIdsRef.current.add(documentId);
    console.log(`🗑️ [PERFECT DELETE] Added ${documentId} to tombstone set (size: ${pendingDeletionIdsRef.current.size})`);

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
      // ✅ PERFECT DELETE: Backend now returns 202 Accepted with jobId
      console.log(`🗑️ [PERFECT DELETE] Requesting deletion for document ${documentId}`);
      const response = await api.delete(`/api/documents/${documentId}`, {
        headers: { 'x-delete-source': 'user_delete' }
      });

      // Handle 202 Accepted (new job) or 200 OK (existing job)
      const { jobId, status, isExisting } = response.data;

      if (jobId) {
        console.log(`📋 [PERFECT DELETE] Deletion job ${jobId} ${isExisting ? 'already exists' : 'created'} (status: ${status})`);

        // 🗑️ SIGNAL-BASED TOMBSTONE: Store jobId→docId mapping for WebSocket-based clearing
        // Tombstones are ONLY cleared by real signals (deletion-job-completed/failed), NOT timeouts
        jobIdToDocIdRef.current.set(jobId, documentId);
        console.log(`🗑️ [PERFECT DELETE] Stored jobId→docId mapping: ${jobId} → ${documentId}`);

        // Track the deletion job for progress monitoring
        setDeletionJobs(prev => {
          const updated = new Map(prev);
          updated.set(jobId, {
            targetType: 'document',
            targetId: documentId,
            targetName: documentToDelete.filename,
            status: status,
            createdAt: Date.now()
          });
          return updated;
        });
      }

      // Invalidate settings cache (storage stats need to be recalculated)
      sessionStorage.removeItem('koda_settings_documents');
      sessionStorage.removeItem('koda_settings_fileData');
      sessionStorage.removeItem('koda_settings_totalStorage');

      // ✅ FIX: Invalidate data cache to prevent stale data from reappearing on window focus
      invalidateCache();

      // 🗑️ PERFECT DELETE: Tombstone is cleared ONLY via WebSocket signals (deletion-job-completed/failed)
      // NO timeout-based clearing - this ensures we wait for actual job completion
      // The jobId→docId mapping (jobIdToDocIdRef) is used to find which doc to clear

      // Return success with job info
      return { success: true, document: documentToDelete, jobId, status };
    } catch (error) {
      console.error(`❌ [PERFECT DELETE] Failed to delete document ${documentId}:`, error);

      // 🗑️ PERFECT DELETE: Remove from tombstone set on error (rollback)
      pendingDeletionIdsRef.current.delete(documentId);
      console.log(`🗑️ [PERFECT DELETE] Removed ${documentId} from tombstone set (error rollback)`);

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

      // ✅ FIX: Invalidate cache AND trigger refetch after successful move
      invalidateCache();
      smartRefetch(['documents', 'folders']);

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
  }, [documents, folders, invalidateCache, smartRefetch]); // Add folders, invalidateCache, smartRefetch to dependencies

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

      // ✅ FIX: Invalidate cache after successful rename
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
      }

      throw error;
    }
  }, [documents, invalidateCache]); // Add invalidateCache to dependencies

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
        parentId: parentFolderId,
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
          parentId: parentFolderId,
          parentFolderId
        };

      }

      const response = await api.post('/api/folders', requestData);

      // After interceptor unwrap, response.data is the folder object directly
      const newFolder = response.data?.folder || response.data;

      // Replace temp folder with real one

      setFolders(prev =>
        prev.map(folder => {
          if (folder.id !== tempId) return folder;
          return {
            ...newFolder,
            parentFolderId: newFolder?.parentFolderId ?? parentFolderId ?? null,
            parentId: newFolder?.parentId ?? newFolder?.parentFolderId ?? parentFolderId ?? null,
          };
        })
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

  // Delete folder (optimistic with PERFECT DELETE job-based approach)
  // mode: 'cascade' (default) - delete folder AND all documents
  // mode: 'folderOnly' - delete folder only, move documents to Unsorted
  const deleteFolder = useCallback(async (folderId, mode = 'cascade') => {
    // ✅ BUG FIX #3: Prevent duplicate deletions and race conditions
    if (deletionInProgressRef.current.has(folderId)) {
      console.log(`⚠️ [deleteFolder] Deletion already in progress for folder ${folderId}, skipping`);
      return { success: false, alreadyInProgress: true };
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
    const documentsInFolders = documents.filter(d => allFolderIdsToDelete.includes(d.folderId));

    // 🗑️ PERFECT DELETE: Add ALL folder IDs to tombstone set BEFORE removing from UI
    // This prevents folders from reappearing if a refetch happens before deletion completes
    allFolderIdsToDelete.forEach(id => {
      pendingDeletionFolderIdsRef.current.add(id);
    });
    console.log(`🗑️ [PERFECT DELETE] Added ${allFolderIdsToDelete.length} folder(s) to tombstone set (size: ${pendingDeletionFolderIdsRef.current.size})`);

    // Remove folder and all subfolders from UI IMMEDIATELY
    setFolders(prev => prev.filter(folder => !allFolderIdsToDelete.includes(folder.id)));

    // For folderOnly mode: Move documents to Unsorted (null folderId) instead of removing
    // For cascade mode: Remove all documents in the folder and subfolders from UI IMMEDIATELY
    if (mode === 'folderOnly') {
      // Move documents to Unsorted (set folderId to null)
      setDocuments(prev => prev.map(doc =>
        allFolderIdsToDelete.includes(doc.folderId) ? { ...doc, folderId: null } : doc
      ));
      setRecentDocuments(prev => prev.map(doc =>
        allFolderIdsToDelete.includes(doc.folderId) ? { ...doc, folderId: null } : doc
      ));
    } else {
      // Cascade mode: remove documents entirely
      setDocuments(prev => prev.filter(doc => !allFolderIdsToDelete.includes(doc.folderId)));
      setRecentDocuments(prev => prev.filter(doc => !allFolderIdsToDelete.includes(doc.folderId)));
    }

    try {
      // ✅ PERFECT DELETE: Backend now returns 202 Accepted with jobId (for cascade mode)
      // For folderOnly mode: Backend returns 200 OK immediately
      console.log(`🗑️ [PERFECT DELETE] Requesting deletion for folder ${folderId} (mode: ${mode}, ${foldersToDelete.length} folders, ${documentsInFolders.length} docs)`);
      const response = await api.delete(`/api/folders/${folderId}?mode=${mode}`);

      // Handle response based on mode
      // folderOnly mode: Returns 200 OK with { success, documentsPreserved, foldersDeleted }
      // cascade mode: Returns 202 Accepted with { jobId, status, isExisting, progress }
      const { jobId, status, isExisting, progress, documentsPreserved, mode: responseMode } = response.data;

      // For folderOnly mode, no job tracking is needed - deletion is synchronous
      if (responseMode === 'folderOnly') {
        console.log(`✅ [PERFECT DELETE] Folder-only deletion complete. ${documentsPreserved || 0} documents preserved (moved to Unsorted)`);
        // Clear tombstones for folderOnly mode since deletion is complete
        allFolderIdsToDelete.forEach(id => {
          pendingDeletionFolderIdsRef.current.delete(id);
        });
        return { success: true, mode: 'folderOnly', documentsPreserved };
      }

      // For cascade mode, track the deletion job
      if (jobId) {
        console.log(`📋 [PERFECT DELETE] Deletion job ${jobId} ${isExisting ? 'already exists' : 'created'} (status: ${status})`);

        // 🗑️ PERFECT DELETE: Track jobId → folderId mapping for tombstone clearing via WebSocket
        // We track the root folder ID; all subfolders are already in the tombstone set
        folderJobIdToFolderIdRef.current.set(jobId, folderId);

        // Track the deletion job for progress monitoring (especially for large folders)
        setDeletionJobs(prev => {
          const updated = new Map(prev);
          updated.set(jobId, {
            targetType: 'folder',
            targetId: folderId,
            targetName: folderToDelete?.name || 'Unknown folder',
            status: status,
            progress: progress,
            docsTotal: progress?.docsTotal || documentsInFolders.length,
            docsDone: progress?.docsDone || 0,
            foldersTotal: progress?.foldersTotal || foldersToDelete.length,
            foldersDone: progress?.foldersDone || 0,
            createdAt: Date.now(),
            allFolderIds: allFolderIdsToDelete // Store all folder IDs for tombstone clearing
          });
          return updated;
        });
      }

      // ✅ Invalidate cache to ensure fresh data on next fetch
      invalidateCache();

      // ✅ FIX: DO NOT refetch immediately after delete
      // The optimistic update already removed items from UI
      // Refetching can cause race conditions where stale cached data reappears
      // Socket events (folder-deleted, folder-tree-updated) will handle updates from other tabs

      return { success: true, jobId, status, progress };

    } catch (error) {
      console.error(`❌ [PERFECT DELETE] Failed to delete folder ${folderId}:`, error);

      // 🗑️ PERFECT DELETE: Clear tombstones on API failure (rollback)
      // This allows the folders to appear again after we restore them
      allFolderIdsToDelete.forEach(id => {
        pendingDeletionFolderIdsRef.current.delete(id);
      });
      console.log(`🗑️ [PERFECT DELETE] Cleared ${allFolderIdsToDelete.length} folder tombstone(s) on API failure`);

      // Restore folders and documents on error
      if (foldersToDelete.length > 0) {
        setFolders(prev => [...foldersToDelete, ...prev]);
      }
      if (documentsInFolders.length > 0) {
        setDocuments(prev => [...documentsInFolders, ...prev]);
        setRecentDocuments(prev => [...documentsInFolders, ...prev].slice(0, 5));
      }

      throw error;
    } finally {
      // ✅ BUG FIX #3: Always clean up deletion lock
      deletionInProgressRef.current.delete(folderId);
    }
  }, [folders, documents, invalidateCache]);

  // ⚡ OPTIMIZED: Get document count by folder using backend-provided count
  // Backend already calculated this recursively - no need to recount on frontend!
  const getDocumentCountByFolder = useCallback((folderId) => {
    // Count from the client-side documents array so folder cards and file breakdown
    // always agree. Recursively include documents in subfolders.
    const collectFolderIds = (parentId) => {
      const ids = new Set([parentId]);
      const addChildren = (pid) => {
        for (const f of folders) {
          if (f.parentFolderId === pid && !ids.has(f.id)) {
            ids.add(f.id);
            addChildren(f.id);
          }
        }
      };
      addChildren(parentId);
      return ids;
    };

    const folderIds = collectFolderIds(folderId);
    return documents.filter(doc => doc.folderId && folderIds.has(doc.folderId)).length;
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
      const ext = (doc.filename || doc.name || '').split('.').pop()?.toLowerCase() || '';
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

    // ✅ FIX: Invalidate fetchAllData cache so stale cached data can't overwrite
    // the fresh data we're about to fetch via individual endpoints.
    cacheRef.current = { data: null, timestamp: 0 };

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

    // ✅ PERFECT DELETE: Deletion job tracking for progress UI
    deletionJobs, // Map<jobId, { targetType, targetId, targetName, status, docsTotal, docsDone, ... }>

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

