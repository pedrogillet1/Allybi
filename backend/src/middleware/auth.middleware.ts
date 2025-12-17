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
 */
export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const queryToken = req.query.token as string;

    // Allow token from header OR query parameter (for Safari/Mac PDF compatibility)
    let token: string | undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7); // Remove 'Bearer ' prefix
    } else if (queryToken) {
      token = queryToken; // Use query parameter token for Safari/iOS PDF viewing
    }

    if (!token) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    // Verify token
    const payload = verifyAccessToken(token);

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
