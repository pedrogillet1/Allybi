import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import type { AdminAuthService } from "../../../bootstrap/adminAuthBridge";
import {
  authLimiter,
  adminLimiter,
} from "../../../middleware/rateLimit.middleware";
import prisma from "../../../platform/db/prismaClient";
import { logger } from "../../../utils/logger";
import {
  setAdminAuthCookies,
  clearAdminAuthCookies,
  getAdminTokensFromCookies,
} from "../../../utils/adminAuthCookies";

const router = Router();

function logAdminSecurityEvent(
  action: string,
  details: Record<string, unknown> = {},
): void {
  prisma.auditLog
    .create({
      data: {
        action,
        userId: null,
        ipAddress: (details.ip as string) || null,
        userAgent: (details.userAgent as string) || null,
        status: action.includes("FAILED") ? "failed" : "success",
        details: JSON.stringify({ ...details, isAdmin: true }),
        createdAt: new Date(),
      },
    })
    .catch((err) => logger.warn("[AdminAuth] audit log write failed", { error: err?.message }));
}

let _svc: AdminAuthService | null = null;
function svc(req: any): AdminAuthService {
  if (!_svc) {
    const s = req.app?.locals?.services?.adminAuth;
    if (!s) {
      throw Object.assign(
        new Error("Admin authentication service unavailable"),
        {
          statusCode: 503,
        },
      );
    }
    _svc = s;
  }
  return _svc!;
}

router.post(
  "/login",
  adminLimiter,
  async (req: Request, res: Response): Promise<void> => {
    const ip =
      req.ip || (req.headers["x-forwarded-for"] as string) || "unknown";
    const userAgent = req.headers["user-agent"] || null;

    try {
      const { username, password } = req.body;
      if (!username || !password) {
        res.status(400).json({
          ok: false,
          error: {
            code: "MISSING_FIELDS",
            message: "Username and password required",
          },
        });
        return;
      }
      const result = await svc(req).login({ username, password });
      logAdminSecurityEvent("ADMIN_LOGIN_SUCCESS", {
        username,
        adminId: result.admin.id,
        ip,
        userAgent,
      });
      if (result.tokens) {
        setAdminAuthCookies(
          res,
          result.tokens.accessToken,
          result.tokens.refreshToken,
        );
      }
      res.json({ ok: true, data: { admin: result.admin } });
    } catch (err: any) {
      logAdminSecurityEvent("ADMIN_LOGIN_FAILED", {
        username: req.body?.username,
        ip,
        userAgent,
        error: err.message,
      });
      const status =
        err.message === "Invalid credentials" ||
        err.message === "Account disabled"
          ? 401
          : 500;
      res.status(status).json({
        ok: false,
        error: { code: "AUTH_FAILED", message: err.message },
      });
    }
  },
);

router.post(
  "/refresh",
  authLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const refreshToken =
        req.body.refreshToken || getAdminTokensFromCookies(req).refreshToken;
      if (!refreshToken) {
        res.status(400).json({
          ok: false,
          error: { code: "MISSING_TOKEN", message: "Refresh token required" },
        });
        return;
      }
      const result = await svc(req).refresh({ refreshToken });
      if (result.tokens?.accessToken) {
        setAdminAuthCookies(
          res,
          result.tokens.accessToken,
          result.tokens.refreshToken || refreshToken,
        );
      }
      res.json({ ok: true, data: { refreshed: true } });
    } catch (err: any) {
      res.status(401).json({
        ok: false,
        error: { code: "REFRESH_FAILED", message: err.message },
      });
    }
  },
);

router.post(
  "/logout",
  authLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const refreshToken =
        req.body.refreshToken || getAdminTokensFromCookies(req).refreshToken;
      const { adminId } = req.body;
      await svc(req).logout({ refreshToken, adminId });
      clearAdminAuthCookies(res);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({
        ok: false,
        error: { code: "LOGOUT_FAILED", message: err.message },
      });
    }
  },
);

router.use(
  (err: unknown, _req: Request, _res: Response, next: NextFunction) => {
    next(err);
  },
);

export default router;
