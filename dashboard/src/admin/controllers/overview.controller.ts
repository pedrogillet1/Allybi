
// file: src/admin/controllers/overview.controller.ts
import type { Request, Response } from "express";
import { createAnalyticsCache } from "../../analytics/cache/analytics.cache";
import { cacheKeys } from "../../analytics/cache/cacheKeys";
import { overviewService } from "../services/overview.service";

type Range = "24h" | "7d" | "30d" | "90d";

const cache = createAnalyticsCache();

function parseRange(input: unknown): Range {
  const v = typeof input === "string" ? input : "7d";
  if (v === "24h" || v === "7d" || v === "30d" || v === "90d") return v;
  return "7d";
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
 * GET /api/admin/overview?range=7d
 * Read-only. Returns KPI cards + chart series + recent errors table.
 */
export async function getOverview(req: Request, res: Response) {
  const requestId = getRequestId(req);

  try {
    const range = parseRange(req.query.range);

    const key = cacheKeys.overview(range);

    const wrapped = await cache.wrap(
      key,
      30, // ttl seconds
      async () => {
        // Service should already be PII-safe and not include plaintext content.
        return overviewService.getOverview({ range });
      },
      {
        staleTtlSeconds: 120,
        allowStaleOnError: true,
      }
    );

    return res.json({
      ok: true,
      range,
      data: wrapped.value,
      meta: {
        cache: wrapped.cache,
        generatedAt: new Date().toISOString(),
        requestId,
      },
    });
  } catch (err: any) {
    // Validation-style errors from service can be treated as 400 if you throw such codes.
    if (err?.code === "BAD_REQUEST") {
      return badRequest(res, err?.message ?? "Invalid request", requestId);
    }
    return internalError(res, requestId);
  }
}
