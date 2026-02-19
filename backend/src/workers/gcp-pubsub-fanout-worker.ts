/**
 * GCP Pub/Sub HTTP fanout worker (Cloud Run push compatible)
 *
 * Purpose:
 * - Consume "extract_fanout" messages that contain MANY documents
 * - Publish one "extract" message per document (so the heavy worker can scale-out)
 *
 * Deploy as a separate Cloud Run service and configure a Pub/Sub push
 * subscription to POST to:
 *   https://<fanout-service>/pubsub/extract-fanout
 */

import express from "express";
import type { Request, Response } from "express";

import { logger } from "../infra/logger";
import {
  publishExtractJobsBulk,
  type DocumentJobInfo,
} from "../services/jobs/pubsubPublisher.service";
import { config } from "../config/env";

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

function isAuthorized(req: Request): boolean {
  const expected = process.env.PUBSUB_PUSH_SECRET;
  if (!expected) return true; // allow if unset (dev)
  const provided = asString(req.headers["x-koda-worker-secret"]);
  return Boolean(provided && provided === expected);
}

function msSince(iso?: string): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Date.now() - t;
}

async function handleExtractFanout(req: Request, res: Response): Promise<void> {
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
    logger.error("[PubSubFanout] Failed to decode Pub/Sub message", {
      error: e?.message || String(e),
    });
    res.status(204).end();
    return;
  }

  const jobType = asString(payload?.jobType);
  if (jobType !== "extract_fanout") {
    // Not for this service.
    res.status(204).end();
    return;
  }

  const docsRaw = Array.isArray(payload?.documents) ? payload.documents : [];
  const publishTime = asString(body?.message?.publishTime);
  const deliveryLatencyMs = msSince(publishTime || undefined);

  const documents: DocumentJobInfo[] = [];
  for (const d of docsRaw) {
    const documentId = asString(d?.documentId);
    const userId = asString(d?.userId);
    const storageKey = asString(d?.storageKey) || "";
    const mimeType = asString(d?.mimeType) || "application/octet-stream";
    const filename = asString(d?.filename) || undefined;
    if (!documentId || !userId) continue;
    documents.push({ documentId, userId, storageKey, mimeType, filename });
  }

  if (documents.length === 0) {
    logger.warn("[PubSubFanout] Empty fanout batch", { deliveryLatencyMs });
    res.status(204).end();
    return;
  }

  logger.info("[PubSubFanout] Fanout received", {
    batchSize: documents.length,
    deliveryLatencyMs,
  });

  try {
    const t0 = Date.now();
    const results = await publishExtractJobsBulk(documents);
    const okCount = Array.from(results.values()).filter(
      (v) => v !== "error",
    ).length;
    logger.info("[PubSubFanout] Fanout published", {
      batchSize: documents.length,
      okCount,
      durationMs: Date.now() - t0,
    });
    res.status(204).end();
  } catch (e: any) {
    logger.error("[PubSubFanout] Fanout publish failed", {
      error: e?.message || String(e),
    });
    res.status(500).json({ ok: false, error: "fanout_failed" });
  }
}

export async function startPubSubFanoutWorker(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: "5mb" }));

  app.get("/health", (_req, res) => res.status(200).send("ok"));
  app.post("/pubsub/extract-fanout", (req, res) => {
    handleExtractFanout(req, res).catch((err) => {
      logger.error("[PubSubFanout] Unhandled error", {
        error: err?.message || String(err),
      });
      res.status(500).json({ ok: false, error: "unhandled" });
    });
  });

  const port = Number(process.env.PORT || 8080);
  app.listen(port, () => {
    logger.info("[PubSubFanout] Listening", { port, nodeEnv: config.NODE_ENV });
  });
}

if (require.main === module) {
  startPubSubFanoutWorker().catch((e) => {
    // eslint-disable-next-line no-console
    console.error("[PubSubFanout] Fatal:", e);
    process.exit(1);
  });
}
