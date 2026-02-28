import type { Job } from "bullmq";

import prisma from "../config/database";
import { addDocumentJob } from "../queues/document.queue";
import {
  startEditWorker,
  stopEditWorker,
  type ReindexRevisionJobData,
} from "../queues/edit.queue";

export async function runJob(job: Job<ReindexRevisionJobData>): Promise<void> {
  const candidateIds = [
    String(job.data.documentId || "").trim(),
    String(job.data.revisionId || "").trim(),
  ].filter(Boolean);
  const seen = new Set<string>();
  let doc:
    | {
        id: string;
        userId: string;
        encryptedFilename: string | null;
        filename: string | null;
        mimeType: string | null;
      }
    | null = null;
  for (const candidateId of candidateIds) {
    if (seen.has(candidateId)) continue;
    seen.add(candidateId);
    doc = await prisma.document.findUnique({
      where: { id: candidateId },
      select: {
        id: true,
        userId: true,
        encryptedFilename: true,
        filename: true,
        mimeType: true,
      },
    });
    if (doc) break;
  }

  if (!doc) {
    throw new Error(
      `Document not found for reindex: ${candidateIds.join(", ") || "none"}`,
    );
  }
  const requestedUserId = String(job.data.userId || "").trim();
  if (requestedUserId && doc.userId !== requestedUserId) {
    throw new Error(
      `Reindex user mismatch for ${doc.id}: expected ${requestedUserId}, found ${doc.userId}`,
    );
  }

  if (!doc.encryptedFilename) {
    throw new Error(
      `Document ${doc.id} has no encryptedFilename; cannot reindex.`,
    );
  }

  await addDocumentJob({
    documentId: doc.id,
    encryptedFilename: doc.encryptedFilename,
    filename: doc.filename ?? "document",
    mimeType: doc.mimeType ?? "application/octet-stream",
    userId: doc.userId,
    thumbnailUrl: null,
  });
}

export function startWorker(): void {
  startEditWorker(runJob);
}

export async function stopWorker(): Promise<void> {
  await stopEditWorker();
}

if (require.main === module) {
  startWorker();

  const shutdown = async () => {
    await stopWorker();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
