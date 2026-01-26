/**
 * Structured Logger for Koda RAG
 *
 * Uses Pino for high-performance structured logging.
 * Respects LOG_LEVEL environment variable:
 * - 'error': Only errors (production recommended)
 * - 'warn': Errors and warnings
 * - 'info': Errors, warnings, and info
 * - 'debug': All logs (development)
 *
 * Performance Impact:
 * - In production (LOG_LEVEL=error): ~0ms overhead (logs are skipped)
 * - In development: Full logging with pretty printing
 */

import pino from 'pino';

// Determine log level from environment
const LOG_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'error' : 'debug');

// Create Pino logger instance
const pinoLogger = pino({
  level: LOG_LEVEL,
  transport: process.env.NODE_ENV !== 'production'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        }
      }
    : undefined,
  // Add timestamp in production
  timestamp: process.env.NODE_ENV === 'production' ? pino.stdTimeFunctions.isoTime : false,
});

/**
 * Logger interface that matches common logging patterns
 */
export const logger = {
  // Standard log levels
  debug: (message: string, data?: object) => {
    if (data) {
      pinoLogger.debug(data, message);
    } else {
      pinoLogger.debug(message);
    }
  },

  info: (message: string, data?: object) => {
    if (data) {
      pinoLogger.info(data, message);
    } else {
      pinoLogger.info(message);
    }
  },

  warn: (message: string, data?: object) => {
    if (data) {
      pinoLogger.warn(data, message);
    } else {
      pinoLogger.warn(message);
    }
  },

  error: (message: string, data?: object) => {
    if (data) {
      pinoLogger.error(data, message);
    } else {
      pinoLogger.error(message);
    }
  },

  // RAG-specific logging helpers
  rag: {
    stage: (stage: string, message: string, data?: object) => {
      pinoLogger.debug({ stage, ...data }, `[RAG:${stage}] ${message}`);
    },
    timing: (operation: string, durationMs: number, data?: object) => {
      pinoLogger.debug({ operation, durationMs, ...data }, `[TIMING] ${operation}: ${durationMs}ms`);
    },
    retrieval: (source: string, count: number, data?: object) => {
      pinoLogger.debug({ source, count, ...data }, `[RETRIEVAL] ${source}: ${count} results`);
    },
  },

  // Get the underlying Pino instance for advanced use
  pino: pinoLogger,
};

/**
 * Performance-optimized console replacement
 *
 * This can be used to override console.log globally in production.
 * Only logs if LOG_LEVEL allows it.
 */
export const performanceConsole = {
  log: (...args: any[]) => {
    if (LOG_LEVEL === 'debug') {
      pinoLogger.debug({ args }, args[0]?.toString() || 'log');
    }
  },

  warn: (...args: any[]) => {
    if (['debug', 'info', 'warn'].includes(LOG_LEVEL)) {
      pinoLogger.warn({ args }, args[0]?.toString() || 'warning');
    }
  },

  error: (...args: any[]) => {
    pinoLogger.error({ args }, args[0]?.toString() || 'error');
  },

  info: (...args: any[]) => {
    if (['debug', 'info'].includes(LOG_LEVEL)) {
      pinoLogger.info({ args }, args[0]?.toString() || 'info');
    }
  },

  debug: (...args: any[]) => {
    if (LOG_LEVEL === 'debug') {
      pinoLogger.debug({ args }, args[0]?.toString() || 'debug');
    }
  },
};

/**
 * Check if logging is enabled for a given level
 * Useful for expensive string operations that should be skipped in production
 */
export const isLoggingEnabled = (level: 'debug' | 'info' | 'warn' | 'error' = 'debug'): boolean => {
  const levels = ['error', 'warn', 'info', 'debug'];
  const currentLevelIndex = levels.indexOf(LOG_LEVEL);
  const requestedLevelIndex = levels.indexOf(level);
  return requestedLevelIndex <= currentLevelIndex;
};

/**
 * Conditional logging - only executes the message function if logging is enabled
 * Prevents expensive string operations in production
 */
export const logIfEnabled = (level: 'debug' | 'info' | 'warn' | 'error', messageFn: () => string, data?: object) => {
  if (isLoggingEnabled(level)) {
    logger[level](messageFn(), data);
  }
};

export default logger;
