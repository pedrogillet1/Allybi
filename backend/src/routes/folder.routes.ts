import { Router } from 'express';
import * as folderController from '../controllers/folder.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

router.post('/', folderController.createFolder);
router.post('/bulk', folderController.bulkCreateFolders); // Bulk folder creation for folder upload
router.get('/', folderController.getFolderTree);
router.get('/:id', folderController.getFolder);
router.get('/:id/deletion-stats', folderController.getFolderDeletionStats); // Get stats for deletion confirmation modal
router.patch('/:id', folderController.updateFolder);
router.delete('/:id', folderController.deleteFolder); // Supports ?mode=folderOnly or ?mode=cascade (default)

export default router;
