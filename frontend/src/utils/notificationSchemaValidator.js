/**
 * notificationSchemaValidator.js
 * Ensures notification objects have consistent schema structure
 * Normalizes missing fields with safe defaults
 * Validates required fields to prevent runtime errors
 */

import { v4 as uuidv4 } from 'uuid';
import { throttledWarn } from './throttledLogger';

/**
 * Required fields for a valid notification
 */
const REQUIRED_FIELDS = ['id', 'type', 'timestamp', 'isRead'];

/**
 * Optional fields with defaults
 */
const DEFAULT_VALUES = {
  id: () => uuidv4(),
  eventKey: 'generic.notification',
  type: 'info',
  timestamp: () => Date.now(),
  isRead: false,
  titleKey: undefined,
  messageKey: undefined,
  title: '',
  message: '',
  details: undefined,
  vars: {},
  meta: {
    scope: 'system',
    source: 'unknown',
    relatedIds: [],
    fileTypes: [],
    dedupeKey: null,
  },
  duration: undefined,
  action: undefined,
  skipToast: false,
};

/**
 * Validates and normalizes a single notification object
 * @param {object} notification - Raw notification object from localStorage
 * @param {number} index - Index in array (for logging)
 * @returns {object|null} - Normalized notification or null if invalid
 */
export function validateAndNormalizeNotification(notification, index = -1) {
  if (!notification || typeof notification !== 'object') {
    throttledWarn(`[SchemaValidator] Invalid notification at index ${index}: not an object`, 'schema');
    return null;
  }

  // Create normalized copy
  const normalized = { ...notification };

  // Flag to track if we made any changes
  let wasModified = false;

  // Validate and normalize required fields
  for (const field of REQUIRED_FIELDS) {
    if (normalized[field] === undefined || normalized[field] === null) {
      const defaultValue = DEFAULT_VALUES[field];
      normalized[field] = typeof defaultValue === 'function' ? defaultValue() : defaultValue;
      wasModified = true;
      throttledWarn(
        `[SchemaValidator] Missing required field "${field}" at index ${index}, set to default: ${normalized[field]}`,
        'schema'
      );
    }
  }

  // Validate timestamp is a number
  if (typeof normalized.timestamp !== 'number') {
    const parsed = parseInt(normalized.timestamp, 10);
    normalized.timestamp = isNaN(parsed) ? Date.now() : parsed;
    wasModified = true;
  }

  // Validate isRead is a boolean
  if (typeof normalized.isRead !== 'boolean') {
    normalized.isRead = Boolean(normalized.isRead);
    wasModified = true;
  }

  // Ensure meta object exists and has required structure
  if (!normalized.meta || typeof normalized.meta !== 'object') {
    normalized.meta = { ...DEFAULT_VALUES.meta };
    wasModified = true;
  } else {
    // Normalize meta fields
    normalized.meta = {
      scope: normalized.meta.scope || 'system',
      source: normalized.meta.source || 'unknown',
      relatedIds: Array.isArray(normalized.meta.relatedIds) ? normalized.meta.relatedIds : [],
      fileTypes: Array.isArray(normalized.meta.fileTypes) ? normalized.meta.fileTypes : [],
      dedupeKey: normalized.meta.dedupeKey || null,
      ...normalized.meta, // Preserve any additional meta fields
    };
  }

  // Ensure vars object exists
  if (!normalized.vars || typeof normalized.vars !== 'object') {
    normalized.vars = {};
    wasModified = true;
  }

  // Validate type is a valid notification type
  const validTypes = ['info', 'success', 'warning', 'error', 'security'];
  if (!validTypes.includes(normalized.type)) {
    throttledWarn(
      `[SchemaValidator] Invalid type "${normalized.type}" at index ${index}, defaulting to "info"`,
      'schema'
    );
    normalized.type = 'info';
    wasModified = true;
  }

  // Set eventKey if missing
  if (!normalized.eventKey) {
    normalized.eventKey = 'generic.notification';
    wasModified = true;
  }

  // Log if modifications were made
  if (wasModified && process.env.NODE_ENV === 'development') {
    console.log(`[SchemaValidator] Normalized notification at index ${index}:`, {
      before: notification,
      after: normalized,
    });
  }

  return normalized;
}

/**
 * Validates and normalizes an array of notifications
 * Filters out invalid notifications that can't be normalized
 * @param {array} notifications - Raw notifications array from localStorage
 * @returns {object} - { valid: array, invalid: number, normalized: number }
 */
export function validateAndNormalizeNotifications(notifications) {
  if (!Array.isArray(notifications)) {
    throttledWarn('[SchemaValidator] Input is not an array, returning empty array', 'schema');
    return { valid: [], invalid: 0, normalized: 0 };
  }

  const results = {
    valid: [],
    invalid: 0,
    normalized: 0,
  };

  notifications.forEach((notification, index) => {
    const normalized = validateAndNormalizeNotification(notification, index);
    if (normalized) {
      results.valid.push(normalized);
      // Check if normalization was needed
      if (JSON.stringify(notification) !== JSON.stringify(normalized)) {
        results.normalized++;
      }
    } else {
      results.invalid++;
    }
  });

  // Log summary if any issues found
  if (results.invalid > 0 || results.normalized > 0) {
    console.group('[SchemaValidator] Notification Schema Validation Summary');
    console.log(`Total: ${notifications.length}`);
    console.log(`Valid: ${results.valid.length}`);
    console.log(`Normalized: ${results.normalized}`);
    console.log(`Invalid (removed): ${results.invalid}`);
    console.groupEnd();
  }

  return results;
}

/**
 * Creates a minimal valid notification object
 * Used as a fallback when notifications are completely broken
 * @param {string} type - Notification type
 * @param {string} title - Notification title
 * @returns {object} - Minimal valid notification
 */
export function createMinimalNotification(type = 'info', title = 'Notification') {
  return {
    id: uuidv4(),
    eventKey: 'generic.notification',
    type,
    timestamp: Date.now(),
    isRead: false,
    title,
    message: '',
    vars: {},
    meta: {
      scope: 'system',
      source: 'schemaValidator',
      relatedIds: [],
      fileTypes: [],
      dedupeKey: null,
    },
  };
}

export default {
  validateAndNormalizeNotification,
  validateAndNormalizeNotifications,
  createMinimalNotification,
};
