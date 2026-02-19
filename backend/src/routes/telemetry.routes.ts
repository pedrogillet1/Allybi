import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { authMiddleware } from "../middleware/auth.middleware";
import { rateLimitMiddleware } from "../middleware/rateLimit.middleware";
import { USAGE_EVENT_TYPES } from "../services/telemetry/telemetry.constants";

const router = Router();

const USAGE_EVENT_TYPE_SET = new Set<string>(USAGE_EVENT_TYPES as readonly string[]);
const MAX_META_BYTES = 2048;

const usageEventSchema = z.object({
  eventType: z.string().min(1),
  at: z.string().datetime().optional(),
  conversationId: z.string().min(1).max(128).optional(),
  documentId: z.string().min(1).max(128).optional(),
  folderId: z.string().min(1).max(128).optional(),
  locale: z.string().min(1).max(20).optional(),
  deviceType: z.enum(["mobile", "desktop", "unknown"]).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

router.post("/usage", authMiddleware, rateLimitMiddleware, async (req: Request, res: Response) => {
  const parsed = usageEventSchema.safeParse(req.body || {});
  if (!parsed.success) {
    res.status(400).json({
      ok: false,
      error: parsed.error.issues[0]?.message || "Invalid telemetry payload",
      code: "INVALID_TELEMETRY_PAYLOAD",
    });
    return;
  }

  const data = parsed.data;
  if (!USAGE_EVENT_TYPE_SET.has(data.eventType)) {
    res.status(400).json({
      ok: false,
      error: "Unsupported usage event type",
      code: "UNSUPPORTED_USAGE_EVENT",
    });
    return;
  }

  if (data.meta) {
    const metaBytes = Buffer.byteLength(JSON.stringify(data.meta), "utf8");
    if (metaBytes > MAX_META_BYTES) {
      res.status(400).json({
        ok: false,
        error: "Telemetry meta payload too large",
        code: "TELEMETRY_META_TOO_LARGE",
      });
      return;
    }
  }

  const userId = String((req as any)?.user?.id || "").trim();
  if (!userId) {
    res.status(401).json({ ok: false, error: "Not authenticated", code: "NOT_AUTHENTICATED" });
    return;
  }

  const telemetry = (req.app.locals?.services as any)?.telemetry;
  if (!telemetry || typeof telemetry.logUsage !== "function") {
    res.status(202).json({ ok: true });
    return;
  }

  try {
    await telemetry.logUsage({
      userId,
      eventType: data.eventType as any,
      at: data.at ? new Date(data.at) : new Date(),
      conversationId: data.conversationId || null,
      documentId: data.documentId || null,
      folderId: data.folderId || null,
      locale: data.locale || null,
      deviceType: data.deviceType || "unknown",
      meta: data.meta || null,
    });
  } catch (error: any) {
    console.warn("[Telemetry] Failed to ingest usage event", {
      eventType: data.eventType,
      userId,
      error: error?.message || String(error || "unknown"),
    });
  }

  // Telemetry is fail-open: never block product flow on ingest issues.
  res.status(202).json({ ok: true });
});

export default router;
