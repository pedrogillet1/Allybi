import * as Sentry from '@sentry/node';

/**
 * Sentry Error Monitoring Configuration
 * Critical for production debugging and performance monitoring
 *
 * NOTE: Sentry is disabled by default. Set SENTRY_DSN environment variable to enable.
 */

export const initSentry = (app: any) => {
  // Skip Sentry in test environment
  if (process.env.NODE_ENV === 'test') {
    console.log('⚠️  Sentry: Skipped in test environment');
    return;
  }

  // Check if Sentry DSN is configured
  if (!process.env.SENTRY_DSN) {
    console.log('⚠️  Sentry: DSN not configured, error monitoring disabled');
    console.log('   Set SENTRY_DSN environment variable to enable Sentry');
    return;
  }

  try {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',

      // Performance Monitoring
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

      // Release tracking for deploy notifications
      release: process.env.SENTRY_RELEASE || `backend@${process.env.npm_package_version}`,

      // Filter sensitive data
      beforeSend(event, hint) {
        // Remove sensitive headers
        if (event.request?.headers) {
          delete event.request.headers['authorization'];
          delete event.request.headers['cookie'];
          delete event.request.headers['x-api-key'];
        }

        // Remove sensitive data from extra context
        if (event.extra) {
          delete event.extra.password;
          delete event.extra.passwordHash;
          delete event.extra.salt;
          delete event.extra.accessToken;
          delete event.extra.refreshToken;
        }

        return event;
      },

      // Ignore certain errors
      ignoreErrors: [
        // Ignore rate limit errors (expected behavior)
        'Rate limit exceeded',
        // Ignore auth errors (not bugs)
        'Unauthorized',
        'Forbidden',
        // Ignore validation errors
        'Validation failed',
      ],
    });

    console.log('✅ Sentry error monitoring initialized');
  } catch (error) {
    console.error('❌ Failed to initialize Sentry:', error);
  }
};

/**
 * Error handler middleware (must be registered after routes)
 * Returns a no-op middleware when Sentry is not configured
 */
export const sentryErrorHandler = () => {
  // Return a no-op middleware that just passes errors to next handler
  return (err: any, req: any, res: any, next: any) => next(err);
};

/**
 * Manual error capture (use for caught errors you want to track)
 */
export const captureError = (error: Error, context?: Record<string, any>) => {
  if (!process.env.SENTRY_DSN) return;

  Sentry.captureException(error, {
    extra: context,
  });
};

/**
 * Manual message capture (use for important events)
 */
export const captureMessage = (message: string, level: 'info' | 'warning' | 'error' = 'info') => {
  if (!process.env.SENTRY_DSN) return;

  Sentry.captureMessage(message, level);
};

/**
 * Set user context for error tracking
 */
export const setUserContext = (userId: string, email?: string) => {
  if (!process.env.SENTRY_DSN) return;

  Sentry.setUser({
    id: userId,
    email,
  });
};

/**
 * Clear user context (e.g., on logout)
 */
export const clearUserContext = () => {
  if (!process.env.SENTRY_DSN) return;

  Sentry.setUser(null);
};

/**
 * Add custom context to errors
 */
export const addBreadcrumb = (message: string, category: string, data?: Record<string, any>) => {
  if (!process.env.SENTRY_DSN) return;

  Sentry.addBreadcrumb({
    message,
    category,
    data,
    level: 'info',
  });
};

export default Sentry;
