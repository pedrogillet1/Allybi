import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import prisma from '../config/database';

/**
 * Extended Request type with authenticated user
 */
export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    googleId: string | null;
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
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    // Only accept tokens from Authorization header (Bearer scheme)
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      res.status(401).json({ error: 'No token provided' });
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
        res.status(401).json({ error: 'Session revoked or expired' });
        return;
      }

      // Sanity: ensure the session belongs to the JWT user
      if (session.userId !== payload.userId) {
        res.status(401).json({ error: 'Invalid token' });
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
      },
    });

    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
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
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = verifyAccessToken(token);

      // Session validation for optional auth too
      if (payload.sid) {
        const session = await prisma.session.findUnique({
          where: { id: payload.sid },
          select: { isActive: true, expiresAt: true, tokenVersion: true, revokedAt: true, userId: true },
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
        },
      });

      if (user) {
        req.user = user;
      }
    }

    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};
