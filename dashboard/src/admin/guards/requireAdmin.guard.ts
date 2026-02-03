// dashboard/src/admin/guards/requireAdmin.guard.ts
//
// Require admin privileges.
// Accepts any of:
// - req.user.role === "admin"
// - req.user.isAdmin === true
// - req.user.permissions includes "admin"

import type { Request, Response, NextFunction } from 'express';

type AuthUser = {
  id: string;
  role?: string;
  isAdmin?: boolean;
  permissions?: string[];
};

function getUser(req: Request): AuthUser | null {
  return ((req as any).user as AuthUser) || null;
}

export function requireAdminGuard(req: Request, res: Response, next: NextFunction) {
  const user = getUser(req);

  if (!user?.id) {
    return res.status(401).json({ ok: false, code: 'AUTH_REQUIRED' });
  }

  const isAdmin =
    user.isAdmin === true ||
    user.role === 'admin' ||
    (Array.isArray(user.permissions) && user.permissions.includes('admin'));

  if (!isAdmin) {
    return res.status(403).json({ ok: false, code: 'ADMIN_REQUIRED' });
  }

  next();
}
