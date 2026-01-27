// src/routes/auth.routes.ts
//
// Clean auth routes for Koda (Express).
// - Thin router: no business logic here
// - Controllers/services handle validation + persistence + security
// - No user-facing microcopy hardcoded here (return reason codes / structured errors)

import { Router } from "express";
import type { Request, Response, NextFunction } from "express";

import {
  authenticateToken,
  optionalAuth,
} from "../middleware/auth.middleware";

import { AuthController, createAuthController } from "../controllers/auth.controller";

const router = Router();

// Lazy controller: resolves AuthService from app.locals on first request
let _ctrl: AuthController | null = null;
function ctrl(req: any): AuthController {
  if (!_ctrl) {
    const svc = req.app?.locals?.services?.auth;
    if (!svc) {
      throw Object.assign(new Error('AuthService not wired'), { statusCode: 503 });
    }
    _ctrl = createAuthController(svc);
  }
  return _ctrl;
}

/**
 * Public
 */
router.post("/signup", (req, res) => ctrl(req).register(req, res));
router.post("/register", (req, res) => ctrl(req).register(req, res));
router.post("/login", (req, res) => ctrl(req).login(req, res));
router.post("/refresh", (req, res) => ctrl(req).refresh(req, res));

/**
 * Recovery (public) — stubbed until recovery methods are added to AuthController
 */
router.post("/recovery/start", (_req, res) => res.status(501).json({ ok: false, error: { code: "NOT_IMPLEMENTED", message: "Recovery not implemented" } }));
router.post("/recovery/verify", (_req, res) => res.status(501).json({ ok: false, error: { code: "NOT_IMPLEMENTED", message: "Recovery not implemented" } }));
router.post("/recovery/reset", (_req, res) => res.status(501).json({ ok: false, error: { code: "NOT_IMPLEMENTED", message: "Recovery not implemented" } }));

/**
 * Session
 */
router.post("/logout", optionalAuth, (req, res) => ctrl(req).logout(req, res));
router.get("/me", authenticateToken, (req, res) => ctrl(req).me(req, res));

/**
 * Health / readiness (optional)
 */
router.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

/**
 * Error boundary (router-level)
 * Keep it minimal: forward to global error handler
 */
router.use((err: unknown, _req: Request, _res: Response, next: NextFunction) => {
  next(err);
});

export default router;
