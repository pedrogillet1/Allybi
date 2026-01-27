import { Router } from 'express';
import { FolderController, createFolderController } from '../controllers/folder.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Lazy controller: resolves FolderService from app.locals on first request
let _ctrl: FolderController | null = null;
function ctrl(req: any): FolderController {
  if (!_ctrl) {
    const svc = req.app?.locals?.services?.folders;
    if (!svc) {
      throw Object.assign(new Error('FolderService not wired'), { statusCode: 503 });
    }
    _ctrl = createFolderController(svc);
  }
  return _ctrl;
}

// Folder CRUD
router.get('/', (req, res) => ctrl(req).list(req, res));
router.get('/tree', (req, res) => ctrl(req).tree(req, res));
router.get('/:id', (req, res) => ctrl(req).get(req, res));
router.post('/', (req, res) => ctrl(req).create(req, res));
router.patch('/:id', (req, res) => ctrl(req).update(req, res));
router.delete('/:id', (req, res) => ctrl(req).delete(req, res));

export default router;
