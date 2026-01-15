import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import * as storageController from '../controllers/storage.controller';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Get user storage information
router.get('/', storageController.getStorageInfo);

// Check if user has capacity for a new file
router.post('/check-capacity', storageController.checkCapacity);

// Recalculate storage for a user
router.post('/recalculate', storageController.recalculateStorage);

export default router;
