import { Router } from "express";
import type { Request, Response } from "express";
import {
  authMiddleware,
  optionalAuth,
} from "../../../middleware/auth.middleware";
import prisma from "../../../config/database";
import createStorageRouter from "../../../controllers/storage.controller";
import path from "path";
import fs from "fs";
import { UPLOAD_CONFIG } from "../../../config/upload.config";

const router = Router();

const STORAGE_LIMITS: Record<string, number> = {
  free: 5 * 1024 * 1024 * 1024,
  pro: 50 * 1024 * 1024 * 1024,
  business: 200 * 1024 * 1024 * 1024,
};

router.get(
  "/",
  authMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

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
  },
);

router.get(
  "/local/:key",
  optionalAuth,
  async (req: Request, res: Response): Promise<void> => {
    if (UPLOAD_CONFIG.STORAGE_PROVIDER !== "local") {
      res.status(404).json({ error: "Local storage is not enabled." });
      return;
    }

    const isProd = process.env.NODE_ENV === "production";
    const userId = (req as any).user?.id as string | undefined;
    if (isProd && !userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const raw = String((req.params as any).key || "");
    let key = raw;
    try {
      key = decodeURIComponent(raw);
    } catch {}

    if (isProd) {
      const isUserPrefix = key.startsWith(`${userId}/`);
      let isSlidesDoc = false;
      if (!isUserPrefix && key.startsWith("slides/")) {
        const m = key.match(/^slides\/([^/]+)\//);
        const documentId = m?.[1] || "";
        if (documentId) {
          const doc = await prisma.document.findFirst({
            where: { id: documentId, userId },
            select: { id: true },
          });
          isSlidesDoc = Boolean(doc);
        }
      }

      if (!isUserPrefix && !isSlidesDoc) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    const root = path.resolve(process.cwd(), UPLOAD_CONFIG.LOCAL_STORAGE_PATH);
    const full = path.resolve(root, key);
    if (!full.startsWith(root)) {
      res.status(400).json({ error: "Invalid storage key." });
      return;
    }

    try {
      await fs.promises.access(full, fs.constants.R_OK);
    } catch {
      res.status(404).json({ error: "File not found." });
      return;
    }

    const ext = path.extname(full).toLowerCase();
    const contentType =
      ext === ".pdf"
        ? "application/pdf"
        : ext === ".png"
          ? "image/png"
          : ext === ".jpg" || ext === ".jpeg"
            ? "image/jpeg"
            : ext === ".webp"
              ? "image/webp"
              : ext === ".gif"
                ? "image/gif"
                : ext === ".svg"
                  ? "image/svg+xml"
                  : ext === ".docx"
                    ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    : ext === ".xlsx"
                      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      : ext === ".pptx"
                        ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
                        : "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

    const stream = fs.createReadStream(full);
    stream.on("error", () => {
      if (!res.headersSent)
        res.status(500).json({ error: "Failed to read file." });
      else res.end();
    });
    stream.pipe(res);
  },
);

const legacyRouter = createStorageRouter();
router.use(legacyRouter);

export default router;
