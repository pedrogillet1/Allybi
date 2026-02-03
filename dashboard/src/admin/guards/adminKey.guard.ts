// dashboard/src/admin/guards/adminKey.guard.ts
//
// Require a valid admin API key header.
// - Intended for server-to-server admin dashboards or internal tooling
// - Do NOT use as the only protection for public endpoints; combine with requireAdminGuard when possible.
//
// Header:
// - x-admin-key: <key>

import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const HEADER = 'x-admin-key';

function safeEqual(a: string, b: string): boolean {
  // Constant-time compare
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

export function adminKeyGuard(req: Request, res: Response, next: NextFunction) {
  const expected = String(process.env.ADMIN_DASHBOARD_KEY || '').trim();
  if (!expected) {
    // Fail-closed if key not configured
    return res.status(503).json({ ok: false, code: 'ADMIN_KEY_NOT_CONFIGURED' });
  }

  const provided = String(req.headers[HEADER] || '').trim();
  if (!provided) return res.status(401).json({ ok: false, code: 'ADMIN_KEY_REQUIRED' });

  if (!safeEqual(provided, expected)) {
    return res.status(403).json({ ok: false, code: 'ADMIN_KEY_INVALID' });
  }

  next();
}
