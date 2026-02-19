import type {
  ChatRequest,
  EditorSelectionRange,
  TurnContext,
} from "./chat.types";

function detectLocale(req: ChatRequest): "en" | "pt" | "es" {
  const lang = String(req.preferredLanguage || "en").toLowerCase();
  if (lang.startsWith("es")) return "es";
  return lang.startsWith("pt") ? "pt" : "en";
}

function detectViewerFileType(
  meta: Record<string, unknown> | null,
): "docx" | "xlsx" | "pptx" | "pdf" | "unknown" {
  const raw = String(
    (meta?.viewerContext as any)?.fileType || "",
  ).toLowerCase();
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
  const src = (meta?.viewerSelection as any)?.ranges;
  if (!Array.isArray(src)) return [];
  return src.map((r: any) => ({
    paragraphId: typeof r?.paragraphId === "string" ? r.paragraphId : undefined,
    a1: typeof r?.a1 === "string" ? r.a1 : undefined,
    sheetName: typeof r?.sheetName === "string" ? r.sheetName : undefined,
    start: Number.isFinite(r?.start) ? Number(r.start) : undefined,
    end: Number.isFinite(r?.end) ? Number(r.end) : undefined,
    text: typeof r?.text === "string" ? r.text : undefined,
  }));
}

export class TurnContextBuilder {
  build(req: ChatRequest): TurnContext {
    const meta = (req.meta as Record<string, unknown> | undefined) || null;
    const viewerMode = Boolean((meta as any)?.viewerMode);
    const activeDocumentId = String(
      (meta as any)?.viewerContext?.activeDocumentId || "",
    ).trim();
    const viewer =
      viewerMode && activeDocumentId
        ? {
            mode: "editor" as const,
            documentId: activeDocumentId,
            fileType: detectViewerFileType(meta),
            selection: {
              isFrozen: Boolean((meta as any)?.viewerSelection?.isFrozen),
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
        activeConnector: (req.connectorContext?.activeProvider as any) || null,
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
