// src/routes/batch.routes.ts
//
// Batch endpoints — returns multiple resources in a single call
// to reduce frontend waterfall on initial load.

import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

router.get("/initial-data", authMiddleware, async (req: any, res): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ ok: false, error: "Not authenticated" }); return; }

  try {
    const docService = req.app?.locals?.services?.documents;
    const folderService = req.app?.locals?.services?.folders;

    const [docsResult, foldersResult] = await Promise.all([
      docService ? docService.list({ userId, limit: 50 }) : { items: [] },
      folderService ? folderService.list({ userId }) : { items: [] },
    ]);

    res.json({
      ok: true,
      data: {
        documents: docsResult.items ?? [],
        folders: foldersResult.items ?? [],
        stats: {
          totalDocuments: docsResult.items?.length ?? 0,
          totalFolders: foldersResult.items?.length ?? 0,
        },
      },
    });
  } catch (err: any) {
    console.error("[Batch] initial-data error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
