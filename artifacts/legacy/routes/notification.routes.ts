import { Router } from 'express';
import * as notificationController from '../controllers/notification.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// All notification routes require authentication
router.use(authenticateToken);

// Get user notifications
router.get('/', notificationController.getNotifications);

// Get unread count
router.get('/unread-count', notificationController.getUnreadCount);

// Mark notification as read
router.post('/:id/read', notificationController.markAsRead);

// Mark all notifications as read
router.post('/mark-all-read', notificationController.markAllAsRead);

// Delete notification
router.delete('/:id', notificationController.deleteNotification);

export default router;
