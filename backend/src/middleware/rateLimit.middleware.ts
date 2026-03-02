import rateLimit, { ipKeyGenerator, Options } from "express-rate-limit";
import type { Request, Response } from "express";
import { Ratelimit } from "@upstash/ratelimit";
import { redisConnection } from "../config/redis";
import { resolvePolicyBank } from "../services/core/policy/policyBankResolver.service";

const IS_PROD = process.env.NODE_ENV === "production";

type RateLimitRoutePolicy = {
  windowMs?: number;
  maxProd?: number;
  maxNonProd?: number;
  message?: string;
};

type RateLimitPolicyFile = {
  config?: { enabled?: boolean };
  routes?: Record<string, RateLimitRoutePolicy>;
};

function loadRateLimitPolicy(): RateLimitPolicyFile | null {
  return resolvePolicyBank<RateLimitPolicyFile>(
    "rate_limit_policy",
    "rate_limit_policy.any.json",
  );
}

const RATE_LIMIT_POLICY = loadRateLimitPolicy();

function resolveRoutePolicy(
  key: string,
  defaults: {
    windowMs: number;
    maxProd: number;
    maxNonProd: number;
    message: string;
  },
): {
  windowMs: number;
  max: number;
  message: string;
} {
  const route = RATE_LIMIT_POLICY?.routes?.[key];
  const policyEnabled = RATE_LIMIT_POLICY?.config?.enabled !== false;
  if (!policyEnabled || !route) {
    return {
      windowMs: defaults.windowMs,
      max: IS_PROD ? defaults.maxProd : defaults.maxNonProd,
      message: defaults.message,
    };
  }
  const windowMs = Number(route.windowMs);
  const maxProd = Number(route.maxProd);
  const maxNonProd = Number(route.maxNonProd);
  return {
    windowMs:
      Number.isFinite(windowMs) && windowMs > 0 ? windowMs : defaults.windowMs,
    max: IS_PROD
      ? Number.isFinite(maxProd) && maxProd > 0
        ? Math.floor(maxProd)
        : defaults.maxProd
      : Number.isFinite(maxNonProd) && maxNonProd > 0
        ? Math.floor(maxNonProd)
        : defaults.maxNonProd,
    message: String(route.message || "").trim() || defaults.message,
  };
}

function getRateLimitIdentity(req: Request): string {
  const userId = (req as any)?.user?.id;
  if (userId) return `user:${String(userId)}`;
  return `ip:${req.ip || "unknown"}`;
}

const API_POLICY = resolveRoutePolicy("api", {
  windowMs: 15 * 60 * 1000,
  maxProd: 300,
  maxNonProd: 500,
  message: "Too many requests from this IP, please try again later.",
});
const AUTH_POLICY = resolveRoutePolicy("auth", {
  windowMs: 15 * 60 * 1000,
  maxProd: 10,
  maxNonProd: 100,
  message: "Too many authentication attempts, please try again later.",
});
const ADMIN_POLICY = resolveRoutePolicy("admin", {
  windowMs: 15 * 60 * 1000,
  maxProd: 10,
  maxNonProd: 20,
  message: "Too many admin login attempts.",
});
const TWO_FACTOR_POLICY = resolveRoutePolicy("two_factor", {
  windowMs: 15 * 60 * 1000,
  maxProd: 3,
  maxNonProd: 3,
  message: "Too many 2FA attempts, please try again later.",
});
const AI_POLICY = resolveRoutePolicy("ai", {
  windowMs: 60 * 1000,
  maxProd: 30,
  maxNonProd: 30,
  message: "Too many AI requests, please slow down.",
});
const EDITING_APPLY_POLICY = resolveRoutePolicy("editing_apply", {
  windowMs: 60 * 1000,
  maxProd: 240,
  maxNonProd: 600,
  message: "Too many edit apply requests, please slow down.",
});
const UPLOAD_POLICY = resolveRoutePolicy("upload", {
  windowMs: 60 * 60 * 1000,
  maxProd: 200,
  maxNonProd: 200,
  message: "Upload limit reached, please try again later.",
});
const PRESIGNED_URL_POLICY = resolveRoutePolicy("presigned_url", {
  windowMs: 15 * 60 * 1000,
  maxProd: 2000,
  maxNonProd: 2000,
  message:
    "Upload rate limit exceeded. Please wait before uploading more files.",
});
const MULTIPART_UPLOAD_POLICY = resolveRoutePolicy("multipart_upload", {
  windowMs: 15 * 60 * 1000,
  maxProd: 500,
  maxNonProd: 500,
  message:
    "Multipart upload rate limit exceeded. Please wait before uploading more files.",
});
const DOWNLOAD_POLICY = resolveRoutePolicy("download", {
  windowMs: 60 * 1000,
  maxProd: 60,
  maxNonProd: 60,
  message: "Too many downloads, please slow down.",
});
const SEARCH_POLICY = resolveRoutePolicy("search", {
  windowMs: 60 * 1000,
  maxProd: 100,
  maxNonProd: 100,
  message: "Too many search requests, please slow down.",
});
const PPTX_PREVIEW_POLICY = resolveRoutePolicy("pptx_preview", {
  windowMs: 60 * 1000,
  maxProd: 60,
  maxNonProd: 60,
  message: "Too many preview requests, please slow down.",
});
const SUSPICIOUS_POLICY = resolveRoutePolicy("suspicious", {
  windowMs: 60 * 60 * 1000,
  maxProd: 10,
  maxNonProd: 10,
  message:
    "Your account has been temporarily restricted due to suspicious activity. Please contact support.",
});
const STATUS_POLLING_POLICY = resolveRoutePolicy("status_polling", {
  windowMs: 60 * 1000,
  maxProd: 120,
  maxNonProd: 120,
  message: "Too many status polling requests, please slow down.",
});

/**
 * Upstash Redis-backed rate limiter for production
 * Falls back to in-memory for development
 */
let upstashAuthLimiter: Ratelimit | null = null;
let upstashAdminLimiter: Ratelimit | null = null;

if (IS_PROD && redisConnection) {
  const authWindowMinutes = Math.max(
    1,
    Math.ceil(AUTH_POLICY.windowMs / 60000),
  );
  const adminWindowMinutes = Math.max(
    1,
    Math.ceil(ADMIN_POLICY.windowMs / 60000),
  );

  upstashAuthLimiter = new Ratelimit({
    redis: redisConnection,
    limiter: Ratelimit.slidingWindow(AUTH_POLICY.max, `${authWindowMinutes} m`),
    prefix: "koda:rl:auth",
    analytics: true,
  });

  upstashAdminLimiter = new Ratelimit({
    redis: redisConnection,
    limiter: Ratelimit.slidingWindow(
      ADMIN_POLICY.max,
      `${adminWindowMinutes} m`,
    ),
    prefix: "koda:rl:admin",
    analytics: true,
  });

  console.log("[RateLimit] Using Redis-backed rate limiting in production");
} else if (IS_PROD) {
  console.warn(
    "[RateLimit] Redis not available, using in-memory rate limiting",
  );
}

/**
 * Helper to create a hybrid rate limiter that uses Redis in production
 */
function createHybridLimiter(
  memoryOptions: Partial<Options>,
  upstashLimiter: Ratelimit | null,
  keyFn: (req: Request) => string,
) {
  // In production with Redis, use Upstash rate limiter
  if (IS_PROD && upstashLimiter) {
    return async (req: Request, res: Response, next: Function) => {
      const key = keyFn(req);
      const result = await upstashLimiter.limit(key);

      res.setHeader("X-RateLimit-Limit", result.limit);
      res.setHeader("X-RateLimit-Remaining", result.remaining);
      res.setHeader("X-RateLimit-Reset", result.reset);

      if (!result.success) {
        res.status(429).json({
          error: memoryOptions.message || "Too many requests",
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
  windowMs: API_POLICY.windowMs,
  max: API_POLICY.max,
  message: API_POLICY.message,
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
    windowMs: AUTH_POLICY.windowMs,
    max: AUTH_POLICY.max,
    message: AUTH_POLICY.message,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => {
      const email = (req.body as any)?.email;
      if (email && typeof email === "string") {
        return `account:${email.toLowerCase().trim()}`;
      }
      return ipKeyGenerator(req.ip || "unknown");
    },
    validate: { keyGeneratorIpFallback: false },
  },
  upstashAuthLimiter,
  (req) => {
    const email = (req.body as any)?.email;
    if (email && typeof email === "string") {
      return `account:${email.toLowerCase().trim()}`;
    }
    return `ip:${req.ip || "unknown"}`;
  },
);

/**
 * Admin auth rate limiter (stricter — 10/15min in prod)
 */
export const adminLimiter = createHybridLimiter(
  {
    windowMs: ADMIN_POLICY.windowMs,
    max: ADMIN_POLICY.max,
    message: ADMIN_POLICY.message,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
  },
  upstashAdminLimiter,
  (req) => `admin:${req.ip || "unknown"}`,
);

/**
 * 2FA verification rate limiter (very strict)
 */
export const twoFactorLimiter = rateLimit({
  windowMs: TWO_FACTOR_POLICY.windowMs,
  max: TWO_FACTOR_POLICY.max,
  message: TWO_FACTOR_POLICY.message,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * AI/Chat endpoints rate limiter
 */
export const aiLimiter = rateLimit({
  windowMs: AI_POLICY.windowMs,
  max: AI_POLICY.max,
  message: AI_POLICY.message,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Editing apply limiter (separate from generic API limiter).
 * Save flows can batch multiple paragraph applies in quick succession.
 */
export const editingApplyLimiter = rateLimit({
  windowMs: EDITING_APPLY_POLICY.windowMs,
  max: EDITING_APPLY_POLICY.max,
  message: EDITING_APPLY_POLICY.message,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getRateLimitIdentity(req),
  validate: { keyGeneratorIpFallback: false },
});

/**
 * File upload endpoints rate limiter
 */
export const uploadLimiter = rateLimit({
  windowMs: UPLOAD_POLICY.windowMs,
  max: UPLOAD_POLICY.max,
  message: UPLOAD_POLICY.message,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Presigned URL endpoints rate limiter (high limit for bulk uploads)
 */
export const presignedUrlLimiter = rateLimit({
  windowMs: PRESIGNED_URL_POLICY.windowMs,
  max: PRESIGNED_URL_POLICY.max,
  message: PRESIGNED_URL_POLICY.message,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Multipart upload endpoints rate limiter (high limit for large files)
 */
export const multipartUploadLimiter = rateLimit({
  windowMs: MULTIPART_UPLOAD_POLICY.windowMs,
  max: MULTIPART_UPLOAD_POLICY.max,
  message: MULTIPART_UPLOAD_POLICY.message,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Document download endpoints rate limiter
 */
export const downloadLimiter = rateLimit({
  windowMs: DOWNLOAD_POLICY.windowMs,
  max: DOWNLOAD_POLICY.max,
  message: DOWNLOAD_POLICY.message,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Document search endpoints rate limiter
 */
export const searchLimiter = rateLimit({
  windowMs: SEARCH_POLICY.windowMs,
  max: SEARCH_POLICY.max,
  message: SEARCH_POLICY.message,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * PPTX Preview endpoints rate limiter
 */
export const pptxPreviewLimiter = rateLimit({
  windowMs: PPTX_PREVIEW_POLICY.windowMs,
  max: PPTX_PREVIEW_POLICY.max,
  message: PPTX_PREVIEW_POLICY.message,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const userId = (req as any).user?.id;
    if (userId) return `user:${userId}`;
    return ipKeyGenerator(req.ip || "unknown");
  },
  validate: { keyGeneratorIpFallback: false },
});

/**
 * Suspicious activity rate limiter (VERY STRICT)
 */
export const suspiciousActivityLimiter = rateLimit({
  windowMs: SUSPICIOUS_POLICY.windowMs,
  max: SUSPICIOUS_POLICY.max,
  message: SUSPICIOUS_POLICY.message,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Processing-status polling limiter (generous — frontend polls frequently)
 */
export const statusPollingLimiter = rateLimit({
  windowMs: STATUS_POLLING_POLICY.windowMs,
  max: STATUS_POLLING_POLICY.max,
  message: STATUS_POLLING_POLICY.message,
  standardHeaders: true,
  legacyHeaders: false,
});

// Alias used by route files
export const rateLimitMiddleware = apiLimiter;
