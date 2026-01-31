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
import cacheService from "../services/cache.service";
import { generateExcelHtmlPreview } from "../services/ingestion/excelHtmlPreview.service";
import { ensurePreview } from "../services/preview/previewOrchestrator.service";
import { generateSlideImagesForDocument } from "../services/preview/pptxSlideImageGenerator.service";

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
// Inline preview handler — returns format the frontend expects
// (DI controller returns { ok, data: { kind } } which breaks the frontend)
router.get("/:id/preview", rateLimitMiddleware, async (req: any, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  try {
    const doc = await prisma.document.findFirst({
      where: { id: req.params.id, userId },
      include: { metadata: true },
    });
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

    const mime = (doc.mimeType || "").toLowerCase();
    const filename = doc.filename || doc.encryptedFilename || "document";
    const meta = doc.metadata as any;

    // DOCX → converted PDF preview
    if (mime.includes("wordprocessingml") || mime === "application/msword") {
      // If a preview PDF already exists, serve it immediately
      const existingPdfKey = meta?.previewPdfKey || null;
      if (existingPdfKey) {
        res.json({
          previewType: "pdf",
          previewUrl: `/api/documents/${doc.id}/preview-pdf`,
          originalType: doc.mimeType,
          filename,
        });
        return;
      }
      // No preview PDF yet — trigger generation in background, but still return
      // the preview-pdf URL so the frontend can retry/poll
      ensurePreview(doc.id, userId, doc.mimeType).catch(() => {});
      res.json({
        previewType: "pdf",
        previewUrl: `/api/documents/${doc.id}/preview-pdf`,
        originalType: doc.mimeType,
        filename,
      });
      return;
    }

    // PDF → stream directly
    if (mime === "application/pdf") {
      res.json({
        previewType: "pdf",
        previewUrl: `/api/documents/${doc.id}/stream`,
        originalType: doc.mimeType,
        filename,
      });
      return;
    }

    // PPTX → always use slides mode (high-quality PNG images rendered from PDF)
    // Never return pptx-pdf — react-pdf renders raw PPTX PDFs poorly.
    // The frontend falls through to the /slides endpoint which handles all states.
    if (mime.includes("presentationml") || mime === "application/vnd.ms-powerpoint") {
      const pdfKey = meta?.previewPdfKey || null;
      const pdfStatus = meta?.previewPdfStatus || null;

      // If PDF exists but slides haven't been generated yet, trigger slide generation
      if (pdfKey && !meta?.slidesData) {
        generateSlideImagesForDocument(doc.id, userId).catch(() => {});
      }

      // If nothing exists yet, trigger the full generation pipeline
      if (!pdfKey) {
        ensurePreview(doc.id, userId, doc.mimeType).catch(() => {});
      }

      // Always return slides mode — the /slides endpoint handles all states
      // (existing images, isGenerating, triggering generation, polling)
      res.json({
        previewType: "pptx",
        previewPdfStatus: pdfStatus,
        previewPdfError: meta?.previewPdfError || null,
        previewUrl: `/api/documents/${doc.id}/slides`,
        originalType: doc.mimeType,
        filename,
      });
      return;
    }

    // Excel → return HTML content (prefer stored HTML, fallback to live generation)
    if (mime.includes("spreadsheetml") || mime.includes("excel") || mime === "application/vnd.ms-excel") {
      let htmlContent = meta?.markdownContent || null;
      let sheets: string[] = [];

      // Check if stored content is actually HTML (contains <table)
      const isHtml = htmlContent && htmlContent.includes("<table");

      if (!isHtml && doc.encryptedFilename) {
        // Generate fresh HTML preview from the Excel file
        try {
          const buffer = await downloadFile(doc.encryptedFilename);
          const preview = await generateExcelHtmlPreview(buffer);
          htmlContent = preview.htmlContent;
          sheets = preview.sheets.map(s => s.name);

          // Cache the HTML in metadata for next time
          await prisma.documentMetadata.upsert({
            where: { documentId: doc.id },
            update: { markdownContent: htmlContent },
            create: { documentId: doc.id, markdownContent: htmlContent },
          });
        } catch (excelErr: any) {
          console.error(`[Preview] Excel HTML generation failed for ${doc.id}:`, excelErr.message);
        }
      } else {
        // Parse sheet names from existing HTML
        const sheetRegex = /<!--\s*Sheet:\s*(.+?)\s*-->|<h2[^>]*>(.+?)<\/h2>/gi;
        let m: RegExpExecArray | null;
        while ((m = sheetRegex.exec(htmlContent!)) !== null) {
          sheets.push(m[1] || m[2]);
        }
        if (sheets.length === 0) sheets = ["Sheet1"];
      }

      res.json({
        previewType: "excel",
        htmlContent: htmlContent || null,
        sheets,
        downloadUrl: `/api/documents/${doc.id}/stream?download=true`,
        error: htmlContent ? undefined : "No preview data available. Try reprocessing the document.",
        originalType: doc.mimeType,
        filename,
      });
      return;
    }

    // Images → stream directly
    if (mime.startsWith("image/")) {
      res.json({
        previewType: "image",
        previewUrl: `/api/documents/${doc.id}/stream`,
        originalType: doc.mimeType,
        filename,
      });
      return;
    }

    // Default — generic preview
    res.json({
      previewType: "text",
      content: meta?.extractedText || "(No preview available)",
      originalType: doc.mimeType,
      filename,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
// Inline stream handler with Safari-friendly headers + caching + decryption
router.get("/:id/stream", rateLimitMiddleware, async (req: any, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  try {
    const documentId = req.params.id;
    const doc = await prisma.document.findFirst({
      where: { id: documentId, userId },
      select: { encryptedFilename: true, mimeType: true, filename: true, isEncrypted: true, encryptionIV: true, encryptionAuthTag: true },
    });
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

    const storageKey = doc.encryptedFilename;
    if (!storageKey) { res.status(404).json({ error: "No storage key" }); return; }

    // Check cache first
    const cached = await cacheService.getCachedDocumentBuffer(documentId);
    if (cached) {
      const mimeType = doc.mimeType || "application/octet-stream";
      const filename = doc.filename || "document";
      const forceDownload = req.query.download === "true";
      const disposition = forceDownload ? "attachment" : "inline";

      res.setHeader("Content-Type", mimeType);
      res.setHeader("Content-Disposition", `${disposition}; filename="${encodeURIComponent(filename)}"`);
      res.setHeader("Content-Length", cached.length.toString());
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
      res.end(cached, "binary" as BufferEncoding);
      return;
    }

    // Download from S3
    let buffer = await downloadFile(storageKey);

    // Decrypt if needed (legacy encryption: IV + AuthTag stored on document row)
    if (doc.isEncrypted && doc.encryptionIV && doc.encryptionAuthTag) {
      try {
        const crypto = await import("crypto");
        const key = crypto.scryptSync(`document-${userId}`, "salt", 32);
        const iv = Buffer.from(doc.encryptionIV, "base64");
        const authTag = Buffer.from(doc.encryptionAuthTag, "base64");
        const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAuthTag(authTag);
        buffer = Buffer.concat([decipher.update(buffer), decipher.final()]);
      } catch (decryptErr: any) {
        console.error(`[Stream] Decryption failed for ${documentId}:`, decryptErr.message);
        // Continue with original buffer — document may not actually be encrypted
      }
    }

    // Cache the buffer for subsequent requests
    await cacheService.cacheDocumentBuffer(documentId, buffer);

    const mimeType = doc.mimeType || "application/octet-stream";
    const filename = doc.filename || "document";
    const forceDownload = req.query.download === "true";
    const disposition = forceDownload ? "attachment" : "inline";

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `${disposition}; filename="${encodeURIComponent(filename)}"`);
    res.setHeader("Content-Length", buffer.length.toString());
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.end(buffer, "binary" as BufferEncoding);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
router.get("/:id/download", rateLimitMiddleware, (req, res) => ctrl(req).download(req, res));

/**
 * PATCH /:id — Update document fields (folderId, filename, displayTitle)
 * Used by CreateCategoryModal, EditCategoryModal, UploadHub, DocumentsContext
 */
router.patch("/:id", rateLimitMiddleware, async (req: any, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  const documentId = req.params.id;
  if (!documentId) { res.status(400).json({ error: "Document id is required" }); return; }

  try {
    const doc = await prisma.document.findFirst({
      where: { id: documentId, userId },
      select: { id: true },
    });
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

    const updateData: any = {};
    if (req.body.folderId !== undefined) updateData.folderId = req.body.folderId || null;
    if (req.body.filename !== undefined) updateData.filename = req.body.filename;
    if (req.body.displayTitle !== undefined) updateData.displayTitle = req.body.displayTitle;

    if (Object.keys(updateData).length === 0) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }

    const updated = await prisma.document.update({
      where: { id: documentId },
      data: updateData,
      include: { folder: { select: { path: true } } },
    });

    res.json({ ok: true, data: updated });
  } catch (e: any) {
    console.error("PATCH /documents/:id error:", e);
    res.status(500).json({ error: e.message || "Failed to update document" });
  }
});

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
    // Ensure filename is always a string for the frontend
    // encryptedFilename is an S3 key like "users/.../docs/.../file.pdf" — extract just the filename
    let fallbackName = "Untitled";
    if (doc.encryptedFilename) {
      const segments = doc.encryptedFilename.split("/");
      fallbackName = segments[segments.length - 1] || "Untitled";
    }
    const result = { ...doc, filename: doc.filename || fallbackName };
    res.json(result);
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
      select: { encryptedFilename: true, filename: true, mimeType: true, isEncrypted: true },
    });
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

    const storageKey = doc.encryptedFilename;
    if (!storageKey) { res.status(404).json({ error: "No storage key" }); return; }

    // Encrypted files must be streamed through the backend (can't use signed URL directly)
    if (doc.isEncrypted) {
      res.json({
        url: `/api/documents/${req.params.id}/stream`,
        filename: doc.filename || storageKey,
        encrypted: true,
      });
      return;
    }

    const url = await getSignedUrl(storageKey, 3600);
    res.json({ url, filename: doc.filename || storageKey, encrypted: false });
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

    const isPPTX = doc.mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      || doc.mimeType?.includes("presentation") || doc.mimeType?.includes("powerpoint");
    if (!isPPTX) { res.status(400).json({ error: "Not a PowerPoint file" }); return; }

    // Parse slides data from metadata
    let slidesData: any[] = [];
    try {
      if ((doc.metadata as any)?.slidesData) {
        const raw = (doc.metadata as any).slidesData;
        slidesData = typeof raw === "string" ? JSON.parse(raw) : raw;
      }
    } catch { slidesData = []; }

    // If no slides data and preview PDF exists, trigger slide generation
    if (!slidesData.length || !slidesData.some((s: any) => s.hasImage)) {
      const slideGenStatus = (doc.metadata as any)?.slideGenerationStatus;
      if (slideGenStatus !== "processing") {
        // Trigger async slide generation — don't block the response
        generateSlideImagesForDocument(doc.id, userId).catch((err: any) => {
          console.error(`[Slides] Auto-trigger slide generation failed:`, err.message);
        });
        if (!slidesData.length) {
          res.json({ success: true, slides: [], totalSlides: 0, page: 1, pageSize: 10, totalPages: 0, isGenerating: true });
          return;
        }
      }
    }

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
 * POST /:id/regenerate-slides — Force regeneration of PPTX slide images
 */
router.post("/:id/regenerate-slides", rateLimitMiddleware, async (req: any, res: Response): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ error: "Not authenticated" }); return; }

  try {
    const doc = await prisma.document.findFirst({
      where: { id: req.params.id, userId },
      select: { id: true, mimeType: true },
    });
    if (!doc) { res.status(404).json({ error: "Document not found" }); return; }

    const isPptx = doc.mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
      || doc.mimeType?.includes("presentation") || doc.mimeType?.includes("powerpoint");
    if (!isPptx) { res.status(400).json({ error: "Not a PowerPoint file" }); return; }

    // Clear existing slides data so regeneration starts fresh
    await prisma.documentMetadata.upsert({
      where: { documentId: doc.id },
      update: {
        slidesData: null,
        slideGenerationStatus: "pending",
        slideGenerationError: null,
      },
      create: {
        documentId: doc.id,
        slideGenerationStatus: "pending",
      },
    });

    // Trigger async generation
    generateSlideImagesForDocument(doc.id, userId).catch((err: any) => {
      console.error(`[RegenerateSlides] Failed:`, err.message);
    });

    res.json({ success: true, message: "Slide regeneration started", isGenerating: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
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
