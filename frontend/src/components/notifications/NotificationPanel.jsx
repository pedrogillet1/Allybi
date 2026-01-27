import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ReactComponent as BellIcon } from '../../assets/Bell-1.svg';
import { ReactComponent as CheckDoubleIcon } from '../../assets/check-double_svgrepo.com.svg';
import { useNotifications } from '../../context/NotificationsStore';
import NotificationRow from './NotificationRow';
import { notificationDeletionBatcher } from '../../utils/notificationDeletionBatcher';

/**
 * NotificationPanel - Central notification popup
 * Shows all notifications with filtering tabs
 * Integrates with NotificationsStore for real data
 */
const NotificationPanel = ({ showNotificationsPopup, setShowNotificationsPopup }) => {
  const { t } = useTranslation();
  const {
    notifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    unreadCount,
    showSuccess,
    addNotification
  } = useNotifications();
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'unread', 'read'

  // Ref to track current batch toast ID (for preventing duplicates)
  const currentBatchToastIdRef = useRef(null);
  // Ref to store deleted notifications for batch undo
  const deletedBatchRef = useRef(null);

  // Handle batch undo - restore ALL notifications in the batch
  // IMPORTANT: This must be defined BEFORE useEffect that uses it, and before any early returns
  const handleBatchUndo = useCallback((batchPayload) => {
    if (!batchPayload?.notifications) return;

    // Restore all notifications in the batch
    batchPayload.notifications.forEach(notification => {
      addNotification({
        ...notification,
        skipToast: true, // Don't show toast for restored notifications
        timestamp: notification.timestamp // Keep original timestamp
      });
    });

    // Clear batch reference
    deletedBatchRef.current = null;
  }, [addNotification]);

  // Configure the batcher with callbacks
  useEffect(() => {
    notificationDeletionBatcher.configure({
      // Called when batch is ready - notifications already deleted individually
      onBatchReady: (ids, notificationsData) => {
        // Store for undo
        deletedBatchRef.current = { ids, notifications: notificationsData };
      },
      // Called to show aggregated toast
      onShowToast: (count, batchPayload) => {
        // Generate unique toast ID for this batch
        const toastId = `delete-batch-${batchPayload.batchId}`;
        currentBatchToastIdRef.current = toastId;

        // Store batch payload for undo
        deletedBatchRef.current = batchPayload;

        // Show single aggregated toast
        addNotification({
          id: toastId,
          type: 'info',
          titleKey: count === 1 ? 'notifications.deleted' : 'notifications.deletedMultiple',
          vars: { count },
          duration: 5000,
          action: {
            label: t('common.undo'),
            onClick: () => handleBatchUndo(batchPayload)
          },
          skipToast: false,
          meta: {
            scope: 'system',
            source: 'notificationPanel',
            batchId: batchPayload.batchId
          }
        });
      }
    });

    // Cleanup on unmount - cancel any pending batch
    return () => {
      notificationDeletionBatcher.cancel();
    };
  }, [t, addNotification, handleBatchUndo]);

  if (!showNotificationsPopup) return null;

  // Filter notifications based on active tab
  const filteredNotifications = notifications.filter(n => {
    if (activeTab === 'unread') return !n.isRead;
    if (activeTab === 'read') return n.isRead;
    return true;
  });

  // Count for tabs
  const readCount = notifications.filter(n => n.isRead).length;

  // Handle notification delete with batching (Google Drive-style aggregation)
  const handleDelete = (notificationId) => {
    const notification = notifications.find(n => n.id === notificationId);
    if (!notification) return;

    // Delete from store immediately (optimistic)
    deleteNotification(notificationId);

    // Queue for batched toast (2000ms aggregation window)
    notificationDeletionBatcher.queueDelete(notificationId, notification);
  };

  // Handle clear read notifications
  const handleClearRead = () => {
    const readNotifications = notifications.filter(n => n.isRead);
    if (readNotifications.length === 0) return;

    // Delete all read notifications
    readNotifications.forEach(n => deleteNotification(n.id));

    // Show confirmation toast
    showSuccess(t('notifications.readCleared', { count: readNotifications.length }));
  };

  // Handle mark all as read
  const handleMarkAllAsRead = () => {
    if (unreadCount === 0) return;
    markAllAsRead();
    showSuccess(t('notifications.allMarkedRead'));
  };

  // Tab button component
  const TabButton = ({ tab, label, count }) => {
    const isActive = activeTab === tab;
    return (
      <div
        onClick={() => setActiveTab(tab)}
        style={{
          height: 36,
          paddingLeft: isActive ? 18 : 12,
          paddingRight: isActive ? 18 : 12,
          paddingTop: 10,
          paddingBottom: 10,
          background: isActive ? '#F5F5F5' : 'transparent',
          borderRadius: 100,
          outline: isActive ? '1px #E6E6EC solid' : 'none',
          outlineOffset: '-1px',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 8,
          display: 'flex',
          cursor: 'pointer',
          transition: 'all 0.15s ease'
        }}
        onMouseEnter={(e) => {
          if (!isActive) e.currentTarget.style.background = '#F9F9F9';
        }}
        onMouseLeave={(e) => {
          if (!isActive) e.currentTarget.style.background = 'transparent';
        }}
      >
        <div style={{
          color: isActive ? '#32302C' : '#6C6B6E',
          fontSize: 14,
          fontFamily: 'Plus Jakarta Sans',
          fontWeight: '600',
          lineHeight: '19.60px'
        }}>
          {label}{count !== undefined ? ` (${count})` : ''}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Dark Overlay */}
      <div
        onClick={() => setShowNotificationsPopup(false)}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'linear-gradient(180deg, rgba(17, 19, 21, 0.50) 0%, rgba(17, 19, 21, 0.90) 100%)',
          zIndex: 999
        }}
      />

      {/* Notifications Panel */}
      <div style={{
        width: 440,
        height: 824,
        maxHeight: 'calc(100vh - 100px)',
        position: 'fixed',
        left: 84,
        top: 68,
        background: 'white',
        borderRadius: 14,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)'
      }}>
        {/* Header with tabs and mark all read button */}
        <div style={{
          padding: '24px 20px 16px 20px',
          borderBottom: '1px solid #E6E6EC',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10
        }}>
          <div style={{
            flex: '1 1 0',
            justifyContent: 'flex-start',
            alignItems: 'center',
            gap: 8,
            display: 'flex'
          }}>
            <TabButton tab="all" label={t('notifications.all')} count={notifications.length} />
            <TabButton tab="unread" label={t('notifications.unread')} count={unreadCount} />
            <TabButton tab="read" label={t('notifications.read')} count={readCount} />
          </div>

          {/* Mark all as read button */}
          <div
            onClick={handleMarkAllAsRead}
            title={t('notifications.markAllRead')}
            style={{
              width: 44,
              height: 44,
              padding: 8,
              background: unreadCount > 0 ? '#171717' : '#E6E6EC',
              borderRadius: 100,
              justifyContent: 'center',
              alignItems: 'center',
              display: 'flex',
              cursor: unreadCount > 0 ? 'pointer' : 'default',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              if (unreadCount > 0) e.currentTarget.style.background = '#2D2D2D';
            }}
            onMouseLeave={(e) => {
              if (unreadCount > 0) e.currentTarget.style.background = '#171717';
              else e.currentTarget.style.background = '#E6E6EC';
            }}
          >
            <CheckDoubleIcon style={{ width: 20, height: 20, filter: unreadCount > 0 ? 'none' : 'invert(1)' }} />
          </div>
        </div>

        {/* Notification list or empty state */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {filteredNotifications.length > 0 ? (
            // Notification rows
            filteredNotifications.map(notification => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                onMarkAsRead={markAsRead}
                onDelete={handleDelete}
              />
            ))
          ) : (
            // Empty state
            <div style={{
              flex: 1,
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 16,
              display: 'flex',
              padding: 32
            }}>
              <BellIcon style={{ width: 64, height: 64, opacity: 0.3 }} />
              <div style={{
                color: '#6C6B6E',
                fontSize: 16,
                fontFamily: 'Plus Jakarta Sans',
                fontWeight: '600',
                textAlign: 'center'
              }}>
                {activeTab === 'all' ? t('notifications.noNotifications') :
                 activeTab === 'unread' ? t('notifications.noUnreadNotifications') :
                 t('notifications.noReadNotifications')}
              </div>
              <div style={{
                color: '#B9B9B9',
                fontSize: 14,
                fontFamily: 'Plus Jakarta Sans',
                fontWeight: '500',
                textAlign: 'center',
                maxWidth: 300
              }}>
                {activeTab === 'all'
                  ? t('notifications.noNotificationsSubtitle')
                  : activeTab === 'unread'
                  ? t('notifications.noUnreadSubtitle')
                  : t('notifications.noReadSubtitle')}
              </div>
            </div>
          )}
        </div>

        {/* Bottom actions: Clear read + Close */}
        <div style={{
          padding: '16px 20px',
          borderTop: '1px solid #E6E6EC',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12
        }}>
          {/* Clear read button (only show when there are read notifications) */}
          {readCount > 0 && (
            <button
              onClick={handleClearRead}
              style={{
                padding: '12px 20px',
                background: 'transparent',
                border: '1px solid #E6E6EC',
                borderRadius: 12,
                color: '#6C6B6E',
                fontSize: 14,
                fontFamily: 'Plus Jakarta Sans',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#F5F5F5';
                e.currentTarget.style.color = '#171717';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#6C6B6E';
              }}
            >
              {t('notifications.clearRead')}
            </button>
          )}

          {/* Close button */}
          <button
            onClick={() => setShowNotificationsPopup(false)}
            style={{
              flex: readCount > 0 ? 'none' : 1,
              padding: '12px 32px',
              background: '#F5F5F5',
              border: '1px solid #E6E6EC',
              borderRadius: 12,
              color: '#171717',
              fontSize: 14,
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#ECECEF'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#F5F5F5'}
          >
            {t('notifications.close')}
          </button>
        </div>
      </div>
    </>
  );
};

export default NotificationPanel;
