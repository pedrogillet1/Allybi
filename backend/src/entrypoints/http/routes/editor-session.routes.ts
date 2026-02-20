import { Router } from "express";

import { authMiddleware } from "../../../middleware/auth.middleware";
import { rateLimitMiddleware } from "../../../middleware/rateLimit.middleware";
import { createEditorSessionController } from "../../../controllers/editorSession.controller";

const router = Router();
const controller = createEditorSessionController();

router.post("/start", authMiddleware, rateLimitMiddleware, (req, res) =>
  controller.start(req, res),
);
router.get("/:sessionId", authMiddleware, rateLimitMiddleware, (req, res) =>
  controller.get(req, res),
);
router.post("/apply", authMiddleware, rateLimitMiddleware, (req, res) =>
  controller.apply(req, res),
);
router.post("/cancel", authMiddleware, rateLimitMiddleware, (req, res) =>
  controller.cancel(req, res),
);

export default router;
