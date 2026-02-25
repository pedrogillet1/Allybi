/**
 * Marketing Routes
 * GET /api/admin/marketing
 */

import { Router, Request, Response } from "express";
import prisma from "../../config/database";
import {
  getDomains,
  getIntents,
  getKeywords,
  getPatterns,
  listInteractions,
} from "../../services/admin";

const router = Router();

/**
 * GET /api/admin/marketing/domains
 * Returns domain analytics
 */
router.get("/domains", async (req: Request, res: Response) => {
  try {
    const range = (req.query.range as string) || "7d";

    const result = await getDomains(prisma, { range });

    res.json({
      ok: true,
      range,
      data: {
        v: 1,
        domains: result.items,
      },
      meta: {
        cache: "miss",
        generatedAt: new Date().toISOString(),
        requestId: (req.headers["x-request-id"] as string) || null,
      },
    });
  } catch (error) {
    console.error("[Admin] Domains error:", error);
    res.status(500).json({
      ok: false,
      error: "Failed to fetch domains",
      code: "DOMAINS_ERROR",
    });
  }
});

/**
 * GET /api/admin/marketing/intents
 * Returns intent analytics
 */
router.get("/intents", async (req: Request, res: Response) => {
  try {
    const range = (req.query.range as string) || "7d";

    const result = await getIntents(prisma, { range });

    res.json({
      ok: true,
      range,
      data: {
        v: 1,
        intents: result.items,
      },
      meta: {
        cache: "miss",
        generatedAt: new Date().toISOString(),
        requestId: (req.headers["x-request-id"] as string) || null,
      },
    });
  } catch (error) {
    console.error("[Admin] Intents error:", error);
    res.status(500).json({
      ok: false,
      error: "Failed to fetch intents",
      code: "INTENTS_ERROR",
    });
  }
});

/**
 * GET /api/admin/marketing/keywords
 * Returns keyword analytics with trending
 */
router.get("/keywords", async (req: Request, res: Response) => {
  try {
    const range = (req.query.range as string) || "7d";
    const domain = req.query.domain as string | undefined;

    const result = await getKeywords(prisma, { range, domain });

    res.json({
      ok: true,
      range,
      data: {
        v: 1,
        top: result.top,
        trending: result.trending,
      },
      meta: {
        cache: "miss",
        generatedAt: new Date().toISOString(),
        requestId: (req.headers["x-request-id"] as string) || null,
      },
    });
  } catch (error) {
    console.error("[Admin] Keywords error:", error);
    res.status(500).json({
      ok: false,
      error: "Failed to fetch keywords",
      code: "KEYWORDS_ERROR",
    });
  }
});

/**
 * GET /api/admin/marketing/patterns
 * Returns pattern analytics
 */
router.get("/patterns", async (req: Request, res: Response) => {
  try {
    const range = (req.query.range as string) || "7d";

    const result = await getPatterns(prisma, { range });

    res.json({
      ok: true,
      range,
      data: {
        v: 1,
        patterns: result.items,
      },
      meta: {
        cache: "miss",
        generatedAt: new Date().toISOString(),
        requestId: (req.headers["x-request-id"] as string) || null,
      },
    });
  } catch (error) {
    console.error("[Admin] Patterns error:", error);
    res.status(500).json({
      ok: false,
      error: "Failed to fetch patterns",
      code: "PATTERNS_ERROR",
    });
  }
});

/**
 * GET /api/admin/marketing/interactions
 * Returns query→answer interaction feed
 */
router.get("/interactions", async (req: Request, res: Response) => {
  try {
    const range = (req.query.range as string) || "7d";
    const limit = parseInt(req.query.limit as string) || 50;
    const cursor = req.query.cursor as string | undefined;

    const result = await listInteractions(prisma, { range, limit, cursor });

    res.json({
      ok: true,
      range: result.range,
      data: {
        v: 1,
        total: result.items.length,
        interactions: result.items,
      },
      meta: {
        cache: "miss",
        generatedAt: new Date().toISOString(),
        requestId: (req.headers["x-request-id"] as string) || null,
      },
      ...(result.nextCursor && { nextCursor: result.nextCursor }),
    });
  } catch (error) {
    console.error("[Admin] Interactions error:", error);
    res.status(500).json({
      ok: false,
      error: "Failed to fetch interactions",
      code: "INTERACTIONS_ERROR",
    });
  }
});

export default router;
