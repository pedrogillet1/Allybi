// src/routes/folder.routes.ts

import { Router, Response } from "express";
import { authMiddleware } from "../../../middleware/auth.middleware";
import { rateLimitMiddleware } from "../../../middleware/rateLimit.middleware";
import {
  FolderController,
  createFolderController,
} from "../../../controllers/folder.controller";
import { validate } from "../../../middleware/validate.middleware";
import {
  folderCreateSchema,
  folderBulkSchema,
  folderUpdateSchema,
  folderMoveSchema,
} from "../../../schemas/request.schemas";
import prisma from "../../../platform/db/prismaClient";
import { logger } from "../../../utils/logger";
import AdmZip from "adm-zip";
import { downloadFile } from "../../../config/storage";
import { hkdf32 } from "../../../services/security/hkdf.service";
import { getFieldEncryption } from "../../../services/security/fieldEncryption.service";

const router = Router();

/**
 * Helper: encrypt folder name if KODA_MASTER_KEY_BASE64 is set.
 * Returns { name, nameEncrypted } for the Prisma data payload.
 */
function encryptFolderName(
  plainName: string,
  userId: string,
  folderId: string,
): { name: string | null; nameEncrypted: string | null } {
  if (!process.env.KODA_MASTER_KEY_BASE64) {
    return { name: plainName, nameEncrypted: null };
  }
  try {
    const fe = getFieldEncryption();
    const enc = fe.encryptField(plainName, {
      userId,
      entityId: folderId,
      field: "name",
    });
    return { name: null, nameEncrypted: enc };
  } catch (err) {
    logger.warn("[Folders] Field encryption failed, storing plaintext", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { name: plainName, nameEncrypted: null };
  }
}

// Lazy controller: resolves FolderService from app.locals on first request
let _ctrl: FolderController | null = null;
function ctrl(req: any): FolderController {
  if (!_ctrl) {
    const svc = req.app?.locals?.services?.folders;
    if (!svc) {
      throw Object.assign(new Error("Folder service unavailable"), {
        statusCode: 503,
      });
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
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const {
      folderTree = [],
      parentFolderId = null,
      defaultEmoji = null,
    } = req.body || {};

    if (!Array.isArray(folderTree) || folderTree.length === 0) {
      res.json({ ok: true, data: { folderMap: {} } });
      return;
    }

    try {
      // Sort by depth so parents are created before children
      const sorted = [...folderTree].sort(
        (a, b) => (a.depth ?? 0) - (b.depth ?? 0),
      );

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
            name: entry.name, // Placeholder; encrypted below
            emoji: defaultEmoji,
            parentFolderId: resolvedParentId,
            path: entry.path || entry.name,
          },
        });

        // Encrypt folder name after creation (needs folderId for AAD)
        const { name: encName, nameEncrypted } = encryptFolderName(
          entry.name,
          userId,
          folder.id,
        );
        if (nameEncrypted) {
          await prisma.folder.update({
            where: { id: folder.id },
            data: { name: encName, nameEncrypted },
          });
        }

        folderMap[entry.path || entry.name] = folder.id;
      }

      res.json({ ok: true, data: { folderMap } });
    } catch (e) {
      logger.error("[Folders] bulk create error", { path: "/bulk" });
      res.status(500).json({ error: "Failed to create folder tree" });
    }
  },
);

router.get("/tree", authMiddleware, rateLimitMiddleware, (req, res) =>
  ctrl(req).tree(req, res),
);
router.get("/", authMiddleware, rateLimitMiddleware, (req, res) =>
  ctrl(req).list(req, res),
);
router.post(
  "/",
  authMiddleware,
  rateLimitMiddleware,
  validate(folderCreateSchema),
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        ok: false,
        error: { code: "AUTH_UNAUTHORIZED", message: "Not authenticated." },
      });
      return;
    }

    const { name, emoji } = req.body;
    const parentFolderId =
      (req.body?.parentFolderId ?? req.body?.parentId) || null;
    if (!name?.trim()) {
      res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_NAME_REQUIRED",
          message: "Folder name is required.",
        },
      });
      return;
    }

    try {
      const folder = await prisma.folder.create({
        data: {
          userId,
          name: name.trim(), // Placeholder; encrypted below
          emoji: emoji || null,
          parentFolderId,
        },
        include: { _count: { select: { documents: true, subfolders: true } } },
      });

      // Encrypt folder name after creation (needs folderId for AAD)
      const { name: encName, nameEncrypted } = encryptFolderName(
        name.trim(),
        userId,
        folder.id,
      );
      if (nameEncrypted) {
        await prisma.folder.update({
          where: { id: folder.id },
          data: { name: encName, nameEncrypted },
        });
        folder.name = null;
      }

      res.status(201).json({ ok: true, data: folder });
    } catch (e: any) {
      if (e.code === "P2002") {
        // Return the existing folder instead of just an error — enables upsert behavior
        const existing = await prisma.folder.findFirst({
          where: { userId, name: name.trim(), parentFolderId },
          include: {
            _count: { select: { documents: true, subfolders: true } },
          },
        });
        if (existing) {
          res.status(200).json({ ok: true, data: existing });
          return;
        }
        res.status(409).json({
          ok: false,
          error: {
            code: "FOLDER_NAME_CONFLICT",
            message: "A folder with this name already exists.",
          },
        });
        return;
      }
      logger.error("[Folders] create error", { error: e.message });
      res.status(500).json({
        ok: false,
        error: {
          code: "FOLDER_ERROR",
          message: e.message || "Failed to create folder",
        },
      });
    }
  },
);
router.get("/:id", authMiddleware, rateLimitMiddleware, (req, res) =>
  ctrl(req).get(req, res),
);
router.patch(
  "/:id",
  authMiddleware,
  rateLimitMiddleware,
  validate(folderUpdateSchema),
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({
        ok: false,
        error: { code: "AUTH_UNAUTHORIZED", message: "Not authenticated." },
      });
      return;
    }

    const folderId = req.params.id;
    if (!folderId) {
      res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_FOLDER_ID_REQUIRED",
          message: "Folder id is required.",
        },
      });
      return;
    }

    const { name, emoji, parentId } = req.body;

    if (!name && emoji === undefined && parentId === undefined) {
      res.status(400).json({
        ok: false,
        error: {
          code: "VALIDATION_UPDATE_REQUIRED",
          message: "Provide at least one of: name, emoji, parentId.",
        },
      });
      return;
    }

    try {
      // Verify folder belongs to user
      const existing = await prisma.folder.findFirst({
        where: { id: folderId, userId },
      });
      if (!existing) {
        res.status(404).json({
          ok: false,
          error: { code: "FOLDER_NOT_FOUND", message: "Folder not found." },
        });
        return;
      }

      // Prevent moving a folder into itself
      if (parentId && parentId === folderId) {
        res.status(400).json({
          ok: false,
          error: {
            code: "INVALID_PARENT",
            message: "Cannot move a folder into itself.",
          },
        });
        return;
      }

      const updateData: any = {};
      if (name) {
        // Encrypt folder name if encryption is configured
        const { name: encName, nameEncrypted } = encryptFolderName(
          name.trim(),
          userId,
          folderId,
        );
        updateData.name = encName;
        if (nameEncrypted) updateData.nameEncrypted = nameEncrypted;
      }
      if (emoji !== undefined) updateData.emoji = emoji || null;
      if (parentId !== undefined) updateData.parentFolderId = parentId || null;

      const folder = await prisma.folder.update({
        where: { id: folderId },
        data: updateData,
        include: { _count: { select: { documents: true, subfolders: true } } },
      });

      res.json({ ok: true, data: folder });
    } catch (e: any) {
      logger.error("[Folders] update error", { error: e.message });
      res.status(500).json({
        ok: false,
        error: {
          code: "FOLDER_ERROR",
          message: e.message || "Failed to update folder",
        },
      });
    }
  },
);
router.delete("/:id", authMiddleware, rateLimitMiddleware, (req, res) =>
  ctrl(req).delete(req, res),
);

router.get(
  "/:id/download",
  authMiddleware,
  rateLimitMiddleware,
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    try {
      const folderId = req.params.id;

      // Verify folder exists and belongs to user
      const folder = await prisma.folder.findFirst({
        where: { id: folderId, userId },
        select: { id: true, name: true },
      });
      if (!folder) {
        res.status(404).json({ error: "Folder not found" });
        return;
      }

      // Recursively collect all folder IDs with their path prefix
      const collectFolderIds = async (
        parentId: string,
        prefix: string,
      ): Promise<Array<{ id: string; path: string }>> => {
        const subs = await prisma.folder.findMany({
          where: { parentFolderId: parentId, userId },
          select: { id: true, name: true },
        });
        let result: Array<{ id: string; path: string }> = [
          { id: parentId, path: prefix },
        ];
        for (const sub of subs) {
          const subName = sub.name || "Untitled";
          const subPath = prefix ? `${prefix}/${subName}` : subName;
          result = result.concat(await collectFolderIds(sub.id, subPath));
        }
        return result;
      };

      const folderEntries = await collectFolderIds(folderId, "");

      // Get all documents in these folders
      const folderIds = folderEntries.map((f) => f.id);
      const documents = await prisma.document.findMany({
        where: { folderId: { in: folderIds }, userId },
        select: {
          id: true,
          filename: true,
          encryptedFilename: true,
          folderId: true,
          isEncrypted: true,
          encryptionIV: true,
          encryptionAuthTag: true,
        },
      });

      if (documents.length === 0) {
        res.status(400).json({ error: "Folder is empty" });
        return;
      }

      // Build folder path lookup
      const folderPathMap = new Map(folderEntries.map((f) => [f.id, f.path]));

      // Create ZIP
      const zip = new AdmZip();

      for (const doc of documents) {
        if (!doc.encryptedFilename) continue;

        let buffer = await downloadFile(doc.encryptedFilename);

        // Decrypt if needed (legacy encrypted files)
        if (doc.isEncrypted && doc.encryptionIV && doc.encryptionAuthTag) {
          try {
            const crypto = await import("crypto");
            const masterKey = Buffer.from(process.env.KODA_MASTER_KEY_BASE64!, "base64");
            const key = hkdf32(masterKey, `download:${userId}:${doc.id}`);
            const iv = Buffer.from(doc.encryptionIV, "base64");
            const authTag = Buffer.from(doc.encryptionAuthTag, "base64");
            const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
            decipher.setAuthTag(authTag);
            buffer = Buffer.concat([decipher.update(buffer), decipher.final()]);
          } catch {
            /* continue with original buffer */
          }
        }

        // Resolve filename
        let filename = doc.filename || "";
        if (!filename && doc.encryptedFilename) {
          const segs = doc.encryptedFilename.split("/");
          filename = segs[segs.length - 1] || "file";
        }
        if (!filename) filename = "file";

        // Build path inside ZIP
        const folderPath = folderPathMap.get(doc.folderId || "") || "";
        const zipPath = folderPath ? `${folderPath}/${filename}` : filename;

        zip.addFile(zipPath, buffer);
      }

      const zipBuffer = zip.toBuffer();
      const zipFilename = `${folder.name}.zip`;

      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(zipFilename)}"`,
      );
      res.setHeader("Content-Length", zipBuffer.length.toString());
      res.end(zipBuffer, "binary" as BufferEncoding);
    } catch (e: any) {
      logger.error("[Folders] download error", { error: e.message });
      res.status(500).json({ error: e.message });
    }
  },
);

export default router;
