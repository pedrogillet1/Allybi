/**
 * Answer Quality Routes
 * GET /api/admin/answer-quality
 */

import { Router, Request, Response } from "express";
import prisma from "../../config/database";
import { getQuality } from "../../services/admin";

const router = Router();

/**
 * GET /api/admin/answer-quality
 * Returns quality metrics with breakdown by domain/intent/operator
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const range = (req.query.range as string) || "7d";
    const limit = parseInt(req.query.limit as string) || 50;
    const cursor = req.query.cursor as string | undefined;
    const domain = req.query.domain as string | undefined;
    const intent = req.query.intent as string | undefined;
    const operator = req.query.operator as string | undefined;

    const result = await getQuality(prisma, {
      range,
      limit,
      cursor,
      domain,
      intent,
      operator,
    });

    res.json({
      ok: true,
      range: result.range,
      data: {
        v: 1,
        totals: result.totals,
        breakdown: result.breakdown,
        feed: result.items,
      },
      meta: {
        cache: "miss",
        generatedAt: new Date().toISOString(),
        requestId: (req.headers["x-request-id"] as string) || null,
      },
      ...(result.nextCursor && { nextCursor: result.nextCursor }),
    });
  } catch (error) {
    console.error("[Admin] Quality error:", error);
    res.status(500).json({
      ok: false,
      error: "Failed to fetch quality metrics",
      code: "QUALITY_ERROR",
    });
  }
});

export default router;
