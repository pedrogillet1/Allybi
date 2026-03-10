import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt";
import prisma from "../config/database";
import { logger } from "../utils/logger";

/**
 * Extended Request type with authenticated user
 */
export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    googleId: string | null;
    role: string;
  };
}

/**
 * Middleware to authenticate JWT tokens
 *
 * SECURITY: Only accepts tokens from Authorization header (Bearer scheme).
 * Query parameter tokens were removed as they expose JWTs in browser history,
 * server logs, and proxy logs. File downloads use S3 presigned URLs instead.
 *
 * Session binding: When the JWT contains `sid` and `sv` claims, the middleware
 * validates that the referenced session is still active and the tokenVersion
 * matches. This allows instant revocation by bumping tokenVersion or
 * deactivating the session.
 */
export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    // Accept tokens from Authorization header (preferred) or HTTP-only cookie (Safari fallback)
    let token: string | undefined;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    } else if ((req as any).cookies?.koda_at) {
      token = (req as any).cookies.koda_at;
    }

    if (!token) {
      res.status(401).json({ error: "No token provided" });
      return;
    }

    // Verify token
    const payload = verifyAccessToken(token);

    // ── Session validation ──────────────────────────────────────────────
    // If the JWT contains session claims (sid + sv), verify the session
    // is still active and the token version matches. This prevents use of
    // tokens that belong to revoked or rotated sessions.
    if (payload.sid) {
      const session = await prisma.session.findUnique({
        where: { id: payload.sid },
        select: {
          isActive: true,
          expiresAt: true,
          tokenVersion: true,
          revokedAt: true,
          userId: true,
        },
      });

      if (
        !session ||
        !session.isActive ||
        session.revokedAt !== null ||
        session.expiresAt < new Date() ||
        (payload.sv !== undefined && session.tokenVersion !== payload.sv)
      ) {
        res.status(401).json({ error: "Session revoked or expired" });
        return;
      }

      // Sanity: ensure the session belongs to the JWT user
      if (session.userId !== payload.userId) {
        res.status(401).json({ error: "Invalid token" });
        return;
      }
    }

    // Fetch user from database
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        googleId: true,
        role: true,
      },
    });

    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }

    // Attach user to request
    req.user = user;

    // Set RLS session variable for tenant isolation
    try {
      await prisma.$executeRawUnsafe(
        `SELECT set_config('app.current_user_id', $1, true)`,
        req.user.id,
      );
    } catch (rlsErr) {
      // Non-fatal: log but don't block the request
      // RLS will fall back to empty string (denying access) which is safe
      logger.warn("[Auth] Failed to set RLS context", {
        error: rlsErr instanceof Error ? rlsErr.message : String(rlsErr),
      });
    }

    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

/**
 * Optional authentication - doesn't fail if no token
 */
// Alias used by route files
export const authMiddleware = authenticateToken;
export const requireAuth = authenticateToken;

export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    // Accept from Authorization header or cookie
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7)
      : null;
    const cookieToken = (req as any).cookies?.koda_at || null;
    const token = bearerToken || cookieToken;

    if (token) {
      const payload = verifyAccessToken(token);

      // Session validation for optional auth too
      if (payload.sid) {
        const session = await prisma.session.findUnique({
          where: { id: payload.sid },
          select: {
            isActive: true,
            expiresAt: true,
            tokenVersion: true,
            revokedAt: true,
            userId: true,
          },
        });

        if (
          !session ||
          !session.isActive ||
          session.revokedAt !== null ||
          session.expiresAt < new Date() ||
          (payload.sv !== undefined && session.tokenVersion !== payload.sv) ||
          session.userId !== payload.userId
        ) {
          // Silently skip — optional auth
          next();
          return;
        }
      }

      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: {
          id: true,
          email: true,
          googleId: true,
          role: true,
        },
      });

      if (user) {
        req.user = user;
      }
    }

    next();
    return;
  } catch (error) {
    // Continue without authentication
    next();
  }
};
