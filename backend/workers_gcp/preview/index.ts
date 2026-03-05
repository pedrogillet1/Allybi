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

function validatePreviewPayload(payload: unknown): WorkerJobPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid payload: object expected");
  }

  const candidate = payload as WorkerJobPayload;
  if (candidate.jobType !== "preview") {
    throw new Error(`Expected job type 'preview', got '${String((candidate as any).jobType || "")}'`);
  }

  asNonEmptyString(candidate.documentId, "documentId");
  asNonEmptyString(candidate.userId, "userId");
  return candidate;
}

async function processPreviewJob(payload: WorkerJobPayload): Promise<WorkerResponse> {
  const start = Date.now();
  const { generatePreviewPdf } = await import("../../src/services/preview/previewPdfGenerator.service");
  const { documentStateManager } = await import("../../src/services/documents/documentStateManager.service");

  const preview = await generatePreviewPdf(payload.documentId, payload.userId);

  if (preview.success || preview.status === "skipped") {
    const { success: _ignoredSuccess, ...previewData } = preview;
    // Best-effort transition indexed -> ready. If the document is already ready or
    // in another terminal state, this no-ops via CAS and we still ACK the message.
    await documentStateManager.markReady(payload.documentId).catch(() => undefined);

    return {
      ...previewData,
      success: true,
      jobType: "preview",
      documentId: payload.documentId,
      durationMs: Date.now() - start,
    };
  }

  if (preview.status === "max_retries_exceeded") {
    const { success: _ignoredSuccess, ...previewData } = preview;
    return {
      ...previewData,
      success: true,
      jobType: "preview",
      documentId: payload.documentId,
      durationMs: Date.now() - start,
      reason: "preview_max_retries_exceeded",
    };
  }

  const { success: _ignoredSuccess, ...previewData } = preview;
  return {
    ...previewData,
    success: false,
    jobType: "preview",
    documentId: payload.documentId,
    durationMs: Date.now() - start,
    error: preview.error || "preview generation failed",
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
  res.status(200).json({ status: "ok", worker: "preview" });
});

app.post("/pubsub", async (req: Request, res: Response) => {
  if (!isValidPubSubEnvelope(req.body)) {
    res.status(400).json({ success: false, error: "Invalid Pub/Sub envelope" });
    return;
  }

  try {
    const decoded = decodePubSubMessage<WorkerJobPayload>(req.body);
    const payload = validatePreviewPayload(decoded.data);
    const result = await processPreviewJob(payload);

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
  console.log(`[workers_gcp] preview worker listening on ${port}`);
});

export default app;
