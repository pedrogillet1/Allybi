/**
 * Admin Authentication Guard
 *
 * Protects admin routes with multiple authentication strategies:
 * 1. Owner user ID check (KODA_OWNER_USER_ID)
 * 2. Admin API key (KODA_ADMIN_KEY)
 * 3. Admin JWT token (from admin login)
 * 4. IP allowlist (optional, KODA_ADMIN_IP_ALLOWLIST)
 *
 * All strategies are read-only; this guard never mutates data.
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { verifyAdminAccessToken, AdminJWTPayload } from '../../utils/adminJwt';

// Environment configuration
const OWNER_USER_ID = process.env.KODA_OWNER_USER_ID;
const ADMIN_KEY = process.env.KODA_ADMIN_KEY;
const IP_ALLOWLIST = process.env.KODA_ADMIN_IP_ALLOWLIST?.split(',').map(ip => ip.trim()).filter(Boolean) || [];
const LOCKDOWN_MODE = process.env.KODA_LOCKDOWN === 'true';

/**
 * Extract real client IP from request
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded)) {
    return forwarded[0];
  }
  return req.socket.remoteAddress || req.ip || 'unknown';
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do a comparison to maintain constant time
    crypto.timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Check if request is from owner user
 */
function isOwnerUser(req: Request): boolean {
  if (!OWNER_USER_ID) return false;

  // Check authenticated user ID from session/JWT
  const userId = (req as Request & { user?: { id: string } }).user?.id;
  if (userId && safeCompare(userId, OWNER_USER_ID)) {
    return true;
  }

  // Check X-User-ID header (for internal services)
  const headerUserId = req.headers['x-user-id'];
  if (typeof headerUserId === 'string' && safeCompare(headerUserId, OWNER_USER_ID)) {
    return true;
  }

  return false;
}

/**
 * Check if request has valid admin JWT token
 * Returns the decoded payload if valid, null otherwise
 */
function getValidAdminJwt(req: Request): AdminJWTPayload | null {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyAdminAccessToken(token);
    return payload;
  } catch {
    return null;
  }
}

/**
 * Check if request has valid admin API key
 */
function hasValidAdminKey(req: Request): boolean {
  if (!ADMIN_KEY) return false;

  // Check Authorization header: Bearer <key> (for direct API key usage)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    // Only compare if it looks like a key (not a JWT)
    if (!token.includes('.') && safeCompare(token, ADMIN_KEY)) {
      return true;
    }
  }

  // Check X-Admin-Key header
  const adminKeyHeader = req.headers['x-admin-key'];
  if (typeof adminKeyHeader === 'string' && safeCompare(adminKeyHeader, ADMIN_KEY)) {
    return true;
  }

  // Check query parameter (less secure, for debugging only)
  if (process.env.NODE_ENV === 'development') {
    const queryKey = req.query.adminKey;
    if (typeof queryKey === 'string' && safeCompare(queryKey, ADMIN_KEY)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if request is from allowed IP
 */
function isAllowedIp(req: Request): boolean {
  if (IP_ALLOWLIST.length === 0) {
    // No allowlist = allow all (if other auth passes)
    return true;
  }

  const clientIp = getClientIp(req);

  // Check exact match
  if (IP_ALLOWLIST.includes(clientIp)) {
    return true;
  }

  // Check localhost variants
  if (IP_ALLOWLIST.includes('localhost')) {
    if (['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(clientIp)) {
      return true;
    }
  }

  return false;
}

/**
 * Admin authentication middleware
 *
 * Requires at least one of:
 * - Valid owner user ID
 * - Valid admin API key
 *
 * Plus (if IP allowlist is configured):
 * - Request from allowed IP
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  // Check IP allowlist first (if configured)
  if (IP_ALLOWLIST.length > 0 && !isAllowedIp(req)) {
    console.warn(`[Admin Guard] Blocked request from IP: ${getClientIp(req)}`);
    res.status(403).json({
      ok: false,
      error: 'Access denied',
      code: 'ADMIN_IP_BLOCKED',
    });
    return;
  }

  // Check owner user
  if (isOwnerUser(req)) {
    // Attach admin context to request
    (req as Request & { adminAuth: { type: string; userId?: string } }).adminAuth = {
      type: 'owner',
      userId: OWNER_USER_ID,
    };
    next();
    return;
  }

  // Check admin JWT token (from admin login)
  const adminJwt = getValidAdminJwt(req);
  if (adminJwt) {
    (req as Request & { adminAuth: { type: string; adminId: string; username: string; role: string } }).adminAuth = {
      type: 'jwt',
      adminId: adminJwt.adminId,
      username: adminJwt.username,
      role: adminJwt.role,
    };
    next();
    return;
  }

  // Check admin key
  if (hasValidAdminKey(req)) {
    (req as Request & { adminAuth: { type: string } }).adminAuth = {
      type: 'api_key',
    };
    next();
    return;
  }

  // In lockdown mode, require explicit auth
  if (LOCKDOWN_MODE) {
    console.warn(`[Admin Guard] Unauthorized request in lockdown mode from IP: ${getClientIp(req)}`);
    res.status(401).json({
      ok: false,
      error: 'Admin authentication required',
      code: 'ADMIN_AUTH_REQUIRED',
    });
    return;
  }

  // Development fallback: allow if no auth configured
  if (process.env.NODE_ENV === 'development' && !OWNER_USER_ID && !ADMIN_KEY) {
    console.warn('[Admin Guard] WARNING: Running without admin auth in development mode');
    (req as Request & { adminAuth: { type: string } }).adminAuth = {
      type: 'dev_bypass',
    };
    next();
    return;
  }

  // Deny by default
  res.status(401).json({
    ok: false,
    error: 'Admin authentication required',
    code: 'ADMIN_AUTH_REQUIRED',
  });
}

export default requireAdmin;
