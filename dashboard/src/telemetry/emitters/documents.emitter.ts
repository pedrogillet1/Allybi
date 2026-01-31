import crypto from "crypto";
import { emit } from "../index";

export type TelemetryContext = {
  userId?: string;
  orgId?: string;
  sessionId?: string;
  requestId?: string;
  ipHash?: string;
  userAgentHash?: string;
};

type BaseEvent = {
  ts: string;
  type: string;
  userId?: string;
  orgId?: string;
  sessionId?: string;
  requestId?: string;
  ipHash?: string;
  userAgentHash?: string;
  entityId?: string; // documentId
  payload?: Record<string, any>;
};

function nowIso() {
  return new Date().toISOString();
}

function safeHash(input: string): string {
  const pepper = process.env.TELEMETRY_HASH_PEPPER || "";
  return crypto.createHash("sha256").update(`${pepper}${input}`).digest("hex");
}

function base(ctx?: TelemetryContext): Omit<BaseEvent, "type"> {
  return {
    ts: nowIso(),
    userId: ctx?.userId,
    orgId: ctx?.orgId,
    sessionId: ctx?.sessionId,
    requestId: ctx?.requestId,
    ipHash: ctx?.ipHash,
    userAgentHash: ctx?.userAgentHash,
  };
}

/**
 * Sanitizes error info so you never leak internals / secrets.
 * Only allow short codes + high-level category.
 */
function sanitizeError(err: unknown): { errorCode: string; errorCategory: string } {
  const msg = typeof err === "object" && err && "message" in err ? String((err as any).message) : "";
  const name = typeof err === "object" && err && "name" in err ? String((err as any).name) : "Error";

  // Keep it coarse. Never include stack traces in telemetry payload.
  const errorCategory =
    name.includes("Timeout") ? "timeout" :
    name.includes("Validation") ? "validation" :
    name.includes("Auth") ? "auth" :
    name.includes("Decrypt") ? "crypto" :
    name.includes("S3") || msg.includes("S3") ? "storage" :
    "unknown";

  // Short code derived from category+name (not reversible to msg)
  const errorCode = crypto.createHash("sha1").update(`${errorCategory}:${name}`).digest("hex").slice(0, 10);

  return { errorCode, errorCategory };
}

/**
 * Document telemetry emitter.
 * NOTE: Do not emit plaintext filenames or extracted text.
 * Emit mime/type/bytes counts + hashed filename if needed.
 */
export const documentsEmitter = {
  async uploadStarted(params: {
    ctx?: TelemetryContext;
    documentId: string;
    folderId?: string | null;
    mimeType?: string;
    sizeBytes?: number;
    encrypted?: boolean;
    filename?: string; // optional raw; hashed only
  }) {
    const payload: Record<string, any> = {
      folderId: params.folderId ?? null,
      mimeType: params.mimeType ?? null,
      sizeBytes: params.sizeBytes ?? null,
      encrypted: params.encrypted ?? null,
    };
    if (params.filename) payload.filenameHash = safeHash(params.filename);

    await emit({
      ...base(params.ctx),
      type: "document.upload_started",
      entityId: params.documentId,
      payload,
    } as any);
  },

  async uploadCompleted(params: {
    ctx?: TelemetryContext;
    documentId: string;
    mimeType?: string;
    sizeBytes?: number;
    encrypted?: boolean;
    storageKeyHash?: string; // optional: hash of storage key if you want correlation
    durationMs?: number;
  }) {
    await emit({
      ...base(params.ctx),
      type: "document.upload_completed",
      entityId: params.documentId,
      payload: {
        mimeType: params.mimeType ?? null,
        sizeBytes: params.sizeBytes ?? null,
        encrypted: params.encrypted ?? null,
        storageKeyHash: params.storageKeyHash ?? null,
        durationMs: params.durationMs ?? null,
      },
    } as any);
  },

  async pipelineStarted(params: {
    ctx?: TelemetryContext;
    documentId: string;
    mimeType?: string;
    encrypted?: boolean;
  }) {
    await emit({
      ...base(params.ctx),
      type: "document.pipeline_started",
      entityId: params.documentId,
      payload: {
        mimeType: params.mimeType ?? null,
        encrypted: params.encrypted ?? null,
      },
    } as any);
  },

  async pipelineStep(params: {
    ctx?: TelemetryContext;
    documentId: string;
    step:
      | "download"
      | "decrypt"
      | "preview"
      | "ocr"
      | "extract"
      | "chunk"
      | "embed"
      | "index"
      | "finalize";
    status: "started" | "completed" | "failed";
    durationMs?: number;
    // Safe counters:
    pages?: number;
    chunksCount?: number;
    tokensIndexed?: number;
    ocrUsed?: boolean;
    error?: unknown; // will be sanitized if present
  }) {
    const payload: Record<string, any> = {
      step: params.step,
      status: params.status,
      durationMs: params.durationMs ?? null,
      pages: params.pages ?? null,
      chunksCount: params.chunksCount ?? null,
      tokensIndexed: params.tokensIndexed ?? null,
      ocrUsed: params.ocrUsed ?? null,
    };

    if (params.status === "failed" && params.error) {
      Object.assign(payload, sanitizeError(params.error));
    }

    await emit({
      ...base(params.ctx),
      type: "document.pipeline_step",
      entityId: params.documentId,
      payload,
    } as any);
  },

  async pipelineCompleted(params: {
    ctx?: TelemetryContext;
    documentId: string;
    durationMs?: number;
    pages?: number;
    chunksCount?: number;
    tokensIndexed?: number;
    previewReady?: boolean;
  }) {
    await emit({
      ...base(params.ctx),
      type: "document.pipeline_completed",
      entityId: params.documentId,
      payload: {
        durationMs: params.durationMs ?? null,
        pages: params.pages ?? null,
        chunksCount: params.chunksCount ?? null,
        tokensIndexed: params.tokensIndexed ?? null,
        previewReady: params.previewReady ?? null,
      },
    } as any);
  },

  async pipelineFailed(params: {
    ctx?: TelemetryContext;
    documentId: string;
    durationMs?: number;
    error: unknown;
  }) {
    const { errorCode, errorCategory } = sanitizeError(params.error);

    await emit({
      ...base(params.ctx),
      type: "document.pipeline_failed",
      entityId: params.documentId,
      payload: {
        durationMs: params.durationMs ?? null,
        errorCode,
        errorCategory,
      },
    } as any);
  },

  async previewViewed(params: {
    ctx?: TelemetryContext;
    documentId: string;
    previewType: "pdf" | "docx" | "pptx" | "excel" | "image" | "video" | "audio" | "text" | "archive" | "unknown";
  }) {
    await emit({
      ...base(params.ctx),
      type: "document.preview_viewed",
      entityId: params.documentId,
      payload: { previewType: params.previewType },
    } as any);
  },

  async downloaded(params: {
    ctx?: TelemetryContext;
    documentId: string;
    // optional: safe for volume monitoring
    sizeBytes?: number;
  }) {
    await emit({
      ...base(params.ctx),
      type: "document.downloaded",
      entityId: params.documentId,
      payload: {
        sizeBytes: params.sizeBytes ?? null,
      },
    } as any);
  },

  async deleted(params: {
    ctx?: TelemetryContext;
    documentId: string;
    reason?: "user_request" | "retention_policy" | "admin_action" | "unknown";
  }) {
    await emit({
      ...base(params.ctx),
      type: "document.deleted",
      entityId: params.documentId,
      payload: { reason: params.reason ?? "unknown" },
    } as any);
  },

  async accessDenied(params: {
    ctx?: TelemetryContext;
    documentId?: string;
    reason: "owner_mismatch" | "missing_permission" | "unauthenticated" | "unknown";
  }) {
    await emit({
      ...base(params.ctx),
      type: "document.access_denied",
      entityId: params.documentId,
      payload: { reason: params.reason },
    } as any);
  },
};
