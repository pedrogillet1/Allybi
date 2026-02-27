/**
 * Live Routes
 * GET /api/admin/live
 */

import { Router, Request, Response } from "express";
import prisma from "../../config/database";
import { getRecentEvents } from "../../services/admin";

const router = Router();

/**
 * GET /api/admin/live
 * Returns recent live events (from Redis or Postgres)
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;

    const result = await getRecentEvents(prisma, { limit });

    res.json({
      ok: true,
      range: "live",
      data: {
        v: 1,
        source: result.source,
        events: result.items,
      },
      meta: {
        cache: "miss",
        generatedAt: new Date().toISOString(),
        requestId: (req.headers["x-request-id"] as string) || null,
      },
    });
  } catch (error) {
    console.error("[Admin] Live events error:", error);
    res.status(500).json({
      ok: false,
      error: "Failed to fetch live events",
      code: "LIVE_ERROR",
    });
  }
});

/**
 * GET /api/admin/live/stream
 * Server-Sent Events endpoint for real-time updates
 * Current behavior: keepalive stream (connected/ping events) for dashboard liveness.
 * This endpoint is intentionally lightweight and does not stream domain events yet.
 */
router.get("/stream", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Send initial connection event
  res.write(
    `data: ${JSON.stringify({ type: "connected", ts: new Date().toISOString() })}\n\n`,
  );

  // Keep connection alive
  const keepAlive = setInterval(() => {
    res.write(
      `data: ${JSON.stringify({ type: "ping", ts: new Date().toISOString() })}\n\n`,
    );
  }, 30000);

  // Clean up on close
  req.on("close", () => {
    clearInterval(keepAlive);
  });
});

export default router;
