/**
 * Preview Orchestrator Service
 *
 * Single entry point for ensuring preview generation is triggered
 * for documents that need it. Used by:
 * - GET /:id/preview
 * - GET /:id/preview-pdf
 * - GET /:id/slides
 *
 * Self-healing: detects stale/failed jobs and re-triggers generation.
 */

import prisma from "../../config/database";
import {
  needsPreviewPdfGeneration,
  getPreviewPdfStatus,
  isProcessingStale,
} from "./previewPdfGenerator.service";
import { addPreviewGenerationJob } from "../../queues/document.queue";

const MAX_RETRY_ATTEMPTS = 3;

export interface EnsurePreviewResult {
  status:
    | "ready"
    | "pending"
    | "processing"
    | "failed"
    | "not_needed"
    | "triggered";
  pdfKey?: string | null;
  error?: string | null;
}

/**
 * Ensure a preview exists for the given document.
 * If not, trigger generation and return current status.
 */
export async function ensurePreview(
  documentId: string,
  userId: string,
  mimeType: string,
): Promise<EnsurePreviewResult> {
  // 1. Check if this type even needs a preview PDF
  if (!needsPreviewPdfGeneration(mimeType)) {
    return { status: "not_needed" };
  }

  // 2. Check current status
  const previewStatus = await getPreviewPdfStatus(documentId);

  // 3. Already ready
  if (previewStatus.status === "ready" && previewStatus.pdfKey) {
    return { status: "ready", pdfKey: previewStatus.pdfKey };
  }

  // 4. Currently processing and not stale — just wait
  if (
    (previewStatus.status === "pending" ||
      previewStatus.status === "processing") &&
    !previewStatus.isStale
  ) {
    return { status: previewStatus.status as "pending" | "processing" };
  }

  // 5. Failed but under retry limit — re-trigger
  if (
    previewStatus.status === "failed" &&
    previewStatus.attempts < MAX_RETRY_ATTEMPTS
  ) {
    await triggerPreviewGeneration(documentId, userId, mimeType);
    return { status: "triggered", error: previewStatus.error };
  }

  // 6. Stale processing — re-trigger
  if (previewStatus.isStale) {
    await triggerPreviewGeneration(documentId, userId, mimeType);
    return { status: "triggered" };
  }

  // 7. Never started (null status) — trigger
  if (!previewStatus.status) {
    await triggerPreviewGeneration(documentId, userId, mimeType);
    return { status: "triggered" };
  }

  // 8. Max retries exceeded
  return {
    status: "failed",
    error: previewStatus.error || "Max retries exceeded",
  };
}

/**
 * Trigger preview generation via the BullMQ queue
 */
async function triggerPreviewGeneration(
  documentId: string,
  userId: string,
  mimeType: string,
): Promise<void> {
  try {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { filename: true },
    });

    await addPreviewGenerationJob({
      documentId,
      userId,
      filename: doc?.filename || "document",
      mimeType,
    });

    console.log(
      `[PreviewOrchestrator] Triggered preview generation for ${documentId.substring(0, 8)}`,
    );
  } catch (error: any) {
    console.error(
      `[PreviewOrchestrator] Failed to trigger preview:`,
      error.message,
    );
  }
}

export default {
  ensurePreview,
};
