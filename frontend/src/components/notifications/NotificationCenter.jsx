import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

const NotificationCenter = () => {
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 50, bottom: 'auto' });
  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch notifications
  const fetchNotifications = async () => {
    try {
      setIsLoading(true);
      const response = await axios.get('/api/notifications', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      setNotifications(response.data.notifications);
      setUnreadCount(response.data.unreadCount);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch notifications on mount and every 30 seconds
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  // Mark notification as read
  const markAsRead = async (notificationId) => {
    try {
      await axios.post(
        `/api/notifications/${notificationId}/read`,
        {},
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );
      fetchNotifications();
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    try {
      await axios.post(
        '/api/notifications/mark-all-read',
        {},
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );
      fetchNotifications();
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  // Get notification icon
  const getNotificationIcon = (type) => {
    const icons = {
      reminder: '⏰',
      system: 'ℹ️',
      document_shared: '📄',
      storage_warning: '⚠️',
    };
    return icons[type] || '🔔';
  };

  // Format time ago
  const formatTimeAgo = (timestamp) => {
    const now = new Date();
    const date = new Date(timestamp);
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return t('notifications.justNow');
    if (seconds < 3600) return t('notifications.minutesAgo', { count: Math.floor(seconds / 60) });
    if (seconds < 86400) return t('notifications.hoursAgo', { count: Math.floor(seconds / 3600) });
    if (seconds < 604800) return t('notifications.daysAgo', { count: Math.floor(seconds / 86400) });
    return date.toLocaleDateString();
  };

  // Calculate dropdown position based on viewport
  const calculateDropdownPosition = () => {
    if (!buttonRef.current) return;

    const buttonRect = buttonRef.current.getBoundingClientRect();
    const dropdownHeight = 500; // maxHeight of dropdown
    const spaceBelow = window.innerHeight - buttonRect.bottom;
    const spaceAbove = buttonRect.top;

    // If not enough space below, but enough space above, open upward
    if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
      setDropdownPosition({
        bottom: window.innerHeight - buttonRect.top + 10,
        top: 'auto'
      });
    } else {
      // Default: open downward
      setDropdownPosition({
        top: 50,
        bottom: 'auto'
      });
    }
  };

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      {/* Notification Bell Button */}
      <button
        ref={buttonRef}
        onClick={() => {
          if (!isOpen) {
            calculateDropdownPosition();
            fetchNotifications();
          }
          setIsOpen(!isOpen);
        }}
        style={{
          position: 'relative',
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: '1px solid #E6E6EC',
          background: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#F5F5F5')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
      >
        <span style={{ fontSize: 20 }}>🔔</span>
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              background: '#FF4444',
              color: 'white',
              borderRadius: '50%',
              width: 18,
              height: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: '600',
              fontFamily: 'Plus Jakarta Sans',
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: dropdownPosition.top,
            bottom: dropdownPosition.bottom,
            right: 0,
            width: 380,
            maxHeight: 500,
            background: 'white',
            borderRadius: 16,
            border: '1px solid #E6E6EC',
            boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.12)',
            zIndex: 1000,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid #E6E6EC',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: '600',
                color: '#323232',
                fontFamily: 'Plus Jakarta Sans',
              }}
            >
              {t('notifications.title')}
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#666',
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '500',
                }}
              >
                {t('notifications.markAllRead')}
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              maxHeight: 400,
            }}
          >
            {isLoading ? (
              <div
                style={{
                  padding: 40,
                  textAlign: 'center',
                  color: '#999',
                  fontFamily: 'Plus Jakarta Sans',
                }}
              >
                {t('common.loading')}
              </div>
            ) : notifications.length === 0 ? (
              <div
                style={{
                  padding: 40,
                  textAlign: 'center',
                  color: '#999',
                  fontFamily: 'Plus Jakarta Sans',
                }}
              >
                <div style={{ fontSize: 40, marginBottom: 12 }}>🔔</div>
                <div>{t('notifications.noNotifications')}</div>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => !notification.isRead && markAsRead(notification.id)}
                  style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid #F5F5F5',
                    cursor: notification.isRead ? 'default' : 'pointer',
                    background: notification.isRead ? 'white' : '#F9F9FB',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) =>
                    !notification.isRead && (e.currentTarget.style.background = '#F5F5F5')
                  }
                  onMouseLeave={(e) =>
                    !notification.isRead && (e.currentTarget.style.background = '#F9F9FB')
                  }
                >
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ fontSize: 24, flexShrink: 0 }}>
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: notification.isRead ? '500' : '600',
                          color: '#323232',
                          marginBottom: 4,
                          fontFamily: 'Plus Jakarta Sans',
                        }}
                      >
                        {notification.title}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: '#666',
                          marginBottom: 8,
                          lineHeight: '1.4',
                          fontFamily: 'Plus Jakarta Sans',
                        }}
                      >
                        {notification.message}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: '#999',
                          fontFamily: 'Plus Jakarta Sans',
                        }}
                      >
                        {formatTimeAgo(notification.createdAt)}
                      </div>
                    </div>
                    {!notification.isRead && (
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: '#4A90E2',
                          flexShrink: 0,
                          marginTop: 6,
                        }}
                      />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
