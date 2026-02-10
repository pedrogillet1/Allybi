import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useTranslation } from 'react-i18next';
import {
  buildFileTypeDedupeKey,
  buildFileTypeDetectedDedupeKey,
  buildUploadSuccessDedupeKey,
  buildBatchOperationDedupeKey,
} from '../utils/notifications/dedupeKeyGenerator';
import { migrateNotification, migrateNotifications } from '../utils/notifications/legacyNotificationMapper';
import { validateAndNormalizeNotifications } from '../utils/notifications/notificationSchemaValidator';

const NotificationsContext = createContext(null);

/**
 * NotificationsProvider - Enhanced Global Notification System
 *
 * Unified notification state management with:
 * - Persistent notifications (localStorage with read/unread state)
 * - Ephemeral toasts (max 3 visible, auto-dismiss)
 * - Rate limiting for repeated errors
 * - Smart deduplication (hash-based, 5s window)
 * - Upload batch accumulation (500ms window)
 * - Undo stack with expiration
 * - Helper methods (showSuccess, showError, showWarning, showInfo)
 * - Full i18n support
 */
export const NotificationsProvider = ({ children }) => {
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState([]);
  const [activeToasts, setActiveToasts] = useState([]); // Renamed from 'toasts' for clarity
  const [undoStack, setUndoStack] = useState([]);

  // Rate limiting map for repeated errors (key: error hash, value: { count, lastShown, backoff })
  const rateLimitMapRef = useRef(new Map());

  // Notification hash map for duplicate prevention (key: hash, value: timestamp)
  const notificationHashMapRef = useRef(new Map());

  // Upload batch accumulation
  const uploadBatchRef = useRef([]);
  const uploadBatchTimerRef = useRef(null);

  // Get user ID for localStorage key
  const getUserId = () => {
    try {
      const user = JSON.parse(localStorage.getItem('user'));
      return user?.id || 'anonymous';
    } catch {
      return 'anonymous';
    }
  };

  // Load notifications from localStorage on mount (with migration guard + legacy mapper)
  useEffect(() => {
    const userId = getUserId();
    const storageKey = `koda_notifications_${userId}`;
    const stored = localStorage.getItem(storageKey);

    if (stored) {
      try {
        const parsed = JSON.parse(stored);

        // Validate structure (migration guard)
        if (Array.isArray(parsed)) {
          // Step 1: Migrate legacy keys in loaded notifications
          const migrated = migrateNotifications(parsed);

          // Step 2: Validate and normalize schema
          const validationResult = validateAndNormalizeNotifications(migrated);
          const validated = validationResult.valid;

          // Step 3: Cap to max 200 notifications to prevent unbounded growth
          const capped = validated.slice(0, 200);
          setNotifications(capped);

          // If we modified anything, update localStorage
          const wasModified =
            capped.length < parsed.length ||
            validationResult.invalid > 0 ||
            validationResult.normalized > 0;

          if (wasModified) {
            localStorage.setItem(storageKey, JSON.stringify(capped));
            console.log(
              `📦 [Notifications] Processed inbox: ${parsed.length} → ${capped.length} entries ` +
              `(${validationResult.invalid} invalid, ${validationResult.normalized} normalized)`
            );
          }
        } else {
          console.warn('Invalid notifications structure, resetting...');
          localStorage.removeItem(storageKey);
        }
      } catch (e) {
        console.error('Failed to parse stored notifications:', e);
        // Clear corrupted data
        localStorage.removeItem(storageKey);
      }
    }
  }, []);

  // Save notifications to localStorage whenever they change (with size cap)
  useEffect(() => {
    const userId = getUserId();
    const storageKey = `koda_notifications_${userId}`;

    // Cap to max 200 notifications to prevent unbounded growth
    const toStore = notifications.slice(0, 200);

    try {
      localStorage.setItem(storageKey, JSON.stringify(toStore));
    } catch (e) {
      console.error('Failed to save notifications to localStorage:', e);
      // If quota exceeded, clear old entries and retry
      if (e.name === 'QuotaExceededError') {
        const reduced = toStore.slice(0, 100);
        try {
          localStorage.setItem(storageKey, JSON.stringify(reduced));
          console.warn('📦 [Notifications] Reduced inbox to 100 entries due to storage quota');
        } catch (retryError) {
          console.error('Failed to save even after reducing:', retryError);
        }
      }
    }
  }, [notifications]);

  // Calculate unread count
  const unreadCount = notifications.filter(n => !n.isRead).length;

  // Add a new notification with structured event model
  const addNotification = useCallback((notification) => {
    // GUARD: Enforce inbox persistence (100% coverage requirement)
    if (notification.toastOnly && process.env.NODE_ENV === 'development') {
      console.warn(
        '[NotificationsStore] toastOnly is deprecated and violates 100% inbox coverage requirement.',
        'All notifications must appear in NotificationPanel inbox.',
        'Use skipToast: true if you want silent logging only.',
        notification
      );
    }

    // Structured event object (B1 requirement)
    let newNotification = {
      id: uuidv4(),
      timestamp: Date.now(),
      isRead: false,
      // Core event properties
      eventKey: notification.eventKey || 'generic.notification',
      type: notification.type || 'info',
      // i18n keys (preferred) or legacy string values
      titleKey: notification.titleKey,
      messageKey: notification.messageKey,
      title: notification.title, // Fallback for legacy calls
      message: notification.message,
      details: notification.details,
      // Interpolation variables
      vars: notification.vars || {},
      // Metadata for filtering/grouping
      meta: {
        scope: notification.meta?.scope || 'system',
        source: notification.meta?.source || 'unknown',
        relatedIds: notification.meta?.relatedIds || [],
        fileTypes: notification.meta?.fileTypes || [],
        dedupeKey: notification.meta?.dedupeKey || null,
        ...notification.meta
      },
      // Toast behavior
      duration: notification.duration,
      action: notification.action,
      // Inbox behavior (skipToast for silent logging only)
      skipToast: notification.skipToast || false,
    };

    // ✅ MIGRATE LEGACY KEYS (run on every addNotification)
    newNotification = migrateNotification(newNotification);

    // Check for duplicate using dedupeKey or fallback to type+title
    // Extended window to 10s (was 5s) for better duplicate prevention
    const dedupeKey = newNotification.meta.dedupeKey || `${newNotification.type}:${newNotification.title || newNotification.titleKey}`;
    const existingNotification = notifications.find(
      n => {
        const nDedupeKey = n.meta?.dedupeKey || `${n.type}:${n.title || n.titleKey}`;
        return nDedupeKey === dedupeKey && Date.now() - n.timestamp < 10000; // 10s window
      }
    );

    if (existingNotification) {
      // Update timestamp of existing notification (refresh it)
      setNotifications(prev => prev.map(n =>
        n.id === existingNotification.id
          ? { ...n, timestamp: Date.now(), isRead: false } // Refresh timestamp, mark unread
          : n
      ));
      return existingNotification.id; // Return existing ID
    }

    // ALWAYS add to notifications inbox (A2 requirement: 100% coverage)
    // toastOnly is deprecated and ignored
    setNotifications(prev => [newNotification, ...prev]);

    // Add to activeToasts (max 3) unless skipToast is set
    if (!notification.skipToast) {
      setActiveToasts(prev => {
        const updated = [newNotification, ...prev].slice(0, 3);
        return updated;
      });
    }

    // If has undo action, add to undo stack
    if (notification.action?.type === 'undo') {
      setUndoStack(prev => [...prev, {
        notificationId: newNotification.id,
        data: notification.action.data,
        expiresAt: Date.now() + (notification.undoWindow || 6000)
      }].slice(-5)); // Keep max 5 undo actions
    }

    return newNotification.id;
  }, [notifications]);

  // Remove a toast
  const removeToast = useCallback((toastId) => {
    setActiveToasts(prev => prev.filter(t => t.id !== toastId));
  }, []);

  // Mark notification as read
  const markAsRead = useCallback(async (notificationId) => {
    setNotifications(prev =>
      prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n)
    );

    // TODO: Call API when backend is ready
    // await notificationService.markAsRead(notificationId);
  }, []);

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));

    // TODO: Call API when backend is ready
    // await notificationService.markAllAsRead();
  }, []);

  // Delete a notification
  const deleteNotification = useCallback(async (notificationId) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));

    // TODO: Call API when backend is ready
    // await notificationService.deleteNotification(notificationId);
  }, []);

  // Get unread notifications
  const getUnreadNotifications = useCallback(() => {
    return notifications.filter(n => !n.isRead);
  }, [notifications]);

  // Get read notifications
  const getReadNotifications = useCallback(() => {
    return notifications.filter(n => n.isRead);
  }, [notifications]);

  // Undo last action
  const undoLastAction = useCallback(async (notificationId) => {
    const undoItem = undoStack.find(u => u.notificationId === notificationId);

    if (!undoItem || Date.now() > undoItem.expiresAt) {
      return false;
    }

    // Remove from undo stack
    setUndoStack(prev => prev.filter(u => u.notificationId !== notificationId));

    // Remove the toast
    removeToast(notificationId);

    // Return the undo data for the caller to handle
    return undoItem.data;
  }, [undoStack, removeToast]);

  // Check if undo is available for a notification
  const isUndoAvailable = useCallback((notificationId) => {
    const undoItem = undoStack.find(u => u.notificationId === notificationId);
    return undoItem && Date.now() < undoItem.expiresAt;
  }, [undoStack]);

  // Clear all notifications
  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  // ============================================================================
  // HELPER METHODS - Convenience functions for common notification patterns
  // ============================================================================

  /**
   * Show success notification
   * @param {string} title - Main message
   * @param {object} options - Optional configuration (eventKey, message, details, vars, meta, action, skipToast)
   */
  const showSuccess = useCallback((title, options = {}) => {
    return addNotification({
      eventKey: options.eventKey || 'generic.success',
      type: 'success',
      title,
      titleKey: options.titleKey,
      message: options.message,
      messageKey: options.messageKey,
      details: options.details,
      vars: options.vars,
      meta: options.meta,
      duration: options.duration || 5000,
      action: options.action,
      skipToast: options.skipToast, // Silent logging only
    });
  }, [addNotification]);

  /**
   * Show error notification with rate limiting
   * @param {string} title - Main message
   * @param {object} options - Optional configuration (eventKey, category, message, details, vars, meta, action, skipToast)
   */
  const showError = useCallback((title, options = {}) => {
    const errorKey = options.category || 'generic';
    const errorData = rateLimitMapRef.current.get(errorKey) || { count: 0, lastShown: 0, backoff: 1000 };

    const now = Date.now();
    const timeSinceLastError = now - errorData.lastShown;

    // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
    if (timeSinceLastError < errorData.backoff) {
      return null; // Rate limited
    }

    errorData.count += 1;
    errorData.lastShown = now;
    errorData.backoff = Math.min(errorData.backoff * 2, 30000);
    rateLimitMapRef.current.set(errorKey, errorData);

    // Reset backoff after 60 seconds of no errors
    setTimeout(() => {
      const current = rateLimitMapRef.current.get(errorKey);
      if (current && (Date.now() - current.lastShown) > 60000) {
        rateLimitMapRef.current.delete(errorKey);
      }
    }, 60000);

    return addNotification({
      eventKey: options.eventKey || 'generic.error',
      type: 'error',
      title,
      titleKey: options.titleKey,
      message: options.message,
      messageKey: options.messageKey,
      details: options.details,
      vars: options.vars,
      meta: options.meta,
      duration: options.duration || 8000,
      action: options.action,
      skipToast: options.skipToast, // Silent logging only
    });
  }, [addNotification]);

  /**
   * Show warning notification
   * @param {string} title - Main message
   * @param {object} options - Optional configuration (eventKey, message, details, vars, meta, action, skipToast)
   */
  const showWarning = useCallback((title, options = {}) => {
    return addNotification({
      eventKey: options.eventKey || 'generic.warning',
      type: 'warning',
      title,
      titleKey: options.titleKey,
      message: options.message,
      messageKey: options.messageKey,
      details: options.details,
      vars: options.vars,
      meta: options.meta,
      duration: options.duration || 7000,
      action: options.action,
      skipToast: options.skipToast, // Silent logging only
    });
  }, [addNotification]);

  /**
   * Show info notification
   * @param {string} title - Main message
   * @param {object} options - Optional configuration (eventKey, message, details, vars, meta, action, skipToast)
   */
  const showInfo = useCallback((title, options = {}) => {
    return addNotification({
      eventKey: options.eventKey || 'generic.info',
      type: 'info',
      title,
      titleKey: options.titleKey,
      message: options.message,
      messageKey: options.messageKey,
      details: options.details,
      vars: options.vars,
      meta: options.meta,
      duration: options.duration || 5000,
      action: options.action,
      skipToast: options.skipToast, // Silent logging only
    });
  }, [addNotification]);

  /**
   * Show upload success with batch accumulation
   * Accumulates multiple uploads within 500ms into single notification
   * @param {number} count - Number of files uploaded
   * @param {object} options - Optional configuration (message, fileTypes, meta)
   */
  const showUploadSuccess = useCallback((count, options = {}) => {
    uploadBatchRef.current.push(count);

    if (uploadBatchTimerRef.current) {
      clearTimeout(uploadBatchTimerRef.current);
    }

    uploadBatchTimerRef.current = setTimeout(() => {
      const totalCount = uploadBatchRef.current.reduce((sum, n) => sum + n, 0);
      uploadBatchRef.current = [];

      const title = t('notifications.events.upload.success', { count: totalCount });

      addNotification({
        eventKey: 'upload.success',
        type: 'success',
        title,
        titleKey: 'notifications.events.upload.success',
        vars: { count: totalCount },
        message: options.message,
        meta: {
          scope: 'upload',
          source: 'uploadService',
          fileTypes: options.fileTypes || [],
          ...options.meta
        },
        duration: 5000,
        skipToast: options.skipToast,
      });
    }, 500);
  }, [addNotification, t]);

  /**
   * Show upload error
   * @param {string} errorMessage - Error message
   * @param {string} details - Optional error details
   * @param {function} onRetry - Optional retry callback
   */
  const showUploadError = useCallback((errorMessage, details, onRetry) => {
    return addNotification({
      type: 'error',
      title: errorMessage,
      message: details,
      duration: onRetry ? 0 : 8000, // Sticky if retry available
      action: onRetry ? {
        label: t('common.retry'),
        onClick: onRetry,
      } : undefined,
    });
  }, [addNotification, t]);

  /**
   * Show delete success with aggregated count
   * Accumulates deletes and shows batched notification
   * @param {string} itemType - Type of item deleted ('document', 'category', etc.)
   * @param {number} count - Number of items deleted
   */
  const showDeleteSuccess = useCallback((itemType, count = 1) => {
    const title = t('notifications.events.document.deleted', { count });

    return addNotification({
      type: 'success',
      title,
      duration: 5000,
    });
  }, [addNotification, t]);

  /**
   * Show rate limit warning (throttled to once per 30s)
   */
  const showRateLimitWarning = useCallback(() => {
    const key = 'rate_limit';
    const lastShown = rateLimitMapRef.current.get(key)?.lastShown || 0;
    const now = Date.now();

    if (now - lastShown < 30000) {
      return null; // Shown recently, skip
    }

    rateLimitMapRef.current.set(key, { lastShown: now, count: 1, backoff: 1000 });

    return addNotification({
      type: 'warning',
      title: t('notifications.events.system.rate_limit_warning'),
      message: t('notifications.events.system.rate_limit_details'),
      duration: 7000,
    });
  }, [addNotification, t]);

  /**
   * Show file exists notification
   * @param {string} filename - Name of duplicate file
   * @param {number} count - Number of duplicate files
   */
  const showFileExists = useCallback((filename, count = 1) => {
    const title = count > 1
      ? t('notifications.events.upload.duplicate_plural', { count })
      : t('notifications.events.upload.duplicate', { fileName: filename });

    return addNotification({
      type: 'warning',
      title,
      duration: 7000,
    });
  }, [addNotification, t]);

  // ============================================================================
  // FILE-TYPE INTELLIGENCE NOTIFICATIONS (A1 requirement)
  // ============================================================================

  /**
   * Show file-type detection notification
   * @param {object} analysis - File type analysis { totalCount, typeGroups: [{type, count, extensions}] }
   */
  const showFileTypeDetected = useCallback((analysis) => {
    const { totalCount, typeGroups } = analysis;
    const uniqueFormats = typeGroups.length;

    const title = t('upload.fileTypeDetected.title');
    const message = t('upload.fileTypeDetected.message', { count: totalCount, formats: uniqueFormats });

    // Build details string with top formats
    const topFormats = typeGroups.slice(0, 3).map(g => `${g.extensions.join(', ')}: ${g.count}`).join('; ');
    const details = uniqueFormats > 3
      ? `${topFormats}; +${uniqueFormats - 3} more`
      : topFormats;

    // ✅ STABLE DEDUPE KEY: Based on file type groups, not timestamp
    const dedupeKey = buildFileTypeDetectedDedupeKey(typeGroups);

    return addNotification({
      eventKey: 'upload.fileTypeDetected',
      type: 'info',
      title,
      titleKey: 'upload.fileTypeDetected.title',
      message,
      messageKey: 'upload.fileTypeDetected.message',
      details,
      vars: { count: totalCount, formats: uniqueFormats },
      meta: {
        scope: 'upload',
        source: 'fileTypeAnalyzer',
        fileTypes: typeGroups.map(g => g.type),
        dedupeKey
      },
      duration: 7000,
    });
  }, [addNotification, t]);

  /**
   * Show unsupported files warning
   * @param {array} unsupportedFiles - Array of {name, extension}
   */
  const showUnsupportedFiles = useCallback((unsupportedFiles) => {
    const count = unsupportedFiles.length;
    const extensions = [...new Set(unsupportedFiles.map(f => f.extension))].join(', ');

    const titleKey = count === 1 ? 'upload.unsupportedFiles.title' : 'upload.unsupportedFiles.title_plural';
    const title = t(titleKey, { count });
    const message = t('upload.unsupportedFiles.message', { extensions });

    const fileList = unsupportedFiles.slice(0, 3).map(f => f.name).join(', ');
    const details = count > 3
      ? `${fileList}, +${count - 3} more`
      : fileList;

    // ✅ STABLE DEDUPE KEY: Based on extensions and count, not timestamp
    const dedupeKey = buildFileTypeDedupeKey('upload.unsupportedFiles', unsupportedFiles, { totalCount: count });

    return addNotification({
      eventKey: 'upload.unsupportedFiles',
      type: 'warning',
      title,
      titleKey,
      message,
      messageKey: 'upload.unsupportedFiles.message',
      details,
      vars: { count, extensions },
      meta: {
        scope: 'upload',
        source: 'fileTypeAnalyzer',
        fileTypes: unsupportedFiles.map(f => f.extension),
        dedupeKey
      },
      duration: 0, // Sticky - requires user action
    });
  }, [addNotification, t]);

  /**
   * Show limited support files info
   * @param {array} limitedFiles - Array of {name, extension, reason}
   */
  const showLimitedSupportFiles = useCallback((limitedFiles) => {
    const count = limitedFiles.length;
    const extensions = [...new Set(limitedFiles.map(f => f.extension))].join(', ');

    const titleKey = count === 1 ? 'upload.limitedSupport.title' : 'upload.limitedSupport.title_plural';
    const title = t(titleKey, { count });
    const message = t('upload.limitedSupport.message', { extensions });

    // ✅ STABLE DEDUPE KEY: Based on extensions and count, not timestamp
    const dedupeKey = buildFileTypeDedupeKey('upload.limitedSupport', limitedFiles, { totalCount: count });

    return addNotification({
      eventKey: 'upload.limitedSupport',
      type: 'warning',
      title,
      titleKey,
      message,
      messageKey: 'upload.limitedSupport.message',
      vars: { count, extensions },
      meta: {
        scope: 'upload',
        source: 'fileTypeAnalyzer',
        fileTypes: limitedFiles.map(f => f.extension),
        dedupeKey
      },
      duration: 8000,
    });
  }, [addNotification, t]);

  /**
   * Show no text detected warning
   * @param {array} emptyFiles - Array of {name, extension}
   */
  const showNoTextDetected = useCallback((emptyFiles) => {
    const count = emptyFiles.length;

    const titleKey = count === 1 ? 'upload.noTextDetected.title' : 'upload.noTextDetected.title_plural';
    const title = t(titleKey, { count });
    const message = t('upload.noTextDetected.message');

    // ✅ STABLE DEDUPE KEY: Based on file count, not timestamp
    const dedupeKey = buildFileTypeDedupeKey('upload.noTextDetected', emptyFiles, { totalCount: count });

    return addNotification({
      eventKey: 'upload.noTextDetected',
      type: 'warning',
      title,
      titleKey,
      message,
      messageKey: 'upload.noTextDetected.message',
      vars: { count },
      meta: {
        scope: 'upload',
        source: 'fileTypeAnalyzer',
        dedupeKey
      },
      duration: 8000,
    });
  }, [addNotification, t]);

  // ============================================================================
  // CLEANUP: Remove expired undo actions every 10 seconds
  // ============================================================================
  useEffect(() => {
    const interval = setInterval(() => {
      setUndoStack(prev => {
        if (prev.length === 0) return prev; // no-op — keep same reference
        const now = Date.now();
        const filtered = prev.filter(item => item.expiresAt > now);
        return filtered.length === prev.length ? prev : filtered;
      });
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  const value = {
    notifications,
    activeToasts,
    toasts: activeToasts, // Backward compatibility alias
    unreadCount,
    addNotification,
    removeToast,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    getUnreadNotifications,
    getReadNotifications,
    undoLastAction,
    isUndoAvailable,
    clearAllNotifications,
    // Helper methods
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showUploadSuccess,
    showUploadError,
    showDeleteSuccess,
    showRateLimitWarning,
    showFileExists,
    // File-type intelligence helpers
    showFileTypeDetected,
    showUnsupportedFiles,
    showLimitedSupportFiles,
    showNoTextDetected,
  };

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
};

// Hook to access notifications context
export const useNotifications = () => {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationsProvider');
  }
  return context;
};

export default NotificationsContext;
