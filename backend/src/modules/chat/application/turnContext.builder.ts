import type {
  ChatRequest,
  EditorSelectionRange,
  TurnContext,
} from "../domain/chat.types";

type ViewerContextMeta = {
  activeDocumentId?: string;
  fileType?: string;
};

type ViewerSelectionMeta = {
  isFrozen?: boolean;
  ranges?: unknown;
};

type ViewerMeta = {
  viewerMode?: boolean;
  viewerContext?: ViewerContextMeta;
  viewerSelection?: ViewerSelectionMeta;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function readViewerMeta(meta: Record<string, unknown> | null): ViewerMeta {
  const root = asRecord(meta);
  const viewerContext = asRecord(root.viewerContext);
  const viewerSelection = asRecord(root.viewerSelection);
  return {
    viewerMode: root.viewerMode === true,
    viewerContext: {
      activeDocumentId:
        typeof viewerContext.activeDocumentId === "string"
          ? viewerContext.activeDocumentId
          : undefined,
      fileType:
        typeof viewerContext.fileType === "string"
          ? viewerContext.fileType
          : undefined,
    },
    viewerSelection: {
      isFrozen: viewerSelection.isFrozen === true,
      ranges: viewerSelection.ranges,
    },
  };
}

function detectLocale(req: ChatRequest): "en" | "pt" | "es" {
  const lang = String(req.preferredLanguage || "en").toLowerCase();
  if (lang.startsWith("es")) return "es";
  return lang.startsWith("pt") ? "pt" : "en";
}

function detectViewerFileType(
  meta: Record<string, unknown> | null,
): "docx" | "xlsx" | "pptx" | "pdf" | "unknown" {
  const raw = String(readViewerMeta(meta).viewerContext?.fileType || "").toLowerCase();
  if (["docx", "word"].includes(raw)) return "docx";
  if (["xlsx", "excel", "sheet", "sheets", "spreadsheet"].includes(raw))
    return "xlsx";
  if (["pptx", "slides", "presentation"].includes(raw)) return "pptx";
  if (raw === "pdf") return "pdf";
  return "unknown";
}

function toRanges(
  meta: Record<string, unknown> | null,
): EditorSelectionRange[] {
  const src = readViewerMeta(meta).viewerSelection?.ranges;
  if (!Array.isArray(src)) return [];
  return src.map((range) => {
    const record = asRecord(range);
    return {
      paragraphId:
        typeof record.paragraphId === "string" ? record.paragraphId : undefined,
      a1: typeof record.a1 === "string" ? record.a1 : undefined,
      sheetName:
        typeof record.sheetName === "string" ? record.sheetName : undefined,
      start: Number.isFinite(record.start) ? Number(record.start) : undefined,
      end: Number.isFinite(record.end) ? Number(record.end) : undefined,
      text: typeof record.text === "string" ? record.text : undefined,
    };
  });
}

export class TurnContextBuilder {
  build(req: ChatRequest): TurnContext {
    const meta =
      req.meta && typeof req.meta === "object" && !Array.isArray(req.meta)
        ? (req.meta as Record<string, unknown>)
        : null;
    const viewerMeta = readViewerMeta(meta);
    const viewerMode = viewerMeta.viewerMode === true;
    const activeDocumentId = String(
      viewerMeta.viewerContext?.activeDocumentId || "",
    ).trim();
    const viewer =
      viewerMode && activeDocumentId
        ? {
            mode: "editor" as const,
            documentId: activeDocumentId,
            fileType: detectViewerFileType(meta),
            selection: {
              isFrozen: viewerMeta.viewerSelection?.isFrozen === true,
              ranges: toRanges(meta),
            },
          }
        : undefined;

    const attachedDocuments = Array.isArray(req.attachedDocumentIds)
      ? req.attachedDocumentIds
          .filter(
            (id): id is string =>
              typeof id === "string" && id.trim().length > 0,
          )
          .map((id) => ({ id, mime: "application/octet-stream" }))
      : [];

    return {
      userId: req.userId,
      conversationId: req.conversationId,
      messageText: req.message,
      locale: detectLocale(req),
      now: new Date(),
      activeDocument: viewer
        ? { id: viewer.documentId, mime: "application/octet-stream" }
        : undefined,
      attachedDocuments,
      viewer,
      connectors: {
        activeConnector: req.connectorContext?.activeProvider || null,
        connected: {
          gmail: Boolean(req.connectorContext?.gmail?.connected),
          outlook: Boolean(req.connectorContext?.outlook?.connected),
          slack: Boolean(req.connectorContext?.slack?.connected),
        },
      },
      request: req,
    };
  }
}
