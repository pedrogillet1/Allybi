// dashboard/src/admin/guards/requireOwner.guard.ts
//
// Require the authenticated user to own a resource.
// This guard is intentionally generic: provide a resolver that returns the ownerId.
// Example usage:
//   router.get("/:conversationId", requireOwnerGuard(async (req) => chat.getOwnerId(req.params.conversationId)), handler)

import type { Request, Response, NextFunction } from 'express';

type AuthUser = { id: string };

function getUserId(req: Request): string | null {
  return ((req as any).user as AuthUser)?.id ?? null;
}

export function requireOwnerGuard(
  resolveOwnerId: (req: Request) => Promise<string | null> | string | null
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ ok: false, code: 'AUTH_REQUIRED' });

      const ownerId = await resolveOwnerId(req);
      if (!ownerId) return res.status(404).json({ ok: false, code: 'RESOURCE_NOT_FOUND' });

      if (String(ownerId) !== String(userId)) {
        return res.status(403).json({ ok: false, code: 'OWNER_REQUIRED' });
      }

      next();
    } catch (e) {
      next(e);
    }
  };
}
