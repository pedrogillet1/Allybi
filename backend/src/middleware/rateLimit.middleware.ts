import rateLimit, { ipKeyGenerator, Options } from 'express-rate-limit';
import type { Request, Response } from 'express';
import { Ratelimit } from '@upstash/ratelimit';
import { redisConnection } from '../config/redis';

const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * Upstash Redis-backed rate limiter for production
 * Falls back to in-memory for development
 */
let upstashAuthLimiter: Ratelimit | null = null;
let upstashAdminLimiter: Ratelimit | null = null;

if (IS_PROD && redisConnection) {
  // 10 requests per 15 minutes for auth endpoints
  upstashAuthLimiter = new Ratelimit({
    redis: redisConnection,
    limiter: Ratelimit.slidingWindow(10, '15 m'),
    prefix: 'koda:rl:auth',
    analytics: true,
  });

  // 10 requests per 15 minutes for admin endpoints
  upstashAdminLimiter = new Ratelimit({
    redis: redisConnection,
    limiter: Ratelimit.slidingWindow(10, '15 m'),
    prefix: 'koda:rl:admin',
    analytics: true,
  });

  console.log('[RateLimit] Using Redis-backed rate limiting in production');
} else if (IS_PROD) {
  console.warn('[RateLimit] Redis not available, using in-memory rate limiting');
}

/**
 * Helper to create a hybrid rate limiter that uses Redis in production
 */
function createHybridLimiter(
  memoryOptions: Partial<Options>,
  upstashLimiter: Ratelimit | null,
  keyFn: (req: Request) => string
) {
  // In production with Redis, use Upstash rate limiter
  if (IS_PROD && upstashLimiter) {
    return async (req: Request, res: Response, next: Function) => {
      const key = keyFn(req);
      const result = await upstashLimiter.limit(key);

      res.setHeader('X-RateLimit-Limit', result.limit);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', result.reset);

      if (!result.success) {
        res.status(429).json({
          error: memoryOptions.message || 'Too many requests',
          retryAfter: Math.ceil((result.reset - Date.now()) / 1000),
        });
        return;
      }

      next();
    };
  }

  // Fall back to in-memory rate limiter
  return rateLimit(memoryOptions as Options);
}

/**
 * General API rate limiter
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: IS_PROD ? 300 : 500, // Stricter in production
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Auth endpoints rate limiter (stricter)
 *
 * Production: Uses Redis-backed Upstash limiter (10 per 15 min)
 * Development: Uses in-memory limiter (100 per 15 min)
 *
 * keyGenerator: when an email/username is in the body, key by
 * `account:<email>` so attackers cannot spray from multiple IPs.
 */
export const authLimiter = createHybridLimiter(
  {
    windowMs: 15 * 60 * 1000,
    max: IS_PROD ? 10 : 100,
    message: 'Too many authentication attempts, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
      const email = (req.body as any)?.email;
      if (email && typeof email === 'string') {
        return `account:${email.toLowerCase().trim()}`;
      }
      return ipKeyGenerator(req.ip || 'unknown');
    },
    validate: { keyGeneratorIpFallback: false },
  },
  upstashAuthLimiter,
  (req) => {
    const email = (req.body as any)?.email;
    if (email && typeof email === 'string') {
      return `account:${email.toLowerCase().trim()}`;
    }
    return `ip:${req.ip || 'unknown'}`;
  }
);

/**
 * Admin auth rate limiter (stricter — 10/15min in prod)
 */
export const adminLimiter = createHybridLimiter(
  {
    windowMs: 15 * 60 * 1000,
    max: IS_PROD ? 10 : 20,
    message: 'Too many admin login attempts.',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
  },
  upstashAdminLimiter,
  (req) => `admin:${req.ip || 'unknown'}`
);

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
 */
export const pptxPreviewLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute per user
  message: 'Too many preview requests, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = (req as any).user?.id;
    if (userId) return `user:${userId}`;
    return ipKeyGenerator(req.ip || 'unknown');
  },
  validate: { keyGeneratorIpFallback: false },
});

/**
 * Suspicious activity rate limiter (VERY STRICT)
 */
export const suspiciousActivityLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Only 10 requests per hour when flagged as suspicious
  message: 'Your account has been temporarily restricted due to suspicious activity. Please contact support.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Alias used by route files
export const rateLimitMiddleware = apiLimiter;
