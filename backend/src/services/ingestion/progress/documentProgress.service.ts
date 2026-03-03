/**
 * Document Progress Service
 *
 * Real-time WebSocket progress emissions for document processing.
 */

import { emitRealtimeToUser } from "../../realtime/socketGateway.service";

export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function stageFromMessage(message: string, pct: number): string {
  const low = String(message || "")
    .trim()
    .toLowerCase();
  if (pct >= 100) return "completed";
  if (low.includes("start")) return "starting";
  if (low.includes("extract")) return "extracting";
  if (low.includes("chunk")) return "chunking";
  if (low.includes("embed")) return "embedding";
  if (low.includes("index")) return "indexing";
  if (low.includes("preview")) return "preview";
  return "processing";
}

export function emitProcessingUpdate(input: {
  userId: string;
  documentId: string;
  filename?: string | null;
  status: "processing" | "completed" | "failed";
  progress: number;
  stage: string;
  message: string;
  error?: string;
}): void {
  const userId = String(input.userId || "").trim();
  const documentId = String(input.documentId || "").trim();
  if (!userId || !documentId) return;
  const payload: Record<string, unknown> = {
    documentId,
    status: input.status,
    progress: clampProgress(input.progress),
    stage: String(input.stage || "").trim() || "processing",
    message: String(input.message || "").trim() || "Processing document...",
  };
  if (input.filename) payload.filename = String(input.filename);
  if (input.error) payload.error = String(input.error);

  emitRealtimeToUser(userId, "document-processing-update", payload);

  if (input.status === "completed") {
    emitRealtimeToUser(userId, "document-processing-complete", payload);
    emitRealtimeToUser(userId, "processing-complete", payload);
  } else if (input.status === "failed") {
    emitRealtimeToUser(userId, "document-processing-failed", payload);
  }
}

export const emitToUser = (
  userId: string,
  event: string,
  data: Record<string, unknown>,
) => {
  emitRealtimeToUser(userId, event, data);

  const documentId = String(data?.documentId || "").trim();
  const filename = String(data?.filename || "").trim();
  if (!documentId) return;

  if (event === "document-indexed") {
    emitProcessingUpdate({
      userId,
      documentId,
      filename,
      status: "processing",
      progress: 90,
      stage: "indexed",
      message: "Document indexed for retrieval.",
    });
    emitRealtimeToUser(userId, "documents-changed", { documentId, event });
    return;
  }

  if (event === "document-ready") {
    emitProcessingUpdate({
      userId,
      documentId,
      filename,
      status: "completed",
      progress: 100,
      stage: "completed",
      message: "Document is ready.",
    });
    emitRealtimeToUser(userId, "documents-changed", { documentId, event });
    return;
  }

  if (event === "document-skipped") {
    const reason =
      String(data?.reason || "").trim() || "No extractable content";
    emitProcessingUpdate({
      userId,
      documentId,
      filename,
      status: "failed",
      progress: 100,
      stage: "skipped",
      message: reason,
      error: reason,
    });
    emitRealtimeToUser(userId, "documents-changed", { documentId, event });
  }
};

export const documentProgressService = {
  async emitCustomProgress(
    pct: number,
    msg: string,
    opts: { documentId?: string; userId?: string; filename?: string },
  ) {
    const userId = String(opts?.userId || "").trim();
    const documentId = String(opts?.documentId || "").trim();
    if (!userId || !documentId) return;
    emitProcessingUpdate({
      userId,
      documentId,
      filename: opts?.filename || null,
      status: "processing",
      progress: clampProgress(pct),
      stage: stageFromMessage(msg, pct),
      message: String(msg || "").trim() || "Processing document...",
    });
  },
};
