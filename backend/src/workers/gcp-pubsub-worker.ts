/**
 * GCP Pub/Sub HTTP worker (Cloud Run push compatible)
 *
 * This is the missing piece for USE_GCP_WORKERS:
 * - backend publishes extract jobs to Pub/Sub
 * - this worker consumes them and runs the same ingestion/indexing pipeline
 *
 * Deploy this file as a separate Cloud Run service and configure a Pub/Sub push
 * subscription to POST to:
 *   https://<worker-service>/pubsub/extract
 */

import express from "express";
import type { Request, Response } from "express";

import { config } from "../config/env";
import { logger } from "../infra/logger";
import {
  processDocumentJobData,
  type ProcessDocumentJobData,
} from "../queues/document.queue";

type PubSubPushBody = {
  message?: {
    data?: string; // base64
    attributes?: Record<string, string>;
    messageId?: string;
    publishTime?: string;
  };
  subscription?: string;
};

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function decodePubSubData(dataB64: string): unknown {
  const json = Buffer.from(dataB64, "base64").toString("utf8");
  return JSON.parse(json) as unknown;
}

function msSince(iso?: string): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Date.now() - t;
}

function isAuthorized(req: Request): boolean {
  const expected = process.env.PUBSUB_PUSH_SECRET;
  if (!expected) return true; // allow if unset (dev)
  const provided = asString(req.headers["x-koda-worker-secret"]);
  return Boolean(provided && provided === expected);
}

async function handleExtract(req: Request, res: Response): Promise<void> {
  if (!isAuthorized(req)) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  const body = req.body as PubSubPushBody;
  const dataB64 = asString(body?.message?.data);
  if (!dataB64) {
    // Acknowledge to prevent infinite retries on malformed push.
    res.status(204).end();
    return;
  }

  let payload: any;
  try {
    payload = decodePubSubData(dataB64);
  } catch (e: any) {
    logger.error("[PubSubWorker] Failed to decode Pub/Sub message", {
      error: e?.message || String(e),
    });
    res.status(204).end();
    return;
  }

  const jobType = asString(payload?.jobType);
  if (jobType && jobType !== "extract") {
    // This service currently handles only extract jobs (end-to-end pipeline).
    res.status(204).end();
    return;
  }

  const deliveryLatencyMs = msSince(
    asString(body?.message?.publishTime) || undefined,
  );

  const documentId = asString(payload?.documentId);
  const userId = asString(payload?.userId);
  const filename = asString(payload?.filename) || "unknown";
  const mimeType = asString(payload?.mimeType) || "application/octet-stream";
  const encryptedFilename = asString(payload?.storage?.key);

  if (!documentId || !userId) {
    res.status(204).end();
    return;
  }

  logger.info("[PubSubWorker] Received extract job", {
    documentId,
    userId,
    filename,
    mimeType,
    deliveryLatencyMs,
  });

  const data: ProcessDocumentJobData = {
    documentId,
    userId,
    filename,
    mimeType,
    encryptedFilename: encryptedFilename || undefined,
  };

  try {
    const t0 = Date.now();
    await processDocumentJobData(data);
    logger.info("[PubSubWorker] Job ok", {
      documentId,
      userId,
      durationMs: Date.now() - t0,
    });
    // Ack only after successful processing so Pub/Sub retries on transient failures.
    res.status(204).end();
  } catch (e: any) {
    logger.error("[PubSubWorker] Job failed", {
      documentId,
      userId,
      error: e?.message || String(e),
    });
    res.status(500).json({ ok: false, error: "job_failed" });
  }
}

export async function startPubSubWorker(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req, res) => res.status(200).send("ok"));
  app.post("/pubsub/extract", (req, res) => {
    handleExtract(req, res).catch((err) => {
      logger.error("[PubSubWorker] Unhandled error", {
        error: err?.message || String(err),
      });
      res.status(500).json({ ok: false, error: "unhandled" });
    });
  });

  const port = Number(process.env.PORT || 8080);
  app.listen(port, () => {
    logger.info("[PubSubWorker] Listening", { port, nodeEnv: config.NODE_ENV });
  });
}

if (require.main === module) {
  startPubSubWorker().catch((e) => {
    // eslint-disable-next-line no-console
    console.error("[PubSubWorker] Fatal:", e);
    process.exit(1);
  });
}
