/**
 * Users Routes
 * GET /api/admin/users
 */

import { Router, Request, Response } from "express";
import prisma from "../../config/database";
import { listUsers, getUserDetail } from "../../services/admin";

const router = Router();

/**
 * GET /api/admin/users
 * Returns paginated list of users with activity stats
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const range = (req.query.range as string) || "7d";
    const limit = parseInt(req.query.limit as string) || 50;
    const cursor = req.query.cursor as string | undefined;

    const result = await listUsers(prisma, { range, limit, cursor });

    res.json({
      ok: true,
      range: result.range,
      data: {
        v: 1,
        total: result.items.length,
        users: result.items,
      },
      meta: {
        cache: "miss",
        generatedAt: new Date().toISOString(),
        requestId: (req.headers["x-request-id"] as string) || null,
      },
      ...(result.nextCursor && { nextCursor: result.nextCursor }),
    });
  } catch (error) {
    console.error("[Admin] Users list error:", error);
    res.status(500).json({
      ok: false,
      error: "Failed to fetch users",
      code: "USERS_ERROR",
    });
  }
});

/**
 * GET /api/admin/users/:userId
 * Returns detailed stats for a specific user
 */
router.get("/:userId", async (req: Request, res: Response) => {
  try {
    const userId = String(req.params.userId || "").trim();
    const rangeParam = req.query.range;
    let range = "7d";
    if (typeof rangeParam === "string") {
      range = rangeParam;
    } else if (Array.isArray(rangeParam)) {
      const firstString = rangeParam.find(
        (value): value is string => typeof value === "string",
      );
      if (firstString) {
        range = firstString;
      }
    }

    const result = await getUserDetail(prisma, { userId, range });

    res.json({
      ok: true,
      range: result.range,
      data: {
        v: 1,
        user: result.user,
      },
      meta: {
        cache: "miss",
        generatedAt: new Date().toISOString(),
        requestId: (req.headers["x-request-id"] as string) || null,
      },
    });
  } catch (error) {
    console.error("[Admin] User detail error:", error);
    res.status(500).json({
      ok: false,
      error: "Failed to fetch user detail",
      code: "USER_DETAIL_ERROR",
    });
  }
});

export default router;
