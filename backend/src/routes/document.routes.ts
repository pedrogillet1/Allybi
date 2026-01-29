// src/routes/document.routes.ts

import { Router, Request, Response } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { rateLimitMiddleware } from "../middleware/rateLimit.middleware";
import { uploadMultiple } from "../middleware/upload.middleware";
import { validate, validateQuery } from "../middleware/validate.middleware";
import { documentIdsSchema, listQuerySchema } from "../schemas/request.schemas";
import { DocumentController, createDocumentController } from "../controllers/document.controller";
import prisma from "../config/database";
import { downloadFile, getSignedUrl } from "../config/storage";

const router = Router();

// All document endpoints require auth
router.use(authMiddleware);

// Lazy controller: resolves DocumentService from app.locals on first request
let _ctrl: DocumentController | null = null;
function ctrl(req: any): DocumentController {
  if (!_ctrl) {
    const svc = req.app?.locals?.services?.documents;
    if (!svc) {
      throw Object.assign(new Error("DocumentService not wired"), { statusCode: 503 });
    }
    _ctrl = createDocumentController(svc);
  }
  return _ctrl;
}

router.post("/upload", uploadMultiple, rateLimitMiddleware, (req, res) => ctrl(req).upload(req, res));

/**
 * POST /verify-uploads — Verify document uploads exist and are confirmed.
 */
router.post("/verify-uploads", rateLimitMiddleware, validate(documentIdsSchema), async (req: any, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const { documentIds } = req.body;

  try {
    const docs = await prisma.document.findMany({
      where: { id: { in: documentIds }, userId },
      select: { id: true, status: true },
    });

    const docMap = new Map(docs.map(d => [d.id, d.status]));
    const verified: string[] = [];
    const pending: string[] = [];
    const missing: string[] = [];

    for (const id of documentIds) {
      const status = docMap.get(id);
      if (!status) {
        missing.push(id);
      } else if (status === "uploaded" || status === "processed") {
        verified.push(id);
      } else {
        pending.push(id);
      }
    }

    res.json({ verified, pending, missing, verifiedCount: verified.length });
  } catch (e: any) {
    console.error("POST /documents/verify-uploads error:", e);
    res.status(500).json({ error: "Failed to verify uploads" });
  }
});

router.get("/", rateLimitMiddleware, validateQuery(listQuerySchema), (req, res) => ctrl(req).list(req, res));
router.get("/:id", rateLimitMiddleware, (req, res) => ctrl(req).get(req, res));
router.get("/:id/preview", rateLimitMiddleware, (req, res) => ctrl(req).preview(req, res));
router.get("/:id/stream", rateLimitMiddleware, (req, res) => ctrl(req).stream(req, res));
router.get("/:id/download", rateLimitMiddleware, (req, res) => ctrl(req).download(req, res));
router.delete("/:id", rateLimitMiddleware, (req, res) => ctrl(req).delete(req, res));

/* ──────────────────────────────────────────────────────────────
 * Restored routes required by DocumentViewer
 * These were removed during the cb42c60be refactor but the
 * frontend still depends on them.
 * ────────────────────────────────────────────────────────────── */

/**
 * GET /:id/status — Document status (metadata + processing state)
 */
router.get("/:id/status", rateLimitMiddleware, async (req: any, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  try {
    const doc = await prisma.document.findFirst({
      where: { id: req.params.id, userId },
      include: { metadata: true },
    });
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
    res.json(doc);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /:id/view-url — Signed URL for direct viewing (non-encrypted files)
 */
router.get("/:id/view-url", rateLimitMiddleware, async (req: any, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  try {
    const doc = await prisma.document.findFirst({
      where: { id: req.params.id, userId },
      select: { encryptedFilename: true, filename: true, mimeType: true },
    });
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

    const storageKey = doc.encryptedFilename;
    if (!storageKey) { res.status(404).json({ error: "No storage key" }); return; }

    const url = await getSignedUrl(storageKey, 3600);
    res.json({ url, filename: doc.filename, encrypted: false });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /:id/preview-pdf — Stream converted PDF for DOCX/PPTX preview
 */
router.get("/:id/preview-pdf", rateLimitMiddleware, async (req: any, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  try {
    const doc = await prisma.document.findFirst({
      where: { id: req.params.id, userId },
      include: { metadata: true },
    });
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

    // Check for a converted PDF in metadata
    const pdfKey = (doc.metadata as any)?.previewPdfKey as string | undefined;
    if (!pdfKey) {
      res.status(404).json({ error: "No preview PDF available" });
      return;
    }

    const buffer = await downloadFile(pdfKey);
    const pdfFilename = (doc.filename || "document").replace(/\.[^.]+$/, ".pdf");
    const forceDownload = req.query.download === "true";
    const disposition = forceDownload ? "attachment" : "inline";

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `${disposition}; filename="${encodeURIComponent(pdfFilename)}"`);
    res.setHeader("Content-Length", buffer.length.toString());
    res.end(buffer, "binary" as BufferEncoding);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /:id/slides — PPTX slide data with signed image URLs
 */
router.get("/:id/slides", rateLimitMiddleware, async (req: any, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  try {
    const doc = await prisma.document.findFirst({
      where: { id: req.params.id, userId },
      include: { metadata: true },
    });
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

    const isPPTX = doc.mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    if (!isPPTX) { res.status(400).json({ error: "Not a PowerPoint file" }); return; }

    // Parse slides data from metadata
    let slidesData: any[] = [];
    try {
      if ((doc.metadata as any)?.slidesData) {
        const raw = (doc.metadata as any).slidesData;
        slidesData = typeof raw === "string" ? JSON.parse(raw) : raw;
      }
    } catch { slidesData = []; }

    // Fallback: parse extractedText for slide markers
    if (!slidesData.length && (doc.metadata as any)?.extractedText) {
      const text = (doc.metadata as any).extractedText as string;
      if (text.includes("=== Slide")) {
        const regex = /=== Slide (\d+) ===/g;
        const markers: { num: number; idx: number }[] = [];
        let m: RegExpExecArray | null;
        while ((m = regex.exec(text)) !== null) markers.push({ num: parseInt(m[1]), idx: m.index });
        for (let i = 0; i < markers.length; i++) {
          const start = markers[i].idx + `=== Slide ${markers[i].num} ===`.length;
          const end = markers[i + 1]?.idx ?? text.length;
          const content = text.substring(start, end).trim();
          slidesData.push({ slideNumber: markers[i].num, content, hasImage: false, imageUrl: null, storagePath: null });
        }
      }
    }

    // Pagination
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(req.query.pageSize as string, 10) || 10));
    const totalSlides = slidesData.length;
    const totalPages = Math.ceil(totalSlides / pageSize);
    const startIdx = (page - 1) * pageSize;
    const pageSlides = slidesData.slice(startIdx, startIdx + pageSize);

    // Generate signed URLs for slides that have storage paths
    const processed = await Promise.all(
      pageSlides.map(async (slide: any, i: number) => {
        const slideNumber = slide.slideNumber || slide.slide_number || (startIdx + i + 1);
        let imageUrl: string | null = null;
        let hasImage = false;

        const storagePath = slide.storagePath || slide.storage_path;
        if (storagePath) {
          try {
            imageUrl = await getSignedUrl(storagePath, 3600);
            hasImage = true;
          } catch { /* storage path invalid */ }
        }

        return { slideNumber, content: slide.content || "", hasImage, imageUrl, storagePath };
      })
    );

    // Parse PPTX metadata
    let pptxMetadata: any = {};
    try {
      if ((doc.metadata as any)?.pptxMetadata) {
        const raw = (doc.metadata as any).pptxMetadata;
        pptxMetadata = typeof raw === "string" ? JSON.parse(raw) : raw;
      }
    } catch { /* ignore */ }

    res.json({ success: true, slides: processed, totalSlides, page, pageSize, totalPages, metadata: pptxMetadata });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to get slides data" });
  }
});

/**
 * POST /:id/reprocess — Trigger reprocessing of a document
 */
router.post("/:id/reprocess", rateLimitMiddleware, async (req: any, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  try {
    const doc = await prisma.document.findFirst({
      where: { id: req.params.id, userId },
      select: { id: true },
    });
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

    // Update status to trigger reprocessing
    await prisma.document.update({
      where: { id: doc.id },
      data: { status: "uploaded" },
    });

    res.json({ message: "Document reprocessing started successfully", result: { status: "queued" } });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * PATCH /:id/markdown — Update markdown content in metadata
 */
router.patch("/:id/markdown", rateLimitMiddleware, async (req: any, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  try {
    const { markdownContent } = req.body;
    if (markdownContent === undefined) { res.status(400).json({ error: "markdownContent is required" }); return; }

    const doc = await prisma.document.findFirst({
      where: { id: req.params.id, userId },
      select: { id: true },
    });
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

    const metadata = await prisma.documentMetadata.upsert({
      where: { documentId: doc.id },
      update: { markdownContent },
      create: { documentId: doc.id, markdownContent },
    });

    res.json({ message: "Markdown updated successfully", metadata });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /:id/export — Export document (returns download URL)
 */
router.post("/:id/export", rateLimitMiddleware, async (req: any, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  try {
    const { format } = req.body;
    if (!format || format !== "pdf") {
      res.status(400).json({ error: "Invalid format", supportedFormats: ["pdf"] });
      return;
    }

    const doc = await prisma.document.findFirst({
      where: { id: req.params.id, userId },
      select: { id: true, filename: true, mimeType: true },
    });
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

    const mime = (doc.mimeType || "").toLowerCase();

    if (mime === "application/pdf") {
      res.json({
        success: true,
        downloadUrl: `/api/documents/${doc.id}/stream?download=true`,
        filename: doc.filename,
        mimeType: "application/pdf",
      });
      return;
    }

    // Office documents — use preview-pdf endpoint
    const officeTypes = [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint",
    ];
    if (officeTypes.includes(mime)) {
      const pdfFilename = (doc.filename || "document").replace(/\.[^/.]+$/, ".pdf");
      res.json({ success: true, downloadUrl: `/api/documents/${doc.id}/preview-pdf?download=true`, filename: pdfFilename, mimeType: "application/pdf" });
      return;
    }

    // Fallback: offer raw download
    res.status(400).json({ error: "Export not available", downloadUrl: `/api/documents/${doc.id}/stream?download=true` });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
