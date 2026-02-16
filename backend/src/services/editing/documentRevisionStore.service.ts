import * as crypto from "crypto";
import prisma from "../../config/database";
import { downloadFile, uploadFile } from "../../config/storage";
import { addDocumentJob, processDocumentJobData, type ProcessDocumentJobData } from "../../queues/document.queue";
import { env } from "../../config/env";
import { isPubSubAvailable, publishExtractJob } from "../jobs/pubsubPublisher.service";
import RevisionService from "../documents/revision.service";
import { logger } from "../../infra/logger";
import cacheService from "../cache.service";
import type { EditRevisionStore } from "./editing.types";
import { DocxEditorService } from "./docx/docxEditor.service";
import { XlsxFileEditorService } from "./xlsx/xlsxFileEditor.service";
import { SlidesClientService } from "./slides/slidesClient.service";
import { SlidesEditorService } from "./slides/slidesEditor.service";
import { SheetsEditorService } from "./sheets/sheetsEditor.service";
import { SheetsChartService } from "./sheets/sheetsChart.service";
import { SheetsFormulaService } from "./sheets/sheetsFormula.service";
import { SheetsTableService } from "./sheets/sheetsTable.service";
import SheetsBridgeService from "./sheets/sheetsBridge.service";
import { SheetsBridgeError } from "./sheets/sheetsBridge.service";
import { SheetsClientError } from "./sheets/sheetsClient.service";
import { looksLikeTruncatedSpanPayload } from "./docxSpanPayloadGuard";

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

function getSheetsLinkFromPptxMetadata(pptxMetadata: unknown): { spreadsheetId: string; url: string } | null {
  const obj = safeJsonParseObject(pptxMetadata);
  const link = obj?.editingSheets;
  const id = typeof link?.spreadsheetId === "string" ? link.spreadsheetId.trim() : "";
  const url = typeof link?.url === "string" ? link.url.trim() : "";
  if (!id) return null;
  return { spreadsheetId: id, url: url || `https://docs.google.com/spreadsheets/d/${id}/edit` };
}

function setSheetsLinkInPptxMetadata(pptxMetadata: unknown, link: { spreadsheetId: string; url: string }): string {
  const obj = safeJsonParseObject(pptxMetadata);
  obj.editingSheets = { spreadsheetId: link.spreadsheetId, url: link.url };
  return JSON.stringify(obj);
}

function getSheetsChartsFromPptxMetadata(pptxMetadata: unknown): any[] {
  const obj = safeJsonParseObject(pptxMetadata);
  const list = obj?.editingSheetsCharts;
  return Array.isArray(list) ? list : [];
}

function addSheetsChartToPptxMetadata(
  pptxMetadata: unknown,
  entry: { chartId?: number; type: string; range: string; title?: string; settings?: Record<string, unknown>; createdAtIso?: string },
): string {
  const obj = safeJsonParseObject(pptxMetadata);
  const existing = Array.isArray(obj.editingSheetsCharts) ? obj.editingSheetsCharts : [];
  const cleanSettings = entry.settings && typeof entry.settings === "object"
    ? Object.fromEntries(
        Object.entries(entry.settings)
          .filter(([k, v]) => {
            if (!k || typeof k !== "string") return false;
            if (v == null) return false;
            if (typeof v === "number") return Number.isFinite(v);
            if (typeof v === "string") return v.trim().length > 0;
            if (typeof v === "boolean") return true;
            if (Array.isArray(v)) return v.length > 0;
            if (typeof v === "object") return Object.keys(v as Record<string, unknown>).length > 0;
            return false;
          }),
      )
    : undefined;
  const next = [
    ...(existing as any[]),
    {
      chartId: typeof entry.chartId === "number" ? entry.chartId : undefined,
      type: String(entry.type || "").trim() || "LINE",
      range: String(entry.range || "").trim(),
      title: entry.title ? String(entry.title).slice(0, 140) : undefined,
      settings: cleanSettings,
      createdAtIso: String(entry.createdAtIso || new Date().toISOString()),
    },
  ]
    .filter((x) => x && x.range)
    .slice(-40);
  obj.editingSheetsCharts = next;
  return JSON.stringify(obj);
}

function addSheetsTableToPptxMetadata(
  pptxMetadata: unknown,
  entry: {
    range: string;
    sheetName?: string;
    hasHeader?: boolean;
    style?: string;
    colors?: { header?: string; stripe?: string; totals?: string; border?: string };
    createdAtIso?: string;
  },
): string {
  const obj = safeJsonParseObject(pptxMetadata);
  const existing = Array.isArray(obj.editingSheetsTables) ? obj.editingSheetsTables : [];
  const range = String(entry.range || "").trim();
  if (!range) return JSON.stringify(obj);
  const colorHex = (raw: unknown): string | undefined => {
    const s = String(raw || "").trim();
    if (!/^#?[0-9a-fA-F]{6}$/.test(s)) return undefined;
    return s.startsWith("#") ? s.toUpperCase() : `#${s.toUpperCase()}`;
  };
  const style = String(entry.style || "").trim().toLowerCase();
  const cleanStyle = style || undefined;
  const colors = {
    header: colorHex(entry.colors?.header),
    stripe: colorHex(entry.colors?.stripe),
    totals: colorHex(entry.colors?.totals),
    border: colorHex(entry.colors?.border),
  };
  const cleanColors = Object.values(colors).some(Boolean) ? colors : undefined;
  const normalized = {
    range,
    sheetName: String(entry.sheetName || "").trim() || undefined,
    hasHeader: entry.hasHeader !== false,
    ...(cleanStyle ? { style: cleanStyle } : {}),
    ...(cleanColors ? { colors: cleanColors } : {}),
    createdAtIso: String(entry.createdAtIso || new Date().toISOString()),
  };
  const merged = [...(existing as any[]), normalized];
  const byKey = new Map<string, any>();
  for (const item of merged) {
    const key = `${String(item?.sheetName || "").trim().toLowerCase()}|${String(item?.range || "").trim().toUpperCase()}`;
    if (!key) continue;
    byKey.set(key, item);
  }
  obj.editingSheetsTables = Array.from(byKey.values()).slice(-80);
  return JSON.stringify(obj);
}

type EditOperatorLike =
  | "EDIT_PARAGRAPH"
  | "EDIT_SPAN"
  | "EDIT_DOCX_BUNDLE"
  | "ADD_PARAGRAPH"
  | "EDIT_CELL"
  | "EDIT_RANGE"
  | "ADD_SHEET"
  | "RENAME_SHEET"
  | "CREATE_CHART"
  | "COMPUTE"
  | "COMPUTE_BUNDLE"
  | "ADD_SLIDE"
  | "REWRITE_SLIDE_TEXT"
  | "REPLACE_SLIDE_IMAGE";

export class DocumentRevisionStoreService implements EditRevisionStore {
  private readonly idempotencyResults = new Map<string, { revisionId: string; createdAtMs: number }>();
  private readonly revisionService: RevisionService;
  private readonly docxEditor: DocxEditorService;
  private readonly xlsxEditor: XlsxFileEditorService;
  private readonly slidesClient: SlidesClientService;
  private readonly slidesEditor: SlidesEditorService;
  private readonly sheetsEditor: SheetsEditorService;
  private readonly sheetsChart: SheetsChartService;
  private readonly sheetsFormula: SheetsFormulaService;
  private readonly sheetsTable: SheetsTableService;
  private readonly sheetsBridge: SheetsBridgeService;

  constructor(opts?: {
    revisionService?: RevisionService;
    docxEditor?: DocxEditorService;
    xlsxEditor?: XlsxFileEditorService;
    slidesClient?: SlidesClientService;
    slidesEditor?: SlidesEditorService;
    sheetsEditor?: SheetsEditorService;
    sheetsChart?: SheetsChartService;
    sheetsFormula?: SheetsFormulaService;
    sheetsTable?: SheetsTableService;
    sheetsBridge?: SheetsBridgeService;
  }) {
    this.revisionService = opts?.revisionService ?? new RevisionService();
    this.docxEditor = opts?.docxEditor ?? new DocxEditorService();
    this.xlsxEditor = opts?.xlsxEditor ?? new XlsxFileEditorService();
    this.slidesClient = opts?.slidesClient ?? new SlidesClientService();
    this.slidesEditor = opts?.slidesEditor ?? new SlidesEditorService();
    this.sheetsEditor = opts?.sheetsEditor ?? new SheetsEditorService();
    this.sheetsChart = opts?.sheetsChart ?? new SheetsChartService();
    this.sheetsFormula = opts?.sheetsFormula ?? new SheetsFormulaService();
    this.sheetsTable = opts?.sheetsTable ?? new SheetsTableService();
    this.sheetsBridge = opts?.sheetsBridge ?? new SheetsBridgeService();
  }

  private async reprocessEditedDocument(input: {
    documentId: string;
    userId: string;
    filename: string;
    mimeType: string;
    encryptedFilename: string;
  }): Promise<void> {
    const payload: ProcessDocumentJobData = {
      documentId: input.documentId,
      userId: input.userId,
      filename: input.filename || "document",
      mimeType: input.mimeType,
      encryptedFilename: input.encryptedFilename,
    };

    try {
      if (env.USE_GCP_WORKERS && isPubSubAvailable()) {
        await publishExtractJob(
          input.documentId,
          input.userId,
          input.encryptedFilename,
          input.mimeType,
          input.filename,
        );
      } else {
        await addDocumentJob(payload);
      }
      return;
    } catch (enqueueError: any) {
      logger.warn("[Editing] Reprocess enqueue failed, running direct processing fallback", {
        documentId: payload.documentId,
        userId: payload.userId,
        error: enqueueError?.message || String(enqueueError || "unknown"),
      });
    }

    try {
      await processDocumentJobData(payload);
    } catch (fallbackError: any) {
      const msg = String(fallbackError?.message || "Auto-processing failed after apply");
      logger.error("[Editing] Direct processing fallback failed", {
        documentId: payload.documentId,
        userId: payload.userId,
        error: msg,
      });
      try {
        await prisma.document.update({
          where: { id: payload.documentId },
          data: { status: "failed", error: msg.slice(0, 500) },
        });
      } catch {
        // ignore
      }
    }
  }

  async createRevision(input: {
    documentId: string;
    userId: string;
    correlationId: string;
    conversationId: string;
    clientMessageId: string;
    content: string;
    idempotencyKey?: string;
    expectedDocumentUpdatedAtIso?: string;
    expectedDocumentFileHash?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ revisionId: string }> {
    const docId = input.documentId.trim();
    const userId = input.userId.trim();
    const meta = input.metadata ?? {};

    let op = asString(meta.operator) as EditOperatorLike | null;
    if (!op) throw new Error("Missing edit operator in revision metadata.");

    const rawTargetId = asString(meta.targetId) ?? null;
    const isSyntheticTarget = Boolean(rawTargetId?.startsWith("synthetic:"));
    // Synthetic targets (e.g. "synthetic:bulk_sheet_edit") are placeholders from editHandler
    // for operators that don't anchor to a specific cell — strip them so operator branches
    // that require real cell references (Sheet1!A1) don't choke on them.
    const targetId = isSyntheticTarget ? null : rawTargetId;
    // When the target is synthetic but the operator resolved to a cell-anchored type
    // (e.g. EDIT_CELL/EDIT_RANGE due to canonicalOperator normalization mismatch),
    // reroute to COMPUTE_BUNDLE which handles bulk ops without a real target.
    if (isSyntheticTarget && (op === "EDIT_CELL" || op === "EDIT_RANGE")) {
      op = "COMPUTE_BUNDLE";
    }
    const beforeText = asString(meta.beforeText) ?? null;
    const contentFormat = asString(meta.contentFormat) === "html" ? "html" : "plain";

    const doc = await prisma.document.findFirst({
      where: { id: docId, userId },
      select: { id: true, encryptedFilename: true, filename: true, mimeType: true, updatedAt: true, fileHash: true },
    });
    if (!doc) throw new Error("Document not found or not accessible.");
    if (!doc.encryptedFilename) throw new Error("Document storage key missing.");

    // Optimistic lock checks (plan -> apply safety).
    if (input.expectedDocumentUpdatedAtIso) {
      const expectedMs = Date.parse(String(input.expectedDocumentUpdatedAtIso));
      const actualMs = Date.parse(String(doc.updatedAt));
      if (Number.isFinite(expectedMs) && Number.isFinite(actualMs) && actualMs > expectedMs) {
        throw new Error("REPLAN_REQUIRED: document changed since plan.");
      }
    }
    if (input.expectedDocumentFileHash) {
      const expectedHash = String(input.expectedDocumentFileHash).trim();
      const actualHash = String(doc.fileHash || "").trim();
      if (expectedHash && actualHash && expectedHash !== actualHash) {
        throw new Error("REPLAN_REQUIRED: document hash changed since plan.");
      }
    }

    // Idempotency (apply/send retries must not duplicate mutations).
    const idempotencyKey = String(input.idempotencyKey || "").trim();
    if (idempotencyKey) {
      this.sweepIdempotency();
      const dedupeKey = `${userId}:${docId}:${idempotencyKey}`;
      const previous = this.idempotencyResults.get(dedupeKey);
      if (previous?.revisionId) return { revisionId: previous.revisionId };
    }

    // Preserve existing preview metadata when we overwrite the same document.
    try {
      if ((meta as any).pptxMetadata == null) {
        const existingMeta = await prisma.documentMetadata.findUnique({
          where: { documentId: docId },
          select: { pptxMetadata: true },
        });
        if (existingMeta?.pptxMetadata != null) {
          (meta as any).pptxMetadata = existingMeta.pptxMetadata;
        }
      }
    } catch {
      // Best-effort; edits should continue even if metadata lookup fails.
    }

    const original = await downloadFile(doc.encryptedFilename);

    let edited: Buffer;

    if (op === "EDIT_PARAGRAPH") {
      assertMime(doc.mimeType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "EDIT_PARAGRAPH");
      if (!targetId) throw new Error("EDIT_PARAGRAPH requires targetId.");
      edited = await this.docxEditor.applyParagraphEdit(original, targetId, input.content, { format: contentFormat });
    } else if (op === "EDIT_SPAN") {
      assertMime(doc.mimeType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "EDIT_SPAN");
      if (!targetId) throw new Error("EDIT_SPAN requires targetId.");
      // EDIT_SPAN still commits a full paragraph payload (plain or html), but the
      // intent/operator is used for auditability and policy.
      if (contentFormat !== "html") {
        const beforeMeta = asString(meta.beforeText) || "";
        if (looksLikeTruncatedSpanPayload(beforeMeta, String(input.content || ""))) {
          throw new Error(
            "EDIT_SPAN received span-only content. Please retry the edit; the full sentence/paragraph must be preserved.",
          );
        }
      }
      edited = await this.docxEditor.applyParagraphEdit(original, targetId, input.content, { format: contentFormat });
    } else if (op === "EDIT_DOCX_BUNDLE") {
      assertMime(doc.mimeType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "EDIT_DOCX_BUNDLE");
      // content is JSON: { patches: [{ kind:"docx_paragraph", paragraphId, afterHtml }] }
      let payload: any = {};
      try {
        payload = JSON.parse(String(input.content || "{}"));
      } catch {
        throw new Error('EDIT_DOCX_BUNDLE requires JSON content like {"patches":[...]}');
      }
      const patches = Array.isArray(payload?.patches) ? payload.patches : [];
      let buf = original;
      for (const p of patches) {
        if (!p || typeof p !== "object") continue;
        const kind = String((p as any).kind || "").trim();
        if (kind === "docx_paragraph") {
          const pid = String((p as any).paragraphId || "").trim();
          const afterHtml = String((p as any).afterHtml || "").trim();
          const removeNumbering = Boolean((p as any).removeNumbering);
          const applyNumbering = Boolean((p as any).applyNumbering);
          if (!pid || !afterHtml) continue;
          // eslint-disable-next-line no-await-in-loop
          buf = await this.docxEditor.applyParagraphEdit(buf, pid, afterHtml, { format: "html", removeNumbering, applyNumbering });
        } else if (kind === "docx_delete_paragraph") {
          const pid = String((p as any).paragraphId || "").trim();
          if (!pid) continue;
          // eslint-disable-next-line no-await-in-loop
          buf = await this.docxEditor.deleteParagraph(buf, pid);
        }
      }
      edited = buf;
    } else if (op === "ADD_PARAGRAPH") {
      assertMime(doc.mimeType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "ADD_PARAGRAPH");
      if (!targetId) throw new Error("ADD_PARAGRAPH requires targetId (insert after).");
      // If inserting after a list item, default to a normal paragraph (not another bullet).
      // Callers can override by setting meta.keepNumbering=true.
      const keepNumbering = Boolean((meta as any)?.keepNumbering);
      edited = await this.docxEditor.insertParagraphAfter(original, targetId, input.content, { format: contentFormat, removeNumbering: !keepNumbering });
    } else if (op === "EDIT_CELL") {
      assertMime(doc.mimeType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "EDIT_CELL");
      if (!targetId) throw new Error("EDIT_CELL requires targetId.");
      edited = await this.applyXlsxEdit(original, {
        op,
        documentId: docId,
        userId,
        filename: doc.filename || "sheet.xlsx",
        targetId,
        content: input.content,
        meta,
        ctx: {
          correlationId: input.correlationId,
          userId: input.userId,
          conversationId: input.conversationId,
          clientMessageId: input.clientMessageId,
        },
      });
    } else if (op === "EDIT_RANGE") {
      assertMime(doc.mimeType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "EDIT_RANGE");
      if (!targetId) throw new Error("EDIT_RANGE requires targetId.");
      edited = await this.applyXlsxEdit(original, {
        op,
        documentId: docId,
        userId,
        filename: doc.filename || "sheet.xlsx",
        targetId,
        content: input.content,
        meta,
        ctx: {
          correlationId: input.correlationId,
          userId: input.userId,
          conversationId: input.conversationId,
          clientMessageId: input.clientMessageId,
        },
      });
    } else if (op === "ADD_SHEET") {
      assertMime(doc.mimeType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "ADD_SHEET");
      edited = await this.applyXlsxEdit(original, {
        op,
        documentId: docId,
        userId,
        filename: doc.filename || "sheet.xlsx",
        targetId: null,
        content: input.content,
        meta,
        ctx: {
          correlationId: input.correlationId,
          userId: input.userId,
          conversationId: input.conversationId,
          clientMessageId: input.clientMessageId,
        },
      });
    } else if (op === "RENAME_SHEET") {
      assertMime(doc.mimeType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "RENAME_SHEET");
      const fromName = beforeText ?? asString(meta.fromSheetName) ?? null;
      const toName = input.content;
      if (!fromName) throw new Error("RENAME_SHEET requires beforeText (old sheet name) or fromSheetName in metadata.");
      (meta as any).fromSheetName = fromName;
      edited = await this.applyXlsxEdit(original, {
        op,
        documentId: docId,
        userId,
        filename: doc.filename || "sheet.xlsx",
        targetId: null,
        content: toName,
        meta,
        ctx: {
          correlationId: input.correlationId,
          userId: input.userId,
          conversationId: input.conversationId,
          clientMessageId: input.clientMessageId,
        },
      });
    } else if (op === "CREATE_CHART") {
      assertMime(doc.mimeType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "CREATE_CHART");
      // Expect JSON in content: { "type": "PIE", "range": "Sheet1!A1:B10", "title": "...", "placement": {...} }
      edited = await this.applyXlsxEdit(original, {
        op,
        documentId: docId,
        userId,
        filename: doc.filename || "sheet.xlsx",
        targetId: null,
        content: input.content,
        meta,
        ctx: {
          correlationId: input.correlationId,
          userId: input.userId,
          conversationId: input.conversationId,
          clientMessageId: input.clientMessageId,
        },
      });
    } else if (op === "COMPUTE") {
      assertMime(doc.mimeType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "COMPUTE");
      edited = await this.applyXlsxEdit(original, {
        op,
        documentId: docId,
        userId,
        filename: doc.filename || "sheet.xlsx",
        targetId: null,
        content: input.content,
        meta,
        ctx: {
          correlationId: input.correlationId,
          userId: input.userId,
          conversationId: input.conversationId,
          clientMessageId: input.clientMessageId,
        },
      });
    } else if (op === "COMPUTE_BUNDLE") {
      assertMime(doc.mimeType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "COMPUTE_BUNDLE");
      edited = await this.applyXlsxEdit(original, {
        op: "COMPUTE",
        documentId: docId,
        userId,
        filename: doc.filename || "sheet.xlsx",
        targetId: null,
        content: input.content,
        meta,
        ctx: {
          correlationId: input.correlationId,
          userId: input.userId,
          conversationId: input.conversationId,
          clientMessageId: input.clientMessageId,
        },
      });
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

      // Invalidate any cached document buffer so subsequent reads fetch the fresh file.
      try { await cacheService.del(`document_buffer:${docId}`); } catch {}

      // Clear derived artifacts so re-indexing doesn't mix old and new chunks.
      const isSlidesEdit = op === "REWRITE_SLIDE_TEXT" || op === "ADD_SLIDE" || op === "REPLACE_SLIDE_IMAGE";
      const isSheetsEdit = op === "EDIT_CELL" || op === "EDIT_RANGE" || op === "ADD_SHEET" || op === "RENAME_SHEET" || op === "CREATE_CHART" || op === "COMPUTE" || op === "COMPUTE_BUNDLE";

      await prisma.$transaction(async (tx) => {
        await tx.documentChunk.deleteMany({ where: { documentId: docId } });
        await tx.documentEmbedding.deleteMany({ where: { documentId: docId } });

        if (isSlidesEdit || isSheetsEdit) {
          const base = (meta as any).pptxMetadata ?? null;
          let nextPptxMetadata: string | null = typeof base === "string" ? base : (base == null ? null : String(base));

          if ((meta as any).slidesPresentationId) {
            nextPptxMetadata = setSlidesLinkInPptxMetadata(
              nextPptxMetadata,
              {
                presentationId: String((meta as any).slidesPresentationId),
                url:
                  String((meta as any).slidesPresentationUrl || "").trim() ||
                  `https://docs.google.com/presentation/d/${String((meta as any).slidesPresentationId)}/edit`,
              },
            );
          }

          if ((meta as any).sheetsSpreadsheetId) {
            nextPptxMetadata = setSheetsLinkInPptxMetadata(
              nextPptxMetadata,
              {
                spreadsheetId: String((meta as any).sheetsSpreadsheetId),
                url:
                  String((meta as any).sheetsSpreadsheetUrl || "").trim() ||
                  `https://docs.google.com/spreadsheets/d/${String((meta as any).sheetsSpreadsheetId)}/edit`,
              },
            );
          }

          const chartEntries = Array.isArray((meta as any).__sheetsChartEntries)
            ? (meta as any).__sheetsChartEntries
            : [];
          for (const entry of chartEntries) {
            const range = String(entry?.range || "").trim();
            if (!range) continue;
            nextPptxMetadata = addSheetsChartToPptxMetadata(nextPptxMetadata, {
              chartId: typeof entry?.chartId === "number" ? entry.chartId : undefined,
              type: String(entry?.type || "LINE"),
              range,
              ...(entry?.title ? { title: String(entry.title) } : {}),
              ...(entry?.settings && typeof entry.settings === "object" ? { settings: entry.settings } : {}),
              ...(entry?.createdAtIso ? { createdAtIso: String(entry.createdAtIso) } : {}),
            });
          }

          const tableEntries = Array.isArray((meta as any).__sheetsTableEntries)
            ? (meta as any).__sheetsTableEntries
            : [];
          for (const entry of tableEntries) {
            const range = String(entry?.range || "").trim();
            if (!range) continue;
            nextPptxMetadata = addSheetsTableToPptxMetadata(nextPptxMetadata, {
              range,
              ...(entry?.sheetName ? { sheetName: String(entry.sheetName) } : {}),
              hasHeader: entry?.hasHeader !== false,
              ...(entry?.style ? { style: String(entry.style) } : {}),
              ...(entry?.colors && typeof entry.colors === "object" ? { colors: entry.colors } : {}),
              ...(entry?.createdAtIso ? { createdAtIso: String(entry.createdAtIso) } : {}),
            });
          }

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
              slideGenerationStatus: isSlidesEdit ? "pending" : undefined,
              slideGenerationError: isSlidesEdit ? null : undefined,
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

      // Reprocess automatically after apply so extraction/index/preview stay in sync with edited content.
      await this.reprocessEditedDocument({
        documentId: docId,
        userId,
        filename: doc.filename || "document",
        mimeType: doc.mimeType || "application/octet-stream",
        encryptedFilename: doc.encryptedFilename,
      });

      if (idempotencyKey) {
        const dedupeKey = `${userId}:${docId}:${idempotencyKey}`;
        this.idempotencyResults.set(dedupeKey, { revisionId: docId, createdAtMs: Date.now() });
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

    if (idempotencyKey) {
      const dedupeKey = `${userId}:${docId}:${idempotencyKey}`;
      this.idempotencyResults.set(dedupeKey, { revisionId: created.id, createdAtMs: Date.now() });
    }
    return { revisionId: created.id };
  }

  private sweepIdempotency(): void {
    const now = Date.now();
    const ttlMs = 1000 * 60 * 30; // 30 minutes
    for (const [key, value] of this.idempotencyResults.entries()) {
      if (!value?.createdAtMs || now - value.createdAtMs > ttlMs) {
        this.idempotencyResults.delete(key);
      }
    }
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

      await this.reprocessEditedDocument({
        documentId: docId,
        userId,
        filename: target.filename || "document",
        mimeType: target.mimeType || "application/octet-stream",
        encryptedFilename: target.encryptedFilename,
      });

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

  private async ensureSheetsSpreadsheetForDocument(input: {
    documentId: string;
    userId: string;
    xlsxBytes: Buffer;
    filename: string;
    correlationId: string;
    conversationId: string;
    clientMessageId: string;
  }): Promise<{ spreadsheetId: string; url: string }> {
    const documentId = input.documentId.trim();
    const userId = input.userId.trim();

    const existing = await prisma.documentMetadata.findUnique({
      where: { documentId },
      select: { pptxMetadata: true },
    });

    const cached = getSheetsLinkFromPptxMetadata((existing as any)?.pptxMetadata);
    if (cached?.spreadsheetId) {
      return { spreadsheetId: cached.spreadsheetId, url: cached.url };
    }

    const folderId = asString(process.env.GOOGLE_SHEETS_FOLDER_ID);
    const imported = await this.sheetsBridge.importXlsxToSpreadsheet(
      {
        xlsxBuffer: input.xlsxBytes,
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
      update: { pptxMetadata: setSheetsLinkInPptxMetadata((existing as any)?.pptxMetadata, imported) } as any,
      create: { documentId, pptxMetadata: setSheetsLinkInPptxMetadata(null, imported) } as any,
    });

    return imported;
  }

  private async applyXlsxEdit(
    originalXlsx: Buffer,
    input: {
      op: EditOperatorLike;
      documentId: string;
      userId: string;
      filename: string;
      targetId: string | null;
      content: string;
      meta: Record<string, unknown>;
      ctx: { correlationId: string; userId: string; conversationId: string; clientMessageId: string };
    },
  ): Promise<Buffer> {
    const parseTsvOrCsvGrid = (text: string): Array<Array<string>> => {
      const raw = String(text || "").trim();
      if (!raw) throw new Error("range values are empty");
      const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const delimiter = lines.some((l) => l.includes("\t")) ? "\t" : ",";
      return lines.map((l) => l.split(delimiter).map((c) => c.trim()));
    };

    const rememberChart = (entry: { chartId?: number; type: string; range: string; title?: string; settings?: Record<string, unknown> }) => {
      const range = String(entry.range || "").trim();
      if (!range) return;
      const list = Array.isArray((input.meta as any).__sheetsChartEntries)
        ? (input.meta as any).__sheetsChartEntries
        : [];
      list.push({
        ...(typeof entry.chartId === "number" ? { chartId: entry.chartId } : {}),
        type: String(entry.type || "LINE"),
        range,
        ...(entry.title ? { title: String(entry.title) } : {}),
        ...(entry.settings && typeof entry.settings === "object" ? { settings: entry.settings } : {}),
        createdAtIso: new Date().toISOString(),
      });
      (input.meta as any).__sheetsChartEntries = list;
    };

    const rememberTable = (
      entry: {
        range: string;
        hasHeader?: boolean;
        style?: string;
        colors?: { header?: string; stripe?: string; totals?: string; border?: string };
      },
    ) => {
      const range = String(entry.range || "").trim();
      if (!range) return;
      const bang = range.indexOf("!");
      const sheetName = bang > 0 ? String(range.slice(0, bang)).replace(/^'/, "").replace(/'$/, "").trim() : "";
      const style = String(entry.style || "").trim().toLowerCase();
      const colorHex = (raw: unknown): string | undefined => {
        const s = String(raw || "").trim();
        if (!/^#?[0-9a-fA-F]{6}$/.test(s)) return undefined;
        return s.startsWith("#") ? s.toUpperCase() : `#${s.toUpperCase()}`;
      };
      const colors = {
        header: colorHex(entry.colors?.header),
        stripe: colorHex(entry.colors?.stripe),
        totals: colorHex(entry.colors?.totals),
        border: colorHex(entry.colors?.border),
      };
      const cleanColors = Object.values(colors).some(Boolean) ? colors : undefined;
      const list = Array.isArray((input.meta as any).__sheetsTableEntries)
        ? (input.meta as any).__sheetsTableEntries
        : [];
      list.push({
        range,
        ...(sheetName ? { sheetName } : {}),
        hasHeader: entry.hasHeader !== false,
        ...(style ? { style } : {}),
        ...(cleanColors ? { colors: cleanColors } : {}),
        createdAtIso: new Date().toISOString(),
      });
      (input.meta as any).__sheetsTableEntries = list;
    };

    const extractChartSettings = (spec: any): Record<string, unknown> | undefined => {
      if (!spec || typeof spec !== "object") return undefined;
      const out: Record<string, unknown> = {};
      const type = String(spec.type || "").trim().toUpperCase();
      if (type) out.type = type;
      if (Number.isInteger(spec.headerCount)) out.headerCount = Number(spec.headerCount);
      if (typeof spec.stacked === "boolean") out.stacked = spec.stacked;
      if (spec.comboSeries && typeof spec.comboSeries === "object") out.comboSeries = spec.comboSeries;
      if (spec.bubble && typeof spec.bubble === "object") out.bubble = spec.bubble;
      if (spec.histogram && typeof spec.histogram === "object") out.histogram = spec.histogram;
      return Object.keys(out).length ? out : undefined;
    };

    // Best effort: prefer Sheets-backed edits (true calc engine + charts).
    // Fall back to direct XLSX edits when Google APIs are not configured.
    try {
      const ensured = await this.ensureSheetsSpreadsheetForDocument({
        documentId: input.documentId,
        userId: input.userId,
        xlsxBytes: originalXlsx,
        filename: input.filename,
        correlationId: input.ctx.correlationId,
        conversationId: input.ctx.conversationId,
        clientMessageId: input.ctx.clientMessageId,
      });

      (input.meta as any).sheetsSpreadsheetId = ensured.spreadsheetId;
      (input.meta as any).sheetsSpreadsheetUrl = ensured.url;

      if (input.op === "EDIT_CELL") {
        const [sheetName, a1] = String(input.targetId || "").split("!");
        if (!sheetName || !a1) throw new Error("EDIT_CELL requires targetId like Sheet1!B2");
        await this.sheetsEditor.editCell(ensured.spreadsheetId, sheetName, a1, input.content, input.ctx);
      } else if (input.op === "EDIT_RANGE") {
        const range = String(input.targetId || "").trim();
        const grid = parseTsvOrCsvGrid(input.content);
        await this.sheetsEditor.editRange(ensured.spreadsheetId, range, grid, input.ctx);
      } else if (input.op === "ADD_SHEET") {
        await this.sheetsEditor.createSheet(ensured.spreadsheetId, input.content, input.ctx);
      } else if (input.op === "RENAME_SHEET") {
        const fromName = asString((input.meta as any).fromSheetName) || null;
        if (!fromName) throw new Error("RENAME_SHEET requires fromSheetName in metadata.");
        const sheetId = await this.sheetsEditor.getSheetIdByName(ensured.spreadsheetId, fromName, input.ctx);
        await this.sheetsEditor.renameSheet(ensured.spreadsheetId, sheetId, input.content, input.ctx);
      } else if (input.op === "CREATE_CHART") {
        const raw = String(input.content || "").trim();
        let spec: any = null;
        try {
          spec = JSON.parse(raw);
        } catch {
          throw new Error('CREATE_CHART requires JSON content like {"type":"PIE","range":"Sheet1!A1:B10"}');
        }
        const spreadsheet = await this.sheetsEditor.getSpreadsheet(ensured.spreadsheetId, input.ctx);
        const firstSheetId = spreadsheet.sheets?.[0]?.properties?.sheetId;
        const created = await this.sheetsChart.createChart(
          ensured.spreadsheetId,
          typeof firstSheetId === "number" ? firstSheetId : 0,
          spec,
          input.ctx,
        );
        rememberChart({
          chartId: created.chartId,
          type: String(spec?.type || ""),
          range: String(spec?.range || ""),
          ...(spec?.title ? { title: String(spec.title) } : {}),
          ...(extractChartSettings(spec) ? { settings: extractChartSettings(spec) } : {}),
        });
      } else if (input.op === "COMPUTE") {
        // content is a JSON payload with ops
        let payload: any = {};
        try {
          payload = JSON.parse(String(input.content || "{}"));
        } catch {
          throw new Error('COMPUTE requires JSON content like {"ops":[...]}');
        }
        const ops = Array.isArray(payload?.ops) ? payload.ops : [];
        for (const op of ops) {
          if (!op || typeof op !== "object") continue;
          const kind = String((op as any).kind || "").trim();
          if (kind === "set_values") {
            const rangeA1 = String((op as any).rangeA1 || "").trim();
            const values = (op as any).values;
            if (!rangeA1 || !Array.isArray(values)) throw new Error("set_values requires rangeA1 and values[][]");
            await this.sheetsEditor.editRange(ensured.spreadsheetId, rangeA1, values, input.ctx);
          } else if (kind === "set_formula") {
            const a1 = String((op as any).a1 || "").trim();
            const formula = String((op as any).formula || "").trim();
            if (!a1 || !formula) throw new Error("set_formula requires a1 and formula");
            await this.sheetsFormula.setFormula(ensured.spreadsheetId, a1, formula, input.ctx);
          } else if (kind === "insert_rows") {
            const sheet = (op as any).sheetName ?? (op as any).sheetId ?? "Sheet1";
            const startIndex = Number((op as any).startIndex);
            const count = Number((op as any).count ?? 1);
            await this.sheetsEditor.insertRows(ensured.spreadsheetId, sheet, startIndex, count, input.ctx);
          } else if (kind === "delete_rows") {
            const sheet = (op as any).sheetName ?? (op as any).sheetId ?? "Sheet1";
            const startIndex = Number((op as any).startIndex);
            const count = Number((op as any).count ?? 1);
            await this.sheetsEditor.deleteRows(ensured.spreadsheetId, sheet, startIndex, count, input.ctx);
          } else if (kind === "insert_columns") {
            const sheet = (op as any).sheetName ?? (op as any).sheetId ?? "Sheet1";
            const startIndex = Number((op as any).startIndex);
            const count = Number((op as any).count ?? 1);
            await this.sheetsEditor.insertColumns(ensured.spreadsheetId, sheet, startIndex, count, input.ctx);
          } else if (kind === "delete_columns") {
            const sheet = (op as any).sheetName ?? (op as any).sheetId ?? "Sheet1";
            const startIndex = Number((op as any).startIndex);
            const count = Number((op as any).count ?? 1);
            await this.sheetsEditor.deleteColumns(ensured.spreadsheetId, sheet, startIndex, count, input.ctx);
          } else if (kind === "create_chart") {
            const spec = (op as any).spec;
            if (!spec) throw new Error("create_chart requires spec");
            const spreadsheet = await this.sheetsEditor.getSpreadsheet(ensured.spreadsheetId, input.ctx);
            const sheetId = spreadsheet.sheets?.find((s: any) => s.properties?.title === String(spec.range || "").split("!")[0])?.properties?.sheetId
              ?? spreadsheet.sheets?.[0]?.properties?.sheetId
              ?? 0;
            const created = await this.sheetsChart.createChart(ensured.spreadsheetId, typeof sheetId === "number" ? sheetId : 0, spec, input.ctx);
            rememberChart({
              chartId: created.chartId,
              type: String(spec?.type || ""),
              range: String(spec?.range || ""),
              ...(spec?.title ? { title: String(spec.title) } : {}),
              ...(extractChartSettings(spec) ? { settings: extractChartSettings(spec) } : {}),
            });
          } else if (kind === "create_table") {
            const rangeA1 = String((op as any).rangeA1 || (op as any).range || "").trim();
            const hasHeader = (op as any).hasHeader !== false;
            const styleRaw = String((op as any).style || "").trim().toLowerCase();
            const style =
              styleRaw === "blue" || styleRaw === "green" || styleRaw === "orange" || styleRaw === "teal" || styleRaw === "gray" || styleRaw === "light_gray"
                ? styleRaw
                : "light_gray";
            const rawColors = ((op as any).colors && typeof (op as any).colors === "object")
              ? (op as any).colors
              : {};
            const colors = {
              ...(String(rawColors?.header || "").trim() ? { header: String(rawColors.header).trim() } : {}),
              ...(String(rawColors?.stripe || "").trim() ? { stripe: String(rawColors.stripe).trim() } : {}),
              ...(String(rawColors?.totals || "").trim() ? { totals: String(rawColors.totals).trim() } : {}),
              ...(String(rawColors?.border || "").trim() ? { border: String(rawColors.border).trim() } : {}),
            };
            if (!rangeA1) throw new Error("create_table requires rangeA1");
            const spreadsheet = await this.sheetsEditor.getSpreadsheet(ensured.spreadsheetId, input.ctx);
            const sheetName = String(rangeA1).includes("!") ? String(rangeA1).split("!")[0] : "";
            const sheetId = spreadsheet.sheets?.find((s: any) => s.properties?.title === sheetName)?.properties?.sheetId
              ?? spreadsheet.sheets?.[0]?.properties?.sheetId
              ?? 0;
            await this.sheetsTable.createTable(
              ensured.spreadsheetId,
              typeof sheetId === "number" ? sheetId : 0,
              {
                rangeA1,
                hasHeader,
                style: style as any,
                ...(Object.keys(colors).length ? { colors } : {}),
              },
              input.ctx,
            );
            rememberTable({
              range: rangeA1,
              hasHeader,
              style,
              ...(Object.keys(colors).length ? { colors } : {}),
            });
          } else if (kind === "sort_range") {
            const rangeA1 = String((op as any).rangeA1 || (op as any).range || "").trim();
            if (!rangeA1) throw new Error("sort_range requires rangeA1");
            const bang = rangeA1.indexOf("!");
            const a1Part = bang > 0 ? rangeA1.slice(bang + 1) : rangeA1;
            const startCell = String(a1Part.split(":")[0] || "").replace(/\$/g, "").trim();
            const endCell = String(a1Part.split(":")[1] || startCell).replace(/\$/g, "").trim();
            const parseCol = (cell: string) => {
              const m = String(cell || "").toUpperCase().match(/^([A-Z]+)/);
              if (!m) return 0;
              let out = 0;
              for (const ch of m[1]) out = out * 26 + (ch.charCodeAt(0) - 64);
              return out - 1;
            };
            const startCol = parseCol(startCell);
            const endCol = parseCol(endCell);
            const width = Math.max(1, endCol - startCol + 1);
            const toDimension = (raw: any): number | null => {
              if (raw == null) return null;
              if (typeof raw === "string" && /^[A-Za-z]+$/.test(raw.trim())) return parseCol(raw.trim());
              const n = Number(raw);
              if (!Number.isFinite(n)) return null;
              const ni = Math.trunc(n);
              if (ni >= 1 && ni <= width) return startCol + (ni - 1);
              if (ni >= 0 && ni < width) return startCol + ni;
              return ni;
            };
            const rawSpecs = Array.isArray((op as any).sortSpecs) ? (op as any).sortSpecs : [op];
            const sortSpecs = rawSpecs
              .map((s: any) => {
                const dim = toDimension(s?.dimensionIndex ?? s?.columnIndex ?? s?.column ?? (op as any).column);
                if (dim == null) return null;
                const orderRaw = String(s?.sortOrder || s?.order || (op as any).order || "ASC").toUpperCase();
                return {
                  dimensionIndex: dim,
                  sortOrder: orderRaw.startsWith("DESC") ? "DESCENDING" : "ASCENDING",
                };
              })
              .filter(Boolean) as Array<{ dimensionIndex: number; sortOrder: "ASCENDING" | "DESCENDING" }>;
            await this.sheetsEditor.sortRange(ensured.spreadsheetId, rangeA1, sortSpecs, input.ctx);
          } else if (kind === "filter_range") {
            const rangeA1 = String((op as any).rangeA1 || (op as any).range || "").trim();
            if (!rangeA1) throw new Error("filter_range requires rangeA1");
            await this.sheetsEditor.applyBasicFilter(ensured.spreadsheetId, rangeA1, input.ctx);
          } else if (kind === "clear_filter") {
            const sheet = (op as any).sheetName ?? (op as any).sheetId
              ?? (String((op as any).rangeA1 || "").includes("!") ? String((op as any).rangeA1).split("!")[0] : "Sheet1");
            await this.sheetsEditor.clearBasicFilter(ensured.spreadsheetId, sheet, input.ctx);
          } else if (kind === "set_number_format") {
            const rangeA1 = String((op as any).rangeA1 || (op as any).range || "").trim();
            const pattern = String((op as any).pattern || (op as any).format || "").trim();
            if (!rangeA1 || !pattern) throw new Error("set_number_format requires rangeA1 and pattern");
            await this.sheetsEditor.setNumberFormat(ensured.spreadsheetId, rangeA1, pattern, input.ctx);
          } else if (kind === "set_freeze_panes") {
            const sheet = (op as any).sheetName ?? (op as any).sheetId
              ?? (String((op as any).rangeA1 || "").includes("!") ? String((op as any).rangeA1).split("!")[0] : "Sheet1");
            const frozenRowCount = Number((op as any).frozenRowCount ?? (op as any).rows ?? 0);
            const frozenColumnCount = Number((op as any).frozenColumnCount ?? (op as any).columns ?? 0);
            await this.sheetsEditor.setFreezePanes(
              ensured.spreadsheetId,
              sheet,
              Number.isFinite(frozenRowCount) ? Math.max(0, Math.trunc(frozenRowCount)) : 0,
              Number.isFinite(frozenColumnCount) ? Math.max(0, Math.trunc(frozenColumnCount)) : 0,
              input.ctx,
            );
          } else if (kind === "set_data_validation") {
            const rangeA1 = String((op as any).rangeA1 || (op as any).range || "").trim();
            if (!rangeA1) throw new Error("set_data_validation requires rangeA1");
            const rule = ((op as any).rule && typeof (op as any).rule === "object") ? (op as any).rule : (op as any);
            const type = String(rule.type || "ONE_OF_LIST").toUpperCase();
            const values = Array.isArray(rule.values) ? rule.values.map((v: any) => String(v)) : [];
            const min = Number(rule.min);
            const max = Number(rule.max);
            await this.sheetsEditor.setDataValidation(
              ensured.spreadsheetId,
              rangeA1,
              {
                type: type as any,
                values,
                ...(Number.isFinite(min) ? { min } : {}),
                ...(Number.isFinite(max) ? { max } : {}),
                ...(typeof rule.strict === "boolean" ? { strict: rule.strict } : {}),
                ...(typeof rule.showCustomUi === "boolean" ? { showCustomUi: rule.showCustomUi } : {}),
                ...(String(rule.inputMessage || "").trim() ? { inputMessage: String(rule.inputMessage) } : {}),
              },
              input.ctx,
            );
          } else if (kind === "clear_data_validation") {
            const rangeA1 = String((op as any).rangeA1 || (op as any).range || "").trim();
            if (!rangeA1) throw new Error("clear_data_validation requires rangeA1");
            await this.sheetsEditor.clearDataValidation(ensured.spreadsheetId, rangeA1, input.ctx);
          } else if (kind === "apply_conditional_format") {
            const rangeA1 = String((op as any).rangeA1 || (op as any).range || "").trim();
            if (!rangeA1) throw new Error("apply_conditional_format requires rangeA1");
            const rule = ((op as any).rule && typeof (op as any).rule === "object") ? (op as any).rule : (op as any);
            const type = String(rule.type || "NUMBER_GREATER").toUpperCase();
            const value = rule.value ?? rule.threshold ?? "0";
            await this.sheetsEditor.applyConditionalFormat(
              ensured.spreadsheetId,
              rangeA1,
              {
                type: type as any,
                value,
                ...(String(rule.backgroundHex || "").trim() ? { backgroundHex: String(rule.backgroundHex).trim() } : {}),
                ...(String(rule.textHex || "").trim() ? { textHex: String(rule.textHex).trim() } : {}),
              },
              input.ctx,
            );
          } else if (kind === "set_print_layout") {
            const sheet = (op as any).sheetName ?? (op as any).sheetId
              ?? (String((op as any).rangeA1 || "").includes("!") ? String((op as any).rangeA1).split("!")[0] : "Sheet1");
            await this.sheetsEditor.setPrintLayout(
              ensured.spreadsheetId,
              sheet,
              {
                ...(typeof (op as any).hideGridlines === "boolean" ? { hideGridlines: Boolean((op as any).hideGridlines) } : {}),
              },
              input.ctx,
            );
          } else if (kind === "update_chart") {
            const chartId = Number((op as any).chartId);
            const spec = (op as any).spec;
            if (!Number.isInteger(chartId) || chartId <= 0 || !spec) {
              throw new Error("update_chart requires chartId and spec");
            }
            await this.sheetsChart.updateChart(ensured.spreadsheetId, chartId, spec, input.ctx);
            rememberChart({
              chartId,
              type: String(spec?.type || ""),
              range: String(spec?.range || ""),
              ...(spec?.title ? { title: String(spec.title) } : {}),
              ...(extractChartSettings(spec) ? { settings: extractChartSettings(spec) } : {}),
            });
          } else {
            throw new Error(`Unsupported compute op: ${kind}`);
          }
        }
      } else {
        throw new Error(`Unsupported XLSX operator for Sheets-backed edit: ${input.op}`);
      }

      return await this.sheetsBridge.exportSpreadsheetToXlsx(ensured.spreadsheetId, input.ctx);
    } catch (e: any) {
      // If auth is missing or any Sheets API error, fall back to direct XLSX edits for basic ops.
      const isSheetsError = (e instanceof SheetsBridgeError || e instanceof SheetsClientError);
      const isAuthError = isSheetsError && (e as any).code === "AUTH_ERROR";
      const sheetsErrorCode = String((e as any)?.code || "").trim().toUpperCase();
      const passthroughChartCodes = new Set([
        "INVALID_CHART_SPEC",
        "INVALID_CHART_TYPE",
        "INVALID_CHART_RANGE",
        "INVALID_A1_CELL",
        "CHART_RANGE_OUT_OF_BOUNDS",
        "CHART_INCOMPATIBLE_SHAPE_EMPTY",
        "CHART_INCOMPATIBLE_SHAPE_SERIES",
        "CHART_INCOMPATIBLE_SHAPE_SCATTER",
        "CHART_INCOMPATIBLE_SHAPE_STACKED",
        "CHART_INCOMPATIBLE_SHAPE_COMBO",
        "CHART_INCOMPATIBLE_SHAPE_BUBBLE",
        "CHART_INCOMPATIBLE_SHAPE_HISTOGRAM",
        "CHART_INCOMPATIBLE_SHAPE_PIE",
        "CHART_INCOMPATIBLE_SHAPE_RADAR",
        "CHART_TYPE_NOT_SUPPORTED",
      ]);
      const isChartValidationError = passthroughChartCodes.has(sheetsErrorCode);

      // Never return false-success for chart creation. Preserve user-facing shape errors.
      if (isSheetsError && input.op === "CREATE_CHART") {
        if (isChartValidationError) {
          throw new Error(String(e?.message || "The selected range is not compatible with this chart type."));
        }
        throw new Error("CHART_ENGINE_UNAVAILABLE: chart creation requires a Sheets-capable engine for this workbook.");
      }

      if (isAuthError) {
        if (input.op === "EDIT_CELL" && input.targetId) return this.xlsxEditor.editCell(originalXlsx, input.targetId, input.content);
        if (input.op === "EDIT_RANGE" && input.targetId) return this.xlsxEditor.editRange(originalXlsx, input.targetId, input.content);
        if (input.op === "ADD_SHEET") return this.xlsxEditor.addSheet(originalXlsx, input.content);
        if (input.op === "RENAME_SHEET") {
          const fromName = asString((input.meta as any).fromSheetName) || "";
          if (!fromName) throw e;
          return this.xlsxEditor.renameSheet(originalXlsx, fromName, input.content);
        }
      }
	      // COMPUTE fallback: catch any Sheets-related error (not just AUTH_ERROR)
	      if (isSheetsError && input.op === "COMPUTE") {
	        let parsedOps: any[] | null = null;
	        try {
	          const payload = JSON.parse(String(input.content || "{}"));
	          parsedOps = Array.isArray(payload?.ops) ? payload.ops : [];
	        } catch {
	          parsedOps = null;
	        }

	        const ops = Array.isArray(parsedOps) ? parsedOps : [];
	        const chartOps = ops.filter((op: any) => {
	          const kind = String(op?.kind || "").trim();
	          return kind === "create_chart" || kind === "update_chart";
	        });
	        const nonChartOps = ops.filter((op: any) => {
	          const kind = String(op?.kind || "").trim();
	          return kind !== "create_chart" && kind !== "update_chart";
	        });

	        if (chartOps.length && isChartValidationError) {
	          throw new Error(String(e?.message || "The selected range is not compatible with this chart type."));
	        }

	        let out = originalXlsx;
	        if (parsedOps == null) {
	          out = await this.xlsxEditor.computeOps(originalXlsx, input.content);
	        } else if (nonChartOps.length) {
	          out = await this.xlsxEditor.computeOps(originalXlsx, JSON.stringify({ ops: nonChartOps }));
	        }

	        // Persist chart/table specs requested inside COMPUTE ops for preview rendering.
	        for (const op of ops) {
	          if (!op || typeof op !== "object") continue;
	          const kind = String((op as any).kind || "").trim();
	          if (kind === "create_chart" || kind === "update_chart") {
	            const spec = ((op as any).spec && typeof (op as any).spec === "object")
	              ? (op as any).spec
	              : {};
	            const range = String(spec?.range || (op as any).rangeA1 || (op as any).range || "").trim();
	            if (!range) {
	              throw new Error("INVALID_CHART_SPEC: chart operations require a source range.");
	            }
	            rememberChart({
	              ...(Number.isInteger(Number((op as any).chartId)) ? { chartId: Number((op as any).chartId) } : {}),
	              type: String(spec?.type || "BAR"),
	              range,
	              ...(String(spec?.title || "").trim() ? { title: String(spec.title).trim() } : {}),
	              ...(extractChartSettings(spec) ? { settings: extractChartSettings(spec) } : {}),
	            });
	            continue;
	          }
	          if (kind === "create_table") {
	            const rangeA1 = String((op as any).rangeA1 || (op as any).range || "").trim();
	            if (!rangeA1) continue;
	            const hasHeader = (op as any).hasHeader !== false;
	            const rawColors = ((op as any).colors && typeof (op as any).colors === "object")
	              ? (op as any).colors
	              : {};
	            const colors = {
	              ...(String(rawColors?.header || "").trim() ? { header: String(rawColors.header).trim() } : {}),
	              ...(String(rawColors?.stripe || "").trim() ? { stripe: String(rawColors.stripe).trim() } : {}),
	              ...(String(rawColors?.totals || "").trim() ? { totals: String(rawColors.totals).trim() } : {}),
	              ...(String(rawColors?.border || "").trim() ? { border: String(rawColors.border).trim() } : {}),
	            };
	            rememberTable({
	              range: rangeA1,
	              hasHeader,
	              style: String((op as any).style || "").trim().toLowerCase(),
	              ...(Object.keys(colors).length ? { colors } : {}),
	            });
	          }
	        }
	        return out;
	      }
	      throw e;
	    }
	  }
}

export default DocumentRevisionStoreService;
