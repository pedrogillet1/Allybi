// src/routes/folder.routes.ts

import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { rateLimitMiddleware } from "../middleware/rateLimit.middleware";
import { FolderController, createFolderController } from "../controllers/folder.controller";

const router = Router();

// Lazy controller: resolves FolderService from app.locals on first request
let _ctrl: FolderController | null = null;
function ctrl(req: any): FolderController {
  if (!_ctrl) {
    const svc = req.app?.locals?.services?.folders;
    if (!svc) {
      throw Object.assign(new Error("FolderService not wired"), { statusCode: 503 });
    }
    _ctrl = createFolderController(svc);
  }
  return _ctrl;
}

router.get("/tree", authMiddleware, rateLimitMiddleware, (req, res) => ctrl(req).tree(req, res));
router.get("/", authMiddleware, rateLimitMiddleware, (req, res) => ctrl(req).list(req, res));
router.post("/", authMiddleware, rateLimitMiddleware, (req, res) => ctrl(req).create(req, res));
router.get("/:id", authMiddleware, rateLimitMiddleware, (req, res) => ctrl(req).get(req, res));
router.patch("/:id", authMiddleware, rateLimitMiddleware, (req, res) => ctrl(req).update(req, res));
router.delete("/:id", authMiddleware, rateLimitMiddleware, (req, res) => ctrl(req).delete(req, res));

export default router;
