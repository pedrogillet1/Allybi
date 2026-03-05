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

function validateOcrPayload(payload: unknown): WorkerJobPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid payload: object expected");
  }

  const candidate = payload as WorkerJobPayload;
  if (candidate.jobType !== "ocr") {
    throw new Error(`Expected job type 'ocr', got '${String((candidate as any).jobType || "")}'`);
  }

  asNonEmptyString(candidate.documentId, "documentId");
  asNonEmptyString(candidate.userId, "userId");
  asNonEmptyString(candidate.mimeType, "mimeType");
  return candidate;
}

function isImageMime(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith("image/");
}

async function processOcrJob(payload: WorkerJobPayload): Promise<WorkerResponse> {
  const start = Date.now();

  if (!isImageMime(payload.mimeType)) {
    return {
      success: true,
      skipped: true,
      reason: `ocr_skipped_non_image_mime:${payload.mimeType}`,
      jobType: "ocr",
      documentId: payload.documentId,
      durationMs: Date.now() - start,
    };
  }

  if (!payload.storage?.key) {
    return {
      success: false,
      jobType: "ocr",
      documentId: payload.documentId,
      durationMs: Date.now() - start,
      error: "Invalid payload: storage.key is required for OCR jobs",
    };
  }

  const { runDocumentIngestionPipeline } = await import(
    "../../src/queues/workers/documentIngestionPipeline.service"
  );

  const result = await runDocumentIngestionPipeline(
    {
      documentId: payload.documentId,
      userId: payload.userId,
      filename: payload.filename || payload.documentId,
      mimeType: payload.mimeType,
      encryptedFilename: payload.storage.key,
    },
    {
      handlePreviewAndReady: true,
    },
  );

  const { success, documentId, ...rest } = result as unknown as Record<string, unknown>;
  return {
    ...rest,
    success: Boolean(success),
    jobType: "ocr",
    documentId: payload.documentId,
    durationMs: Date.now() - start,
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
  res.status(200).json({ status: "ok", worker: "ocr" });
});

app.post("/pubsub", async (req: Request, res: Response) => {
  if (!isValidPubSubEnvelope(req.body)) {
    res.status(400).json({ success: false, error: "Invalid Pub/Sub envelope" });
    return;
  }

  try {
    const decoded = decodePubSubMessage<WorkerJobPayload>(req.body);
    const payload = validateOcrPayload(decoded.data);
    const result = await processOcrJob(payload);

    if (result.success) {
      res.status(200).json(result);
      return;
    }

    res.status(500).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isValidationError = /Invalid payload|Expected job type|Invalid Pub\/Sub envelope/i.test(message);
    res.status(isValidationError ? 400 : 500).json({ success: false, error: message });
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
  console.log(`[workers_gcp] ocr worker listening on ${port}`);
});

export default app;
