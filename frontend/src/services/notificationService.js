/**
 * NotificationService - localStorage-based notification storage
 * TODO: Wire to backend when notification API is implemented
 */

// Helper to get user ID
const getUserId = () => {
  try {
    const user = JSON.parse(localStorage.getItem('user'));
    return user?.id || 'anonymous';
  } catch {
    return 'anonymous';
  }
};

const getStorageKey = () => `koda_notifications_${getUserId()}`;

const readAll = () => {
  try {
    const stored = localStorage.getItem(getStorageKey());
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const writeAll = (notifications) => {
  localStorage.setItem(getStorageKey(), JSON.stringify(notifications));
};

// Fetch all notifications
export const fetchNotifications = async () => {
  return readAll();
};

// Mark a notification as read
export const markAsRead = async (notificationId) => {
  const all = readAll();
  const updated = all.map((n) =>
    n.id === notificationId ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
  );
  writeAll(updated);
  return true;
};

// Mark all notifications as read
export const markAllAsRead = async () => {
  const all = readAll();
  const now = new Date().toISOString();
  writeAll(all.map((n) => ({ ...n, isRead: true, readAt: n.readAt || now })));
  return true;
};

// Delete a notification
export const deleteNotification = async (notificationId) => {
  const all = readAll();
  writeAll(all.filter((n) => n.id !== notificationId));
  return true;
};

// Create a notification
export const createNotification = async (notification) => {
  const all = readAll();
  const entry = {
    id: notification.id || crypto.randomUUID(),
    ...notification,
    isRead: false,
    createdAt: new Date().toISOString(),
  };
  all.unshift(entry);
  writeAll(all);
  return entry;
};

export default {
  fetchNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  createNotification
};
