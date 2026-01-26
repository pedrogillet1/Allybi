/**
 * Admin Middleware
 *
 * PURPOSE: Protect admin-only routes by checking user's admin status
 * USAGE: Apply to routes that should only be accessible by admins
 */

import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// List of admin email addresses (configurable via environment variable)
const ADMIN_EMAILS = process.env.ADMIN_EMAILS
  ? process.env.ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase())
  : [
    'admin@koda.com',
    'pedro@koda.com',
    'pedro@getkoda.ai',
    'localhost@koda.com'
  ];

/**
 * Check if user is an admin
 */
export const isAdmin = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    // Check if user is authenticated
    if (!req.user || !req.user.id) {
      console.log('🔒 [ADMIN] Access denied: No user in request');
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const userId = req.user.id;

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true
      }
    });

    if (!user) {
      console.log(`🔒 [ADMIN] Access denied: User ${userId} not found`);
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if user is admin by role or email
    const isAdminByRole = user.role === 'admin' || user.role === 'super_admin';
    const isAdminByEmail = ADMIN_EMAILS.includes(user.email.toLowerCase());

    if (!isAdminByRole && !isAdminByEmail) {
      console.log(`🔒 [ADMIN] Access denied: User ${user.email} is not an admin`);
      return res.status(403).json({
        success: false,
        error: 'Admin access required'
      });
    }

    console.log(`🔓 [ADMIN] Access granted: ${user.email}`);

    // Add admin info to request
    req.user.email = user.email;
    (req.user as any).role = (user as any).role;

    next();
  } catch (error: any) {
    console.error('❌ [ADMIN] Middleware error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

/**
 * Check if user is a super admin (highest privilege)
 */
export const isSuperAdmin = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    // Check if user is authenticated
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const userId = req.user.id;

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true
      }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if user is super admin
    const isSuperAdminByRole = user.role === 'super_admin';
    const isSuperAdminByEmail = user.email.toLowerCase() === 'pedro@getkoda.ai' ||
                                 user.email.toLowerCase() === 'admin@koda.com';

    if (!isSuperAdminByRole && !isSuperAdminByEmail) {
      console.log(`🔒 [SUPER ADMIN] Access denied: User ${user.email}`);
      return res.status(403).json({
        success: false,
        error: 'Super admin access required'
      });
    }

    console.log(`🔓 [SUPER ADMIN] Access granted: ${user.email}`);
    next();
  } catch (error: any) {
    console.error('❌ [SUPER ADMIN] Middleware error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

/**
 * Log admin action for audit trail
 */
export const logAdminAction = async (
  userId: string,
  action: string,
  resource: string,
  details?: any
) => {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action: `admin:${action}`,
        resource,
        status: 'success',
        details: details ? JSON.stringify(details) : null
      }
    });
    console.log(`📝 [ADMIN AUDIT] ${action} on ${resource} by ${userId}`);
  } catch (error) {
    console.error('❌ [ADMIN AUDIT] Failed to log action:', error);
  }
};

/**
 * Rate limiter for admin routes (more lenient than public routes)
 */
export const adminRateLimiter = (windowMs: number = 60000, max: number = 100) => {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.id || 'anonymous';
    const now = Date.now();

    const userRequests = requests.get(userId);

    if (!userRequests || now > userRequests.resetTime) {
      // Reset window
      requests.set(userId, { count: 1, resetTime: now + windowMs });
      return next();
    }

    if (userRequests.count >= max) {
      const retryAfter = Math.ceil((userRequests.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({
        success: false,
        error: 'Too many requests. Please try again later.',
        retryAfter
      });
    }

    userRequests.count++;
    next();
  };
};

export default {
  isAdmin,
  isSuperAdmin,
  logAdminAction,
  adminRateLimiter
};
