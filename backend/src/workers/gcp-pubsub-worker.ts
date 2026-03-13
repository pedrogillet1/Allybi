import express, { Request, Response } from "express";
import prisma from "../config/database";
import { bootstrapSecrets } from "../bootstrap/secrets";
import { initializeContainer } from "../bootstrap/container";
import { processDocumentJobData } from "../queues/workers/documentJobProcessor.service";
import type { WorkerJobPayload } from "../services/jobs/pubsubPublisher.service";

const PORT = Number(process.env.PORT || 8080);

function decodePubSubBody(req: Request): WorkerJobPayload {
  const data = String(req.body?.message?.data || "");
  if (!data) {
    throw new Error("Missing Pub/Sub message data");
  }
  return JSON.parse(Buffer.from(data, "base64").toString("utf8")) as WorkerJobPayload;
}

async function bootstrap(): Promise<void> {
  await bootstrapSecrets();
  await initializeContainer();
  await prisma.$connect();
}

async function main(): Promise<void> {
  await bootstrap();

  const app = express();
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true, role: "pubsub-worker", ts: new Date().toISOString() });
  });

  app.get("/ready", (_req, res) => {
    res.status(200).json({ ok: true, role: "pubsub-worker", ts: new Date().toISOString() });
  });

  app.post("/pubsub/extract", async (req: Request, res: Response) => {
    try {
      const payload = decodePubSubBody(req);
      await processDocumentJobData({
        documentId: payload.documentId,
        userId: payload.userId,
        filename: payload.filename || payload.documentId,
        mimeType: payload.mimeType,
      });
      res.status(204).send();
    } catch (error) {
      console.error("[PubSubWorker] extract failed", error);
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.listen(PORT, () => {
    console.log(`[PubSubWorker] listening on ${PORT}`);
  });
}

main().catch((error) => {
  console.error("[PubSubWorker] fatal boot failure", error);
  process.exit(1);
});
