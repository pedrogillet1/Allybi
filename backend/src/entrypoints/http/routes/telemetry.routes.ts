import { Router, type Request, type Response } from "express";
import { createHash } from "crypto";
import { z } from "zod";

import { authMiddleware } from "../../../middleware/auth.middleware";
import { authorizeByMethod } from "../../../middleware/authorize.middleware";
import { rateLimitMiddleware } from "../../../middleware/rateLimit.middleware";
import { USAGE_EVENT_TYPES } from "../../../services/telemetry/telemetry.constants";

const router = Router();
const authorizeTelemetry = authorizeByMethod("telemetry");

const USAGE_EVENT_TYPE_SET = new Set<string>(
  USAGE_EVENT_TYPES as readonly string[],
);
const MAX_META_BYTES = 2048;
const PUBLIC_VISIT_EVENT_TYPE = "ALLYBI_PUBLIC_VISIT_STARTED";
const AD_CLICK_EVENT_TYPE = "ALLYBI_AD_CLICKED";

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

const publicVisitSchema = z.object({
  at: z.string().datetime().optional(),
  locale: z.string().min(1).max(20).optional(),
  deviceType: z.enum(["mobile", "desktop", "unknown"]).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

const hasMetaWithinLimit = (
  meta: Record<string, unknown> | undefined,
): boolean => {
  if (!meta) return true;
  const metaBytes = Buffer.byteLength(JSON.stringify(meta), "utf8");
  return metaBytes <= MAX_META_BYTES;
};

const getClientIp = (req: Request): string => {
  const forwarded = req.headers["x-forwarded-for"];
  if (Array.isArray(forwarded)) {
    return (
      String(forwarded[0] || "")
        .split(",")[0]
        .trim() || "unknown"
    );
  }
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim() || "unknown";
  }
  return String(req.ip || "unknown").trim() || "unknown";
};

const buildAnonymousVisitorId = (req: Request): string => {
  const ip = getClientIp(req);
  const ua = String(req.get("user-agent") || "unknown").slice(0, 256);
  const salt = String(
    process.env.TELEMETRY_ANON_SALT || "allybi-public-telemetry-v1",
  );
  const digest = createHash("sha256")
    .update(`${salt}:${ip}:${ua}`)
    .digest("hex")
    .slice(0, 24);
  return `anon:${digest}`;
};

const sanitizePublicMeta = (
  meta: Record<string, unknown> | undefined,
): Record<string, unknown> | null => {
  if (!meta) return null;
  const out: Record<string, unknown> = {};
  for (const [rawKey, rawValue] of Object.entries(meta)) {
    const key = String(rawKey || "")
      .trim()
      .slice(0, 64);
    if (!key) continue;
    if (typeof rawValue === "string") {
      out[key] = rawValue.slice(0, 256);
      continue;
    }
    if (
      typeof rawValue === "number" ||
      typeof rawValue === "boolean" ||
      rawValue == null
    ) {
      out[key] = rawValue;
    }
  }
  return Object.keys(out).length ? out : null;
};

router.post(
  "/usage",
  authMiddleware,
  authorizeTelemetry,
  rateLimitMiddleware,
  async (req: Request, res: Response) => {
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

    if (!hasMetaWithinLimit(data.meta)) {
      res.status(400).json({
        ok: false,
        error: "Telemetry meta payload too large",
        code: "TELEMETRY_META_TOO_LARGE",
      });
      return;
    }

    const userId = String((req as any)?.user?.id || "").trim();
    if (!userId) {
      res.status(401).json({
        ok: false,
        error: "Not authenticated",
        code: "NOT_AUTHENTICATED",
      });
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

    res.status(202).json({ ok: true });
  },
);

router.post(
  "/public/visit",
  rateLimitMiddleware,
  async (req: Request, res: Response) => {
    const parsed = publicVisitSchema.safeParse(req.body || {});
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: parsed.error.issues[0]?.message || "Invalid telemetry payload",
        code: "INVALID_TELEMETRY_PAYLOAD",
      });
      return;
    }

    const data = parsed.data;
    if (!hasMetaWithinLimit(data.meta)) {
      res.status(400).json({
        ok: false,
        error: "Telemetry meta payload too large",
        code: "TELEMETRY_META_TOO_LARGE",
      });
      return;
    }

    const telemetry = (req.app.locals?.services as any)?.telemetry;
    if (!telemetry || typeof telemetry.logUsage !== "function") {
      res.status(202).json({ ok: true });
      return;
    }

    try {
      const userId = buildAnonymousVisitorId(req);
      const publicMeta = sanitizePublicMeta(data.meta);
      const sourceValue = String(
        (publicMeta as any)?.source || "",
      ).toLowerCase();
      const hasUtm =
        sourceValue === "utm" ||
        Boolean((publicMeta as any)?.utmSource) ||
        Boolean((publicMeta as any)?.utmCampaign) ||
        Boolean((publicMeta as any)?.utmMedium);
      await telemetry.logUsage({
        userId,
        eventType: PUBLIC_VISIT_EVENT_TYPE as any,
        at: data.at ? new Date(data.at) : new Date(),
        locale: data.locale || null,
        deviceType: data.deviceType || "unknown",
        meta: {
          source: "public_landing",
          surface: "signup_login",
          ...(publicMeta || {}),
        },
      });

      if (hasUtm) {
        await telemetry.logUsage({
          userId,
          eventType: AD_CLICK_EVENT_TYPE as any,
          at: data.at ? new Date(data.at) : new Date(),
          locale: data.locale || null,
          deviceType: data.deviceType || "unknown",
          meta: {
            source: "ad_platform",
            surface: "public_auth",
            ...(publicMeta || {}),
          },
        });
      }
    } catch (error: any) {
      console.warn("[Telemetry] Failed to ingest public visit event", {
        eventType: PUBLIC_VISIT_EVENT_TYPE,
        error: error?.message || String(error || "unknown"),
      });
    }

    res.status(202).json({ ok: true });
  },
);

export default router;
