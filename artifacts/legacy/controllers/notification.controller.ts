import { Request, Response } from 'express';
import { notificationService } from '../services/securityStubs.service';

export const getNotifications = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

    const result = await notificationService.getUserNotifications(userId, limit);

    res.status(200).json({
      notifications: result.notifications,
      unreadCount: result.unreadCount,
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
};

export const markAsRead = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    await notificationService.markNotificationAsRead(id, userId);

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
};

export const markAllAsRead = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    await notificationService.markAllNotificationsAsRead(userId);

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
};

export const deleteNotification = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    await notificationService.deleteNotification(id, userId);

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
};

export const getUnreadCount = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const { unreadCount } = await notificationService.getUserNotifications(userId, 1);

    res.status(200).json({ unreadCount });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
};
