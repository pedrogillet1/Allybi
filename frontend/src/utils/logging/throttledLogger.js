/**
 * throttledLogger.js
 * Prevents console spam by throttling repeated warnings
 * Especially useful in production for translation missing warnings
 */

// Track last logged timestamps for each unique message
const logTimestamps = new Map();

// Throttle duration in milliseconds
const THROTTLE_DEV_MS = 5000;  // 5 seconds in development
const THROTTLE_PROD_MS = 30000; // 30 seconds in production

/**
 * Logs a warning with throttling to prevent console spam
 * @param {string} message - The warning message to log
 * @param {string} category - Optional category for grouping (default: 'general')
 */
export function throttledWarn(message, category = 'general') {
  const now = Date.now();
  const key = `${category}:${message}`;
  const lastLogged = logTimestamps.get(key);

  // Determine throttle duration based on environment
  const isProduction = process.env.NODE_ENV === 'production';
  const throttleDuration = isProduction ? THROTTLE_PROD_MS : THROTTLE_DEV_MS;

  // Check if we should log this message
  if (!lastLogged || (now - lastLogged) >= throttleDuration) {
    console.warn(message);
    logTimestamps.set(key, now);
  }
}

/**
 * Logs an error with throttling (always logs in development, throttled in production)
 * @param {string} message - The error message to log
 * @param {string} category - Optional category for grouping
 */
export function throttledError(message, category = 'general') {
  const now = Date.now();
  const key = `${category}:${message}`;
  const lastLogged = logTimestamps.get(key);

  const isProduction = process.env.NODE_ENV === 'production';
  const throttleDuration = isProduction ? THROTTLE_PROD_MS : 0; // Never throttle in dev

  if (!lastLogged || (now - lastLogged) >= throttleDuration) {
    console.error(message);
    logTimestamps.set(key, now);
  }
}

/**
 * Clears the throttle cache for a specific category or all categories
 * @param {string} category - Optional category to clear (clears all if not provided)
 */
export function clearThrottleCache(category = null) {
  if (category) {
    // Clear only entries matching the category
    for (const key of logTimestamps.keys()) {
      if (key.startsWith(`${category}:`)) {
        logTimestamps.delete(key);
      }
    }
  } else {
    // Clear all
    logTimestamps.clear();
  }
}

/**
 * Gets statistics about throttled logs (for debugging)
 * @returns {Object} Statistics object with counts and categories
 */
export function getThrottleStats() {
  const stats = {
    totalKeys: logTimestamps.size,
    categories: {}
  };

  for (const key of logTimestamps.keys()) {
    const [category] = key.split(':');
    stats.categories[category] = (stats.categories[category] || 0) + 1;
  }

  return stats;
}
