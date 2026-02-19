import type { NextFunction, Request, Response } from "express";

const CSRF_HEADER = "x-csrf-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Auth endpoints that establish/reset sessions — these must be exempt from
 * CSRF because stale httpOnly cookies (koda_at/koda_rt) survive JS-based
 * logout and would otherwise block fresh login/register attempts.
 */
const CSRF_EXEMPT_PREFIXES = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/signup",
  "/api/auth/refresh",
  "/api/auth/pending/",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/send-reset-link",
  "/api/auth/verify-reset-code",
  "/api/auth/google",
  "/api/auth/apple",
  "/api/auth/2fa/verify-login",
];

function isExempt(url: string): boolean {
  const path = url.split("?")[0];
  return CSRF_EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * Cookie-auth CSRF protection (double-submit pattern).
 * We only enforce when an authenticated cookie session is present
 * AND the endpoint is not in the exempt list.
 */
export function csrfProtection(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }

  // Auth endpoints that create/restore sessions are exempt — stale httpOnly
  // cookies can't be cleared by the frontend, so CSRF would block re-login.
  if (isExempt(req.originalUrl || req.url)) {
    next();
    return;
  }

  const hasSessionCookie = Boolean(
    (req as any).cookies?.koda_at || (req as any).cookies?.koda_rt,
  );
  if (!hasSessionCookie) {
    next();
    return;
  }

  const csrfCookie = (req as any).cookies?.koda_csrf;
  const csrfHeader = req.header(CSRF_HEADER);
  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    res.status(403).json({
      ok: false,
      error: {
        code: "CSRF_INVALID",
        message: "CSRF token missing or invalid.",
      },
    });
    return;
  }

  next();
}
