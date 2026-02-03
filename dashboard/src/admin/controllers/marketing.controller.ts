// file: src/admin/controllers/marketing.controller.ts
import type { Request, Response } from "express";
import { createAnalyticsCache } from "../../analytics/cache/analytics.cache";
import { cacheKeys } from "../../analytics/cache/cacheKeys";
import { marketingService } from "../services/marketing.service";

type Range = "24h" | "7d" | "30d" | "90d";

const cache = createAnalyticsCache();

function parseRange(input: unknown): Range {
  const v = typeof input === "string" ? input : "7d";
  if (v === "24h" || v === "7d" || v === "30d" || v === "90d") return v;
  return "7d";
}

function parseIntClamped(input: unknown, def: number, min: number, max: number): number {
  const n = typeof input === "string" ? Number(input) : typeof input === "number" ? input : def;
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function parseOptionalString(input: unknown, maxLen: number): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim();
  if (!s) return null;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function getRequestId(req: Request): string | null {
  const h = req.headers["x-request-id"];
  return typeof h === "string" && h.length ? h : null;
}

function badRequest(res: Response, details: string, requestId: string | null) {
  return res.status(400).json({
    ok: false,
    error: "bad_request",
    details,
    requestId,
  });
}

function internalError(res: Response, requestId: string | null) {
  return res.status(500).json({
    ok: false,
    error: "internal_error",
    requestId,
  });
}

/**
 * GET /api/admin/marketing?range=30d&utm_source=...&utm_campaign=...&referrer=...&limit=50&offset=0
 *
 * NOTE: Marketing data must be privacy-safe.
 * Do not return raw emails, IPs, or user agents.
 * Only return aggregated counts and safe labels (utm_source/campaign/referrer domains).
 */
export async function getMarketing(req: Request, res: Response) {
  const requestId = getRequestId(req);

  try {
    const range = parseRange(req.query.range);
    const limit = parseIntClamped(req.query.limit, 50, 1, 200);
    const offset = parseIntClamped(req.query.offset, 0, 0, 1_000_000);

    const utm_source = parseOptionalString(req.query.utm_source, 120);
    const utm_medium = parseOptionalString(req.query.utm_medium, 120);
    const utm_campaign = parseOptionalString(req.query.utm_campaign, 160);
    const referrer = parseOptionalString(req.query.referrer, 240);

    const filters = { utm_source, utm_medium, utm_campaign, referrer, limit, offset };

    const key = cacheKeys.marketing(range, filters);

    const wrapped = await cache.wrap(
      key,
      60, // marketing can be slightly slower-updating
      async () => {
        return marketingService.getMarketing({
          range,
          utm_source,
          utm_medium,
          utm_campaign,
          referrer,
          limit,
          offset,
        });
      },
      {
        staleTtlSeconds: 300,
        allowStaleOnError: true,
      }
    );

    // Defensive: ensure no sensitive fields leak if service misbehaves
    const value: any = wrapped.value ?? {};
    delete value.rawEvents;
    delete value.userEmails;
    delete value.ipAddresses;
    delete value.userAgents;

    return res.json({
      ok: true,
      range,
      data: value,
      meta: {
        cache: wrapped.cache,
        generatedAt: new Date().toISOString(),
        requestId,
      },
    });
  } catch (err: any) {
    if (err?.code === "BAD_REQUEST") {
      return badRequest(res, err?.message ?? "Invalid request", requestId);
    }
    return internalError(res, requestId);
  }
}
