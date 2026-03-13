import express, { Request, Response } from "express";
import prisma from "../config/database";
import { bootstrapSecrets } from "../bootstrap/secrets";
import { initializeContainer } from "../bootstrap/container";
import {
  publishExtractJobsBulk,
  type ExtractFanoutPayload,
} from "../services/jobs/pubsubPublisher.service";

const PORT = Number(process.env.PORT || 8080);

function decodePubSubBody(req: Request): ExtractFanoutPayload {
  const data = String(req.body?.message?.data || "");
  if (!data) {
    throw new Error("Missing Pub/Sub message data");
  }
  return JSON.parse(Buffer.from(data, "base64").toString("utf8")) as ExtractFanoutPayload;
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
    res.status(200).json({ ok: true, role: "pubsub-fanout-worker", ts: new Date().toISOString() });
  });

  app.get("/ready", (_req, res) => {
    res.status(200).json({ ok: true, role: "pubsub-fanout-worker", ts: new Date().toISOString() });
  });

  app.post("/pubsub/extract-fanout", async (req: Request, res: Response) => {
    try {
      const payload = decodePubSubBody(req);
      await publishExtractJobsBulk(payload.documents);
      res.status(204).send();
    } catch (error) {
      console.error("[PubSubFanoutWorker] fanout failed", error);
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.listen(PORT, () => {
    console.log(`[PubSubFanoutWorker] listening on ${PORT}`);
  });
}

main().catch((error) => {
  console.error("[PubSubFanoutWorker] fatal boot failure", error);
  process.exit(1);
});
