import { Router } from "express";

import { authMiddleware } from "../../../middleware/auth.middleware";
import { authorizeByMethod } from "../../../middleware/authorize.middleware";
import {
  editingApplyLimiter,
  rateLimitMiddleware,
} from "../../../middleware/rateLimit.middleware";
import { createEditingController } from "../../../controllers/editing.controller";
import { getEditingPolicySnapshot } from "../../../services/editing/editingPolicy.service";
import EditingCapabilityMatrixService from "../../../services/editing/capabilities/capabilityMatrix.service";

const router = Router();
const controller = createEditingController();
const authorizeEditing = authorizeByMethod("editing");
const capabilityMatrixService = new EditingCapabilityMatrixService();

router.get(
  "/capabilities",
  authMiddleware,
  authorizeEditing,
  rateLimitMiddleware,
  (req, res) => {
    const domainRaw = String(req.query.domain || "")
      .trim()
      .toLowerCase();
    const domain =
      domainRaw === "docx"
        ? "docx"
        : domainRaw === "sheets"
          ? "sheets"
          : undefined;
    const matrix = capabilityMatrixService.build(domain);
    res.json({
      ok: true,
      data: matrix,
    });
  },
);

router.get(
  "/policy",
  authMiddleware,
  authorizeEditing,
  rateLimitMiddleware,
  (_req, res) => {
    const policy = getEditingPolicySnapshot();
    res.json({
      ok: true,
      data: policy,
    });
  },
);

router.post(
  "/plan",
  authMiddleware,
  authorizeEditing,
  rateLimitMiddleware,
  (req, res) => controller.plan(req, res),
);
router.post(
  "/preview",
  authMiddleware,
  authorizeEditing,
  rateLimitMiddleware,
  (req, res) => controller.preview(req, res),
);
router.post(
  "/apply",
  authMiddleware,
  authorizeEditing,
  editingApplyLimiter,
  (req, res) => controller.apply(req, res),
);
router.post(
  "/undo",
  authMiddleware,
  authorizeEditing,
  rateLimitMiddleware,
  (req, res) => controller.undo(req, res),
);

export default router;
