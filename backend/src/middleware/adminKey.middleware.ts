// backend/src/middleware/adminKey.middleware.ts
//
// Gate 2: X-KODA-ADMIN-KEY header requirement for admin routes in production.
// Uses timing-safe comparison to prevent timing attacks.

import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

/**
 * Timing-safe string comparison to prevent timing attacks.
 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Middleware that requires X-KODA-ADMIN-KEY header to match KODA_ADMIN_KEY env var.
 * Should be applied to admin routes in production after authenticateAdmin.
 */
export function requireAdminKey(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.KODA_ADMIN_KEY;

  if (!expected) {
    res.status(500).json({ ok: false, code: "ADMIN_KEY_NOT_CONFIGURED" });
    return;
  }

  const provided = req.header("X-KODA-ADMIN-KEY") || "";

  if (!provided || !safeEqual(provided, expected)) {
    res.status(401).json({ ok: false, code: "ADMIN_KEY_REQUIRED" });
    return;
  }

  next();
}
