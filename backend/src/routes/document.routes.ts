import { Router } from 'express';
import { DocumentController, createDocumentController } from '../controllers/document.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { uploadLimiter, downloadLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Lazy controller: resolves DocumentService from app.locals on first request
let _ctrl: DocumentController | null = null;
function ctrl(req: any): DocumentController {
  if (!_ctrl) {
    const svc = req.app?.locals?.services?.documents;
    if (!svc) {
      throw Object.assign(new Error('DocumentService not wired'), { statusCode: 503 });
    }
    _ctrl = createDocumentController(svc);
  }
  return _ctrl;
}

// List documents
router.get('/', (req, res) => ctrl(req).list(req, res));

// Get single document
router.get('/:id', (req, res) => ctrl(req).get(req, res));

// Upload document
router.post('/upload', uploadLimiter, (req, res) => ctrl(req).upload(req, res));

// Preview document
router.get('/:id/preview', downloadLimiter, (req, res) => ctrl(req).preview(req, res));

// Reindex document
router.post('/:id/reindex', (req, res) => ctrl(req).reindex(req, res));

// Delete document
router.delete('/:id', (req, res) => ctrl(req).delete(req, res));

// Supported file types
router.get('/meta/supported-types', (req, res) => ctrl(req).supportedTypes(req, res));

export default router;
