/**
 * Notification Deletion Batcher
 *
 * Implements Google Drive-style aggregation for notification deletions:
 * - 2000ms aggregation window
 * - Single toast for batched deletes
 * - One Undo action for entire batch
 * - Prevents duplicate toasts
 */

const AGGREGATION_WINDOW_MS = 2000;

class NotificationDeletionBatcher {
  constructor() {
    this.pendingIds = new Set();
    this.pendingNotifications = new Map(); // id -> notification object for undo
    this.timer = null;
    this.currentBatchId = null;
    this.toastKey = null;
    this.onBatchReady = null; // callback(ids, notifications)
    this.onShowToast = null;  // callback(count, undoCallback)
  }

  /**
   * Configure callbacks
   * @param {object} config - { onBatchReady, onShowToast }
   */
  configure({ onBatchReady, onShowToast }) {
    this.onBatchReady = onBatchReady;
    this.onShowToast = onShowToast;
  }

  /**
   * Queue a notification for deletion
   * @param {string} id - Notification ID
   * @param {object} notification - Full notification object (for undo restore)
   */
  queueDelete(id, notification) {
    // Add to pending
    this.pendingIds.add(id);
    this.pendingNotifications.set(id, notification);

    // If no timer running, start aggregation window
    if (!this.timer) {
      this.currentBatchId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      this.timer = setTimeout(() => this._flushBatch(), AGGREGATION_WINDOW_MS);
    }

    // Return current batch size for immediate feedback
    return this.pendingIds.size;
  }

  /**
   * Flush the current batch - show toast and call batch ready
   */
  _flushBatch() {
    const count = this.pendingIds.size;
    const ids = Array.from(this.pendingIds);
    const notifications = Array.from(this.pendingNotifications.entries()).map(([id, n]) => ({ id, ...n }));

    // Clear state
    this.timer = null;
    const batchId = this.currentBatchId;
    this.currentBatchId = null;

    // Store for undo
    const batchPayload = {
      ids,
      notifications,
      batchId,
    };

    // Clear pending AFTER storing
    this.pendingIds.clear();
    this.pendingNotifications.clear();

    // Notify that batch is ready for processing
    if (this.onBatchReady) {
      this.onBatchReady(ids, notifications);
    }

    // Show aggregated toast with undo
    if (this.onShowToast) {
      this.onShowToast(count, batchPayload);
    }
  }

  /**
   * Cancel pending batch (if user navigates away, etc.)
   */
  cancel() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pendingIds.clear();
    this.pendingNotifications.clear();
    this.currentBatchId = null;
  }

  /**
   * Check if there's an active batch
   */
  hasPendingBatch() {
    return this.pendingIds.size > 0;
  }

  /**
   * Get current pending count
   */
  getPendingCount() {
    return this.pendingIds.size;
  }
}

// Export singleton instance
export const notificationDeletionBatcher = new NotificationDeletionBatcher();

export default NotificationDeletionBatcher;
