// backend/src/middleware/admin.middleware.ts
//
// Admin authentication middleware for Koda.
// - Validates admin JWT from Authorization header
// - Fetches admin from Admin table, sets req.admin
// - Fail-closed: no token or invalid token => 401
// - Production owner lockdown: if KODA_OWNER_ADMIN_ID is set, only that
//   admin ID is allowed (prevents rogue admin accounts)

import type { Request, Response, NextFunction } from "express";
import { verifyAdminAccessToken } from "../utils/adminJwt";
import prisma from "../config/database";

const IS_PROD = process.env.NODE_ENV === "production";
const OWNER_ADMIN_ID = process.env.KODA_OWNER_ADMIN_ID || undefined;

/**
 * Authenticate admin JWT and populate req.admin.
 * Use this as middleware on any route that requires admin access.
 */
export function authenticateAdmin(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ ok: false, code: "ADMIN_AUTH_REQUIRED" });
    return;
  }

  const token = authHeader.slice(7);

  let payload: any;
  try {
    payload = verifyAdminAccessToken(token);
  } catch {
    res.status(401).json({ ok: false, code: "ADMIN_AUTH_REQUIRED" });
    return;
  }

  prisma.admin.findUnique({
    where: { id: payload.adminId },
    select: { id: true, username: true, name: true, role: true, isActive: true },
  }).then((admin) => {
    if (!admin || !admin.isActive) {
      res.status(401).json({ ok: false, code: "ADMIN_AUTH_REQUIRED" });
      return;
    }

    // Production owner lockdown: if KODA_OWNER_ADMIN_ID is set,
    // only the owner admin is allowed to access admin routes.
    if (IS_PROD && OWNER_ADMIN_ID && admin.id !== OWNER_ADMIN_ID) {
      res.status(403).json({ ok: false, code: "ADMIN_FORBIDDEN" });
      return;
    }

    (req as any).admin = admin;
    next();
  }).catch(() => {
    res.status(401).json({ ok: false, code: "ADMIN_AUTH_REQUIRED" });
  });
}

// Backward-compatible alias
export const requireAdmin = authenticateAdmin;
