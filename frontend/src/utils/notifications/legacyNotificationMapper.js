/**
 * Legacy Notification Key Mapper
 *
 * Migrates old notification keys to new namespace structure.
 * Ensures backward compatibility while standardizing on new keys.
 *
 * Legacy pattern: upload.notifications.uploadComplete
 * New pattern: notifications.uploadComplete
 *
 * Includes telemetry to track migration patterns and unmapped keys.
 */

import { throttledWarn } from '../logging/throttledLogger';

/**
 * Migration statistics
 */
const migrationStats = {
  totalMigrations: 0,
  mappedKeys: {},
  unmappedLegacyKeys: new Set(),
};

/**
 * Legacy to new key mappings (expanded coverage)
 */
const KEY_MAPPINGS = {
  // Upload notifications (old nested structure)
  'upload.notifications.uploadComplete': 'notifications.uploadComplete',
  'upload.notifications.uploadCompleteText': 'notifications.uploadCompleteText',
  'upload.notifications.uploadFailed': 'notifications.uploadFailed',
  'upload.notifications.uploadFailedText': 'notifications.uploadFailedText',
  'upload.notifications.uploadPartialComplete': 'notifications.uploadPartialComplete',
  'upload.notifications.uploadPartialCompleteText': 'notifications.uploadPartialCompleteText',
  'upload.notifications.storageAlmostFull': 'notifications.storageAlmostFull',
  'upload.notifications.storageAlmostFullText': 'notifications.storageAlmostFullText',
  'upload.notifications.storageRunningLow': 'notifications.storageWarning',
  'upload.notifications.storageRunningLowText': 'notifications.storageWarningText',
  'upload.notifications.storageFull': 'notifications.storageAlmostFull',

  // Old success/error patterns
  'notifications.uploadSuccess': 'notifications.uploadComplete',
  'notifications.deleteSuccess': 'notifications.events.document.deleted',
  'notifications.moveSuccess': 'notifications.events.document.moved',
  'notifications.renameSuccess': 'notifications.events.document.renamed',
  'notifications.folderDeleted': 'notifications.events.folder.deleted',
  'notifications.folderMoved': 'notifications.events.folder.moved',
  'notifications.folderRenamed': 'notifications.events.folder.renamed',

  // Legacy event keys (if any exist)
  'document.deleted': 'notifications.events.document.deleted',
  'document.uploaded': 'notifications.uploadComplete',
  'document.moved': 'notifications.events.document.moved',
  'document.renamed': 'notifications.events.document.renamed',
  'folder.deleted': 'notifications.events.folder.deleted',
  'folder.moved': 'notifications.events.folder.moved',
  'folder.renamed': 'notifications.events.folder.renamed',

  // Auth/Security notifications
  'auth.loginSuccess': 'notifications.loginSuccess',
  'auth.loginSecurityNotice': 'notifications.loginSecurityNotice',
  'security.accountAccess': 'notifications.loginSecurityNotice',

  // Storage notifications (alternative patterns)
  'storage.warning': 'notifications.storageWarning',
  'storage.almostFull': 'notifications.storageAlmostFull',
  'storage.runningLow': 'notifications.storageWarning',

  // Alternative upload patterns
  'upload.success': 'notifications.uploadComplete',
  'upload.failed': 'notifications.uploadFailed',
  'upload.complete': 'notifications.uploadComplete',
  'upload.error': 'notifications.uploadFailed',

  // Settings/Profile notifications
  'settings.saved': 'notifications.allMarkedRead', // Generic success
  'profile.updated': 'notifications.allMarkedRead', // Generic success
};

/**
 * Maps a legacy key to its modern equivalent
 * @param {string} key - Translation key
 * @returns {string} - Mapped key or original if no mapping exists
 */
export function mapLegacyKey(key) {
  if (!key || typeof key !== 'string') return key;

  // Direct mapping
  if (KEY_MAPPINGS[key]) {
    // Track this migration
    migrationStats.totalMigrations++;
    migrationStats.mappedKeys[key] = (migrationStats.mappedKeys[key] || 0) + 1;
    return KEY_MAPPINGS[key];
  }

  // Pattern-based mappings
  // e.g., "notifications.events.*.title" is already modern
  if (key.startsWith('notifications.events.')) {
    return key;
  }

  // Modern "notifications.*" keys (already correct namespace)
  if (key.startsWith('notifications.')) {
    return key;
  }

  // Fallback: Try to auto-migrate old nested patterns
  // Pattern: "*.notifications.*" → "notifications.*"
  if (key.includes('.notifications.')) {
    const parts = key.split('.');
    const notifIndex = parts.indexOf('notifications');
    if (notifIndex > 0) {
      const modernKey = 'notifications.' + parts.slice(notifIndex + 1).join('.');
      throttledWarn(
        `[LegacyMapper] Auto-migrated unknown key: ${key} → ${modernKey}`,
        'legacy-migration'
      );
      migrationStats.unmappedLegacyKeys.add(key);
      return modernKey;
    }
  }

  // Log unmapped legacy keys that look like keys
  if (looksLikeTranslationKey(key) && !key.startsWith('notifications.')) {
    migrationStats.unmappedLegacyKeys.add(key);
    throttledWarn(
      `[LegacyMapper] Unmapped legacy key: ${key}. Consider adding to KEY_MAPPINGS.`,
      'legacy-migration'
    );
  }

  // Return original if no mapping
  return key;
}

/**
 * Checks if a string looks like a translation key
 * (contains dots and no spaces)
 * @param {string} str - String to check
 * @returns {boolean}
 */
export function looksLikeTranslationKey(str) {
  if (!str || typeof str !== 'string') return false;
  return str.includes('.') && !str.includes(' ') && str.length < 100;
}

/**
 * Migrates a notification object to use modern keys
 * @param {object} notification - Notification object
 * @returns {object} - Migrated notification
 */
export function migrateNotification(notification) {
  if (!notification) return notification;

  const migrated = { ...notification };

  // Migrate titleKey
  if (migrated.titleKey) {
    migrated.titleKey = mapLegacyKey(migrated.titleKey);
  }

  // Migrate messageKey
  if (migrated.messageKey) {
    migrated.messageKey = mapLegacyKey(migrated.messageKey);
  }

  // Handle case where title IS a key (should be titleKey)
  if (migrated.title && !migrated.titleKey && looksLikeTranslationKey(migrated.title)) {
    migrated.titleKey = mapLegacyKey(migrated.title);
    delete migrated.title; // Remove so rendering uses titleKey
  }

  // Handle case where message IS a key (should be messageKey)
  if (migrated.message && !migrated.messageKey && looksLikeTranslationKey(migrated.message)) {
    migrated.messageKey = mapLegacyKey(migrated.message);
    delete migrated.message; // Remove so rendering uses messageKey
  }

  return migrated;
}

/**
 * Migrates a batch of notifications
 * @param {array} notifications - Array of notification objects
 * @returns {array} - Migrated notifications
 */
export function migrateNotifications(notifications) {
  if (!Array.isArray(notifications)) return notifications;
  return notifications.map(migrateNotification);
}

/**
 * Gets migration statistics
 * Useful for debugging and monitoring legacy key usage
 * @returns {object} - Migration statistics
 */
export function getMigrationStats() {
  return {
    totalMigrations: migrationStats.totalMigrations,
    uniqueMappedKeys: Object.keys(migrationStats.mappedKeys).length,
    mappedKeys: { ...migrationStats.mappedKeys },
    unmappedLegacyKeys: Array.from(migrationStats.unmappedLegacyKeys),
    unmappedCount: migrationStats.unmappedLegacyKeys.size,
  };
}

/**
 * Resets migration statistics
 * Useful for testing or clearing counters
 */
export function resetMigrationStats() {
  migrationStats.totalMigrations = 0;
  migrationStats.mappedKeys = {};
  migrationStats.unmappedLegacyKeys.clear();
}

/**
 * Logs current migration statistics to console
 * For debugging purposes
 */
export function logMigrationStats() {
  const stats = getMigrationStats();
  console.group('📊 Legacy Key Migration Statistics');
  console.log(`Total migrations: ${stats.totalMigrations}`);
  console.log(`Unique mapped keys: ${stats.uniqueMappedKeys}`);
  if (stats.unmappedCount > 0) {
    console.warn(`Unmapped legacy keys found: ${stats.unmappedCount}`);
    console.table(stats.unmappedLegacyKeys);
  }
  if (Object.keys(stats.mappedKeys).length > 0) {
    console.log('Migration frequency:');
    console.table(stats.mappedKeys);
  }
  console.groupEnd();
}

export default {
  mapLegacyKey,
  looksLikeTranslationKey,
  migrateNotification,
  migrateNotifications,
  getMigrationStats,
  resetMigrationStats,
  logMigrationStats,
};
