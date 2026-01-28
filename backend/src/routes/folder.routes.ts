// src/routes/folder.routes.ts

import { Router, Response } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { rateLimitMiddleware } from "../middleware/rateLimit.middleware";
import { FolderController, createFolderController } from "../controllers/folder.controller";
import { validate } from "../middleware/validate.middleware";
import { folderCreateSchema, folderBulkSchema, folderUpdateSchema, folderMoveSchema } from "../schemas/request.schemas";
import prisma from "../config/database";
import { logger } from "../utils/logger";

const router = Router();

// Lazy controller: resolves FolderService from app.locals on first request
let _ctrl: FolderController | null = null;
function ctrl(req: any): FolderController {
  if (!_ctrl) {
    const svc = req.app?.locals?.services?.folders;
    if (!svc) {
      throw Object.assign(new Error("FolderService not wired"), { statusCode: 503 });
    }
    _ctrl = createFolderController(svc);
  }
  return _ctrl;
}

/**
 * POST /bulk — Create multiple folders in a tree structure.
 * Used by unifiedUploadService.js during folder uploads.
 *
 * Request body:
 *   { folderTree: [{ name, path, parentPath, depth }], parentFolderId, defaultEmoji }
 *
 * Response:
 *   { ok: true, data: { folderMap: { "path": "folderId", ... } } }
 */
router.post(
  "/bulk",
  authMiddleware,
  rateLimitMiddleware,
  validate(folderBulkSchema),
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

    const { folderTree = [], parentFolderId = null, defaultEmoji = null } = req.body || {};

    if (!Array.isArray(folderTree) || folderTree.length === 0) {
      res.json({ ok: true, data: { folderMap: {} } });
      return;
    }

    try {
      // Sort by depth so parents are created before children
      const sorted = [...folderTree].sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0));

      // Map from path → created folder id
      const folderMap: Record<string, string> = {};

      for (const entry of sorted) {
        // Determine parent: if parentPath exists, use the already-created folder; otherwise use the root parentFolderId
        let resolvedParentId = parentFolderId;
        if (entry.parentPath && folderMap[entry.parentPath]) {
          resolvedParentId = folderMap[entry.parentPath];
        }

        const folder = await prisma.folder.create({
          data: {
            userId,
            name: entry.name,
            emoji: defaultEmoji,
            parentFolderId: resolvedParentId,
            path: entry.path || entry.name,
          },
        });

        folderMap[entry.path || entry.name] = folder.id;
      }

      res.json({ ok: true, data: { folderMap } });
    } catch (e) {
      logger.error("[Folders] bulk create error", { path: "/bulk" });
      res.status(500).json({ error: "Failed to create folder tree" });
    }
  }
);

router.get("/tree", authMiddleware, rateLimitMiddleware, (req, res) => ctrl(req).tree(req, res));
router.get("/", authMiddleware, rateLimitMiddleware, (req, res) => ctrl(req).list(req, res));
router.post("/", authMiddleware, rateLimitMiddleware, validate(folderCreateSchema), (req, res) => ctrl(req).create(req, res));
router.get("/:id", authMiddleware, rateLimitMiddleware, (req, res) => ctrl(req).get(req, res));
router.patch("/:id", authMiddleware, rateLimitMiddleware, validate(folderUpdateSchema), (req, res) => ctrl(req).update(req, res));
router.delete("/:id", authMiddleware, rateLimitMiddleware, (req, res) => ctrl(req).delete(req, res));

export default router;
