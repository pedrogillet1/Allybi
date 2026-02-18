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
  const capabilities: any = getOptionalBank('allybi_capabilities');
  const alwaysConfirmOperators = Array.isArray(capabilities?.alwaysConfirmOperators)
    ? capabilities.alwaysConfirmOperators.map((x: any) => String(x))
    : [];
  const silentExecuteConfidence =
    typeof capabilities?.config?.silentExecuteConfidence === 'number'
      ? capabilities.config.silentExecuteConfidence
      : 0.9;

  const autoApplyInViewer =
    typeof capabilities?.config?.autoApplyInViewer === 'boolean'
      ? capabilities.config.autoApplyInViewer
      : true;

  const autoApplyComputeBundles =
    typeof capabilities?.config?.autoApplyComputeBundles === 'boolean'
      ? capabilities.config.autoApplyComputeBundles
      : true;

  res.json({
    ok: true,
    data: {
      alwaysConfirmOperators,
      silentExecuteConfidence,
      autoApplyInViewer,
      autoApplyComputeBundles,
      databanksUsed: [
        ...(capabilities?._meta?.id ? [String(capabilities._meta.id)] : []),
      ],
    },
  });
});

// Optional non-chat editing endpoints.
router.post('/plan', authMiddleware, rateLimitMiddleware, (req, res) => controller.plan(req, res));
router.post('/preview', authMiddleware, rateLimitMiddleware, (req, res) => controller.preview(req, res));
router.post('/apply', authMiddleware, rateLimitMiddleware, (req, res) => controller.apply(req, res));
router.post('/undo', authMiddleware, rateLimitMiddleware, (req, res) => controller.undo(req, res));

export default router;
