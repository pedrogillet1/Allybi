/**
 * Global Logging Setup for Koda RAG
 *
 * This module overrides the global console object to respect LOG_LEVEL.
 * Import this ONCE at the top of your main entry point (index.ts or app.ts).
 *
 * Usage:
 *   import './utils/setupLogging';
 *
 * Environment Variables:
 *   LOG_LEVEL: 'error' | 'warn' | 'info' | 'debug' (default: 'debug' in dev, 'error' in prod)
 *
 * Performance Impact:
 *   - With LOG_LEVEL=error: All console.log/debug/info calls become no-ops (~0ms)
 *   - With LOG_LEVEL=debug: Full logging (same as before)
 */

const LOG_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'error' : 'debug');

// Store original console methods for fallback
const originalConsole = {
  log: console.log.bind(console),
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

// Define log level hierarchy
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
} as const;

const currentLevel = LOG_LEVELS[LOG_LEVEL as keyof typeof LOG_LEVELS] ?? LOG_LEVELS.debug;

/**
 * No-op function for disabled log levels
 */
const noop = () => {};

/**
 * Override console methods based on LOG_LEVEL
 */
if (process.env.NODE_ENV === 'production' || LOG_LEVEL === 'error') {
  // Production: Only errors
  console.log = noop;
  console.debug = noop;
  console.info = noop;
  console.warn = currentLevel >= LOG_LEVELS.warn ? originalConsole.warn : noop;
  // console.error remains unchanged
} else if (LOG_LEVEL === 'warn') {
  // Warnings and errors only
  console.log = noop;
  console.debug = noop;
  console.info = noop;
  // console.warn and console.error remain unchanged
} else if (LOG_LEVEL === 'info') {
  // Info, warnings, and errors
  console.debug = noop;
  // console.log, console.info, console.warn, console.error remain unchanged
}
// LOG_LEVEL === 'debug': All logs enabled (no changes needed)

// Log the logging configuration once at startup
if (currentLevel >= LOG_LEVELS.info) {
  originalConsole.info(`[LOGGING] Log level set to: ${LOG_LEVEL} (NODE_ENV: ${process.env.NODE_ENV || 'development'})`);
}

/**
 * Export original console for cases where you ALWAYS want to log
 * (e.g., startup messages, critical errors)
 */
export { originalConsole };

/**
 * Restore original console (useful for testing)
 */
export function restoreConsole() {
  console.log = originalConsole.log;
  console.debug = originalConsole.debug;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
}
