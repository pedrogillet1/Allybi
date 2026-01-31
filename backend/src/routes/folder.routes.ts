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
router.post("/", authMiddleware, rateLimitMiddleware, validate(folderCreateSchema), async (req: any, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ ok: false, error: { code: "AUTH_UNAUTHORIZED", message: "Not authenticated." } }); return; }

  const { name, emoji, parentFolderId } = req.body;
  if (!name?.trim()) {
    res.status(400).json({ ok: false, error: { code: "VALIDATION_NAME_REQUIRED", message: "Folder name is required." } });
    return;
  }

  try {
    const folder = await prisma.folder.create({
      data: {
        userId,
        name: name.trim(),
        emoji: emoji || null,
        parentFolderId: parentFolderId || null,
      },
      include: { _count: { select: { documents: true, subfolders: true } } },
    });

    res.status(201).json({ ok: true, data: folder });
  } catch (e: any) {
    if (e.code === 'P2002') {
      res.status(409).json({ ok: false, error: { code: "FOLDER_NAME_CONFLICT", message: "A folder with this name already exists." } });
      return;
    }
    logger.error("[Folders] create error", { error: e.message });
    res.status(500).json({ ok: false, error: { code: "FOLDER_ERROR", message: e.message || "Failed to create folder" } });
  }
});
router.get("/:id", authMiddleware, rateLimitMiddleware, (req, res) => ctrl(req).get(req, res));
router.patch("/:id", authMiddleware, rateLimitMiddleware, validate(folderUpdateSchema), async (req: any, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ ok: false, error: { code: "AUTH_UNAUTHORIZED", message: "Not authenticated." } }); return; }

  const folderId = req.params.id;
  if (!folderId) { res.status(400).json({ ok: false, error: { code: "VALIDATION_FOLDER_ID_REQUIRED", message: "Folder id is required." } }); return; }

  const { name, emoji } = req.body;

  if (!name && emoji === undefined) {
    res.status(400).json({ ok: false, error: { code: "VALIDATION_UPDATE_REQUIRED", message: "Provide at least one of: name, emoji." } });
    return;
  }

  try {
    // Verify folder belongs to user
    const existing = await prisma.folder.findFirst({ where: { id: folderId, userId } });
    if (!existing) { res.status(404).json({ ok: false, error: { code: "FOLDER_NOT_FOUND", message: "Folder not found." } }); return; }

    const updateData: any = {};
    if (name) updateData.name = name.trim();
    if (emoji !== undefined) updateData.emoji = emoji || null;

    const folder = await prisma.folder.update({
      where: { id: folderId },
      data: updateData,
      include: { _count: { select: { documents: true, subfolders: true } } },
    });

    res.json({ ok: true, data: folder });
  } catch (e: any) {
    logger.error("[Folders] update error", { error: e.message });
    res.status(500).json({ ok: false, error: { code: "FOLDER_ERROR", message: e.message || "Failed to update folder" } });
  }
});
router.delete("/:id", authMiddleware, rateLimitMiddleware, (req, res) => ctrl(req).delete(req, res));

export default router;
