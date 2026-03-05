// src/routes/document.routes.ts

import { Router, Request, Response } from "express";
import { authMiddleware } from "../../../middleware/auth.middleware";
import { authorizeByMethod } from "../../../middleware/authorize.middleware";
import {
  rateLimitMiddleware,
  statusPollingLimiter,
} from "../../../middleware/rateLimit.middleware";
import { uploadMultiple } from "../../../middleware/upload.middleware";
import {
  validate,
  validateQuery,
} from "../../../middleware/validate.middleware";
import {
  documentIdsSchema,
  documentPatchSchema,
  listQuerySchema,
} from "../../../schemas/request.schemas";
import {
  DocumentController,
  createDocumentController,
} from "../../../controllers/document.controller";
import prisma from "../../../platform/db/prismaClient";
import {
  downloadFile,
  getSignedUrl,
  fileExists,
} from "../../../config/storage";
import cacheService from "../../../services/cache.service";
import { generateExcelHtmlPreview } from "../../../services/ingestion/excelHtmlPreview.service";
import * as XLSX from "xlsx";
import { ensurePreview } from "../../../services/preview/previewOrchestrator.service";
import { generateSlideImagesForDocument } from "../../../services/preview/pptxSlideImageGenerator.service";
import { documentUploadWriteService } from "../../../services/documents/documentUploadWrite.service";
import {
  publishExtractJob,
  isPubSubAvailable,
} from "../../../services/jobs/pubsubPublisher.service";
import { env } from "../../../config/env";
import { DocxAnchorsService } from "../../../services/editing/docx/docxAnchors.service";
import {
  toMarkdown,
  buildDocxBundlePatchesFromMarkdown,
} from "../../../services/editing/docx/docxMarkdownBridge.service";
import { extractXlsxWithAnchors } from "../../../services/extraction/xlsxExtractor.service";
import { SlidesClientService } from "../../../services/editing/slides/slidesClient.service";
import { EditSuggestionsService } from "../../../services/editing/editSuggestions.service";
import { buildDocumentCapabilities } from "../../../services/editing/allybi/capabilities.service";
import { RevisionService } from "../../../modules/documents/application";
import { Document as DocxDocument, Packer, Paragraph } from "docx";
import * as cloudConvert from "../../../services/conversion/cloudConvertPptx.service";
import slidesStudioRouter from "../../../routes/slidesStudio.routes";
import sheetsStudioRouter from "../../../routes/sheetsStudio.routes";

const router = Router();

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const ENABLE_DOCX_MARKDOWN_API =
  String(process.env.KODA_ENABLE_DOCX_MARKDOWN_API || "")
    .trim()
    .toLowerCase() === "true";

function isDocxDocumentLike(input: {
  mimeType?: string | null;
  filename?: string | null;
}): boolean {
  const mime = String(input?.mimeType || "")
    .trim()
    .toLowerCase();
  if (mime === DOCX_MIME) return true;
  const name = String(input?.filename || "")
    .trim()
    .toLowerCase();
  return name.endsWith(".docx");
}

// pdf-parse (v2+) exports the PDFParse class which can parse bytes/URLs.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PDFParse } = require("pdf-parse");

// All document endpoints require auth
router.use(authMiddleware);
router.use(authorizeByMethod("documents"));

// Lazy controller: resolves DocumentService from app.locals on first request
let _ctrl: DocumentController | null = null;
function ctrl(req: any): DocumentController {
  if (!_ctrl) {
    const svc = req.app?.locals?.services?.documents;
    if (!svc) {
      throw Object.assign(new Error("Document service unavailable"), {
        statusCode: 503,
      });
    }
    _ctrl = createDocumentController(svc);
  }
  return _ctrl;
}

router.post("/upload", uploadMultiple, rateLimitMiddleware, (req, res) =>
  ctrl(req).upload(req, res),
);

/**
 * POST /verify-uploads — Verify document uploads exist and are confirmed.
 */
router.post(
  "/verify-uploads",
  rateLimitMiddleware,
  validate(documentIdsSchema),
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { documentIds } = req.body;

    try {
      const docs = await prisma.document.findMany({
        where: { id: { in: documentIds }, userId },
        select: { id: true, status: true },
      });

      const docMap = new Map(docs.map((d) => [d.id, d.status]));
      const verified: string[] = [];
      const pending: string[] = [];
      const missing: string[] = [];

      for (const id of documentIds) {
        const status = docMap.get(id);
        if (!status) {
          missing.push(id);
        } else if (status !== "uploading") {
          // Once a doc leaves "uploading", it is safe to treat as present/confirmed:
          // - uploaded: upload completion confirmed
          // - enriching/indexed/ready/skipped: processing already started or finished
          // - failed: processing failed, but upload exists
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
  },
);

/**
 * POST /processing-status — Batch check document processing statuses.
 * Returns per-document status so the frontend can track enrichment progress.
 */
router.post(
  "/processing-status",
  statusPollingLimiter,
  validate(documentIdsSchema),
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { documentIds } = req.body;

    try {
      const docs = await prisma.document.findMany({
        where: { id: { in: documentIds }, userId },
        select: { id: true, status: true },
      });

      const statuses: Record<string, string> = {};
      for (const doc of docs) {
        statuses[doc.id] = doc.status;
      }

      // "indexed" means embeddings are written and the doc is AI-usable.
      // "ready" may be reached after previews/metadata finalize.
      // "skipped" is NOT AI-usable (usually no extractable text), so it must not count as ready.
      const readyLike = new Set(["ready", "indexed"]);
      const readyCount = docs.filter((d) => readyLike.has(d.status)).length;
      const failedCount = docs.filter((d) => d.status === "failed").length;
      const indexedCount = docs.filter((d) => d.status === "indexed").length;
      const skippedCount = docs.filter((d) => d.status === "skipped").length;
      const totalCount = documentIds.length;

      res.json({
        statuses,
        readyCount,
        failedCount,
        indexedCount,
        skippedCount,
        totalCount,
        allReady: readyCount === totalCount,
      });
    } catch (e: any) {
      console.error("POST /documents/processing-status error:", e);
      res.status(500).json({ error: "Failed to check processing status" });
    }
  },
);

router.get(
  "/",
  rateLimitMiddleware,
  validateQuery(listQuerySchema),
  (req, res) => ctrl(req).list(req, res),
);
router.get("/:id", rateLimitMiddleware, (req, res) => ctrl(req).get(req, res));
router.post("/:id/reindex", rateLimitMiddleware, (req, res) =>
  ctrl(req).reindex(req, res),
);

/**
 * POST /:id/version — Upload a new document revision and enqueue indexing.
 */
router.post(
  "/:id/version",
  uploadMultiple,
  rateLimitMiddleware,
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    try {
      const file = Array.isArray(req.files) ? req.files[0] : null;
      if (!file || !Buffer.isBuffer(file.buffer)) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      const revisionService = new RevisionService();
      const created = await revisionService.createRevision(
        {
          userId,
          sourceDocumentId: String(req.params.id || ""),
          contentBuffer: file.buffer,
          mimeType: file.mimetype,
          filename: file.originalname,
          reason: "manual_version_upload",
        },
        {
          userId,
          correlationId: req.headers["x-correlation-id"] as
            | string
            | undefined,
        },
      );

      res.status(201).json({
        ok: true,
        data: { revision: created },
      });
    } catch (e: any) {
      const message = String(e?.message || "Failed to create version");
      const status = /not found/i.test(message)
        ? 404
        : /required|invalid/i.test(message)
          ? 400
          : 500;
      const code =
        status === 404
          ? "DOCUMENT_NOT_FOUND"
          : status === 400
            ? "INVALID_INPUT"
            : "VERSION_CREATE_FAILED";
      res.status(status).json({
        ok: false,
        error: { code, message },
      });
    }
  },
);

/**
 * GET /:id/versions — List all revisions in this document family.
 */
router.get(
  "/:id/versions",
  rateLimitMiddleware,
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    try {
      const revisionService = new RevisionService();
      const result = await revisionService.listRevisions(
        userId,
        String(req.params.id || ""),
      );
      res.json({
        ok: true,
        data: result,
      });
    } catch (e: any) {
      const message = String(e?.message || "Failed to list versions");
      const status = /not found/i.test(message)
        ? 404
        : /required|invalid/i.test(message)
          ? 400
          : 500;
      const code =
        status === 404
          ? "DOCUMENT_NOT_FOUND"
          : status === 400
            ? "INVALID_INPUT"
            : "VERSIONS_LIST_FAILED";
      res.status(status).json({
        ok: false,
        error: { code, message },
      });
    }
  },
);

// PPTX Studio (Canva-like editor backed by Google Slides import/export)
router.use("/:id/studio/slides", slidesStudioRouter);
// XLSX Studio (structured compute ops backed by Google Sheets import/export)
router.use("/:id/studio/sheets", sheetsStudioRouter);

/**
 * GET /:id/editing/capabilities — Viewer-friendly edit support flags for this document.
 * This intentionally reflects current backend reality (not future intent).
 */
router.get(
  "/:id/editing/capabilities",
  rateLimitMiddleware,
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    try {
      const doc = await prisma.document.findFirst({
        where: { id: req.params.id, userId },
        select: { id: true, filename: true, mimeType: true },
      });
      if (!doc) {
        res.status(404).json({ error: "Document not found" });
        return;
      }

      const capabilities = buildDocumentCapabilities({
        documentId: doc.id,
        filename: doc.filename || "document",
        mimeType: doc.mimeType || "",
      });

      // Preserve the legacy shape used by current frontend while exposing the
      // richer bank-driven shape in parallel.
      res.json({
        ...capabilities,
        operatorMatrix: capabilities.operators,
        operators: {
          docx: capabilities.supports.docx
            ? [
                "EDIT_PARAGRAPH",
                "EDIT_SPAN",
                "EDIT_DOCX_BUNDLE",
                "ADD_PARAGRAPH",
              ]
            : [],
          sheets: capabilities.supports.sheets
            ? [
                "EDIT_CELL",
                "EDIT_RANGE",
                "ADD_SHEET",
                "RENAME_SHEET",
                "CREATE_CHART",
                "COMPUTE_BUNDLE",
              ]
            : [],
          slides: capabilities.supports.slides
            ? ["REWRITE_SLIDE_TEXT", "ADD_SLIDE", "REPLACE_SLIDE_IMAGE"]
            : [],
          pdf: capabilities.supports.pdfRevisedCopy ? ["REVISE_COPY"] : [],
        },
        undo: {
          available:
            String(process.env.KODA_EDITING_KEEP_UNDO_HISTORY || "true")
              .trim()
              .toLowerCase() !== "false",
        },
      });
    } catch (e: any) {
      console.error("GET /documents/:id/editing/capabilities error:", e);
      res.status(500).json({ error: "Failed to load editing capabilities" });
    }
  },
);

/**
 * GET /:id/editing/slides-model — Structured slide text anchors for viewer-side selection.
 * Requires PPTX and Google APIs configured (ADC or service account).
 */
router.get(
  "/:id/editing/slides-model",
  rateLimitMiddleware,
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    try {
      const doc = await prisma.document.findFirst({
        where: { id: req.params.id, userId },
        include: { metadata: true },
      });
      if (!doc) {
        res.status(404).json({ error: "Document not found" });
        return;
      }
      if (!doc.encryptedFilename) {
        res.status(422).json({ error: "Document storage key missing" });
        return;
      }

      const mime = (doc.mimeType || "").toLowerCase();
      const isPptx =
        mime ===
          "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
        mime === "application/vnd.ms-powerpoint" ||
        mime.includes("presentationml");
      if (!isPptx) {
        res
          .status(400)
          .json({ error: "slides-model is only available for PPTX files." });
        return;
      }

      const meta: any = doc.metadata || {};
      const readLink = (() => {
        try {
          const raw = String(meta?.pptxMetadata || "").trim();
          if (!raw) return null;
          const obj = JSON.parse(raw);
          const link = obj?.editingSlides;
          const pid =
            typeof link?.presentationId === "string"
              ? link.presentationId.trim()
              : "";
          const url = typeof link?.url === "string" ? link.url.trim() : "";
          if (!pid) return null;
          return {
            presentationId: pid,
            url: url || `https://docs.google.com/presentation/d/${pid}/edit`,
          };
        } catch {
          return null;
        }
      })();

      let presentationId: string | null = readLink?.presentationId || null;
      let presentationUrl: string | null = readLink?.url || null;

      const slidesClient = new SlidesClientService();
      if (!presentationId) {
        const bytes = await downloadFile(doc.encryptedFilename);
        const imported = await slidesClient.importPptxToPresentation(
          {
            pptxBuffer: bytes,
            filename: doc.filename || "deck.pptx",
            parentFolderId: process.env.GOOGLE_SLIDES_FOLDER_ID || undefined,
          },
          {
            userId,
            correlationId: req.headers["x-correlation-id"] as any,
            conversationId: req.headers["x-conversation-id"] as any,
            clientMessageId: req.headers["x-client-message-id"] as any,
          },
        );
        presentationId = imported.presentationId;
        presentationUrl = imported.url;

        const nextPptxMetadata = (() => {
          const base = (() => {
            try {
              const raw = String(meta?.pptxMetadata || "").trim();
              if (!raw) return {};
              const obj = JSON.parse(raw);
              return obj && typeof obj === "object" && !Array.isArray(obj)
                ? obj
                : {};
            } catch {
              return {};
            }
          })();
          (base as any).editingSlides = {
            presentationId,
            url: presentationUrl,
          };
          return JSON.stringify(base);
        })();

        await documentUploadWriteService.upsertDocumentMetadata({
          documentId: doc.id,
          update: { pptxMetadata: nextPptxMetadata },
          create: { pptxMetadata: nextPptxMetadata },
        });
      }

      const presentation = await slidesClient.getPresentation(presentationId, {
        userId,
        correlationId: req.headers["x-correlation-id"] as any,
        conversationId: req.headers["x-conversation-id"] as any,
        clientMessageId: req.headers["x-client-message-id"] as any,
      });

      const slides = presentation.slides ?? [];
      const anchors: Array<{
        objectId: string;
        label: string;
        text: string;
        slideNumber: number;
        slideObjectId: string;
      }> = [];

      for (let i = 0; i < slides.length; i += 1) {
        const slide = slides[i];
        const slideNumber = i + 1;
        const slideObjectId = slide.objectId || `slide_${slideNumber}`;
        const pageElements = slide.pageElements ?? [];

        for (const el of pageElements) {
          const objectId = el.objectId;
          if (!objectId) continue;

          const shape = el.shape;
          const textEls = shape?.text?.textElements ?? [];
          const chunks: string[] = [];
          for (const te of textEls) {
            const content = te.textRun?.content;
            if (content && content.trim()) chunks.push(content);
          }
          const text = chunks.join(" ").replace(/\s+/g, " ").trim();
          if (!text) continue;

          const label =
            el.title ||
            (shape?.placeholder?.type
              ? String(shape.placeholder.type)
              : null) ||
            `Text box`;

          anchors.push({
            objectId,
            label: String(label),
            text,
            slideNumber,
            slideObjectId,
          });
        }
      }

      res.json({
        documentId: doc.id,
        domain: "slides",
        presentationId,
        presentationUrl,
        slideCount: slides.length,
        anchors,
        resolver: {
          maxCandidates: 3,
          note: "Use anchors[].objectId as targetId for REWRITE_SLIDE_TEXT.",
        },
        // For debugging / UI targeting.
        hasTextAnchors: anchors.length > 0,
      });
    } catch (e: any) {
      console.error("GET /documents/:id/editing/slides-model error:", e);
      res
        .status(500)
        .json({ error: e.message || "Failed to load slides model" });
    }
  },
);

/**
 * GET /:id/editing/pdf-text — Extract plain text from a PDF (best-effort).
 */
router.get(
  "/:id/editing/pdf-text",
  rateLimitMiddleware,
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    try {
      const doc = await prisma.document.findFirst({
        where: { id: req.params.id, userId },
        select: {
          id: true,
          encryptedFilename: true,
          mimeType: true,
          filename: true,
        },
      });
      if (!doc) {
        res.status(404).json({ error: "Document not found" });
        return;
      }
      if (!doc.encryptedFilename) {
        res.status(422).json({ error: "Document storage key missing" });
        return;
      }
      if ((doc.mimeType || "").toLowerCase() !== "application/pdf") {
        res
          .status(400)
          .json({ error: "pdf-text is only available for PDF files." });
        return;
      }

      const bytes = await downloadFile(doc.encryptedFilename);
      const parser = new PDFParse({ data: bytes });
      const parsed = await parser.getText();
      await parser.destroy();

      // Keep payload bounded. UI can request "full" later if needed.
      const text = String(parsed?.text || "").trim();
      const metaOnly = String(req.query?.meta || "").trim() === "1";
      const maxChars = metaOnly ? 0 : 250_000;
      res.json({
        documentId: doc.id,
        filename: doc.filename,
        mimeType: doc.mimeType,
        charCount: text.length,
        truncated: !metaOnly && text.length > maxChars,
        text: metaOnly
          ? ""
          : text.length > maxChars
            ? text.slice(0, maxChars)
            : text,
      });
    } catch (e: any) {
      console.error("GET /documents/:id/editing/pdf-text error:", e);
      res
        .status(500)
        .json({ error: e.message || "Failed to extract PDF text" });
    }
  },
);

function buildDocxFromPlainText(text: string): Promise<Buffer> {
  const raw = String(text || "");
  const lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const children: Paragraph[] = lines.map(
    (line) => new Paragraph({ text: line }),
  );

  const doc = new DocxDocument({
    sections: [{ properties: {}, children }],
  });

  return Packer.toBuffer(doc);
}

/**
 * POST /:id/editing/pdf-revise — Create a revised DOCX copy from a PDF.
 * Body: { revisedText: string, filename?: string, outputFormat?: 'docx'|'pdf' }
 *
 * For non-scanned PDFs (text layer present), we can "round-trip":
 *  PDF -> (user edits plain text) -> DOCX -> PDF (outputFormat='pdf')
 */
router.post(
  "/:id/editing/pdf-revise",
  rateLimitMiddleware,
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    try {
      const doc = await prisma.document.findFirst({
        where: { id: req.params.id, userId },
        select: {
          id: true,
          mimeType: true,
          filename: true,
          encryptedFilename: true,
        },
      });
      if (!doc) {
        res.status(404).json({ error: "Document not found" });
        return;
      }
      if ((doc.mimeType || "").toLowerCase() !== "application/pdf") {
        res
          .status(400)
          .json({ error: "pdf-revise is only available for PDF files." });
        return;
      }

      const revisedText = String(req.body?.revisedText || "").trim();
      if (!revisedText) {
        res.status(400).json({ error: "revisedText is required." });
        return;
      }

      const outputFormatRaw = String(
        req.body?.outputFormat || "docx",
      ).toLowerCase();
      const outputFormat = outputFormatRaw === "pdf" ? "pdf" : "docx";

      // If user requests PDF output, ensure the source PDF likely has a text layer (not scanned).
      if (outputFormat === "pdf") {
        if (!doc.encryptedFilename) {
          res.status(422).json({ error: "Document storage key missing" });
          return;
        }
        const bytes = await downloadFile(doc.encryptedFilename);
        const parser = new PDFParse({ data: bytes });
        const parsed = await parser.getText();
        await parser.destroy();
        const text = String(parsed?.text || "").trim();
        if (text.length < 50) {
          res.status(422).json({
            error:
              "This PDF appears to be scanned (no selectable text). Convert via OCR first.",
          });
          return;
        }
      }

      const out = await buildDocxFromPlainText(revisedText);

      const base = String(doc.filename || "document.pdf").replace(
        /\.pdf$/i,
        "",
      );
      const desiredFilename =
        String(
          req.body?.filename ||
            (outputFormat === "pdf"
              ? `${base} (Revised).pdf`
              : `${base} (Revised).docx`),
        ).trim() ||
        (outputFormat === "pdf"
          ? `${base} (Revised).pdf`
          : `${base} (Revised).docx`);

      const revisionService = new RevisionService();
      const correlation = {
        userId,
        correlationId: req.headers["x-correlation-id"] as any,
        conversationId: req.headers["x-conversation-id"] as any,
        clientMessageId: req.headers["x-client-message-id"] as any,
      };

      // Default: create DOCX revision (existing behavior).
      if (outputFormat !== "pdf") {
        const created = await revisionService.createRevision(
          {
            userId,
            sourceDocumentId: doc.id,
            contentBuffer: Buffer.from(out),
            mimeType:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename: desiredFilename,
            enqueueReindex: true,
            reason: "pdf:revise_copy",
            metadata: {
              sourceMimeType: doc.mimeType,
              sourceFilename: doc.filename,
            },
          },
          correlation,
        );

        res.json({
          success: true,
          sourceDocumentId: doc.id,
          createdDocumentId: created.id,
          filename: created.filename,
          mimeType: created.mimeType,
        });
        return;
      }

      // PDF output: round-trip through DOCX->PDF conversion using CloudConvert (same subsystem as preview PDFs).
      if (!cloudConvert.isCloudConvertAvailable()) {
        res.status(503).json({
          error:
            "PDF conversion is not configured (missing CLOUDCONVERT_API_KEY).",
        });
        return;
      }

      const conversion = await cloudConvert.convertToPdf(
        Buffer.from(out),
        `${base} (Revised).docx`,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );

      if (!conversion.success || !conversion.pdfBuffer) {
        res.status(500).json({
          error:
            conversion.error || "Failed to convert revised DOCX back to PDF.",
        });
        return;
      }

      const createdPdf = await revisionService.createRevision(
        {
          userId,
          sourceDocumentId: doc.id,
          contentBuffer: Buffer.from(conversion.pdfBuffer),
          mimeType: "application/pdf",
          filename: desiredFilename,
          enqueueReindex: true,
          reason: "pdf:revise_copy_pdf",
          metadata: {
            sourceMimeType: doc.mimeType,
            sourceFilename: doc.filename,
            intermediate: "docx",
          },
        },
        correlation,
      );

      res.json({
        success: true,
        sourceDocumentId: doc.id,
        createdDocumentId: createdPdf.id,
        filename: createdPdf.filename,
        mimeType: createdPdf.mimeType,
      });
    } catch (e: any) {
      console.error("POST /documents/:id/editing/pdf-revise error:", e);
      res
        .status(500)
        .json({ error: e.message || "Failed to create revised copy" });
    }
  },
);

/**
 * POST /:id/editing/pdf-to-docx — Create an editable DOCX working copy from a PDF.
 * - Keeps the original PDF unchanged.
 * - For scanned PDFs (no text layer), returns 422.
 *
 * Body: { filename?: string }
 */
router.post(
  "/:id/editing/pdf-to-docx",
  rateLimitMiddleware,
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    try {
      const doc = await prisma.document.findFirst({
        where: { id: req.params.id, userId },
        select: {
          id: true,
          mimeType: true,
          filename: true,
          encryptedFilename: true,
        },
      });
      if (!doc) {
        res.status(404).json({ error: "Document not found" });
        return;
      }
      if (!doc.encryptedFilename) {
        res.status(422).json({ error: "Document storage key missing" });
        return;
      }
      if ((doc.mimeType || "").toLowerCase() !== "application/pdf") {
        res
          .status(400)
          .json({ error: "pdf-to-docx is only available for PDF files." });
        return;
      }

      // Block scanned PDFs (no selectable text layer).
      const bytes = await downloadFile(doc.encryptedFilename);
      const scanCheck = new PDFParse({ data: bytes });
      const scanParsed = await scanCheck.getText();
      await scanCheck.destroy();
      const scanText = String(scanParsed?.text || "").trim();
      if (scanText.length < 50) {
        res.status(422).json({
          error:
            "This PDF appears to be scanned (no selectable text). Editing is not available.",
        });
        return;
      }

      if (!cloudConvert.isCloudConvertAvailable()) {
        res.status(503).json({
          error:
            "DOCX conversion is not configured (missing CLOUDCONVERT_API_KEY).",
        });
        return;
      }

      const base = String(doc.filename || "document.pdf").replace(
        /\.pdf$/i,
        "",
      );
      const desiredFilename =
        String(req.body?.filename || `${base} (Editable).docx`).trim() ||
        `${base} (Editable).docx`;

      const conversion = await cloudConvert.convertToDocx(
        Buffer.from(bytes),
        String(doc.filename || "document.pdf"),
        "application/pdf",
      );

      if (!conversion.success || !conversion.docxBuffer) {
        res.status(500).json({
          error: conversion.error || "Failed to convert PDF to DOCX.",
        });
        return;
      }

      const revisionService = new RevisionService();
      const correlation = {
        userId,
        correlationId: req.headers["x-correlation-id"] as any,
        conversationId: req.headers["x-conversation-id"] as any,
        clientMessageId: req.headers["x-client-message-id"] as any,
      };

      const created = await revisionService.createRevision(
        {
          userId,
          sourceDocumentId: doc.id,
          contentBuffer: Buffer.from(conversion.docxBuffer),
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          filename: desiredFilename,
          enqueueReindex: true,
          reason: "pdf:to_docx_working_copy",
          metadata: {
            sourceMimeType: doc.mimeType,
            sourceFilename: doc.filename,
          },
        },
        correlation,
      );

      res.json({
        success: true,
        sourceDocumentId: doc.id,
        createdDocumentId: created.id,
        filename: created.filename,
        mimeType: created.mimeType,
      });
    } catch (e: any) {
      console.error("POST /documents/:id/editing/pdf-to-docx error:", e);
      res
        .status(500)
        .json({ error: e.message || "Failed to convert PDF to DOCX" });
    }
  },
);

/**
 * GET /:id/editing/anchors — Structured anchors for viewer-side selection.
 * DOCX: paragraph nodes (paragraphId, text, sectionPath, styleFingerprint, docIndex)
 * XLSX: sheet summaries + fact anchors (truncated).
 */
router.get(
  "/:id/editing/anchors",
  rateLimitMiddleware,
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    try {
      const doc = await prisma.document.findFirst({
        where: { id: req.params.id, userId },
        select: {
          id: true,
          filename: true,
          encryptedFilename: true,
          mimeType: true,
        },
      });
      if (!doc) {
        res.status(404).json({ error: "Document not found" });
        return;
      }
      if (!doc.encryptedFilename) {
        res.status(422).json({ error: "Document storage key missing" });
        return;
      }

      const mime = (doc.mimeType || "").toLowerCase();
      const bytes = await downloadFile(doc.encryptedFilename);

      if (isDocxDocumentLike(doc)) {
        const anchors = new DocxAnchorsService();
        const paragraphs = await anchors.extractParagraphNodes(bytes);
        res.json({
          documentId: doc.id,
          domain: "docx",
          paragraphs,
        });
        return;
      }

      if (
        mime ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ) {
        const extraction = await extractXlsxWithAnchors(bytes);
        res.json({
          documentId: doc.id,
          domain: "sheets",
          sheetNames: extraction.sheetNames || [],
          sheets: (extraction.sheets || []).map((s: any) => ({
            sheetName: s.sheetName,
            headers: Array.isArray(s.headers) ? s.headers.slice(0, 64) : [],
            rowLabels: Array.isArray(s.rowLabels)
              ? s.rowLabels.slice(0, 128)
              : [],
          })),
          // Truncate facts to keep payload bounded.
          cellFacts: Array.isArray(extraction.cellFacts)
            ? extraction.cellFacts.slice(0, 250)
            : [],
        });
        return;
      }

      res
        .status(400)
        .json({ error: "Anchors are only available for DOCX and XLSX." });
    } catch (e: any) {
      console.error("GET /documents/:id/editing/anchors error:", e);
      res.status(500).json({ error: "Failed to load editing anchors" });
    }
  },
);

/**
 * GET /:id/editing/suggestions — Smart edit presets for the viewer.
 * DOCX only for v1. Suggestions are grounded to real paragraphIds.
 */
router.get(
  "/:id/editing/suggestions",
  rateLimitMiddleware,
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    try {
      const doc = await prisma.document.findFirst({
        where: { id: req.params.id, userId },
        select: {
          id: true,
          filename: true,
          encryptedFilename: true,
          mimeType: true,
        },
      });
      if (!doc) {
        res.status(404).json({ error: "Document not found" });
        return;
      }
      if (!doc.encryptedFilename) {
        res.status(422).json({ error: "Document storage key missing" });
        return;
      }

      if (!isDocxDocumentLike(doc)) {
        res
          .status(400)
          .json({ error: "Suggestions are only available for DOCX files." });
        return;
      }

      const countRaw = req.query?.count;
      const count = Math.max(
        1,
        Math.min(
          12,
          Number.isFinite(Number(countRaw)) ? Math.trunc(Number(countRaw)) : 6,
        ),
      );
      const seed =
        typeof req.query?.seed === "string"
          ? String(req.query.seed).trim()
          : "";

      const bytes = await downloadFile(doc.encryptedFilename);
      const anchors = new DocxAnchorsService();
      const paragraphs = await anchors.extractParagraphNodes(bytes);

      const svc = new EditSuggestionsService();
      const suggestions = svc.suggestDocx({
        documentId: doc.id,
        paragraphs,
        count,
        seed: seed || undefined,
        language: (req.query?.language as any) || undefined,
      });

      res.json({
        documentId: doc.id,
        domain: "docx",
        suggestions,
      });
    } catch (e: any) {
      console.error("GET /documents/:id/editing/suggestions error:", e);
      res.status(500).json({ error: "Failed to load editing suggestions" });
    }
  },
);

/**
 * GET /:id/editing/docx-html — Minimal HTML canvas for DOCX paragraph editing.
 * This is intentionally "blocky" (paragraph-level) and selection-friendly.
 */
router.get(
  "/:id/editing/docx-html",
  rateLimitMiddleware,
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    try {
      res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, proxy-revalidate",
      );
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      const doc = await prisma.document.findFirst({
        where: { id: req.params.id, userId },
        select: {
          id: true,
          filename: true,
          encryptedFilename: true,
          mimeType: true,
        },
      });
      if (!doc) {
        res.status(404).json({ error: "Document not found" });
        return;
      }
      if (!doc.encryptedFilename) {
        res.status(422).json({ error: "Document storage key missing" });
        return;
      }

      if (!isDocxDocumentLike(doc)) {
        res
          .status(400)
          .json({ error: "docx-html is only available for DOCX files." });
        return;
      }

      const escapeHtml = (text: string): string =>
        String(text || "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");

      const bytes = await downloadFile(doc.encryptedFilename);
      {
        const crypto = await import("crypto");
        const loadedHash = crypto
          .createHash("sha256")
          .update(bytes)
          .digest("hex")
          .slice(0, 12);
        console.log(
          `[docx-html] Loaded file for ${doc.id}, hash=${loadedHash}, size=${bytes.length}`,
        );
      }
      const anchors = new DocxAnchorsService();
      const paragraphs = await anchors.extractRichParagraphNodes(bytes);

      /** Build rich HTML from DOCX runs, preserving bold/italic/underline/strikethrough and inline styles. */
      const runsToHtml = (runs: any[]): string => {
        if (!Array.isArray(runs) || runs.length === 0) return "";
        return runs
          .map((r: any) => {
            let html = escapeHtml(String(r.text || "")).replace(/\n/g, "<br/>");
            // Inline style spans (font-size, color, font-family)
            const styles: string[] = [];
            if (r.fontSize) styles.push(`font-size:${r.fontSize}`);
            if (r.color)
              styles.push(`color:#${String(r.color).replace(/^#/, "")}`);
            if (r.fontFamily)
              styles.push(`font-family:${escapeHtml(r.fontFamily)}`);
            if (styles.length)
              html = `<span style="${styles.join(";")}">${html}</span>`;
            // Formatting tags
            if (r.strikethrough) html = `<s>${html}</s>`;
            if (r.underline) html = `<u>${html}</u>`;
            if (r.italic) html = `<em>${html}</em>`;
            if (r.bold) html = `<strong>${html}</strong>`;
            return html;
          })
          .join("");
      };

      const blocks = paragraphs.map((p: any) => {
        const richHtml = runsToHtml(p.runs);
        return {
          paragraphId: p.paragraphId,
          text: p.text,
          sectionPath: p.sectionPath,
          indexInSection: p.indexInSection,
          docIndex: p.docIndex,
          styleFingerprint: p.styleFingerprint,
          styleName: p.styleName || null,
          headingLevel:
            typeof p.headingLevel === "number" ? p.headingLevel : null,
          numberingSignature: p.numberingSignature || null,
          alignment: p.alignment || null,
          html: richHtml || escapeHtml(p.text).replace(/\n/g, "<br/>"),
        };
      });

      const classFor = (b: any): string => {
        const cls = ["koda-docx-p"];
        if (b.headingLevel) cls.push(`koda-docx-h${b.headingLevel}`);
        if (b.numberingSignature) cls.push("koda-docx-li");
        if (b.alignment)
          cls.push(`koda-docx-align-${String(b.alignment).toLowerCase()}`);
        return cls.join(" ");
      };

      const listLevelFor = (b: any): number => {
        const sig = String(b.numberingSignature || "");
        if (!sig) return 0;
        const level = Number(sig.split(":")[0]);
        return Number.isFinite(level) && level >= 0 ? level : 0;
      };

      const html = [
        `<div class="koda-docx-canvas" data-document-id="${doc.id}">`,
        ...blocks.map((b) => {
          const lvl = listLevelFor(b);
          return `<p class="${classFor(b)}" data-paragraph-id="${b.paragraphId}" data-style-name="${escapeHtml(String(b.styleName || ""))}" data-list-level="${lvl}">${b.html}</p>`;
        }),
        `</div>`,
      ].join("");

      res.json({
        documentId: doc.id,
        filename: doc.filename,
        domain: "docx",
        html,
        blocks,
      });
    } catch (e: any) {
      console.error("GET /documents/:id/editing/docx-html error:", e);
      res.status(500).json({ error: "Failed to render DOCX HTML." });
    }
  },
);

/**
 * GET /:id/editing/markdown — Internal endpoint.
 * Extract DOCX as annotated Markdown with paragraph identity markers.
 */
router.get(
  "/:id/editing/markdown",
  rateLimitMiddleware,
  async (req: any, res: Response): Promise<void> => {
    if (!ENABLE_DOCX_MARKDOWN_API) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    try {
      const doc = await prisma.document.findFirst({
        where: { id: req.params.id, userId },
        select: {
          id: true,
          filename: true,
          encryptedFilename: true,
          mimeType: true,
          updatedAt: true,
        },
      });
      if (!doc) {
        res.status(404).json({ error: "Document not found" });
        return;
      }
      if (!doc.encryptedFilename) {
        res.status(422).json({ error: "Document storage key missing" });
        return;
      }
      if (!isDocxDocumentLike(doc)) {
        res.status(400).json({
          error: "Markdown editing is only available for DOCX files.",
        });
        return;
      }

      const bytes = await downloadFile(doc.encryptedFilename);
      const anchors = new DocxAnchorsService();
      const richNodes = await anchors.extractRichParagraphNodes(bytes);
      const numberingFormats = await anchors.extractNumberingFormats(bytes);
      const result = toMarkdown(richNodes, numberingFormats);

      // File hash for optimistic locking
      const crypto = await import("crypto");
      const fileHash = crypto
        .createHash("sha256")
        .update(bytes)
        .digest("hex")
        .slice(0, 16);

      res.json({
        documentId: doc.id,
        markdown: result.markdown,
        paragraphMap: result.paragraphMap,
        fileHash,
        updatedAt: doc.updatedAt,
      });
    } catch (e: any) {
      console.error("GET /documents/:id/editing/markdown error:", e);
      res.status(500).json({ error: "Failed to extract Markdown." });
    }
  },
);

/**
 * POST /:id/editing/markdown — Internal endpoint.
 * Save Markdown edits back to DOCX.
 * Diffs submitted Markdown against current DOCX, generates EDIT_DOCX_BUNDLE patches.
 * Body: { markdown: string, paragraphMap: ParagraphMapEntry[], expectedFileHash: string }
 */
router.post(
  "/:id/editing/markdown",
  rateLimitMiddleware,
  async (req: any, res: Response): Promise<void> => {
    if (!ENABLE_DOCX_MARKDOWN_API) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    try {
      const { markdown, paragraphMap, expectedFileHash } = req.body || {};
      if (!markdown || typeof markdown !== "string") {
        res.status(400).json({ error: "markdown is required." });
        return;
      }
      if (!paragraphMap || !Array.isArray(paragraphMap)) {
        res.status(400).json({ error: "paragraphMap is required." });
        return;
      }

      const doc = await prisma.document.findFirst({
        where: { id: req.params.id, userId },
        select: {
          id: true,
          filename: true,
          encryptedFilename: true,
          mimeType: true,
        },
      });
      if (!doc) {
        res.status(404).json({ error: "Document not found" });
        return;
      }
      if (!doc.encryptedFilename) {
        res.status(422).json({ error: "Document storage key missing" });
        return;
      }
      if (!isDocxDocumentLike(doc)) {
        res.status(400).json({
          error: "Markdown editing is only available for DOCX files.",
        });
        return;
      }

      const bytes = await downloadFile(doc.encryptedFilename);

      // Optimistic lock check
      if (expectedFileHash) {
        const crypto = await import("crypto");
        const currentHash = crypto
          .createHash("sha256")
          .update(bytes)
          .digest("hex")
          .slice(0, 16);
        if (currentHash !== expectedFileHash) {
          res.status(409).json({
            error: "Document was modified since you loaded it. Please reload.",
            currentFileHash: currentHash,
            expectedFileHash,
          });
          return;
        }
      }

      const markdownPlan = await buildDocxBundlePatchesFromMarkdown(
        bytes,
        markdown,
        paragraphMap,
      );
      if (markdownPlan.markdownPatches.length === 0) {
        res.json({ ok: true, patchCount: 0, noop: true });
        return;
      }

      const bundlePatches = markdownPlan.bundlePatches;
      if (bundlePatches.length === 0) {
        res.json({ ok: true, patchCount: 0, noop: true });
        return;
      }

      // Dispatch through the existing editing pipeline
      const revisionStore = req.app?.locals?.services?.documentRevisionStore;
      if (!revisionStore) {
        res.status(503).json({ error: "DocumentRevisionStore not available." });
        return;
      }

      const result = await revisionStore.createRevision({
        documentId: doc.id,
        userId,
        correlationId: (req.headers["x-correlation-id"] as string) || "",
        conversationId: (req.headers["x-conversation-id"] as string) || "",
        clientMessageId: (req.headers["x-client-message-id"] as string) || "",
        content: JSON.stringify({ patches: bundlePatches }),
        metadata: { operator: "EDIT_DOCX_BUNDLE" },
      });

      res.json({
        ok: true,
        patchCount: bundlePatches.length,
        fileHashBefore: result?.fileHashBefore || expectedFileHash || null,
        fileHashAfter: result?.fileHashAfter || null,
        revisionId: result?.revisionId || null,
      });
    } catch (e: any) {
      console.error("POST /documents/:id/editing/markdown error:", e);
      res
        .status(500)
        .json({ error: e.message || "Failed to apply Markdown edits." });
    }
  },
);

// Inline preview handler — returns format the frontend expects
// (DI controller returns { ok, data: { kind } } which breaks the frontend)
router.get(
  "/:id/preview",
  rateLimitMiddleware,
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    try {
      const doc = await prisma.document.findFirst({
        where: { id: req.params.id, userId },
        include: { metadata: true },
      });
      if (!doc) {
        res.status(404).json({ error: "Document not found" });
        return;
      }

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
      if (
        mime.includes("presentationml") ||
        mime === "application/vnd.ms-powerpoint"
      ) {
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
      if (
        mime.includes("spreadsheetml") ||
        mime.includes("excel") ||
        mime === "application/vnd.ms-excel"
      ) {
        let htmlContent = meta?.markdownContent || null;
        let sheets: string[] = [];
        const chartsMeta = (() => {
          try {
            const raw = String(meta?.pptxMetadata || "").trim();
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            const list = (parsed as any)?.editingSheetsCharts;
            return Array.isArray(list) ? list : [];
          } catch {
            return [];
          }
        })();
        const tablesMeta = (() => {
          try {
            const raw = String(meta?.pptxMetadata || "").trim();
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            const list = (parsed as any)?.editingSheetsTables;
            return Array.isArray(list) ? list : [];
          } catch {
            return [];
          }
        })();

        // Check if stored content is actually HTML (contains <table)
        const isHtml = htmlContent && htmlContent.includes("<table");

        const unquoteSheetName = (raw: string): string => {
          const t = String(raw || "").trim();
          if (!t) return "";
          const unwrapped =
            t.startsWith("'") && t.endsWith("'") && t.length >= 2
              ? t.slice(1, -1)
              : t;
          return unwrapped.replace(/''/g, "'");
        };

        const buildChartsPayload = (buffer: Buffer): any[] => {
          const list = Array.isArray(chartsMeta) ? chartsMeta : [];
          if (!list.length) return [];
          let workbook: XLSX.WorkBook;
          try {
            workbook = XLSX.read(buffer, {
              type: "buffer",
              cellStyles: true,
              cellDates: true,
              cellNF: true,
            });
          } catch {
            return [];
          }

          const out: any[] = [];
          for (const raw of list.slice(-20)) {
            const type = String((raw as any)?.type || "")
              .trim()
              .toUpperCase();
            const rangeFull = String((raw as any)?.range || "").trim();
            if (!rangeFull) continue;
            const bang = rangeFull.indexOf("!");
            const sheetName =
              bang > 0
                ? unquoteSheetName(rangeFull.slice(0, bang)) || "Sheet1"
                : "Sheet1";
            const a1 = bang > 0 ? rangeFull.slice(bang + 1).trim() : rangeFull;
            const ws = workbook.Sheets[sheetName];
            if (!ws) continue;

            const r = a1.includes(":") ? a1 : `${a1}:${a1}`;
            let decoded: XLSX.Range;
            try {
              decoded = XLSX.utils.decode_range(r);
            } catch {
              continue;
            }

            const startRow = decoded.s.r;
            const endRow = decoded.e.r;
            const startCol = decoded.s.c;
            const endCol = decoded.e.c;

            // Build headers (first row) and rows (rest).
            const headers: string[] = [];
            for (let c = startCol; c <= endCol; c++) {
              const addr = XLSX.utils.encode_cell({ r: startRow, c });
              const cell: any = (ws as any)[addr];
              const v = cell?.w ?? cell?.v;
              headers.push(
                v != null && String(v).trim()
                  ? String(v).trim().slice(0, 40)
                  : `Series${c - startCol + 1}`,
              );
            }

            const isSingleColumn = startCol === endCol;
            const isScatterLike = type === "SCATTER" || type === "BUBBLE";
            const isHistogram = type === "HISTOGRAM";
            const labelKey =
              isSingleColumn || isScatterLike || isHistogram
                ? "Label"
                : headers[0] || "Label";
            const seriesKeys = (() => {
              if (isSingleColumn) return [headers[0] || "Value"];
              if (isScatterLike) return headers.slice(0);
              return headers.slice(1);
            })();

            const data: any[] = [];
            for (let rr = startRow + 1; rr <= endRow; rr++) {
              const rowObj: any = {};
              for (let c = startCol; c <= endCol; c++) {
                const addr = XLSX.utils.encode_cell({ r: rr, c });
                const cell: any = (ws as any)[addr];
                const v = cell?.v ?? null;
                const w = cell?.w ?? null;
                const key = headers[c - startCol];
                const parsed =
                  typeof v === "number"
                    ? v
                    : typeof w === "string" &&
                        w.trim() &&
                        Number.isFinite(Number(w.replace(/,/g, "")))
                      ? Number(w.replace(/,/g, ""))
                      : null;
                if (isSingleColumn) {
                  rowObj[labelKey] = `Row ${rr + 1}`;
                  rowObj[seriesKeys[0]] = parsed;
                } else if (isScatterLike) {
                  if (c === startCol)
                    rowObj[labelKey] =
                      w != null
                        ? String(w)
                        : v != null
                          ? String(v)
                          : `Row ${rr + 1}`;
                  rowObj[key] = parsed;
                } else {
                  if (c === startCol)
                    rowObj[labelKey] =
                      w != null ? String(w) : v != null ? String(v) : "";
                  else rowObj[key] = parsed;
                }
              }
              // Keep rows that have at least one numeric series value.
              const hasNum = seriesKeys.some(
                (k) => typeof rowObj[k] === "number",
              );
              if (hasNum || String(rowObj[labelKey] || "").trim())
                data.push(rowObj);
            }

            out.push({
              chartId:
                typeof (raw as any)?.chartId === "number"
                  ? (raw as any).chartId
                  : undefined,
              type: [
                "COLUMN",
                "BAR",
                "LINE",
                "AREA",
                "PIE",
                "SCATTER",
                "STACKED_BAR",
                "STACKED_COLUMN",
                "COMBO",
                "BUBBLE",
                "RADAR",
                "HISTOGRAM",
              ].includes(type)
                ? type
                : "LINE",
              title: (raw as any)?.title
                ? String((raw as any).title).slice(0, 140)
                : null,
              range: rangeFull,
              sheetName,
              labelKey,
              seriesKeys,
              data,
              settings:
                (raw as any)?.settings &&
                typeof (raw as any).settings === "object"
                  ? (raw as any).settings
                  : undefined,
            });
          }
          return out;
        };

        if (!isHtml && doc.encryptedFilename) {
          // Generate fresh HTML preview from the Excel file
          console.log(
            `[Preview:Excel] Regenerating HTML from file for ${doc.id}`,
          );
          try {
            const buffer = await downloadFile(doc.encryptedFilename);
            const preview = await generateExcelHtmlPreview(buffer);
            htmlContent = preview.htmlContent;
            sheets = preview.sheets.map((s) => s.name);
            const charts = buildChartsPayload(buffer);

            // Cache the HTML in metadata for next time
            await documentUploadWriteService.upsertDocumentMetadata({
              documentId: doc.id,
              update: { markdownContent: htmlContent },
              create: { markdownContent: htmlContent },
            });

            res.json({
              previewType: "excel",
              htmlContent: htmlContent || null,
              sheets,
              charts,
              tables: tablesMeta,
              downloadUrl: `/api/documents/${doc.id}/stream?download=true`,
              error: htmlContent
                ? undefined
                : "No preview data available. Try reprocessing the document.",
              originalType: doc.mimeType,
              filename,
            });
            return;
          } catch (excelErr: any) {
            console.error(
              `[Preview] Excel HTML generation failed for ${doc.id}:`,
              excelErr.message,
            );
          }
        } else {
          // Parse sheet names from existing HTML
          console.log(
            `[Preview:Excel] Serving cached HTML for ${doc.id}, length=${(htmlContent || "").length}`,
          );
          const sheetRegex =
            /<!--\s*Sheet:\s*(.+?)\s*-->|data-sheet-name="([^"]+)"|<h2[^>]*>(.+?)<\/h2>/gi;
          let m: RegExpExecArray | null;
          while ((m = sheetRegex.exec(htmlContent!)) !== null) {
            sheets.push(m[1] || m[2] || m[3]);
          }
          // Fallback: read actual sheet names from the file
          if (sheets.length === 0 && doc.encryptedFilename) {
            try {
              const buffer = await downloadFile(doc.encryptedFilename);
              const preview = await generateExcelHtmlPreview(buffer);
              sheets = preview.sheets.map((s) => s.name);
              const charts = buildChartsPayload(buffer);
              // Re-cache with sheet markers
              await documentUploadWriteService.upsertDocumentMetadata({
                documentId: doc.id,
                update: { markdownContent: preview.htmlContent },
                create: { markdownContent: preview.htmlContent },
              });
              htmlContent = preview.htmlContent;
              res.json({
                previewType: "excel",
                htmlContent: htmlContent || null,
                sheets,
                charts,
                tables: tablesMeta,
                downloadUrl: `/api/documents/${doc.id}/stream?download=true`,
                error: htmlContent
                  ? undefined
                  : "No preview data available. Try reprocessing the document.",
                originalType: doc.mimeType,
                filename,
              });
              return;
            } catch {
              sheets = ["Sheet1"];
            }
          } else if (sheets.length === 0) {
            sheets = ["Sheet1"];
          }
        }

        let charts: any[] = [];
        if (
          doc.encryptedFilename &&
          Array.isArray(chartsMeta) &&
          chartsMeta.length > 0
        ) {
          try {
            const buffer = await downloadFile(doc.encryptedFilename);
            charts = buildChartsPayload(buffer);
          } catch {
            charts = [];
          }
        }

        res.json({
          previewType: "excel",
          htmlContent: htmlContent || null,
          sheets,
          charts,
          tables: tablesMeta,
          downloadUrl: `/api/documents/${doc.id}/stream?download=true`,
          error: htmlContent
            ? undefined
            : "No preview data available. Try reprocessing the document.",
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
  },
);
// Inline stream handler with Safari-friendly headers + caching + decryption
router.get(
  "/:id/stream",
  rateLimitMiddleware,
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    try {
      const documentId = req.params.id;
      const doc = await prisma.document.findFirst({
        where: { id: documentId, userId },
        select: {
          encryptedFilename: true,
          mimeType: true,
          filename: true,
          isEncrypted: true,
          encryptionIV: true,
          encryptionAuthTag: true,
        },
      });
      if (!doc) {
        res.status(404).json({ error: "Document not found" });
        return;
      }

      const storageKey = doc.encryptedFilename;
      if (!storageKey) {
        res.status(404).json({ error: "No storage key" });
        return;
      }

      // Resolve clean filename: prefer filename, fallback to last segment of S3 key
      let filename = doc.filename;
      if (!filename && storageKey) {
        const segments = storageKey.split("/");
        filename = segments[segments.length - 1] || null;
      }
      if (!filename) filename = "document";

      // Check cache first
      const cached = await cacheService.getCachedDocumentBuffer(documentId);
      if (cached) {
        const mimeType = doc.mimeType || "application/octet-stream";
        const forceDownload = req.query.download === "true";
        const disposition = forceDownload ? "attachment" : "inline";

        res.setHeader("Content-Type", mimeType);
        res.setHeader(
          "Content-Disposition",
          `${disposition}; filename="${encodeURIComponent(filename)}"`,
        );
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
          console.error(
            `[Stream] Decryption failed for ${documentId}:`,
            decryptErr.message,
          );
          // Continue with original buffer — document may not actually be encrypted
        }
      }

      // Cache the buffer for subsequent requests
      await cacheService.cacheDocumentBuffer(documentId, buffer);

      const mimeType = doc.mimeType || "application/octet-stream";
      const forceDownload = req.query.download === "true";
      const disposition = forceDownload ? "attachment" : "inline";

      res.setHeader("Content-Type", mimeType);
      res.setHeader(
        "Content-Disposition",
        `${disposition}; filename="${encodeURIComponent(filename)}"`,
      );
      res.setHeader("Content-Length", buffer.length.toString());
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
      res.end(buffer, "binary" as BufferEncoding);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  },
);
router.get("/:id/download", rateLimitMiddleware, (req, res) =>
  ctrl(req).download(req, res),
);

/**
 * PATCH /:id — Update document fields (folderId, filename, displayTitle)
 * Used by CreateCategoryModal, EditCategoryModal, UploadHub, DocumentsContext
 */
router.patch(
  "/:id",
  rateLimitMiddleware,
  validate(documentPatchSchema),
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const documentId = req.params.id;
    if (!documentId) {
      res.status(400).json({ error: "Document id is required" });
      return;
    }

    try {
      const updateData: {
        folderId?: string | null;
        filename?: string;
        displayTitle?: string | null;
      } = {};
      if (req.body.folderId !== undefined) updateData.folderId = req.body.folderId;
      if (req.body.filename !== undefined) updateData.filename = req.body.filename;
      if (req.body.displayTitle !== undefined)
        updateData.displayTitle = req.body.displayTitle;

      if (
        updateData.folderId === undefined &&
        updateData.filename === undefined &&
        updateData.displayTitle === undefined
      ) {
        res.status(400).json({ error: "No valid fields to update" });
        return;
      }

      const updated = await documentUploadWriteService.updateDocumentFieldsForUser(
        {
          userId,
          documentId,
          ...updateData,
        },
      );
      if (!updated) {
        res.status(404).json({ error: "Document not found" });
        return;
      }

      res.json({ ok: true, data: updated });
    } catch (e: any) {
      console.error("PATCH /documents/:id error:", e);
      res.status(500).json({ error: e.message || "Failed to update document" });
    }
  },
);

router.delete("/:id", rateLimitMiddleware, (req, res) =>
  ctrl(req).delete(req, res),
);

/* ──────────────────────────────────────────────────────────────
 * Restored routes required by DocumentViewer
 * These were removed during the cb42c60be refactor but the
 * frontend still depends on them.
 * ────────────────────────────────────────────────────────────── */

/**
 * GET /:id/status — Document status (metadata + processing state)
 */
router.get(
  "/:id/status",
  rateLimitMiddleware,
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    try {
      const doc = await prisma.document.findFirst({
        where: { id: req.params.id, userId },
        include: { metadata: true },
      });
      if (!doc) {
        res.status(404).json({ error: "Document not found" });
        return;
      }
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
  },
);

/**
 * Helper: Check if a MIME type requires preview PDF generation
 */
function needsPreviewPdf(mimeType: string | null): boolean {
  if (!mimeType) return false;
  const mime = mimeType.toLowerCase();
  return (
    mime.includes("wordprocessingml") ||
    mime === "application/msword" ||
    mime.includes("presentationml") ||
    mime === "application/vnd.ms-powerpoint"
  );
}

/**
 * GET /:id/preview-status — Lightweight endpoint for polling preview generation status
 * Returns only the preview status without generating a preview.
 * Frontend can poll this to know when preview is ready.
 */
router.get(
  "/:id/preview-status",
  rateLimitMiddleware,
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    try {
      const doc = await prisma.document.findFirst({
        where: { id: req.params.id, userId },
        select: {
          id: true,
          mimeType: true,
          status: true,
          metadata: {
            select: {
              previewPdfKey: true,
              previewPdfStatus: true,
              previewPdfError: true,
            },
          },
        },
      });

      if (!doc) {
        res.status(404).json({ error: "Document not found" });
        return;
      }

      const meta = doc.metadata as any;
      const previewNeeded = needsPreviewPdf(doc.mimeType);
      const hasPreview = !!meta?.previewPdfKey;
      const previewStatus =
        meta?.previewPdfStatus || (hasPreview ? "ready" : "pending");

      res.json({
        documentId: doc.id,
        documentStatus: doc.status,
        needsPreview: previewNeeded,
        previewStatus,
        previewReady: hasPreview,
        previewError: meta?.previewPdfError || null,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  },
);

/**
 * GET /:id/view-url — Signed URL for direct viewing (non-encrypted files)
 */
router.get(
  "/:id/view-url",
  rateLimitMiddleware,
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    try {
      const doc = await prisma.document.findFirst({
        where: { id: req.params.id, userId },
        select: {
          encryptedFilename: true,
          filename: true,
          mimeType: true,
          isEncrypted: true,
        },
      });
      if (!doc) {
        res.status(404).json({ error: "Document not found" });
        return;
      }

      const storageKey = doc.encryptedFilename;
      if (!storageKey) {
        res.status(404).json({ error: "No storage key" });
        return;
      }

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
  },
);

/**
 * GET /:id/preview-pdf — Stream converted PDF for DOCX/PPTX preview
 */
router.get(
  "/:id/preview-pdf",
  rateLimitMiddleware,
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    try {
      const doc = await prisma.document.findFirst({
        where: { id: req.params.id, userId },
        include: { metadata: true },
      });
      if (!doc) {
        res.status(404).json({ error: "Document not found" });
        return;
      }

      // Check for a converted PDF in metadata
      let pdfKey = (doc.metadata as any)?.previewPdfKey as string | undefined;

      // If no preview PDF, try generating on-demand
      if (!pdfKey) {
        const previewGen =
          await import("../../../services/preview/previewPdfGenerator.service");
        const result = await previewGen.generatePreviewPdf(doc.id, userId);
        if (result.success && result.pdfKey) {
          pdfKey = result.pdfKey;
        } else {
          res.status(404).json({ error: "No preview PDF available" });
          return;
        }
      }

      if (!pdfKey) {
        res.status(404).json({ error: "No preview PDF available" });
        return;
      }
      const buffer = await downloadFile(pdfKey);

      // Resolve clean filename
      let cleanName = doc.filename;
      if (!cleanName && doc.encryptedFilename) {
        const segments = doc.encryptedFilename.split("/");
        cleanName = segments[segments.length - 1] || null;
      }
      if (!cleanName) cleanName = "document";
      const pdfFilename = cleanName.replace(/\.[^.]+$/, ".pdf");

      const forceDownload = req.query.download === "true";
      const disposition = forceDownload ? "attachment" : "inline";

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `${disposition}; filename="${encodeURIComponent(pdfFilename)}"`,
      );
      res.setHeader("Content-Length", buffer.length.toString());
      res.end(buffer, "binary" as BufferEncoding);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  },
);

/**
 * GET /:id/slides — PPTX slide data with signed image URLs
 */
router.get(
  "/:id/slides",
  rateLimitMiddleware,
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    try {
      const doc = await prisma.document.findFirst({
        where: { id: req.params.id, userId },
        include: { metadata: true },
      });
      if (!doc) {
        res.status(404).json({ error: "Document not found" });
        return;
      }

      const isPPTX =
        doc.mimeType ===
          "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
        doc.mimeType?.includes("presentation") ||
        doc.mimeType?.includes("powerpoint");
      if (!isPPTX) {
        res.status(400).json({ error: "Not a PowerPoint file" });
        return;
      }

      // Parse slides data from metadata
      let slidesData: any[] = [];
      try {
        if ((doc.metadata as any)?.slidesData) {
          const raw = (doc.metadata as any).slidesData;
          slidesData = typeof raw === "string" ? JSON.parse(raw) : raw;
        }
      } catch {
        slidesData = [];
      }

      // Self-healing: verify slide files actually exist in the current storage provider.
      // After a storage migration (e.g. S3 → GCS) the metadata may reference files that
      // only exist in the old provider. Spot-check the first slide; if missing, wipe the
      // stale data and let the regeneration path below handle it.
      if (
        slidesData.length > 0 &&
        slidesData.some((s: any) => s.hasImage && s.storagePath)
      ) {
        const probe = slidesData.find((s: any) => s.hasImage && s.storagePath);
        if (probe) {
          try {
            const exists = await fileExists(probe.storagePath);
            if (!exists) {
              console.warn(
                `[Slides] Slide file not found in current storage (${probe.storagePath}), clearing stale data and regenerating...`,
              );
              await documentUploadWriteService.updateDocumentMetadata({
                documentId: doc.id,
                data: {
                  slidesData: null,
                  slideGenerationStatus: "pending",
                  slideGenerationError: null,
                },
              });
              slidesData = [];
            }
          } catch {
            // fileExists threw — treat as missing
            slidesData = [];
          }
        }
      }

      // If no slides data and preview PDF exists, trigger slide generation
      if (!slidesData.length || !slidesData.some((s: any) => s.hasImage)) {
        const slideGenStatus = (doc.metadata as any)?.slideGenerationStatus;
        if (slideGenStatus !== "processing") {
          // Trigger async slide generation — don't block the response
          generateSlideImagesForDocument(doc.id, userId).catch((err: any) => {
            console.error(
              `[Slides] Auto-trigger slide generation failed:`,
              err.message,
            );
          });
          if (!slidesData.length) {
            res.json({
              success: true,
              slides: [],
              totalSlides: 0,
              page: 1,
              pageSize: 10,
              totalPages: 0,
              isGenerating: true,
            });
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
          while ((m = regex.exec(text)) !== null)
            markers.push({ num: parseInt(m[1]), idx: m.index });
          for (let i = 0; i < markers.length; i++) {
            const start =
              markers[i].idx + `=== Slide ${markers[i].num} ===`.length;
            const end = markers[i + 1]?.idx ?? text.length;
            const content = text.substring(start, end).trim();
            slidesData.push({
              slideNumber: markers[i].num,
              content,
              hasImage: false,
              imageUrl: null,
              storagePath: null,
            });
          }
        }
      }

      // Pagination
      const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
      const pageSize = Math.min(
        200,
        Math.max(1, parseInt(req.query.pageSize as string, 10) || 10),
      );
      const totalSlides = slidesData.length;
      const totalPages = Math.ceil(totalSlides / pageSize);
      const startIdx = (page - 1) * pageSize;
      const pageSlides = slidesData.slice(startIdx, startIdx + pageSize);

      // Generate signed URLs for slides that have storage paths
      const processed = await Promise.all(
        pageSlides.map(async (slide: any, i: number) => {
          const slideNumber =
            slide.slideNumber || slide.slide_number || startIdx + i + 1;
          let imageUrl: string | null = null;
          let hasImage = false;

          const storagePath = slide.storagePath || slide.storage_path;
          if (storagePath) {
            try {
              imageUrl = await getSignedUrl(storagePath, 3600);
              hasImage = true;
            } catch {
              /* storage path invalid */
            }
          }

          return {
            slideNumber,
            content: slide.content || "",
            hasImage,
            imageUrl,
            storagePath,
          };
        }),
      );

      // Parse PPTX metadata
      let pptxMetadata: any = {};
      try {
        if ((doc.metadata as any)?.pptxMetadata) {
          const raw = (doc.metadata as any).pptxMetadata;
          pptxMetadata = typeof raw === "string" ? JSON.parse(raw) : raw;
        }
      } catch {
        /* ignore */
      }

      res.json({
        success: true,
        slides: processed,
        totalSlides,
        page,
        pageSize,
        totalPages,
        metadata: pptxMetadata,
      });
    } catch (e: any) {
      res.status(500).json({ error: "Failed to get slides data" });
    }
  },
);

/**
 * POST /:id/regenerate-slides — Force regeneration of PPTX slide images
 */
router.post(
  "/:id/regenerate-slides",
  rateLimitMiddleware,
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    try {
      const doc = await prisma.document.findFirst({
        where: { id: req.params.id, userId },
        select: { id: true, mimeType: true },
      });
      if (!doc) {
        res.status(404).json({ error: "Document not found" });
        return;
      }

      const isPptx =
        doc.mimeType ===
          "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
        doc.mimeType?.includes("presentation") ||
        doc.mimeType?.includes("powerpoint");
      if (!isPptx) {
        res.status(400).json({ error: "Not a PowerPoint file" });
        return;
      }

      // Clear existing slides data so regeneration starts fresh
      await documentUploadWriteService.upsertDocumentMetadata({
        documentId: doc.id,
        update: {
          slidesData: null,
          slideGenerationStatus: "pending",
          slideGenerationError: null,
        },
        create: {
          slideGenerationStatus: "pending",
        },
      });

      // Trigger async generation
      generateSlideImagesForDocument(doc.id, userId).catch((err: any) => {
        console.error(`[RegenerateSlides] Failed:`, err.message);
      });

      res.json({
        success: true,
        message: "Slide regeneration started",
        isGenerating: true,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  },
);

/**
 * POST /:id/reprocess — Trigger reprocessing of a document
 */
router.post(
  "/:id/reprocess",
  rateLimitMiddleware,
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    try {
      const doc = await prisma.document.findFirst({
        where: { id: req.params.id, userId },
        select: {
          id: true,
          mimeType: true,
          encryptedFilename: true,
          filename: true,
        },
      });
      if (!doc) {
        res.status(404).json({ error: "Document not found" });
        return;
      }

      // Reset all stage statuses and document status
      const resetCount = await documentUploadWriteService.resetForReprocess({
        userId,
        documentId: doc.id,
        at: new Date(),
      });
      if (resetCount === 0) {
        res.status(404).json({ error: "Document not found" });
        return;
      }

      // Publish extract job to start the pipeline
      if (env.USE_GCP_WORKERS && isPubSubAvailable()) {
        const storageKey = doc.encryptedFilename || "";
        await publishExtractJob(
          doc.id,
          userId,
          storageKey,
          doc.mimeType || "application/octet-stream",
          doc.filename || undefined,
        );
      }

      res.json({
        message: "Document reprocessing started successfully",
        result: { status: "queued" },
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  },
);

/**
 * PATCH /:id/markdown — Update markdown content in metadata
 */
router.patch(
  "/:id/markdown",
  rateLimitMiddleware,
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    try {
      const { markdownContent } = req.body;
      if (markdownContent === undefined) {
        res.status(400).json({ error: "markdownContent is required" });
        return;
      }

      const doc = await prisma.document.findFirst({
        where: { id: req.params.id, userId },
        select: { id: true },
      });
      if (!doc) {
        res.status(404).json({ error: "Document not found" });
        return;
      }

      const metadata = await documentUploadWriteService.upsertDocumentMetadata({
        documentId: doc.id,
        update: { markdownContent },
        create: { markdownContent },
      });

      res.json({ message: "Markdown updated successfully", metadata });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  },
);

/**
 * POST /:id/export — Export document (returns download URL)
 * Supports PDF and DOCX export for all compatible document types.
 */
router.post(
  "/:id/export",
  rateLimitMiddleware,
  async (req: any, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    try {
      const { format } = req.body;
      if (!format || !["pdf", "docx"].includes(format)) {
        res
          .status(400)
          .json({ error: "Invalid format", supportedFormats: ["pdf", "docx"] });
        return;
      }

      const doc = await prisma.document.findFirst({
        where: { id: req.params.id, userId },
        select: {
          id: true,
          filename: true,
          encryptedFilename: true,
          mimeType: true,
          isEncrypted: true,
          encryptionIV: true,
          encryptionAuthTag: true,
        },
      });
      if (!doc) {
        res.status(404).json({ error: "Document not found" });
        return;
      }

      // Resolve clean filename: prefer filename, fallback to last segment of S3 key
      let cleanName = doc.filename;
      if (!cleanName && doc.encryptedFilename) {
        const segments = doc.encryptedFilename.split("/");
        cleanName = segments[segments.length - 1] || null;
      }
      if (!cleanName) cleanName = "document";

      const mime = (doc.mimeType || "").toLowerCase();

      // Supported types for conversion
      const officeTypes = [
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/msword",
        "application/vnd.ms-excel",
        "application/vnd.ms-powerpoint",
      ];
      const imageTypes = [
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/gif",
        "image/webp",
      ];

      // ========== DOCX EXPORT ==========
      if (format === "docx") {
        // If already a DOCX file, return original
        if (
          mime ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        ) {
          res.json({
            success: true,
            downloadUrl: `/api/documents/${doc.id}/stream?download=true`,
            filename: cleanName,
            mimeType:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          });
          return;
        }
        // If it's a DOC file, also return original (old Word format)
        if (mime === "application/msword") {
          res.json({
            success: true,
            downloadUrl: `/api/documents/${doc.id}/stream?download=true`,
            filename: cleanName.replace(/\.doc$/i, ".doc"),
            mimeType: "application/msword",
          });
          return;
        }

        // For PDFs, Excel, and PowerPoint - convert to DOCX via CloudConvert
        const convertibleToDocx = ["application/pdf", ...officeTypes];
        if (convertibleToDocx.includes(mime)) {
          const cloudConvert =
            await import("../../../services/conversion/cloudConvertPptx.service");
          if (!cloudConvert.isCloudConvertAvailable()) {
            res
              .status(400)
              .json({ error: "DOCX conversion service is not configured." });
            return;
          }

          // Download and decrypt file
          let fileBuffer = await downloadFile(doc.encryptedFilename!);
          if (doc.isEncrypted && doc.encryptionIV && doc.encryptionAuthTag) {
            try {
              const crypto = await import("crypto");
              const key = crypto.scryptSync(`document-${userId}`, "salt", 32);
              const iv = Buffer.from(doc.encryptionIV, "base64");
              const authTag = Buffer.from(doc.encryptionAuthTag, "base64");
              const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
              decipher.setAuthTag(authTag);
              fileBuffer = Buffer.concat([
                decipher.update(fileBuffer),
                decipher.final(),
              ]);
            } catch (decryptErr: any) {
              console.error(`[Export] Decryption failed:`, decryptErr.message);
            }
          }

          const result = await cloudConvert.convertToDocx(
            fileBuffer,
            cleanName,
            doc.mimeType || undefined,
          );
          if (!result.success || !result.docxBuffer) {
            res
              .status(400)
              .json({ error: result.error || "DOCX conversion failed." });
            return;
          }

          // Send the DOCX directly as response
          const docxFilename = cleanName.replace(/\.[^/.]+$/, ".docx");
          res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          );
          res.setHeader(
            "Content-Disposition",
            `attachment; filename="${encodeURIComponent(docxFilename)}"`,
          );
          res.setHeader("Content-Length", result.docxBuffer.length.toString());
          res.end(result.docxBuffer, "binary" as BufferEncoding);
          return;
        }

        // Images and text files cannot be converted to DOCX
        if (
          imageTypes.includes(mime) ||
          mime.startsWith("text/") ||
          mime === "application/json"
        ) {
          res.status(400).json({
            error:
              "DOCX export is not available for this file type. Use Download instead.",
          });
          return;
        }

        res
          .status(400)
          .json({ error: "DOCX export is not available for this file type." });
        return;
      }

      // ========== PDF EXPORT ==========
      // If already PDF, return original
      if (mime === "application/pdf") {
        res.json({
          success: true,
          downloadUrl: `/api/documents/${doc.id}/stream?download=true`,
          filename: cleanName,
          mimeType: "application/pdf",
        });
        return;
      }

      // Office documents — use preview-pdf endpoint (cached)
      if (officeTypes.includes(mime)) {
        const metadata = await prisma.documentMetadata.findUnique({
          where: { documentId: doc.id },
          select: { previewPdfKey: true },
        });

        if (!metadata?.previewPdfKey) {
          const previewGen =
            await import("../../../services/preview/previewPdfGenerator.service");
          const result = await previewGen.generatePreviewPdf(doc.id, userId);
          if (!result.success) {
            res
              .status(400)
              .json({ error: "PDF conversion failed.", details: result.error });
            return;
          }
        }

        const pdfFilename = cleanName.replace(/\.[^/.]+$/, ".pdf");
        res.json({
          success: true,
          downloadUrl: `/api/documents/${doc.id}/preview-pdf?download=true`,
          filename: pdfFilename,
          mimeType: "application/pdf",
        });
        return;
      }

      // Images and text files - not supported for PDF export yet
      if (
        imageTypes.includes(mime) ||
        mime.startsWith("text/") ||
        mime === "application/json"
      ) {
        res.status(400).json({
          error:
            "PDF export is not available for this file type. Use Download instead.",
        });
        return;
      }

      res
        .status(400)
        .json({ error: "PDF export is not available for this file type." });
    } catch (e: any) {
      console.error("[Export] Error:", e.message);
      res.status(500).json({ error: e.message });
    }
  },
);

export default router;
