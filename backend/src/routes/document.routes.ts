// src/routes/document.routes.ts

import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { rateLimitMiddleware } from "../middleware/rateLimit.middleware";
import { uploadMultiple } from "../middleware/upload.middleware";
import { DocumentController, createDocumentController } from "../controllers/document.controller";

const router = Router();

// All document endpoints require auth
router.use(authMiddleware);

// Lazy controller: resolves DocumentService from app.locals on first request
let _ctrl: DocumentController | null = null;
function ctrl(req: any): DocumentController {
  if (!_ctrl) {
    const svc = req.app?.locals?.services?.documents;
    if (!svc) {
      throw Object.assign(new Error("DocumentService not wired"), { statusCode: 503 });
    }
    _ctrl = createDocumentController(svc);
  }
  return _ctrl;
}

router.post("/upload", uploadMultiple, rateLimitMiddleware, (req, res) => ctrl(req).upload(req, res));
router.get("/", rateLimitMiddleware, (req, res) => ctrl(req).list(req, res));
router.get("/:id", rateLimitMiddleware, (req, res) => ctrl(req).get(req, res));
router.get("/:id/preview", rateLimitMiddleware, (req, res) => ctrl(req).preview(req, res));
router.delete("/:id", rateLimitMiddleware, (req, res) => ctrl(req).delete(req, res));

export default router;
