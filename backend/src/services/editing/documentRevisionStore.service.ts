import * as crypto from "crypto";
import prisma from "../../config/database";
import { downloadFile, uploadFile } from "../../config/storage";
import {
  addDocumentJob,
  processDocumentJobData,
  type ProcessDocumentJobData,
} from "../../queues/document.queue";
import { env } from "../../config/env";
import {
  isPubSubAvailable,
  publishExtractJob,
} from "../jobs/pubsubPublisher.service";
import RevisionService from "../documents/revision.service";
import { logger } from "../../utils/logger";
import cacheService from "../cache.service";
import type { EditOperator, EditRevisionStore } from "./editing.types";
import { DocxEditorService } from "./docx/docxEditor.service";
import { DocxAnchorsService } from "./docx/docxAnchors.service";
import { buildDocxBundlePatchesFromMarkdown } from "./docx/docxMarkdownBridge.service";
import { SlidesClientService } from "./slides/slidesClient.service";
import { SlidesEditorService } from "./slides/slidesEditor.service";
import SheetsBridgeService from "./sheets/sheetsBridge.service";
import {
  applyPatchOpsToSpreadsheetModel,
  buildSemanticIndex,
  buildSpreadsheetModelFromXlsx,
  compileSpreadsheetModelToXlsx,
  computeOpsToPatchPlan,
  diffSpreadsheetModels,
  summarizePatchStatuses,
} from "./spreadsheetModel";
import { looksLikeTruncatedSpanPayload } from "./docxSpanPayloadGuard";
import SpreadsheetEngineService from "../spreadsheetEngine/spreadsheetEngine.service";
import type { SpreadsheetEngineOp } from "../spreadsheetEngine/spreadsheetEngine.types";
import { getRuntimeOperatorContract } from "./contracts";

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function assertMime(
  actual: string | null | undefined,
  expected: string,
  label: string,
): void {
  if (!actual || actual !== expected) {
    throw new Error(
      `${label} requires ${expected}. Current MIME: ${actual || "unknown"}`,
    );
  }
}

function assertPptxMime(
  actual: string | null | undefined,
  label: string,
): void {
  const mime = String(actual || "").toLowerCase();
  const ok =
    mime ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    mime === "application/vnd.ms-powerpoint" ||
    mime.includes("presentationml");
  if (!ok) {
    throw new Error(
      `${label} requires a PPTX document. Current MIME: ${actual || "unknown"}`,
    );
  }
}

type EditingSaveMode = "overwrite" | "revision";

function editingSaveMode(): EditingSaveMode {
  const raw = String(process.env.KODA_EDITING_SAVE_MODE || "overwrite")
    .trim()
    .toLowerCase();
  return raw === "revision" ? "revision" : "overwrite";
}

function keepUndoHistory(): boolean {
  // Keep history by default (stored as hidden revisions). Set to "false" to disable.
  return (
    String(process.env.KODA_EDITING_KEEP_UNDO_HISTORY || "true")
      .trim()
      .toLowerCase() !== "false"
  );
}

function sha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function verifyBitwise(input: {
  restoredBytes: Buffer;
  referenceBytes: Buffer;
}): { verified: boolean; restoredHash: string; referenceHash: string } {
  const restoredHash = sha256(input.restoredBytes);
  const referenceHash = sha256(input.referenceBytes);
  return {
    verified: restoredHash === referenceHash,
    restoredHash,
    referenceHash,
  };
}

function isParagraphTargetNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || "");
  return /Paragraph target not found:/i.test(message);
}

function looksLikeDocxAnnotatedMarkdown(value: string): boolean {
  return /<!--\s*docx:\d+\s*-->/i.test(String(value || ""));
}

function escapeRegex(text: string): string {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildFindReplaceRegex(input: {
  findText: string;
  useRegex: boolean;
  matchCase: boolean;
  wholeWord: boolean;
}): RegExp {
  const findText = String(input.findText || "");
  if (!findText.trim()) {
    throw new Error("DOCX_FIND_REPLACE requires findText.");
  }
  const sourceBase = input.useRegex ? findText : escapeRegex(findText);
  const source = input.wholeWord ? `\\b${sourceBase}\\b` : sourceBase;
  try {
    return new RegExp(source, input.matchCase ? "g" : "gi");
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_pattern";
    throw new Error(`DOCX_FIND_REPLACE_INVALID_PATTERN: ${message}`);
  }
}

export class OperatorNotImplementedError extends Error {
  readonly code = "OPERATOR_NOT_IMPLEMENTED" as const;
  readonly operator: string;

  constructor(operator: string) {
    super(`Operator is not implemented in revision store: ${operator}`);
    this.name = "OperatorNotImplementedError";
    this.operator = String(operator || "").trim() || "unknown";
  }
}

function safeJsonParseObject(value: unknown): Record<string, any> {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as any)
      : {};
  } catch {
    return {};
  }
}

function getSlidesLinkFromPptxMetadata(
  pptxMetadata: unknown,
): { presentationId: string; url: string } | null {
  const obj = safeJsonParseObject(pptxMetadata);
  const link = obj?.editingSlides;
  const id =
    typeof link?.presentationId === "string" ? link.presentationId.trim() : "";
  const url = typeof link?.url === "string" ? link.url.trim() : "";
  if (!id) return null;
  return {
    presentationId: id,
    url: url || `https://docs.google.com/presentation/d/${id}/edit`,
  };
}

function setSlidesLinkInPptxMetadata(
  pptxMetadata: unknown,
  link: { presentationId: string; url: string },
): string {
  const obj = safeJsonParseObject(pptxMetadata);
  obj.editingSlides = { presentationId: link.presentationId, url: link.url };
  return JSON.stringify(obj);
}

function getSheetsLinkFromPptxMetadata(
  pptxMetadata: unknown,
): { spreadsheetId: string; url: string } | null {
  const obj = safeJsonParseObject(pptxMetadata);
  const link = obj?.editingSheets;
  const id =
    typeof link?.spreadsheetId === "string" ? link.spreadsheetId.trim() : "";
  const url = typeof link?.url === "string" ? link.url.trim() : "";
  if (!id) return null;
  return {
    spreadsheetId: id,
    url: url || `https://docs.google.com/spreadsheets/d/${id}/edit`,
  };
}

function setSheetsLinkInPptxMetadata(
  pptxMetadata: unknown,
  link: { spreadsheetId: string; url: string },
): string {
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
  entry: {
    chartId?: number;
    type: string;
    range: string;
    title?: string;
    settings?: Record<string, unknown>;
    createdAtIso?: string;
  },
): string {
  const obj = safeJsonParseObject(pptxMetadata);
  const existing = Array.isArray(obj.editingSheetsCharts)
    ? obj.editingSheetsCharts
    : [];
  const cleanSettings =
    entry.settings && typeof entry.settings === "object"
      ? Object.fromEntries(
          Object.entries(entry.settings).filter(([k, v]) => {
            if (!k || typeof k !== "string") return false;
            if (v == null) return false;
            if (typeof v === "number") return Number.isFinite(v);
            if (typeof v === "string") return v.trim().length > 0;
            if (typeof v === "boolean") return true;
            if (Array.isArray(v)) return v.length > 0;
            if (typeof v === "object")
              return Object.keys(v as Record<string, unknown>).length > 0;
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
    colors?: {
      header?: string;
      stripe?: string;
      totals?: string;
      border?: string;
    };
    createdAtIso?: string;
  },
): string {
  const obj = safeJsonParseObject(pptxMetadata);
  const existing = Array.isArray(obj.editingSheetsTables)
    ? obj.editingSheetsTables
    : [];
  const range = String(entry.range || "").trim();
  if (!range) return JSON.stringify(obj);
  const colorHex = (raw: unknown): string | undefined => {
    const s = String(raw || "").trim();
    if (!/^#?[0-9a-fA-F]{6}$/.test(s)) return undefined;
    return s.startsWith("#") ? s.toUpperCase() : `#${s.toUpperCase()}`;
  };
  const style = String(entry.style || "")
    .trim()
    .toLowerCase();
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
    const key = `${String(item?.sheetName || "")
      .trim()
      .toLowerCase()}|${String(item?.range || "")
      .trim()
      .toUpperCase()}`;
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
  | "DELETE_SHEET"
  | "CREATE_CHART"
  | "COMPUTE"
  | "COMPUTE_BUNDLE"
  | "ADD_SLIDE"
  | "REWRITE_SLIDE_TEXT"
  | "REPLACE_SLIDE_IMAGE";

export class DocumentRevisionStoreService implements EditRevisionStore {
  private readonly idempotencyResults = new Map<
    string,
    { revisionId: string; createdAtMs: number }
  >();
  private readonly revisionService: RevisionService;
  private readonly docxEditor: DocxEditorService;
  private readonly slidesClient: SlidesClientService;
  private readonly slidesEditor: SlidesEditorService;
  private readonly sheetsBridge: SheetsBridgeService;
  private readonly spreadsheetEngine: SpreadsheetEngineService;

  constructor(opts?: {
    revisionService?: RevisionService;
    docxEditor?: DocxEditorService;
    slidesClient?: SlidesClientService;
    slidesEditor?: SlidesEditorService;
    sheetsBridge?: SheetsBridgeService;
    spreadsheetEngine?: SpreadsheetEngineService;
  }) {
    this.revisionService = opts?.revisionService ?? new RevisionService();
    this.docxEditor = opts?.docxEditor ?? new DocxEditorService();
    this.slidesClient = opts?.slidesClient ?? new SlidesClientService();
    this.slidesEditor = opts?.slidesEditor ?? new SlidesEditorService();
    this.sheetsBridge = opts?.sheetsBridge ?? new SheetsBridgeService();
    this.spreadsheetEngine =
      opts?.spreadsheetEngine ?? new SpreadsheetEngineService();
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
      logger.warn(
        "[Editing] Reprocess enqueue failed, running direct processing fallback",
        {
          documentId: payload.documentId,
          userId: payload.userId,
          error: enqueueError?.message || String(enqueueError || "unknown"),
        },
      );
    }

    try {
      await processDocumentJobData(payload);
    } catch (fallbackError: any) {
      const msg = String(
        fallbackError?.message || "Auto-processing failed after apply",
      );
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
  }): Promise<{
    revisionId: string;
    fileHashBefore?: string;
    fileHashAfter?: string;
    applyMetrics?: {
      changedCellsCount?: number;
      changedStructuresCount?: number;
      affectedRanges?: string[];
      affectedParagraphIds?: string[];
      locateRange?: string | null;
      executionPath?: "python_applied" | "python_bypassed" | "local_only";
      pythonTraceId?: string | null;
      pythonOpProofsCount?: number;
      pythonOpProofCoverage?: number;
      changedSamples?: Array<{
        sheetName: string;
        cell: string;
        before: string;
        after: string;
      }>;
      rejectedOps?: string[];
      patchesApplied?: number;
    };
  }> {
    const docId = input.documentId.trim();
    const userId = input.userId.trim();
    const meta = input.metadata ?? {};

    let op = asString(meta.operator) as EditOperatorLike | null;
    if (!op) throw new Error("Missing edit operator in revision metadata.");
    const operatorContract = getRuntimeOperatorContract(op as EditOperator);
    if (!operatorContract) {
      throw new OperatorNotImplementedError(op);
    }

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
    const rawContentFormat = String(asString(meta.contentFormat) || "")
      .trim()
      .toLowerCase();
    const contentFormat: "plain" | "html" | "markdown" =
      rawContentFormat === "html"
        ? "html"
        : rawContentFormat === "markdown"
          ? "markdown"
          : "plain";
    const paragraphContentFormat = contentFormat === "html" ? "html" : "plain";
    // Defensive routing: if a DOCX edit payload contains bundle patches but the
    // caller sent a non-bundle operator, force bundle apply to avoid writing raw
    // JSON text into a paragraph.
    if (op !== "EDIT_DOCX_BUNDLE") {
      try {
        const parsed = JSON.parse(String(input.content || "{}"));
        if (
          Array.isArray((parsed as any)?.patches) &&
          (parsed as any).patches.length > 0
        ) {
          const docxPatchKinds = new Set([
            "docx_paragraph",
            "docx_delete_paragraph",
            "docx_set_run_style",
            "docx_clear_run_style",
            "docx_set_alignment",
            "docx_set_indentation",
            "docx_set_line_spacing",
            "docx_set_para_spacing",
            "docx_set_para_style",
            "docx_set_text_case",
            "docx_merge_paragraphs",
            "docx_split_to_list",
            "docx_list_promote_demote",
            "docx_delete_section",
            "docx_insert_before",
            "docx_list_apply_bullets",
            "docx_list_apply_numbering",
            "docx_list_remove",
            "docx_list_restart_numbering",
            "docx_split_paragraph",
            "docx_update_toc",
          ]);
          const bundleLike = (parsed as any).patches.every((p: any) => {
            const kind = String(p?.kind || "").trim();
            return docxPatchKinds.has(kind);
          });
          if (bundleLike) op = "EDIT_DOCX_BUNDLE";
        }
      } catch {
        // non-JSON content: keep original operator
      }
    }

    const doc = await prisma.document.findFirst({
      where: { id: docId, userId },
      select: {
        id: true,
        encryptedFilename: true,
        filename: true,
        mimeType: true,
        updatedAt: true,
        fileHash: true,
      },
    });
    if (!doc) throw new Error("Document not found or not accessible.");
    if (!doc.encryptedFilename)
      throw new Error("Document storage key missing.");

    // Optimistic lock checks (plan -> apply safety).
    if (input.expectedDocumentUpdatedAtIso) {
      const expectedMs = Date.parse(String(input.expectedDocumentUpdatedAtIso));
      const actualMs = Date.parse(String(doc.updatedAt));
      if (
        Number.isFinite(expectedMs) &&
        Number.isFinite(actualMs) &&
        actualMs > expectedMs
      ) {
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
    const fileHashBefore =
      String(doc.fileHash || "").trim() || sha256(original);

    let edited: Buffer;

    if (op === "EDIT_PARAGRAPH") {
      assertMime(
        doc.mimeType,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "EDIT_PARAGRAPH",
      );
      if (!targetId) throw new Error("EDIT_PARAGRAPH requires targetId.");
      edited = await this.docxEditor.applyParagraphEdit(
        original,
        targetId,
        input.content,
        { format: paragraphContentFormat },
      );
    } else if (op === "EDIT_SPAN") {
      assertMime(
        doc.mimeType,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "EDIT_SPAN",
      );
      if (!targetId) throw new Error("EDIT_SPAN requires targetId.");
      // EDIT_SPAN still commits a full paragraph payload (plain or html), but the
      // intent/operator is used for auditability and policy.
      if (contentFormat !== "html") {
        const beforeMeta = asString(meta.beforeText) || "";
        if (
          looksLikeTruncatedSpanPayload(beforeMeta, String(input.content || ""))
        ) {
          throw new Error(
            "EDIT_SPAN received span-only content. Please retry the edit; the full sentence/paragraph must be preserved.",
          );
        }
      }
      edited = await this.docxEditor.applyParagraphEdit(
        original,
        targetId,
        input.content,
        { format: paragraphContentFormat },
      );
    } else if (op === "EDIT_DOCX_BUNDLE") {
      assertMime(
        doc.mimeType,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "EDIT_DOCX_BUNDLE",
      );
      const rawContent = String(input.content || "").trim();
      let patches: any[] = [];

      try {
        const payload = JSON.parse(rawContent || "{}");
        patches = Array.isArray(payload?.patches) ? payload.patches : [];
      } catch {
        // Non-JSON payloads can still be valid when bundle content is markdown.
      }

      if (patches.length === 0 && rawContent) {
        const shouldUseMarkdownBridge =
          contentFormat === "markdown" ||
          looksLikeDocxAnnotatedMarkdown(rawContent);
        if (shouldUseMarkdownBridge) {
          const markdownParagraphMap = Array.isArray((meta as any).paragraphMap)
            ? (meta as any).paragraphMap
            : undefined;
          const markdownPlan = await buildDocxBundlePatchesFromMarkdown(
            original,
            rawContent,
            markdownParagraphMap,
          );
          patches = Array.isArray(markdownPlan.bundlePatches)
            ? markdownPlan.bundlePatches
            : [];
        }
      }

      if (patches.length === 0) {
        throw new Error(
          'EDIT_DOCX_BUNDLE requires JSON {"patches":[...]} or annotated markdown content (<!-- docx:N --> markers).',
        );
      }

      let buf = original;
      let patchesApplied = 0;
      const dynamicAffectedParagraphIds = new Set<string>();

      // Phase 1: Apply all content edits (docx_paragraph) first
      for (const p of patches) {
        if (!p || typeof p !== "object") continue;
        const kind = String((p as any).kind || "").trim();
        if (kind !== "docx_paragraph") continue;
        const pid = String((p as any).paragraphId || "").trim();
        const afterHtml = String((p as any).afterHtml || "").trim();
        const removeNumbering = Boolean((p as any).removeNumbering);
        const applyNumbering = Boolean((p as any).applyNumbering);
        const applyNumberingType =
          String((p as any).applyNumberingType || "")
            .trim()
            .toLowerCase() === "numbered"
            ? "numbered"
            : String((p as any).applyNumberingType || "")
                  .trim()
                  .toLowerCase() === "bulleted"
              ? "bulleted"
              : undefined;
        if (!pid || !afterHtml) continue;
        const before = buf;
        try {
          // eslint-disable-next-line no-await-in-loop
          buf = await this.docxEditor.applyParagraphEdit(buf, pid, afterHtml, {
            format: "html",
            removeNumbering,
            applyNumbering,
            applyNumberingType,
          });
          if (!buf.equals(before)) patchesApplied++;
        } catch (error) {
          if (isParagraphTargetNotFoundError(error)) {
            logger.warn(
              "[Editing][DOCX_BUNDLE] Skipping stale paragraph patch target",
              {
                kind,
                paragraphId: pid,
              },
            );
            continue;
          }
          throw error;
        }
      }

      // Phase 1.5: Structural & formatting patches
      for (const p of patches) {
        if (!p || typeof p !== "object") continue;
        const kind = String((p as any).kind || "").trim();
        const pid = String((p as any).paragraphId || "").trim();
        const before = buf;
        try {
          switch (kind) {
            // --- Run-level formatting ---
            case "docx_set_run_style": {
              if (!pid) continue;
              const style: Record<string, unknown> = {};
              if ((p as any).bold != null)
                style.bold = Boolean((p as any).bold);
              if ((p as any).italic != null)
                style.italic = Boolean((p as any).italic);
              if ((p as any).underline != null)
                style.underline = Boolean((p as any).underline);
              if ((p as any).color) style.color = String((p as any).color);
              if ((p as any).fontFamily)
                style.fontFamily = String((p as any).fontFamily);
              if ((p as any).fontSizePt)
                style.fontSizePt = Number((p as any).fontSizePt);
              buf = await this.docxEditor.applyRunStyle(buf, pid, style as any);
              break;
            }
            case "docx_clear_run_style": {
              if (!pid) continue;
              buf = await this.docxEditor.clearRunStyle(buf, pid);
              break;
            }
            // --- Paragraph-level formatting ---
            case "docx_set_alignment": {
              if (!pid) continue;
              const alignment = String((p as any).alignment || "")
                .trim()
                .toLowerCase();
              if (!alignment) continue;
              buf = await this.docxEditor.setAlignment(buf, pid, alignment);
              break;
            }
            case "docx_set_indentation": {
              if (!pid) continue;
              const opts: Record<string, number> = {};
              if ((p as any).leftPt != null)
                opts.leftPt = Number((p as any).leftPt);
              if ((p as any).rightPt != null)
                opts.rightPt = Number((p as any).rightPt);
              if ((p as any).firstLinePt != null)
                opts.firstLinePt = Number((p as any).firstLinePt);
              buf = await this.docxEditor.setIndentation(buf, pid, opts as any);
              break;
            }
            case "docx_set_line_spacing": {
              if (!pid) continue;
              const multiplier = Number(
                (p as any).lineSpacing || (p as any).multiplier,
              );
              if (!Number.isFinite(multiplier) || multiplier <= 0) continue;
              buf = await this.docxEditor.setLineSpacing(buf, pid, multiplier);
              break;
            }
            case "docx_set_para_spacing": {
              if (!pid) continue;
              const opts: Record<string, number> = {};
              if ((p as any).beforePt != null)
                opts.beforePt = Number((p as any).beforePt);
              if ((p as any).afterPt != null)
                opts.afterPt = Number((p as any).afterPt);
              buf = await this.docxEditor.setParagraphSpacing(
                buf,
                pid,
                opts as any,
              );
              break;
            }
            case "docx_set_para_style": {
              if (!pid) continue;
              const styleName = String((p as any).styleName || "").trim();
              if (!styleName) continue;
              buf = await this.docxEditor.setParagraphStyle(
                buf,
                pid,
                styleName,
              );
              break;
            }
            // --- Text case ---
            case "docx_set_text_case": {
              if (!pid) continue;
              const targetCase = String(
                (p as any).targetCase || (p as any).caseType || "",
              )
                .trim()
                .toLowerCase();
              if (!targetCase) continue;
              buf = await this.docxEditor.setTextCase(buf, pid, targetCase);
              break;
            }
            // --- List structural ---
            case "docx_merge_paragraphs": {
              const pids = Array.isArray((p as any).paragraphIds)
                ? (p as any).paragraphIds
                    .map((id: any) => String(id || "").trim())
                    .filter(Boolean)
                : [];
              if (pids.length < 2) continue;
              const separator =
                typeof (p as any).joinSeparator === "string"
                  ? (p as any).joinSeparator
                  : " ";
              buf = await this.docxEditor.mergeParagraphs(buf, pids, separator);
              break;
            }
            case "docx_split_to_list": {
              if (!pid) continue;
              const items = Array.isArray((p as any).items)
                ? (p as any).items
                    .map((i: any) => String(i || ""))
                    .map((line: string) =>
                      line
                        .replace(/^[\s"'`“”‘’\u200B-\u200D\uFEFF]+/, "")
                        .replace(/^(?:&bull;|&#8226;|&#x2022;)\s*/i, "")
                        .replace(
                          /^[\s]*(?:[\u2022\u2023\u25E6\u2043\u2219\u25A1\u2610\u25AA\u25AB\u25CF\u25CB\u25C9\u2765\u2767]|[\-\*\+]|□)\s*/,
                          "",
                        )
                        .replace(/^\(?\d{1,3}\)?[.)\-:]\s*/, "")
                        .replace(/^[a-zA-Z][.)\-:]\s+/, "")
                        .replace(/\s+/g, " ")
                        .trim(),
                    )
                    .filter(Boolean)
                : [];
              if (!items.length) continue;
              const listType =
                String((p as any).listType || "bulleted")
                  .trim()
                  .toLowerCase() === "numbered"
                  ? "numbered"
                  : "bulleted";
              buf = await this.docxEditor.splitParagraphToList(
                buf,
                pid,
                items,
                listType as any,
              );
              break;
            }
            case "docx_list_promote_demote": {
              if (!pid) continue;
              const direction = String((p as any).direction || "")
                .trim()
                .toLowerCase();
              if (direction !== "promote" && direction !== "demote") continue;
              buf = await this.docxEditor.promoteOrDemoteListLevel(
                buf,
                pid,
                direction as any,
              );
              break;
            }
            case "docx_list_apply_bullets": {
              if (!pid) continue;
              buf = await this.docxEditor.applyListFormatting(
                buf,
                pid,
                "bulleted",
              );
              break;
            }
            case "docx_list_apply_numbering": {
              if (!pid) continue;
              buf = await this.docxEditor.applyListFormatting(
                buf,
                pid,
                "numbered",
              );
              break;
            }
            case "docx_list_remove": {
              if (!pid) continue;
              buf = await this.docxEditor.removeListFormatting(buf, pid);
              break;
            }
            case "docx_list_restart_numbering": {
              if (!pid) continue;
              const startAt =
                (p as any).startAt != null ? Number((p as any).startAt) : 1;
              buf = await this.docxEditor.restartListNumbering(
                buf,
                pid,
                startAt,
              );
              break;
            }
            case "docx_split_paragraph": {
              if (!pid) continue;
              const splitItems = Array.isArray((p as any).items)
                ? (p as any).items
                    .map((i: any) => String(i || ""))
                    .map((line: string) =>
                      line
                        .replace(/^[\s"'`“”‘’\u200B-\u200D\uFEFF]+/, "")
                        .replace(/^(?:&bull;|&#8226;|&#x2022;)\s*/i, "")
                        .replace(
                          /^[\s]*(?:[\u2022\u2023\u25E6\u2043\u2219\u25A1\u2610\u25AA\u25AB\u25CF\u25CB\u25C9\u2765\u2767]|[\-\*\+]|□)\s*/,
                          "",
                        )
                        .replace(/^\(?\d{1,3}\)?[.)\-:]\s*/, "")
                        .replace(/^[a-zA-Z][.)\-:]\s+/, "")
                        .replace(/\s+/g, " ")
                        .trim(),
                    )
                    .filter(Boolean)
                : [];
              const splitListType =
                String((p as any).listType || "bulleted")
                  .trim()
                  .toLowerCase() === "numbered"
                  ? "numbered"
                  : "bulleted";
              if (!splitItems.length) continue;
              buf = await this.docxEditor.splitParagraphToList(
                buf,
                pid,
                splitItems,
                splitListType as any,
              );
              break;
            }
            case "docx_update_toc": {
              buf = await this.docxEditor.updateTableOfContents(buf);
              break;
            }
            // --- Page / section break operations ---
            case "docx_page_break": {
              if (!pid) continue;
              const position = String((p as any).position || "before")
                .trim()
                .toLowerCase() as "before" | "after";
              buf = await this.docxEditor.insertPageBreak(
                buf,
                pid,
                position === "after" ? "after" : "before",
              );
              break;
            }
            case "docx_section_break": {
              if (!pid) continue;
              const breakType = String(
                (p as any).breakType || "nextPage",
              ).trim() as "nextPage" | "continuous";
              buf = await this.docxEditor.insertSectionBreak(
                buf,
                pid,
                breakType === "continuous" ? "continuous" : "nextPage",
              );
              break;
            }
            // --- Section operations ---
            case "docx_delete_section": {
              const headingPid = String(
                (p as any).headingParagraphId || pid || "",
              ).trim();
              if (!headingPid) continue;
              buf = await this.docxEditor.deleteSection(buf, headingPid);
              break;
            }
            case "docx_insert_before": {
              if (!pid) continue;
              const content = String(
                (p as any).content ||
                  (p as any).afterText ||
                  (p as any).afterHtml ||
                  "",
              ).trim();
              if (!content) continue;
              const format =
                String((p as any).format || "plain")
                  .trim()
                  .toLowerCase() === "html"
                  ? "html"
                  : "plain";
              buf = await this.docxEditor.insertParagraphBefore(
                buf,
                pid,
                content,
                { format: format as any },
              );
              break;
            }
            case "docx_find_replace": {
              const findReplace = await this.applyDocxFindReplacePatch(
                buf,
                p as Record<string, unknown>,
              );
              if (!findReplace.buffer.equals(buf)) {
                buf = findReplace.buffer;
                patchesApplied += Math.max(
                  findReplace.affectedParagraphIds.length,
                  1,
                );
                for (const paragraphId of findReplace.affectedParagraphIds) {
                  dynamicAffectedParagraphIds.add(paragraphId);
                }
              }
              break;
            }
            default:
              // Unknown patch kind — skip (docx_paragraph and docx_delete_paragraph handled in other phases)
              continue;
          }
        } catch (error) {
          if (isParagraphTargetNotFoundError(error)) {
            logger.warn(
              "[Editing][DOCX_BUNDLE] Skipping stale structural/format patch target",
              {
                kind,
                paragraphId: pid || null,
              },
            );
            continue;
          }
          throw error;
        }

        if (!buf.equals(before)) patchesApplied++;
      }

      // Phase 2: Batch all deletions in a single pass (reverse order preserves indices)
      const deletePids = patches
        .filter(
          (p: any) =>
            p &&
            String((p as any).kind || "").trim() === "docx_delete_paragraph",
        )
        .map((p: any) => String((p as any).paragraphId || "").trim())
        .filter(Boolean);
      if (deletePids.length) {
        const before = buf;
        buf = await this.docxEditor.deleteParagraphs(buf, deletePids);
        if (!buf.equals(before)) patchesApplied += deletePids.length;
      }

      if (patchesApplied === 0) {
        throw new Error(
          "EDIT_NOOP: All patches resulted in no changes to the document.",
        );
      }

      // Propagate apply metrics so the orchestrator can report real counts.
      const affectedParagraphIds = Array.from(
        new Set(
          [
            ...Array.from(dynamicAffectedParagraphIds),
            ...patches
              .map((patch: any) =>
                String((patch as any)?.paragraphId || "").trim(),
              )
              .filter(Boolean),
            ...deletePids,
            ...patches
              .filter(
                (patch: any) =>
                  String((patch as any)?.kind || "").trim() ===
                  "docx_merge_paragraphs",
              )
              .flatMap((patch: any) =>
                Array.isArray((patch as any)?.paragraphIds)
                  ? (patch as any).paragraphIds
                      .map((id: any) => String(id || "").trim())
                      .filter(Boolean)
                  : [],
              ),
          ].filter(Boolean),
        ),
      );
      (meta as any).__applyMetrics = {
        ...(meta as any).__applyMetrics,
        patchesApplied,
        affectedParagraphIds,
      };

      // Verification gate: re-parse output and check structural invariants
      try {
        const { DocxAnchorsService } = await import(
          "./docx/docxAnchors.service"
        );
        const verifyAnchors = new DocxAnchorsService();
        const originalAnchors =
          await verifyAnchors.extractParagraphNodes(original);
        const editedAnchors = await verifyAnchors.extractParagraphNodes(buf);
        const origCount = originalAnchors.length;
        const editCount = editedAnchors.length;
        // Sanity: document should not lose more than half its paragraphs unexpectedly
        if (editCount < Math.ceil(origCount * 0.3) && origCount > 4) {
          throw new Error(
            `EDIT_VERIFY_FAIL: Document shrank from ${origCount} to ${editCount} paragraphs (>70% loss). ` +
              `Rolling back to prevent data loss.`,
          );
        }
        // Check merge invariant: if docx_merge_paragraphs was used, verify the merge target still exists
        const mergePatch = patches.find(
          (p: any) => String(p?.kind || "") === "docx_merge_paragraphs",
        );
        if (mergePatch) {
          const mergedPids: string[] = Array.isArray(
            (mergePatch as any).paragraphIds,
          )
            ? (mergePatch as any).paragraphIds
            : [];
          const removedCount = mergedPids.length - 1; // all but first should be removed
          const expectedCount = origCount - removedCount;
          if (editCount > expectedCount + 1 || editCount < expectedCount - 1) {
            logger.warn(
              "[Editing][DOCX_BUNDLE] Merge paragraph count mismatch",
              {
                expected: expectedCount,
                actual: editCount,
                mergedPids: mergedPids.length,
              },
            );
          }
        }
      } catch (verifyErr: any) {
        if (String(verifyErr?.message || "").startsWith("EDIT_VERIFY_FAIL:")) {
          throw verifyErr;
        }
        // Non-fatal verification errors: log but don't block the edit
        logger.warn(
          "[Editing][DOCX_BUNDLE] Post-apply verification failed (non-fatal)",
          {
            error: String(verifyErr?.message || verifyErr),
          },
        );
      }

      edited = buf;
    } else if (op === "ADD_PARAGRAPH") {
      assertMime(
        doc.mimeType,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "ADD_PARAGRAPH",
      );
      if (!targetId)
        throw new Error("ADD_PARAGRAPH requires targetId (insert after).");
      // If inserting after a list item, default to a normal paragraph (not another bullet).
      // Callers can override by setting meta.keepNumbering=true.
      const keepNumbering = Boolean((meta as any)?.keepNumbering);
      edited = await this.docxEditor.insertParagraphAfter(
        original,
        targetId,
        input.content,
        { format: paragraphContentFormat, removeNumbering: !keepNumbering },
      );
    } else if (op === "EDIT_CELL") {
      assertMime(
        doc.mimeType,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "EDIT_CELL",
      );
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
      assertMime(
        doc.mimeType,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "EDIT_RANGE",
      );
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
      assertMime(
        doc.mimeType,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "ADD_SHEET",
      );
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
      assertMime(
        doc.mimeType,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "RENAME_SHEET",
      );
      const fromName = beforeText ?? asString(meta.fromSheetName) ?? null;
      const toName = input.content;
      if (!fromName)
        throw new Error(
          "RENAME_SHEET requires beforeText (old sheet name) or fromSheetName in metadata.",
        );
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
    } else if (op === "DELETE_SHEET") {
      assertMime(
        doc.mimeType,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "DELETE_SHEET",
      );
      const sheetName = String(
        input.content || asString(meta.sheetName) || "",
      ).trim();
      if (!sheetName)
        throw new Error(
          "DELETE_SHEET requires content (sheet name to delete).",
        );
      edited = await this.applyXlsxEdit(original, {
        op,
        documentId: docId,
        userId,
        filename: doc.filename || "sheet.xlsx",
        targetId: null,
        content: sheetName,
        meta,
        ctx: {
          correlationId: input.correlationId,
          userId: input.userId,
          conversationId: input.conversationId,
          clientMessageId: input.clientMessageId,
        },
      });
    } else if (op === "CREATE_CHART") {
      assertMime(
        doc.mimeType,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "CREATE_CHART",
      );
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
      assertMime(
        doc.mimeType,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "COMPUTE",
      );
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
      assertMime(
        doc.mimeType,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "COMPUTE_BUNDLE",
      );
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
      if (!targetId)
        throw new Error(
          "REWRITE_SLIDE_TEXT requires targetId (Slides objectId).",
        );

      const { presentationId, url } =
        await this.ensureSlidesPresentationForDocument({
          documentId: docId,
          userId,
          pptxBytes: original,
          filename: doc.filename || "deck.pptx",
          correlationId: input.correlationId,
          conversationId: input.conversationId,
          clientMessageId: input.clientMessageId,
        });

      await this.slidesEditor.replaceText(
        presentationId,
        targetId,
        input.content,
        {
          correlationId: input.correlationId,
          userId: input.userId,
          conversationId: input.conversationId,
          clientMessageId: input.clientMessageId,
        },
      );

      edited = await this.slidesClient.exportPresentationToPptx(
        presentationId,
        {
          correlationId: input.correlationId,
          userId: input.userId,
          conversationId: input.conversationId,
          clientMessageId: input.clientMessageId,
        },
      );

      // Persist presentation linkage in revision metadata (useful for debugging).
      (meta as any).slidesPresentationId = presentationId;
      (meta as any).slidesPresentationUrl = url;
    } else if (op === "ADD_SLIDE") {
      assertPptxMime(doc.mimeType, "ADD_SLIDE");

      const { presentationId, url } =
        await this.ensureSlidesPresentationForDocument({
          documentId: docId,
          userId,
          pptxBytes: original,
          filename: doc.filename || "deck.pptx",
          correlationId: input.correlationId,
          conversationId: input.conversationId,
          clientMessageId: input.clientMessageId,
        });

      // Input content can optionally specify a Slides predefined layout.
      const requestedLayout =
        String(input.content || "").trim() || "TITLE_AND_BODY";
      await this.slidesEditor.addSlide(
        presentationId,
        requestedLayout as any,
        undefined,
        {
          correlationId: input.correlationId,
          userId: input.userId,
          conversationId: input.conversationId,
          clientMessageId: input.clientMessageId,
        },
      );

      edited = await this.slidesClient.exportPresentationToPptx(
        presentationId,
        {
          correlationId: input.correlationId,
          userId: input.userId,
          conversationId: input.conversationId,
          clientMessageId: input.clientMessageId,
        },
      );

      (meta as any).slidesPresentationId = presentationId;
      (meta as any).slidesPresentationUrl = url;
    } else if (op === "REPLACE_SLIDE_IMAGE") {
      assertPptxMime(doc.mimeType, "REPLACE_SLIDE_IMAGE");
      if (!targetId)
        throw new Error(
          "REPLACE_SLIDE_IMAGE requires targetId (Slides image objectId).",
        );
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

      await this.slidesEditor.replaceImage(
        ensured.presentationId,
        targetId,
        url,
        {
          correlationId: input.correlationId,
          userId: input.userId,
          conversationId: input.conversationId,
          clientMessageId: input.clientMessageId,
        },
      );

      edited = await this.slidesClient.exportPresentationToPptx(
        ensured.presentationId,
        {
          correlationId: input.correlationId,
          userId: input.userId,
          conversationId: input.conversationId,
          clientMessageId: input.clientMessageId,
        },
      );

      (meta as any).slidesPresentationId = ensured.presentationId;
      (meta as any).slidesPresentationUrl = ensured.url;
    } else {
      throw new OperatorNotImplementedError(op);
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
      await uploadFile(
        doc.encryptedFilename,
        edited,
        doc.mimeType || "application/octet-stream",
      );

      const editedHash = sha256(edited);
      logger.info("[Editing] File saved to storage", {
        documentId: docId,
        operator: op,
        storageKey: doc.encryptedFilename,
        fileHashBefore,
        fileHashAfter: editedHash,
        fileSizeBytes: edited.length,
      });

      // Invalidate any cached document buffer so subsequent reads fetch the fresh file.
      try {
        await cacheService.del(`document_buffer:${docId}`);
      } catch {}

      // Clear derived artifacts so re-indexing doesn't mix old and new chunks.
      const isSlidesEdit =
        op === "REWRITE_SLIDE_TEXT" ||
        op === "ADD_SLIDE" ||
        op === "REPLACE_SLIDE_IMAGE";
      const isSheetsEdit =
        op === "EDIT_CELL" ||
        op === "EDIT_RANGE" ||
        op === "ADD_SHEET" ||
        op === "RENAME_SHEET" ||
        op === "CREATE_CHART" ||
        op === "COMPUTE" ||
        op === "COMPUTE_BUNDLE";

      await prisma.$transaction(async (tx) => {
        await tx.documentChunk.deleteMany({ where: { documentId: docId } });
        await tx.documentEmbedding.deleteMany({ where: { documentId: docId } });

        if (isSlidesEdit || isSheetsEdit) {
          const base = (meta as any).pptxMetadata ?? null;
          let nextPptxMetadata: string | null =
            typeof base === "string"
              ? base
              : base == null
                ? null
                : String(base);

          if ((meta as any).slidesPresentationId) {
            nextPptxMetadata = setSlidesLinkInPptxMetadata(nextPptxMetadata, {
              presentationId: String((meta as any).slidesPresentationId),
              url:
                String((meta as any).slidesPresentationUrl || "").trim() ||
                `https://docs.google.com/presentation/d/${String((meta as any).slidesPresentationId)}/edit`,
            });
          }

          if ((meta as any).sheetsSpreadsheetId) {
            nextPptxMetadata = setSheetsLinkInPptxMetadata(nextPptxMetadata, {
              spreadsheetId: String((meta as any).sheetsSpreadsheetId),
              url:
                String((meta as any).sheetsSpreadsheetUrl || "").trim() ||
                `https://docs.google.com/spreadsheets/d/${String((meta as any).sheetsSpreadsheetId)}/edit`,
            });
          }

          const chartEntries = Array.isArray((meta as any).__sheetsChartEntries)
            ? (meta as any).__sheetsChartEntries
            : [];
          for (const entry of chartEntries) {
            const range = String(entry?.range || "").trim();
            if (!range) continue;
            nextPptxMetadata = addSheetsChartToPptxMetadata(nextPptxMetadata, {
              chartId:
                typeof entry?.chartId === "number" ? entry.chartId : undefined,
              type: String(entry?.type || "LINE"),
              range,
              ...(entry?.title ? { title: String(entry.title) } : {}),
              ...(entry?.settings && typeof entry.settings === "object"
                ? { settings: entry.settings }
                : {}),
              ...(entry?.createdAtIso
                ? { createdAtIso: String(entry.createdAtIso) }
                : {}),
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
              ...(entry?.sheetName
                ? { sheetName: String(entry.sheetName) }
                : {}),
              hasHeader: entry?.hasHeader !== false,
              ...(entry?.style ? { style: String(entry.style) } : {}),
              ...(entry?.colors && typeof entry.colors === "object"
                ? { colors: entry.colors }
                : {}),
              ...(entry?.createdAtIso
                ? { createdAtIso: String(entry.createdAtIso) }
                : {}),
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
          await tx.documentMetadata.deleteMany({
            where: { documentId: docId },
          });
        }

        await tx.documentProcessingMetrics.deleteMany({
          where: { documentId: docId },
        });
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
        this.idempotencyResults.set(dedupeKey, {
          revisionId: docId,
          createdAtMs: Date.now(),
        });
      }
      const applyMetrics =
        (meta as any).__applyMetrics &&
        typeof (meta as any).__applyMetrics === "object"
          ? (meta as any).__applyMetrics
          : undefined;
      return {
        revisionId: docId,
        fileHashBefore,
        fileHashAfter: sha256(edited),
        ...(applyMetrics ? { applyMetrics } : {}),
      };
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
      },
    );

    if (idempotencyKey) {
      const dedupeKey = `${userId}:${docId}:${idempotencyKey}`;
      this.idempotencyResults.set(dedupeKey, {
        revisionId: created.id,
        createdAtMs: Date.now(),
      });
    }
    const applyMetrics =
      (meta as any).__applyMetrics &&
      typeof (meta as any).__applyMetrics === "object"
        ? (meta as any).__applyMetrics
        : undefined;
    return {
      revisionId: created.id,
      fileHashBefore,
      fileHashAfter: sha256(edited),
      ...(applyMetrics ? { applyMetrics } : {}),
    };
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

  /**
   * Store an externally-produced edited buffer for a document, replacing its
   * content in-place with proper cleanup of derived artifacts + re-indexing.
   * Used by routes that build the edited bytes themselves (e.g. Slides export).
   */
  async storeEditedBuffer(input: {
    documentId: string;
    userId: string;
    editedBuffer: Buffer;
    operator: string;
    correlationId?: string;
    conversationId?: string;
    clientMessageId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{
    revisionId: string;
    fileHashBefore: string;
    fileHashAfter: string;
  }> {
    const docId = input.documentId.trim();
    const userId = input.userId.trim();

    const doc = await prisma.document.findFirst({
      where: { id: docId, userId },
      select: {
        id: true,
        encryptedFilename: true,
        filename: true,
        mimeType: true,
        fileHash: true,
      },
    });
    if (!doc) throw new Error("Document not found or not accessible.");
    if (!doc.encryptedFilename)
      throw new Error("Document storage key missing.");

    const original = await downloadFile(doc.encryptedFilename);
    const fileHashBefore =
      String(doc.fileHash || "").trim() || sha256(original);
    const fileHashAfter = sha256(input.editedBuffer);

    // Overwrite content at the same storage key.
    await uploadFile(
      doc.encryptedFilename,
      input.editedBuffer,
      doc.mimeType || "application/octet-stream",
    );
    try {
      await cacheService.del(`document_buffer:${docId}`);
    } catch {}

    const op = String(input.operator || "").trim();
    const isSlidesEdit = op.includes("SLIDE") || op === "EXPORT_SLIDES";
    const isSheetsEdit =
      op.includes("SHEET") ||
      op.includes("CELL") ||
      op.includes("RANGE") ||
      op.includes("CHART") ||
      op.includes("COMPUTE");

    await prisma.$transaction(async (tx) => {
      await tx.documentChunk.deleteMany({ where: { documentId: docId } });
      await tx.documentEmbedding.deleteMany({ where: { documentId: docId } });

      if (isSlidesEdit || isSheetsEdit) {
        const existingMeta = await tx.documentMetadata.findUnique({
          where: { documentId: docId },
          select: { pptxMetadata: true },
        });
        await tx.documentMetadata.upsert({
          where: { documentId: docId },
          update: {
            markdownContent: null,
            markdownUrl: null,
            markdownStructure: null,
            sheetCount: null,
            slideCount: null,
            slidesData: null,
            pptxMetadata: (existingMeta as any)?.pptxMetadata ?? null,
            slideGenerationStatus: isSlidesEdit ? "pending" : undefined,
            slideGenerationError: isSlidesEdit ? null : undefined,
            previewPdfStatus: "pending",
            previewPdfKey: null,
            previewPdfError: null,
            previewPdfAttempts: 0,
            previewPdfUpdatedAt: null,
          } as any,
          create: { documentId: docId } as any,
        });
      } else {
        await tx.documentMetadata.deleteMany({ where: { documentId: docId } });
      }

      await tx.documentProcessingMetrics.deleteMany({
        where: { documentId: docId },
      });
      await tx.document.update({
        where: { id: docId },
        data: {
          fileSize: input.editedBuffer.length,
          fileHash: fileHashAfter,
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

    await this.reprocessEditedDocument({
      documentId: docId,
      userId,
      filename: doc.filename || "document",
      mimeType: doc.mimeType || "application/octet-stream",
      encryptedFilename: doc.encryptedFilename,
    });

    return { revisionId: docId, fileHashBefore, fileHashAfter };
  }

  async undoToRevision(input: {
    documentId: string;
    userId: string;
    revisionId?: string;
  }): Promise<{
    restoredRevisionId: string;
    beforeHash?: string;
    restoredHash?: string;
    referenceHash?: string;
    verifiedBitwise?: boolean;
    verificationReason?: string;
  }> {
    const userId = input.userId.trim();
    const docId = input.documentId.trim();

    if (editingSaveMode() === "overwrite") {
      // Undo in overwrite mode restores the original document in-place.
      const target = await prisma.document.findFirst({
        where: { id: docId, userId },
        select: {
          id: true,
          encryptedFilename: true,
          filename: true,
          mimeType: true,
          parentVersionId: true,
        },
      });
      if (!target) throw new Error("Document not found or not accessible.");
      if (!target.encryptedFilename)
        throw new Error("Document storage key missing.");
      const currentBytes = await downloadFile(target.encryptedFilename);
      const beforeHash = sha256(currentBytes);

      const rootDocumentId = await this.resolveRootDocumentId(target.id);
      const chain = await prisma.document.findMany({
        where: {
          userId,
          OR: [{ id: rootDocumentId }, { parentVersionId: rootDocumentId }],
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          encryptedFilename: true,
          filename: true,
          mimeType: true,
          createdAt: true,
        },
      });

      // Chain includes the root document itself; backups are additional items with parentVersionId set.
      const backups = chain.filter((d) => d.id !== rootDocumentId);
      if (backups.length === 0)
        throw new Error("No previous revision to undo to.");

      const requested = input.revisionId?.trim() || null;
      const restoreFromId = requested
        ? requested
        : backups[backups.length - 1]!.id;
      const restoreDoc = chain.find((d) => d.id === restoreFromId);
      if (!restoreDoc?.encryptedFilename)
        throw new Error("Restore revision storage key missing.");

      // Optional: backup current state before undo (kept hidden) so repeated undo doesn't destroy history.
      if (keepUndoHistory()) {
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
      await uploadFile(
        target.encryptedFilename,
        bytes,
        target.mimeType || "application/octet-stream",
      );

      await prisma.$transaction([
        prisma.documentChunk.deleteMany({ where: { documentId: docId } }),
        prisma.documentEmbedding.deleteMany({ where: { documentId: docId } }),
        prisma.documentMetadata.deleteMany({ where: { documentId: docId } }),
        prisma.documentProcessingMetrics.deleteMany({
          where: { documentId: docId },
        }),
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

      const restoredBytes = await downloadFile(target.encryptedFilename);
      const verification = verifyBitwise({
        restoredBytes,
        referenceBytes: bytes,
      });

      return {
        restoredRevisionId: docId,
        beforeHash,
        restoredHash: verification.restoredHash,
        referenceHash: verification.referenceHash,
        verifiedBitwise: verification.verified,
        ...(verification.verified
          ? {}
          : {
              verificationReason: "UNDO_RESTORE_HASH_MISMATCH_OVERWRITE_MODE",
            }),
      };
    }

    const source = await prisma.document.findFirst({
      where: { id: docId, userId },
      select: { id: true, parentVersionId: true, encryptedFilename: true },
    });
    if (!source) throw new Error("Document not found or not accessible.");
    if (!source.encryptedFilename)
      throw new Error("Document storage key missing.");
    const sourceBytes = await downloadFile(source.encryptedFilename);
    const beforeHash = sha256(sourceBytes);

    const rootDocumentId = await this.resolveRootDocumentId(source.id);

    const chain = await prisma.document.findMany({
      where: {
        userId,
        OR: [{ id: rootDocumentId }, { parentVersionId: rootDocumentId }],
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        encryptedFilename: true,
        filename: true,
        mimeType: true,
        createdAt: true,
      },
    });

    if (chain.length <= 1) throw new Error("No previous revision to undo to.");

    let restoreFromId: string | null = input.revisionId?.trim() || null;
    if (restoreFromId) {
      const ok = chain.some((d) => d.id === restoreFromId);
      if (!ok)
        throw new Error(
          "Requested revisionId is not in this document's revision chain.",
        );
    } else {
      // Restore to the previous item in the chain (second last).
      restoreFromId = chain[chain.length - 2]!.id;
    }

    const restoreDoc = chain.find((d) => d.id === restoreFromId);
    if (!restoreDoc?.encryptedFilename)
      throw new Error("Restore revision storage key missing.");

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
        metadata: {
          undoFrom: restoreDoc.id,
          rootDocumentId,
          undoVerificationHash: sha256(bytes),
          undoVerificationMode: "bitwise",
        },
      },
      { userId },
    );
    const restoredDoc = await prisma.document.findUnique({
      where: { id: created.id },
      select: { encryptedFilename: true },
    });
    if (!restoredDoc?.encryptedFilename) {
      throw new Error("Undo restored revision storage key missing.");
    }
    const restoredBytes = await downloadFile(restoredDoc.encryptedFilename);
    const verification = verifyBitwise({
      restoredBytes,
      referenceBytes: bytes,
    });

    return {
      restoredRevisionId: created.id,
      beforeHash,
      restoredHash: verification.restoredHash,
      referenceHash: verification.referenceHash,
      verifiedBitwise: verification.verified,
      ...(verification.verified
        ? {}
        : {
            verificationReason: "UNDO_RESTORE_HASH_MISMATCH_REVISION_MODE",
          }),
    };
  }

  private async applyDocxFindReplacePatch(
    buffer: Buffer,
    patch: Record<string, unknown>,
  ): Promise<{
    buffer: Buffer;
    affectedParagraphIds: string[];
    replacements: number;
  }> {
    const findText =
      asString((patch as any).findText) || asString((patch as any).searchText);
    if (!findText) {
      return {
        buffer,
        affectedParagraphIds: [],
        replacements: 0,
      };
    }

    const replaceTextRaw =
      (patch as any).replaceText ??
      (patch as any).replacementText ??
      (patch as any).replaceWith ??
      "";
    const replaceText = replaceTextRaw == null ? "" : String(replaceTextRaw);
    const useRegex = Boolean((patch as any).useRegex);
    const matchCase = Boolean(
      (patch as any).matchCase ?? (patch as any).caseSensitive,
    );
    const wholeWord = Boolean((patch as any).wholeWord);
    const matcher = buildFindReplaceRegex({
      findText,
      useRegex,
      matchCase,
      wholeWord,
    });

    const anchorsService = new DocxAnchorsService();
    const anchors = await anchorsService.extractParagraphNodes(buffer);
    let nextBuffer = buffer;
    const affectedParagraphIds: string[] = [];
    let replacements = 0;

    for (const anchor of anchors) {
      const paragraphId = String(anchor.paragraphId || "").trim();
      const originalText = String(anchor.text || "");
      if (!paragraphId || !originalText) continue;

      matcher.lastIndex = 0;
      const matches = originalText.match(matcher);
      const count = matches ? matches.length : 0;
      if (count === 0) continue;

      matcher.lastIndex = 0;
      const replacedText = originalText.replace(matcher, replaceText);
      if (replacedText === originalText) continue;

      try {
        // eslint-disable-next-line no-await-in-loop
        const updated = await this.docxEditor.applyParagraphEdit(
          nextBuffer,
          paragraphId,
          replacedText,
        );
        if (updated.equals(nextBuffer)) continue;
        nextBuffer = updated;
        affectedParagraphIds.push(paragraphId);
        replacements += count;
      } catch (error) {
        if (isParagraphTargetNotFoundError(error)) {
          logger.warn(
            "[Editing][DOCX_FIND_REPLACE] Skipping stale paragraph target",
            {
              paragraphId,
            },
          );
          continue;
        }
        throw error;
      }
    }

    return {
      buffer: nextBuffer,
      affectedParagraphIds,
      replacements,
    };
  }

  private async resolveRootDocumentId(documentId: string): Promise<string> {
    let currentId: string | null = documentId;
    let safety = 0;

    while (currentId && safety < 20) {
      safety += 1;
      const row: { id: string; parentVersionId: string | null } | null =
        await prisma.document.findUnique({
          where: { id: currentId },
          select: { id: true, parentVersionId: true },
        });
      if (!row)
        throw new Error(`Revision chain broken for document ${documentId}.`);
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

    const cached = getSlidesLinkFromPptxMetadata(
      (existing as any)?.pptxMetadata,
    );
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
      update: {
        pptxMetadata: setSlidesLinkInPptxMetadata(
          (existing as any)?.pptxMetadata,
          imported,
        ),
      } as any,
      create: {
        documentId,
        pptxMetadata: setSlidesLinkInPptxMetadata(null, imported),
      } as any,
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

    const cached = getSheetsLinkFromPptxMetadata(
      (existing as any)?.pptxMetadata,
    );
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
      update: {
        pptxMetadata: setSheetsLinkInPptxMetadata(
          (existing as any)?.pptxMetadata,
          imported,
        ),
      } as any,
      create: {
        documentId,
        pptxMetadata: setSheetsLinkInPptxMetadata(null, imported),
      } as any,
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
      ctx: {
        correlationId: string;
        userId: string;
        conversationId: string;
        clientMessageId: string;
      };
    },
  ): Promise<Buffer> {
    const parseTsvOrCsvGrid = (text: string): Array<Array<string>> => {
      const raw = String(text || "").trim();
      if (!raw) throw new Error("range values are empty");
      const lines = raw
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const delimiter = lines.some((l) => l.includes("\t")) ? "\t" : ",";
      return lines.map((l) => l.split(delimiter).map((c) => c.trim()));
    };

    const rememberChart = (entry: {
      chartId?: number;
      type: string;
      range: string;
      title?: string;
      settings?: Record<string, unknown>;
    }) => {
      const range = String(entry.range || "").trim();
      if (!range) return;
      const list = Array.isArray((input.meta as any).__sheetsChartEntries)
        ? (input.meta as any).__sheetsChartEntries
        : [];
      list.push({
        ...(typeof entry.chartId === "number"
          ? { chartId: entry.chartId }
          : {}),
        type: String(entry.type || "LINE"),
        range,
        ...(entry.title ? { title: String(entry.title) } : {}),
        ...(entry.settings && typeof entry.settings === "object"
          ? { settings: entry.settings }
          : {}),
        createdAtIso: new Date().toISOString(),
      });
      (input.meta as any).__sheetsChartEntries = list;
    };

    const rememberTable = (entry: {
      range: string;
      hasHeader?: boolean;
      style?: string;
      colors?: {
        header?: string;
        stripe?: string;
        totals?: string;
        border?: string;
      };
    }) => {
      const range = String(entry.range || "").trim();
      if (!range) return;
      const bang = range.indexOf("!");
      const sheetName =
        bang > 0
          ? String(range.slice(0, bang))
              .replace(/^'/, "")
              .replace(/'$/, "")
              .trim()
          : "";
      const style = String(entry.style || "")
        .trim()
        .toLowerCase();
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
      const cleanColors = Object.values(colors).some(Boolean)
        ? colors
        : undefined;
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

    const extractChartSettings = (
      spec: any,
    ): Record<string, unknown> | undefined => {
      if (!spec || typeof spec !== "object") return undefined;
      const out: Record<string, unknown> = {};
      const type = String(spec.type || "")
        .trim()
        .toUpperCase();
      if (type) out.type = type;
      if (Number.isInteger(spec.headerCount))
        out.headerCount = Number(spec.headerCount);
      if (typeof spec.stacked === "boolean") out.stacked = spec.stacked;
      if (spec.comboSeries && typeof spec.comboSeries === "object")
        out.comboSeries = spec.comboSeries;
      if (spec.bubble && typeof spec.bubble === "object")
        out.bubble = spec.bubble;
      if (spec.histogram && typeof spec.histogram === "object")
        out.histogram = spec.histogram;
      return Object.keys(out).length ? out : undefined;
    };

    const parseComputePayloadOps = (): SpreadsheetEngineOp[] => {
      let payload: any = {};
      try {
        payload = JSON.parse(String(input.content || "{}"));
      } catch {
        throw new Error('COMPUTE requires JSON content like {"ops":[...]}');
      }
      const ops = Array.isArray(payload?.ops) ? payload.ops : [];
      return ops.filter(
        (item: any) => item && typeof item === "object",
      ) as SpreadsheetEngineOp[];
    };

    const buildSpreadsheetEngineOps = (): SpreadsheetEngineOp[] => {
      if (input.op === "EDIT_CELL") {
        const [sheetName, a1] = String(input.targetId || "").split("!");
        if (!sheetName || !a1)
          throw new Error("EDIT_CELL requires targetId like Sheet1!B2");
        return [
          {
            kind: "set_values",
            rangeA1: `${sheetName}!${a1}`,
            values: [[String(input.content ?? "")]],
          },
        ];
      }
      if (input.op === "EDIT_RANGE") {
        const rangeA1 = String(input.targetId || "").trim();
        if (!rangeA1) throw new Error("EDIT_RANGE requires targetId.");
        return [
          {
            kind: "set_values",
            rangeA1,
            values: parseTsvOrCsvGrid(input.content),
          },
        ];
      }
      if (input.op === "ADD_SHEET") {
        const title = String(input.content || "").trim();
        if (!title) throw new Error("ADD_SHEET requires content (sheet name).");
        return [{ kind: "add_sheet", title }];
      }
      if (input.op === "RENAME_SHEET") {
        const fromName = asString((input.meta as any).fromSheetName);
        const toName = String(input.content || "").trim();
        if (!fromName || !toName)
          throw new Error("RENAME_SHEET requires fromSheetName and content.");
        return [{ kind: "rename_sheet", fromName, toName }];
      }
      if (input.op === "DELETE_SHEET") {
        const sheetName = String(input.content || "").trim();
        if (!sheetName)
          throw new Error("DELETE_SHEET requires content (sheet name).");
        return [{ kind: "delete_sheet", sheetName }];
      }
      if (input.op === "CREATE_CHART") {
        const raw = String(input.content || "").trim();
        let spec: any = null;
        try {
          spec = JSON.parse(raw);
        } catch {
          throw new Error(
            'CREATE_CHART requires JSON content like {"type":"PIE","range":"Sheet1!A1:B10"}',
          );
        }
        if (!spec || typeof spec !== "object") {
          throw new Error("CREATE_CHART requires a JSON object payload.");
        }
        return [{ kind: "create_chart", spec }];
      }
      if (input.op === "COMPUTE") {
        return parseComputePayloadOps();
      }
      throw new Error(
        `Unsupported XLSX operator for Python spreadsheet engine: ${input.op}`,
      );
    };

    const persistSpreadsheetEngineArtifacts = (response: any): void => {
      if (response?.artifacts && typeof response.artifacts === "object") {
        (input.meta as any).__pythonSpreadsheetArtifacts = response.artifacts;
      }
      if (
        response?.answer_context &&
        typeof response.answer_context === "object"
      ) {
        (input.meta as any).__pythonSpreadsheetAnswerContext =
          response.answer_context;
      }
      if (response?.proof && typeof response.proof === "object") {
        (input.meta as any).__pythonSpreadsheetProof = response.proof;
      }
      const opProofsFromProof = Array.isArray(response?.proof?.ops)
        ? response.proof.ops
        : [];
      const opProofsFromStatuses = Array.isArray(response?.applied_ops)
        ? response.applied_ops
            .map((status: any) => {
              const index = Number(status?.index);
              const kind = String(status?.kind || "").trim();
              if (!Number.isFinite(index) || !kind) return null;
              return {
                index,
                kind,
                status: String(status?.status || "").trim() || "unknown",
                ...(status?.message
                  ? { message: String(status.message).slice(0, 300) }
                  : {}),
                ...(status?.before_hash
                  ? { before_hash: String(status.before_hash) }
                  : {}),
                ...(status?.after_hash
                  ? { after_hash: String(status.after_hash) }
                  : {}),
                ...(status?.proof && typeof status.proof === "object"
                  ? { proof: status.proof as Record<string, unknown> }
                  : {}),
              };
            })
            .filter(Boolean)
        : [];
      const opProofs = [...opProofsFromProof, ...opProofsFromStatuses]
        .filter((entry: any) => entry && typeof entry === "object")
        .slice(0, 500);
      if (opProofs.length) {
        (input.meta as any).__pythonSpreadsheetOpProofs = opProofs;
      }
      if (Array.isArray(response?.warnings)) {
        (input.meta as any).__pythonSpreadsheetWarnings = response.warnings
          .map((item: any) => String(item || "").trim())
          .filter(Boolean);
      }

      const artifacts =
        response?.artifacts && typeof response.artifacts === "object"
          ? response.artifacts
          : {};

      const chartEntries = Array.isArray((artifacts as any).chartEntries)
        ? (artifacts as any).chartEntries
        : [];
      for (const entry of chartEntries) {
        const range = String(entry?.range || "").trim();
        if (!range) continue;
        rememberChart({
          ...(typeof entry?.chartId === "number"
            ? { chartId: entry.chartId }
            : {}),
          type: String(entry?.type || "LINE"),
          range,
          ...(entry?.title ? { title: String(entry.title) } : {}),
          ...(entry?.settings && typeof entry.settings === "object"
            ? { settings: entry.settings }
            : {}),
        });
      }

      const tableEntries = Array.isArray((artifacts as any).tableEntries)
        ? (artifacts as any).tableEntries
        : [];
      for (const entry of tableEntries) {
        const range = String(entry?.range || "").trim();
        if (!range) continue;
        rememberTable({
          range,
          hasHeader: entry?.hasHeader !== false,
          ...(entry?.style ? { style: String(entry.style) } : {}),
          ...(entry?.colors && typeof entry.colors === "object"
            ? { colors: entry.colors }
            : {}),
        });
      }
    };

    const spreadsheetEngineOps = buildSpreadsheetEngineOps();
    const spreadsheetEngineMode = this.spreadsheetEngine.mode();
    let spreadsheetExecutionPath:
      | "local_only"
      | "python_applied"
      | "python_bypassed" = "local_only";
    const requiresRemotePython = spreadsheetEngineOps.some((op) => {
      const kind = String((op as any)?.kind || "")
        .trim()
        .toLowerCase();
      return (
        kind.startsWith("python_") || kind === "insight" || kind === "analysis"
      );
    });
    const shouldCallPythonEngine =
      input.op === "COMPUTE" &&
      this.spreadsheetEngine.enabled() &&
      (requiresRemotePython || spreadsheetEngineMode !== "off");

    if (shouldCallPythonEngine) {
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

        const response = await this.spreadsheetEngine.execute({
          requestId: `${input.ctx.correlationId}:${Date.now()}`,
          documentId: input.documentId,
          userId: input.userId,
          correlationId: input.ctx.correlationId,
          spreadsheetId: ensured.spreadsheetId,
          ops: spreadsheetEngineOps,
          context: {
            activeSheetName:
              asString((input.meta as any).activeSheetName) ||
              asString((input.meta as any).sheetName),
            selectionRangeA1:
              asString((input.meta as any).selectionRangeA1) ||
              asString((input.meta as any).rangeA1) ||
              asString(input.targetId),
            language: asString((input.meta as any).language),
            conversationId: input.ctx.conversationId,
          },
          options: {
            sourceOperator: input.op,
            source: "documentRevisionStore.canonical",
          },
        });

        persistSpreadsheetEngineArtifacts(response);
        spreadsheetExecutionPath = "python_applied";

        const statuses = Array.isArray(response?.applied_ops)
          ? response.applied_ops
          : [];
        const failed = statuses.filter(
          (status: any) =>
            String(status?.status || "").toLowerCase() === "failed",
        );
        if (failed.length > 0 && spreadsheetEngineMode === "enforced") {
          const failedSummary = failed
            .map(
              (item: any) =>
                `${String(item?.kind || "unknown")}${item?.message ? ` (${String(item.message)})` : ""}`,
            )
            .join("; ");
          throw new Error(
            `PYTHON_SPREADSHEET_ENGINE_FAILED: ${failedSummary || "operation failed"}`,
          );
        }
      } catch (error: any) {
        const message = String(error?.message || error || "");
        const isInfraDisabled =
          /service_disabled|sheets\.googleapis\.com|google sheets api has not been used|auth_error|permission denied|403/i.test(
            message,
          );

        if (spreadsheetEngineMode === "enforced" && !isInfraDisabled) {
          throw new Error(
            `PYTHON_SPREADSHEET_ENGINE_FAILED: ${String(error?.message || error)}`,
          );
        }
        spreadsheetExecutionPath = "python_bypassed";
        const warningList = Array.isArray(
          (input.meta as any).__pythonSpreadsheetWarnings,
        )
          ? (input.meta as any).__pythonSpreadsheetWarnings
          : [];
        warningList.push(
          `python_engine_bypassed:${message || "python engine failed"}`,
        );
        (input.meta as any).__pythonSpreadsheetWarnings = warningList
          .filter(Boolean)
          .slice(-20);
      }
    }

    const modelBefore = await buildSpreadsheetModelFromXlsx(originalXlsx);
    const semanticIndex = buildSemanticIndex(modelBefore);
    const translated = computeOpsToPatchPlan({
      ops: spreadsheetEngineOps as Array<Record<string, unknown>>,
      activeSheetName:
        asString((input.meta as any).activeSheetName) ||
        asString((input.meta as any).sheetName),
      semanticIndex,
    });

    if (!translated.patchOps.length && translated.rejectedOps.length) {
      throw new Error(`PATCH_REJECTED: ${translated.rejectedOps.join("; ")}`);
    }

    const applyResult = applyPatchOpsToSpreadsheetModel(
      modelBefore,
      translated.patchOps,
    );
    const statusSummary = summarizePatchStatuses(applyResult.statuses);
    const diff = diffSpreadsheetModels(modelBefore, applyResult.model);
    const rejectedOps = [
      ...translated.rejectedOps,
      ...statusSummary.rejectedOps,
    ];

    if (
      !diff.changed ||
      (diff.changedCellsCount === 0 && diff.changedStructuresCount === 0)
    ) {
      // Ensure doc stays "ready" — don't leave it in an intermediate status
      try {
        await prisma.document.update({
          where: { id: input.documentId },
          data: { status: "ready" },
        });
      } catch {}
      throw new Error("EDIT_NOOP_NO_CHANGES");
    }

    // Keep chat metadata for chart/table cards sourced from canonical patch ops.
    for (const op of translated.patchOps) {
      if (op.op === "CREATE_CHART_CARD") {
        rememberChart({
          type: String(op.chart?.type || "BAR"),
          range: String(op.range || ""),
          ...(op.chart?.title ? { title: String(op.chart.title) } : {}),
          ...(op.chart?.settings && typeof op.chart.settings === "object"
            ? { settings: op.chart.settings }
            : {}),
        });
      } else if (op.op === "CREATE_TABLE") {
        rememberTable({
          range: String(op.range || ""),
          hasHeader: op.hasHeader !== false,
          ...(op.style?.style ? { style: String(op.style.style) } : {}),
          ...(op.style?.colors && typeof op.style.colors === "object"
            ? { colors: op.style.colors }
            : {}),
        });
      }
    }

    (input.meta as any).__canonicalSpreadsheet = {
      canonicalOps: translated.canonicalOps,
      patchOpsCount: translated.patchOps.length,
      rejectedOpsCount: rejectedOps.length,
      changedCellsCount: diff.changedCellsCount,
      changedStructuresCount: diff.changedStructuresCount,
      locateRange: diff.locateRange,
      executionPath: spreadsheetExecutionPath,
    };

    const pythonOpProofs = Array.isArray(
      (input.meta as any).__pythonSpreadsheetOpProofs,
    )
      ? ((input.meta as any).__pythonSpreadsheetOpProofs as Array<any>)
      : [];
    const opProofCoverage = pythonOpProofs.length
      ? pythonOpProofs.filter((proof) => {
          const beforeHash = String((proof as any)?.before_hash || "").trim();
          const afterHash = String((proof as any)?.after_hash || "").trim();
          return Boolean(beforeHash) && Boolean(afterHash);
        }).length / pythonOpProofs.length
      : 0;

    (input.meta as any).__applyMetrics = {
      changedCellsCount: diff.changedCellsCount,
      changedStructuresCount: diff.changedStructuresCount,
      affectedRanges: diff.affectedRanges,
      locateRange: diff.locateRange,
      changedSamples: diff.changedSamples,
      rejectedOps,
      executionPath: spreadsheetExecutionPath,
      pythonOpProofsCount: pythonOpProofs.length,
      pythonOpProofCoverage: Number(opProofCoverage.toFixed(4)),
      pythonTraceId: asString(
        (input.meta as any).__pythonSpreadsheetProof?.trace_id,
      ),
    };

    if (rejectedOps.length) {
      const warningList = Array.isArray(
        (input.meta as any).__pythonSpreadsheetWarnings,
      )
        ? (input.meta as any).__pythonSpreadsheetWarnings
        : [];
      for (const rejected of rejectedOps)
        warningList.push(`PATCH_REJECTED:${rejected}`);
      (input.meta as any).__pythonSpreadsheetWarnings = warningList
        .filter(Boolean)
        .slice(-50);
    }

    return compileSpreadsheetModelToXlsx(applyResult.model);
  }
}

export default DocumentRevisionStoreService;
