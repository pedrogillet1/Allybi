// src/routes/storage.routes.ts
//
// Storage routes: user storage usage + legacy doc-index routes.

import { Router } from "express";
import type { Request, Response } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import prisma from "../config/database";
import createStorageRouter from "../controllers/storage.controller";

const router = Router();

// --- User storage usage (authenticated) ---
const STORAGE_LIMITS: Record<string, number> = {
  free: 5 * 1024 * 1024 * 1024,    // 5 GB
  pro: 50 * 1024 * 1024 * 1024,     // 50 GB
  business: 200 * 1024 * 1024 * 1024, // 200 GB
};

router.get("/", authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const userId = (req as any).user?.id;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  try {
    const [agg, user] = await Promise.all([
      prisma.document.aggregate({
        where: { userId },
        _sum: { fileSize: true },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { subscriptionTier: true },
      }),
    ]);

    const used = agg._sum.fileSize ?? 0;
    const tier = user?.subscriptionTier || "free";
    const limit = STORAGE_LIMITS[tier] ?? STORAGE_LIMITS.free;

    res.json({ used, limit });
  } catch {
    res.status(500).json({ error: "Failed to fetch storage info" });
  }
});

// --- Legacy doc-index routes (from storage controller) ---
const legacyRouter = createStorageRouter();
router.use(legacyRouter);

export default router;
