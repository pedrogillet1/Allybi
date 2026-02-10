import * as crypto from "crypto";
import prisma from "../../config/database";
import { downloadFile, uploadFile } from "../../config/storage";
import { addDocumentJob } from "../../queues/document.queue";
import { env } from "../../config/env";
import { isPubSubAvailable, publishExtractJob } from "../jobs/pubsubPublisher.service";
import RevisionService from "../documents/revision.service";
import type { EditRevisionStore } from "./editing.types";
import { DocxEditorService } from "./docx/docxEditor.service";
import { XlsxFileEditorService } from "./xlsx/xlsxFileEditor.service";
import { SlidesClientService } from "./slides/slidesClient.service";
import { SlidesEditorService } from "./slides/slidesEditor.service";

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function assertMime(actual: string | null | undefined, expected: string, label: string): void {
  if (!actual || actual !== expected) {
    throw new Error(`${label} requires ${expected}. Current MIME: ${actual || "unknown"}`);
  }
}

function assertPptxMime(actual: string | null | undefined, label: string): void {
  const mime = String(actual || "").toLowerCase();
  const ok =
    mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    mime === "application/vnd.ms-powerpoint" ||
    mime.includes("presentationml");
  if (!ok) {
    throw new Error(`${label} requires a PPTX document. Current MIME: ${actual || "unknown"}`);
  }
}

type EditingSaveMode = "overwrite" | "revision";

function editingSaveMode(): EditingSaveMode {
  const raw = String(process.env.KODA_EDITING_SAVE_MODE || "overwrite").trim().toLowerCase();
  return raw === "revision" ? "revision" : "overwrite";
}

function keepUndoHistory(): boolean {
  // Keep history by default (stored as hidden revisions). Set to "false" to disable.
  return String(process.env.KODA_EDITING_KEEP_UNDO_HISTORY || "true").trim().toLowerCase() !== "false";
}

function sha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function safeJsonParseObject(value: unknown): Record<string, any> {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as any) : {};
  } catch {
    return {};
  }
}

function getSlidesLinkFromPptxMetadata(pptxMetadata: unknown): { presentationId: string; url: string } | null {
  const obj = safeJsonParseObject(pptxMetadata);
  const link = obj?.editingSlides;
  const id = typeof link?.presentationId === "string" ? link.presentationId.trim() : "";
  const url = typeof link?.url === "string" ? link.url.trim() : "";
  if (!id) return null;
  return { presentationId: id, url: url || `https://docs.google.com/presentation/d/${id}/edit` };
}

function setSlidesLinkInPptxMetadata(
  pptxMetadata: unknown,
  link: { presentationId: string; url: string },
): string {
  const obj = safeJsonParseObject(pptxMetadata);
  obj.editingSlides = { presentationId: link.presentationId, url: link.url };
  return JSON.stringify(obj);
}

type EditOperatorLike =
  | "EDIT_PARAGRAPH"
  | "ADD_PARAGRAPH"
  | "EDIT_CELL"
  | "EDIT_RANGE"
  | "ADD_SHEET"
  | "RENAME_SHEET"
  | "ADD_SLIDE"
  | "REWRITE_SLIDE_TEXT"
  | "REPLACE_SLIDE_IMAGE";

export class DocumentRevisionStoreService implements EditRevisionStore {
  private readonly revisionService: RevisionService;
  private readonly docxEditor: DocxEditorService;
  private readonly xlsxEditor: XlsxFileEditorService;
  private readonly slidesClient: SlidesClientService;
  private readonly slidesEditor: SlidesEditorService;

  constructor(opts?: {
    revisionService?: RevisionService;
    docxEditor?: DocxEditorService;
    xlsxEditor?: XlsxFileEditorService;
    slidesClient?: SlidesClientService;
    slidesEditor?: SlidesEditorService;
  }) {
    this.revisionService = opts?.revisionService ?? new RevisionService();
    this.docxEditor = opts?.docxEditor ?? new DocxEditorService();
    this.xlsxEditor = opts?.xlsxEditor ?? new XlsxFileEditorService();
    this.slidesClient = opts?.slidesClient ?? new SlidesClientService();
    this.slidesEditor = opts?.slidesEditor ?? new SlidesEditorService();
  }

  async createRevision(input: {
    documentId: string;
    userId: string;
    correlationId: string;
    conversationId: string;
    clientMessageId: string;
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ revisionId: string }> {
    const docId = input.documentId.trim();
    const userId = input.userId.trim();
    const meta = input.metadata ?? {};

    const op = asString(meta.operator) as EditOperatorLike | null;
    if (!op) throw new Error("Missing edit operator in revision metadata.");

    const targetId = asString(meta.targetId) ?? null;
    const beforeText = asString(meta.beforeText) ?? null;
    const contentFormat = asString(meta.contentFormat) === "html" ? "html" : "plain";

    const doc = await prisma.document.findFirst({
      where: { id: docId, userId },
      select: { id: true, encryptedFilename: true, filename: true, mimeType: true },
    });
    if (!doc) throw new Error("Document not found or not accessible.");
    if (!doc.encryptedFilename) throw new Error("Document storage key missing.");

    const original = await downloadFile(doc.encryptedFilename);

    let edited: Buffer;

    if (op === "EDIT_PARAGRAPH") {
      assertMime(doc.mimeType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "EDIT_PARAGRAPH");
      if (!targetId) throw new Error("EDIT_PARAGRAPH requires targetId.");
      edited = await this.docxEditor.applyParagraphEdit(original, targetId, input.content, { format: contentFormat });
    } else if (op === "ADD_PARAGRAPH") {
      assertMime(doc.mimeType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "ADD_PARAGRAPH");
      if (!targetId) throw new Error("ADD_PARAGRAPH requires targetId (insert after).");
      edited = await this.docxEditor.insertParagraphAfter(original, targetId, input.content, { format: contentFormat });
    } else if (op === "EDIT_CELL") {
      assertMime(doc.mimeType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "EDIT_CELL");
      if (!targetId) throw new Error("EDIT_CELL requires targetId.");
      edited = await this.xlsxEditor.editCell(original, targetId, input.content);
    } else if (op === "EDIT_RANGE") {
      assertMime(doc.mimeType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "EDIT_RANGE");
      if (!targetId) throw new Error("EDIT_RANGE requires targetId.");
      edited = await this.xlsxEditor.editRange(original, targetId, input.content);
    } else if (op === "ADD_SHEET") {
      assertMime(doc.mimeType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "ADD_SHEET");
      edited = await this.xlsxEditor.addSheet(original, input.content);
    } else if (op === "RENAME_SHEET") {
      assertMime(doc.mimeType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "RENAME_SHEET");
      const fromName = beforeText ?? asString(meta.fromSheetName) ?? null;
      const toName = input.content;
      if (!fromName) throw new Error("RENAME_SHEET requires beforeText (old sheet name) or fromSheetName in metadata.");
      edited = await this.xlsxEditor.renameSheet(original, fromName, toName);
    } else if (op === "REWRITE_SLIDE_TEXT") {
      assertPptxMime(doc.mimeType, "REWRITE_SLIDE_TEXT");
      if (!targetId) throw new Error("REWRITE_SLIDE_TEXT requires targetId (Slides objectId).");

      const { presentationId, url } = await this.ensureSlidesPresentationForDocument({
        documentId: docId,
        userId,
        pptxBytes: original,
        filename: doc.filename || "deck.pptx",
        correlationId: input.correlationId,
        conversationId: input.conversationId,
        clientMessageId: input.clientMessageId,
      });

      await this.slidesEditor.replaceText(presentationId, targetId, input.content, {
        correlationId: input.correlationId,
        userId: input.userId,
        conversationId: input.conversationId,
        clientMessageId: input.clientMessageId,
      });

      edited = await this.slidesClient.exportPresentationToPptx(presentationId, {
        correlationId: input.correlationId,
        userId: input.userId,
        conversationId: input.conversationId,
        clientMessageId: input.clientMessageId,
      });

      // Persist presentation linkage in revision metadata (useful for debugging).
      (meta as any).slidesPresentationId = presentationId;
      (meta as any).slidesPresentationUrl = url;
    } else if (op === "ADD_SLIDE") {
      assertPptxMime(doc.mimeType, "ADD_SLIDE");

      const { presentationId, url } = await this.ensureSlidesPresentationForDocument({
        documentId: docId,
        userId,
        pptxBytes: original,
        filename: doc.filename || "deck.pptx",
        correlationId: input.correlationId,
        conversationId: input.conversationId,
        clientMessageId: input.clientMessageId,
      });

      // Input content can optionally specify a Slides predefined layout.
      const requestedLayout = String(input.content || "").trim() || "TITLE_AND_BODY";
      await this.slidesEditor.addSlide(presentationId, requestedLayout as any, undefined, {
        correlationId: input.correlationId,
        userId: input.userId,
        conversationId: input.conversationId,
        clientMessageId: input.clientMessageId,
      });

      edited = await this.slidesClient.exportPresentationToPptx(presentationId, {
        correlationId: input.correlationId,
        userId: input.userId,
        conversationId: input.conversationId,
        clientMessageId: input.clientMessageId,
      });

      (meta as any).slidesPresentationId = presentationId;
      (meta as any).slidesPresentationUrl = url;
    } else if (op === "REPLACE_SLIDE_IMAGE") {
      assertPptxMime(doc.mimeType, "REPLACE_SLIDE_IMAGE");
      if (!targetId) throw new Error("REPLACE_SLIDE_IMAGE requires targetId (Slides image objectId).");
      const url = String(input.content || "").trim();
      if (!/^https:\/\//i.test(url)) {
        throw new Error("REPLACE_SLIDE_IMAGE requires an HTTPS image URL.");
      }

      const ensured = await this.ensureSlidesPresentationForDocument({
        documentId: docId,
        userId,
        pptxBytes: original,
        filename: doc.filename || "deck.pptx",
        correlationId: input.correlationId,
        conversationId: input.conversationId,
        clientMessageId: input.clientMessageId,
      });

      await this.slidesEditor.replaceImage(ensured.presentationId, targetId, url, {
        correlationId: input.correlationId,
        userId: input.userId,
        conversationId: input.conversationId,
        clientMessageId: input.clientMessageId,
      });

      edited = await this.slidesClient.exportPresentationToPptx(ensured.presentationId, {
        correlationId: input.correlationId,
        userId: input.userId,
        conversationId: input.conversationId,
        clientMessageId: input.clientMessageId,
      });

      (meta as any).slidesPresentationId = ensured.presentationId;
      (meta as any).slidesPresentationUrl = ensured.url;
    } else {
      throw new Error(`Unsupported edit operator: ${op}`);
    }

    // Default: overwrite the original stored file (no new document in the user's library).
    // "revision" mode keeps the old behavior for debugging/back-compat.
    if (editingSaveMode() === "overwrite") {
      // Optional hidden backup so Undo works without creating visible library duplicates.
      if (keepUndoHistory()) {
        await this.revisionService.createRevision(
          {
            userId,
            sourceDocumentId: docId,
            contentBuffer: original,
            mimeType: doc.mimeType || undefined,
            filename: doc.filename || undefined,
            enqueueReindex: false,
            reason: `backup:${op}`,
            metadata: {
              ...meta,
              appliedOperator: op,
              appliedTargetId: targetId,
              backupOf: docId,
            },
          },
          {
            correlationId: input.correlationId,
            userId: input.userId,
            conversationId: input.conversationId,
            clientMessageId: input.clientMessageId,
          },
        );
      }

      // Overwrite content at the same storage key.
      await uploadFile(doc.encryptedFilename, edited, doc.mimeType || "application/octet-stream");

      // Clear derived artifacts so re-indexing doesn't mix old and new chunks.
      const isSlidesEdit = op === "REWRITE_SLIDE_TEXT" || op === "ADD_SLIDE" || op === "REPLACE_SLIDE_IMAGE";

      await prisma.$transaction(async (tx) => {
        await tx.documentChunk.deleteMany({ where: { documentId: docId } });
        await tx.documentEmbedding.deleteMany({ where: { documentId: docId } });

        if (isSlidesEdit) {
          const nextPptxMetadata =
            (meta as any).slidesPresentationId
              ? setSlidesLinkInPptxMetadata(
                  (meta as any).pptxMetadata,
                  {
                    presentationId: String((meta as any).slidesPresentationId),
                    url:
                      String((meta as any).slidesPresentationUrl || "").trim() ||
                      `https://docs.google.com/presentation/d/${String((meta as any).slidesPresentationId)}/edit`,
                  },
                )
              : null;

          await tx.documentMetadata.upsert({
            where: { documentId: docId },
            update: {
              // Clear derived preview artifacts so the preview pipeline re-renders.
              markdownContent: null,
              markdownUrl: null,
              markdownStructure: null,
              sheetCount: null,
              slideCount: null,
              slidesData: null,
              pptxMetadata: nextPptxMetadata,
              slideGenerationStatus: "pending",
              slideGenerationError: null,
              previewPdfStatus: "pending",
              previewPdfKey: null,
              previewPdfError: null,
              previewPdfAttempts: 0,
              previewPdfUpdatedAt: null,
            } as any,
            create: {
              documentId: docId,
              pptxMetadata: nextPptxMetadata,
            } as any,
          });
        } else {
          await tx.documentMetadata.deleteMany({ where: { documentId: docId } });
        }

        await tx.documentProcessingMetrics.deleteMany({ where: { documentId: docId } });
        await tx.document.update({
          where: { id: docId },
          data: {
            fileSize: edited.length,
            fileHash: sha256(edited),
            status: "uploaded",
            chunksCount: 0,
            embeddingsGenerated: false,
            error: null,
            rawText: null,
            previewText: null,
            renderableContent: null,
            extractedTextEncrypted: null,
            previewTextEncrypted: null,
            renderableContentEncrypted: null,
          },
        });
      });

      // Re-enqueue processing for the same documentId.
      try {
        if (env.USE_GCP_WORKERS && isPubSubAvailable()) {
          await publishExtractJob(docId, userId, doc.encryptedFilename, doc.mimeType, doc.filename || "document");
        } else {
          await addDocumentJob({
            documentId: docId,
            userId,
            filename: doc.filename || "document",
            mimeType: doc.mimeType,
            encryptedFilename: doc.encryptedFilename,
          });
        }
      } catch {
        // Best-effort: the edit is saved; processing can be retried by the sweeper or manual reindex.
      }

      return { revisionId: docId };
    }

    const created = await this.revisionService.createRevision(
      {
        userId,
        sourceDocumentId: docId,
        contentBuffer: edited,
        mimeType: doc.mimeType || undefined,
        filename: doc.filename || undefined,
        enqueueReindex: true,
        reason: `edit:${op}`,
        metadata: {
          ...meta,
          appliedOperator: op,
          appliedTargetId: targetId,
        },
      },
      {
        correlationId: input.correlationId,
        userId: input.userId,
        conversationId: input.conversationId,
        clientMessageId: input.clientMessageId,
      }
    );

    return { revisionId: created.id };
  }

  async undoToRevision(input: {
    documentId: string;
    userId: string;
    revisionId?: string;
  }): Promise<{ restoredRevisionId: string }> {
    const userId = input.userId.trim();
    const docId = input.documentId.trim();

    if (editingSaveMode() === "overwrite") {
      // Undo in overwrite mode restores the original document in-place.
      const target = await prisma.document.findFirst({
        where: { id: docId, userId },
        select: { id: true, encryptedFilename: true, filename: true, mimeType: true, parentVersionId: true },
      });
      if (!target) throw new Error("Document not found or not accessible.");
      if (!target.encryptedFilename) throw new Error("Document storage key missing.");

      const rootDocumentId = await this.resolveRootDocumentId(target.id);
      const chain = await prisma.document.findMany({
        where: {
          userId,
          OR: [{ id: rootDocumentId }, { parentVersionId: rootDocumentId }],
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, encryptedFilename: true, filename: true, mimeType: true, createdAt: true },
      });

      // Chain includes the root document itself; backups are additional items with parentVersionId set.
      const backups = chain.filter((d) => d.id !== rootDocumentId);
      if (backups.length === 0) throw new Error("No previous revision to undo to.");

      const requested = input.revisionId?.trim() || null;
      const restoreFromId = requested ? requested : backups[backups.length - 1]!.id;
      const restoreDoc = chain.find((d) => d.id === restoreFromId);
      if (!restoreDoc?.encryptedFilename) throw new Error("Restore revision storage key missing.");

      // Optional: backup current state before undo (kept hidden) so repeated undo doesn't destroy history.
      if (keepUndoHistory()) {
        const currentBytes = await downloadFile(target.encryptedFilename);
        await this.revisionService.createRevision(
          {
            userId,
            sourceDocumentId: rootDocumentId,
            contentBuffer: currentBytes,
            mimeType: target.mimeType || undefined,
            filename: target.filename || undefined,
            enqueueReindex: false,
            reason: `undo-backup`,
            metadata: { undoOf: restoreFromId },
          },
          { userId },
        );
      }

      const bytes = await downloadFile(restoreDoc.encryptedFilename);
      await uploadFile(target.encryptedFilename, bytes, target.mimeType || "application/octet-stream");

      await prisma.$transaction([
        prisma.documentChunk.deleteMany({ where: { documentId: docId } }),
        prisma.documentEmbedding.deleteMany({ where: { documentId: docId } }),
        prisma.documentMetadata.deleteMany({ where: { documentId: docId } }),
        prisma.documentProcessingMetrics.deleteMany({ where: { documentId: docId } }),
        prisma.document.update({
          where: { id: docId },
          data: {
            fileSize: bytes.length,
            fileHash: sha256(bytes),
            status: "uploaded",
            chunksCount: 0,
            embeddingsGenerated: false,
            error: null,
            rawText: null,
            previewText: null,
            renderableContent: null,
            extractedTextEncrypted: null,
            previewTextEncrypted: null,
            renderableContentEncrypted: null,
          },
        }),
      ]);

      try {
        if (env.USE_GCP_WORKERS && isPubSubAvailable()) {
          await publishExtractJob(docId, userId, target.encryptedFilename, target.mimeType, target.filename || "document");
        } else {
          await addDocumentJob({
            documentId: docId,
            userId,
            filename: target.filename || "document",
            mimeType: target.mimeType,
            encryptedFilename: target.encryptedFilename,
          });
        }
      } catch {}

      return { restoredRevisionId: docId };
    }

    const source = await prisma.document.findFirst({
      where: { id: docId, userId },
      select: { id: true, parentVersionId: true },
    });
    if (!source) throw new Error("Document not found or not accessible.");

    const rootDocumentId = await this.resolveRootDocumentId(source.id);

    const chain = await prisma.document.findMany({
      where: {
        userId,
        OR: [{ id: rootDocumentId }, { parentVersionId: rootDocumentId }],
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, encryptedFilename: true, filename: true, mimeType: true, createdAt: true },
    });

    if (chain.length <= 1) throw new Error("No previous revision to undo to.");

    let restoreFromId: string | null = input.revisionId?.trim() || null;
    if (restoreFromId) {
      const ok = chain.some((d) => d.id === restoreFromId);
      if (!ok) throw new Error("Requested revisionId is not in this document's revision chain.");
    } else {
      // Restore to the previous item in the chain (second last).
      restoreFromId = chain[chain.length - 2]!.id;
    }

    const restoreDoc = chain.find((d) => d.id === restoreFromId);
    if (!restoreDoc?.encryptedFilename) throw new Error("Restore revision storage key missing.");

    const bytes = await downloadFile(restoreDoc.encryptedFilename);

    const created = await this.revisionService.createRevision(
      {
        userId,
        sourceDocumentId: restoreDoc.id,
        contentBuffer: bytes,
        mimeType: restoreDoc.mimeType || undefined,
        filename: restoreDoc.filename || undefined,
        enqueueReindex: true,
        reason: `undo`,
        metadata: { undoFrom: restoreDoc.id, rootDocumentId },
      },
      { userId }
    );

    return { restoredRevisionId: created.id };
  }

  private async resolveRootDocumentId(documentId: string): Promise<string> {
    let currentId: string | null = documentId;
    let safety = 0;

    while (currentId && safety < 20) {
      safety += 1;
      const row: { id: string; parentVersionId: string | null } | null = await prisma.document.findUnique({
        where: { id: currentId },
        select: { id: true, parentVersionId: true },
      });
      if (!row) throw new Error(`Revision chain broken for document ${documentId}.`);
      if (!row.parentVersionId) return row.id;
      currentId = row.parentVersionId;
    }

    throw new Error("Revision chain exceeded safety depth.");
  }

  private async ensureSlidesPresentationForDocument(input: {
    documentId: string;
    userId: string;
    pptxBytes: Buffer;
    filename: string;
    correlationId: string;
    conversationId: string;
    clientMessageId: string;
  }): Promise<{ presentationId: string; url: string }> {
    const documentId = input.documentId.trim();
    const userId = input.userId.trim();

    const existing = await prisma.documentMetadata.findUnique({
      where: { documentId },
      select: { pptxMetadata: true },
    });

    const cached = getSlidesLinkFromPptxMetadata((existing as any)?.pptxMetadata);
    if (cached?.presentationId) {
      return {
        presentationId: cached.presentationId,
        url: cached.url,
      };
    }

    const folderId = asString(process.env.GOOGLE_SLIDES_FOLDER_ID);
    const imported = await this.slidesClient.importPptxToPresentation(
      {
        pptxBuffer: input.pptxBytes,
        filename: input.filename,
        ...(folderId ? { parentFolderId: folderId } : {}),
      },
      {
        correlationId: input.correlationId,
        userId,
        conversationId: input.conversationId,
        clientMessageId: input.clientMessageId,
      },
    );

    await prisma.documentMetadata.upsert({
      where: { documentId },
      update: { pptxMetadata: setSlidesLinkInPptxMetadata((existing as any)?.pptxMetadata, imported) } as any,
      create: { documentId, pptxMetadata: setSlidesLinkInPptxMetadata(null, imported) } as any,
    });

    return imported;
  }
}

export default DocumentRevisionStoreService;
