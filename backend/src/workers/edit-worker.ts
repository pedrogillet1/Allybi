import type { Job } from "bullmq";

import prisma from "../config/database";
import { addDocumentJob } from "../queues/document.queue";
import {
  startEditWorker,
  stopEditWorker,
  type ReindexRevisionJobData,
} from "../queues/edit.queue";

async function runJob(job: Job<ReindexRevisionJobData>): Promise<void> {
  const targetId = job.data.revisionId || job.data.documentId;

  const doc = await prisma.document.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      userId: true,
      encryptedFilename: true,
      filename: true,
      mimeType: true,
    },
  });

  if (!doc) {
    throw new Error(`Document not found for reindex: ${targetId}`);
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
