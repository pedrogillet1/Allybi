import prisma from "../../../src/config/database";
import { documentStateManager } from "../../../src/services/documents/documentStateManager.service";

export type ProcessingStage = "extract" | "embed" | "preview" | "ocr";

export async function markStageStarted(
  _documentId: string,
  _stage: ProcessingStage,
): Promise<void> {
  // Stage-level fields are not persisted in the canonical schema.
}

export async function markStageCompleted(
  _documentId: string,
  _stage: ProcessingStage,
): Promise<void> {
  // Stage-level fields are not persisted in the canonical schema.
}

export async function markStageFailed(
  documentId: string,
  _stage: ProcessingStage,
  error: string,
): Promise<void> {
  await documentStateManager.markFailed(documentId, "enriching", error).catch(() => undefined);
}

export async function markStageSkipped(
  documentId: string,
  _stage: ProcessingStage,
): Promise<void> {
  await documentStateManager.markSkipped(documentId, "stage_skipped").catch(() => undefined);
}

export async function markQueryableIfEmbedded(documentId: string): Promise<void> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { status: true, embeddingsGenerated: true },
  });

  if (!doc || !doc.embeddingsGenerated) return;

  if (doc.status === "enriching") {
    const chunkCount = await prisma.documentChunk.count({
      where: { documentId, isActive: true } as any,
    });
    await documentStateManager.markIndexed(documentId, chunkCount).catch(() => undefined);
  }
}

export async function markReadyIfComplete(documentId: string): Promise<void> {
  await documentStateManager.markReady(documentId).catch(() => undefined);
}

export async function claimDocumentForProcessing(
  documentId: string,
  fromStatus: string,
): Promise<boolean> {
  if (fromStatus !== "uploaded") return false;
  const result = await documentStateManager.claimForEnrichment(documentId);
  return result.success;
}
