/* eslint-disable @typescript-eslint/no-explicit-any */

import { emit } from "../index";
import { TELEMETRY_CATEGORY, TELEMETRY_EVENT, TELEMETRY_SEVERITY } from "../constants";
import type { TelemetryContext } from "../context";
import type { FilesEventPayload } from "../types";

/**
 * Files Telemetry Emitter (Koda)
 * ------------------------------
 * Covers file upload + file actions that should reflect in UI:
 *  - upload started/completed/failed
 *  - move/rename/delete/restore
 *
 * Rules:
 *  - No secrets (signed URLs, S3 keys may be ok but avoid full paths if sensitive)
 *  - Keep payload small
 */

function base(ctx: TelemetryContext) {
  return {
    category: TELEMETRY_CATEGORY.FILES,
    correlationId: ctx.correlationId,
    requestId: ctx.requestId,
    sessionId: ctx.sessionId,
    userId: ctx.userId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    conversationId: ctx.conversationId,
    messageId: ctx.messageId,
    documentId: ctx.documentId,
    folderId: ctx.folderId,
  };
}

export const filesEmitter = {
  async uploadStarted(ctx: TelemetryContext, payload: FilesEventPayload = {}) {
    return emit(TELEMETRY_EVENT.FILES_UPLOAD_STARTED, {
      ...base(ctx),
      severity: TELEMETRY_SEVERITY.INFO,
      documentId: (payload as any)?.metaDocumentId || ctx.documentId,
      payload: sanitizeFilesPayload(payload),
    } as any);
  },

  async uploadCompleted(ctx: TelemetryContext, payload: FilesEventPayload = {}) {
    return emit(TELEMETRY_EVENT.FILES_UPLOAD_COMPLETED, {
      ...base(ctx),
      severity: TELEMETRY_SEVERITY.INFO,
      documentId: (payload as any)?.metaDocumentId || ctx.documentId,
      payload: sanitizeFilesPayload(payload),
    } as any);
  },

  async uploadFailed(ctx: TelemetryContext, payload: FilesEventPayload = {}) {
    return emit(TELEMETRY_EVENT.FILES_UPLOAD_FAILED, {
      ...base(ctx),
      severity: TELEMETRY_SEVERITY.ERROR,
      documentId: (payload as any)?.metaDocumentId || ctx.documentId,
      payload: sanitizeFilesPayload(payload),
    } as any);
  },

  async move(ctx: TelemetryContext, payload: FilesEventPayload = {}) {
    return emit(TELEMETRY_EVENT.FILES_MOVE, {
      ...base(ctx),
      severity: payload.result === "failed" ? TELEMETRY_SEVERITY.WARN : TELEMETRY_SEVERITY.INFO,
      documentId: (payload as any)?.metaDocumentId || ctx.documentId,
      payload: sanitizeFilesPayload(payload),
    } as any);
  },

  async rename(ctx: TelemetryContext, payload: FilesEventPayload = {}) {
    return emit(TELEMETRY_EVENT.FILES_RENAME, {
      ...base(ctx),
      severity: payload.result === "failed" ? TELEMETRY_SEVERITY.WARN : TELEMETRY_SEVERITY.INFO,
      documentId: (payload as any)?.metaDocumentId || ctx.documentId,
      payload: sanitizeFilesPayload(payload),
    } as any);
  },

  async delete(ctx: TelemetryContext, payload: FilesEventPayload = {}) {
    return emit(TELEMETRY_EVENT.FILES_DELETE, {
      ...base(ctx),
      severity: payload.result === "failed" ? TELEMETRY_SEVERITY.WARN : TELEMETRY_SEVERITY.INFO,
      documentId: (payload as any)?.metaDocumentId || ctx.documentId,
      payload: sanitizeFilesPayload(payload),
    } as any);
  },

  async restore(ctx: TelemetryContext, payload: FilesEventPayload = {}) {
    return emit(TELEMETRY_EVENT.FILES_RESTORE, {
      ...base(ctx),
      severity: payload.result === "failed" ? TELEMETRY_SEVERITY.WARN : TELEMETRY_SEVERITY.INFO,
      documentId: (payload as any)?.metaDocumentId || ctx.documentId,
      payload: sanitizeFilesPayload(payload),
    } as any);
  },
};

/**
 * FilesEventPayload in your types.ts is:
 *  {
 *    uploadSessionId?, filename?, mimeType?, sizeBytes?,
 *    fromFolderId?, toFolderId?, result?, error?
 *  }
 *
 * We also keep this emitter tolerant to extra keys, but we strip sensitive ones.
 */
function sanitizeFilesPayload(payload: FilesEventPayload): FilesEventPayload {
  const out: any = { ...(payload || {}) };

  // Remove obvious secrets if someone accidentally passes them
  delete out.signedUrl;
  delete out.presignedUrl;
  delete out.authorization;
  delete out.token;
  delete out.accessToken;
  delete out.refreshToken;
  delete out.secret;
  delete out.key;

  // Ensure error shape is safe
  if (out.error) {
    const e: any = out.error;
    out.error = {
      code: e.code,
      message: e.message || "error",
      where: e.where,
      // Stack is intentionally omitted here; sinks can capture stack in dev if needed
      meta: e.meta,
    };
  }

  return out;
}

export default filesEmitter;
