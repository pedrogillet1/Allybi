import { Router } from 'express';

import { authMiddleware } from '../middleware/auth.middleware';
import { rateLimitMiddleware } from '../middleware/rateLimit.middleware';
import { createEditingController } from '../controllers/editing.controller';
import { getOptionalBank } from '../services/core/banks/bankLoader.service';

const router = Router();
const controller = createEditingController();

// Viewer/UI helpers: expose bank-driven editing policy so the frontend can enforce the same
// confirmation rules as the backend (single source of truth).
router.get('/policy', authMiddleware, rateLimitMiddleware, (_req, res) => {
  const bank: any = getOptionalBank('editing_routing');
  const alwaysConfirmOperators = Array.isArray(bank?.operators?.alwaysConfirm)
    ? bank.operators.alwaysConfirm.map((x: any) => String(x))
    : [];
  const silentExecuteConfidence =
    typeof bank?.config?.thresholds?.silentExecuteConfidence === 'number'
      ? bank.config.thresholds.silentExecuteConfidence
      : 0.9;

  res.json({
    ok: true,
    data: {
      alwaysConfirmOperators,
      silentExecuteConfidence,
      databanksUsed: bank?.bankId ? [String(bank.bankId)] : [],
    },
  });
});

// Optional non-chat editing endpoints.
router.post('/plan', authMiddleware, rateLimitMiddleware, (req, res) => controller.plan(req, res));
router.post('/preview', authMiddleware, rateLimitMiddleware, (req, res) => controller.preview(req, res));
router.post('/apply', authMiddleware, rateLimitMiddleware, (req, res) => controller.apply(req, res));
router.post('/undo', authMiddleware, rateLimitMiddleware, (req, res) => controller.undo(req, res));

export default router;
