/**
 * Overview Routes
 * GET /api/admin/overview
 */

import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { getOverview, getTimeseries } from "../../services/admin";
import {
  parseRange,
  normalizeRange,
} from "../../services/admin/_shared/rangeWindow";
import { getGoogleMetrics } from "../../services/admin/googleMetrics.service";

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /api/admin/overview
 * Returns dashboard KPIs
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const range = (req.query.range as string) || "7d";
    const rangeKey = normalizeRange(range, "7d");
    const window = parseRange(rangeKey);
    const [result, google] = await Promise.all([
      getOverview(prisma, { range: rangeKey }),
      getGoogleMetrics(prisma, window),
    ]);

    res.json({
      ok: true,
      range: result.range,
      data: {
        v: 1,
        kpis: result.kpis,
        window: result.window,
        google,
      },
      meta: {
        cache: "miss",
        generatedAt: new Date().toISOString(),
        requestId: (req.headers["x-request-id"] as string) || null,
      },
    });
  } catch (error) {
    console.error("[Admin] Overview error:", error);
    res.status(500).json({
      ok: false,
      error: "Failed to fetch overview",
      code: "OVERVIEW_ERROR",
    });
  }
});

/**
 * GET /api/admin/overview/timeseries
 * Returns timeseries data for a specific metric
 */
router.get("/timeseries", async (req: Request, res: Response) => {
  try {
    const range = (req.query.range as string) || "7d";
    const metric = (req.query.metric as string) || "dau";
    const result = await getTimeseries(prisma, { range, metric });

    res.json({
      ok: true,
      range: result.range,
      data: {
        v: 1,
        metric: result.metric,
        points: result.points,
      },
      meta: {
        cache: "miss",
        generatedAt: new Date().toISOString(),
        requestId: (req.headers["x-request-id"] as string) || null,
      },
    });
  } catch (error) {
    console.error("[Admin] Timeseries error:", error);
    res.status(500).json({
      ok: false,
      error: "Failed to fetch timeseries",
      code: "TIMESERIES_ERROR",
    });
  }
});

export default router;
