import rateLimit from 'express-rate-limit';

/**
 * General API rate limiter
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per windowMs (increased for development)
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Auth endpoints rate limiter (stricter)
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs (increased for development)
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
});

/**
 * 2FA verification rate limiter (very strict)
 */
export const twoFactorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // Limit each IP to 3 attempts per windowMs
  message: 'Too many 2FA attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * AI/Chat endpoints rate limiter
 */
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: 'Too many AI requests, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * File upload endpoints rate limiter
 */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 200, // 200 uploads per hour (increased to support batch folder uploads)
  message: 'Upload limit reached, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Presigned URL endpoints rate limiter (high limit for bulk uploads)
 *
 * Bulk upload of N files requires:
 * - 1 request to /api/presigned-urls/bulk
 * - N requests to /api/presigned-urls/complete/:documentId
 * - 1 request to /api/presigned-urls/reconcile
 *
 * For 600 files: 602 requests. For 1000 files: 1002 requests.
 * Set limit to 2000 to support bulk uploads up to ~2000 files.
 *
 * SECURITY: Requires authentication via authenticateToken middleware.
 * This limit is per-IP, so authenticated users are still protected.
 */
export const presignedUrlLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000, // Allow bulk uploads of up to ~2000 files
  message: 'Upload rate limit exceeded. Please wait before uploading more files.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Multipart upload endpoints rate limiter (high limit for large files)
 *
 * Large file uploads require multiple chunk operations.
 * A 200MB file with 8MB chunks = 25 parts + init + complete = ~27 requests
 * Multiple large files in parallel could be 100+ requests.
 */
export const multipartUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Allow multiple large file uploads
  message: 'Multipart upload rate limit exceeded. Please wait before uploading more files.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Document download endpoints rate limiter
 */
export const downloadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 downloads per minute
  message: 'Too many downloads, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Document search endpoints rate limiter
 * Prevents brute-force document discovery attacks
 */
export const searchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 searches per minute
  message: 'Too many search requests, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * PPTX Preview endpoints rate limiter
 * Prevents abuse of preview generation and slide fetching
 */
export const pptxPreviewLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute per user
  message: 'Too many preview requests, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => false, // Disable skip function to avoid validation
  keyGenerator: (req) => {
    // Rate limit per user if authenticated, otherwise use default IP handling
    const userId = (req as any).user?.id;
    if (userId) return `user:${userId}`;

    // Let express-rate-limit handle IP (it has built-in IPv6 support)
    return req.ip || 'unknown';
  },
  validate: { xForwardedForHeader: false }, // Disable IPv6 validation warning
});

/**
 * Suspicious activity rate limiter (VERY STRICT)
 * Applied when suspicious patterns are detected
 */
export const suspiciousActivityLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Only 10 requests per hour when flagged as suspicious
  message: 'Your account has been temporarily restricted due to suspicious activity. Please contact support.',
  standardHeaders: true,
  legacyHeaders: false,
});
