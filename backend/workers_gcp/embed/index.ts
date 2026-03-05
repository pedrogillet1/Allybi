import express, { Request, Response } from "express";
import { decodePubSubMessage, isValidPubSubEnvelope } from "../shared/pubsub";
import type { WorkerJobPayload, WorkerResponse } from "../shared/types";

function asNonEmptyString(value: unknown, field: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    throw new Error(`Invalid payload: ${field} is required`);
  }
  return normalized;
}

function validateEmbedPayload(payload: unknown): WorkerJobPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid payload: object expected");
  }

  const candidate = payload as WorkerJobPayload;
  if (candidate.jobType !== "embed") {
    throw new Error(`Expected job type 'embed', got '${String((candidate as any).jobType || "")}'`);
  }

  asNonEmptyString(candidate.documentId, "documentId");
  asNonEmptyString(candidate.userId, "userId");
  return candidate;
}

async function processEmbedJob(payload: WorkerJobPayload): Promise<WorkerResponse> {
  const start = Date.now();

  const prismaModule = await import("../../src/config/database");
  const vectorEmbeddingRuntimeModule = await import(
    "../../src/services/retrieval/vectorEmbedding.runtime.service"
  );
  const { documentStateManager } = await import("../../src/services/documents/documentStateManager.service");

  const prisma = prismaModule.default;
  const vectorEmbeddingRuntimeService = vectorEmbeddingRuntimeModule.default;

  const doc = await prisma.document.findUnique({
    where: { id: payload.documentId },
    select: {
      id: true,
      status: true,
      embeddingsGenerated: true,
    },
  });

  if (!doc) {
    throw new Error(`Document ${payload.documentId} not found`);
  }

  let chunks: Array<Record<string, unknown>> = [];
  try {
    chunks = await prisma.documentChunk.findMany({
      where: {
        documentId: payload.documentId,
        isActive: true,
      } as any,
      orderBy: { chunkIndex: "asc" },
      select: {
        chunkIndex: true,
        text: true,
        page: true,
        metadata: true,
      } as any,
    });
  } catch {
    // Backward-compat for schemas that do not have documentChunk.isActive.
    chunks = await prisma.documentChunk.findMany({
      where: { documentId: payload.documentId } as any,
      orderBy: { chunkIndex: "asc" },
      select: {
        chunkIndex: true,
        text: true,
        page: true,
        metadata: true,
      } as any,
    });
  }

  const chunksToEmbed = chunks
    .filter((chunk: any) => typeof chunk.text === "string" && chunk.text.trim().length >= 8)
    .map((chunk: any) => ({
      chunkIndex: chunk.chunkIndex,
      content: chunk.text,
      pageNumber: chunk.page || undefined,
      metadata:
        chunk.metadata && typeof chunk.metadata === "object" && !Array.isArray(chunk.metadata)
          ? (chunk.metadata as Record<string, unknown>)
          : undefined,
    }));

  if (chunksToEmbed.length === 0) {
    return {
      success: Boolean(doc.embeddingsGenerated),
      skipped: true,
      reason: doc.embeddingsGenerated
        ? "embed_skipped_no_plaintext_chunks_embeddings_already_generated"
        : "embed_failed_no_plaintext_chunks_available",
      jobType: "embed",
      documentId: payload.documentId,
      durationMs: Date.now() - start,
      ...(doc.embeddingsGenerated
        ? {}
        : { error: "No plaintext chunks available to generate embeddings" }),
    };
  }

  await vectorEmbeddingRuntimeService.storeDocumentEmbeddings(payload.documentId, chunksToEmbed);

  if (doc.status === "enriching") {
    await documentStateManager.markIndexed(payload.documentId, chunksToEmbed.length).catch(() => undefined);
    await documentStateManager.markReady(payload.documentId).catch(() => undefined);
  } else if (doc.status === "indexed") {
    await documentStateManager.markReady(payload.documentId).catch(() => undefined);
  }

  return {
    success: true,
    jobType: "embed",
    documentId: payload.documentId,
    durationMs: Date.now() - start,
    embeddingsGenerated: chunksToEmbed.length,
  };
}

async function disconnectDatabase(): Promise<void> {
  try {
    const prismaModule = await import("../../src/config/database");
    await prismaModule.default.$disconnect();
  } catch {
    // Best-effort shutdown.
  }
}

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", worker: "embed" });
});

app.post("/pubsub", async (req: Request, res: Response) => {
  if (!isValidPubSubEnvelope(req.body)) {
    res.status(400).json({ success: false, error: "Invalid Pub/Sub envelope" });
    return;
  }

  try {
    const decoded = decodePubSubMessage<WorkerJobPayload>(req.body);
    const payload = validateEmbedPayload(decoded.data);
    const result = await processEmbedJob(payload);

    if (result.success) {
      res.status(200).json(result);
      return;
    }

    res.status(500).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isValidationError = /Invalid payload|Expected job type|Invalid Pub\/Sub envelope/i.test(message);
    const isNotFound = /not found/i.test(message);
    res.status(isValidationError || isNotFound ? 400 : 500).json({ success: false, error: message });
  }
});

process.on("SIGTERM", async () => {
  await disconnectDatabase();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await disconnectDatabase();
  process.exit(0);
});

const port = Number(process.env.PORT || 8080);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[workers_gcp] embed worker listening on ${port}`);
});

export default app;
