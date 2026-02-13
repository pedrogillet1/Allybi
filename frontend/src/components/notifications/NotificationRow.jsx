import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import chevronLeftIcon from '../../assets/chevron-left.svg';
import { looksLikeTranslationKey } from '../../utils/notifications/legacyNotificationMapper';
import { throttledWarn } from '../../utils/logging/throttledLogger';

// Notification icons
import notificationCheckmark from '../../assets/notification-checkmark.svg';
import notificationEye from '../../assets/notification-eye.svg';
import notificationBell from '../../assets/notification-bell.svg';
import notificationUpload from '../../assets/upload.svg';
import notificationCancel from '../../assets/notification-cancel.svg';
import notificationTrash from '../../assets/notification-trash.svg';
import notificationMove from '../../assets/notification-move.svg';
import notificationStorage from '../../assets/notification-storage.svg';

/**
 * NotificationRow - Single notification in the center popup
 * Icon, title, text, timestamp
 * Unread badge/accent
 * Click to mark as read + navigate
 * Delete functionality with hover
 */
const NotificationRow = ({ notification, onMarkAsRead, onDelete }) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = React.useState(false);

  // Format timestamp with i18n
  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('notifications.justNow');
    if (diffMins < 60) return t('notifications.minutesAgo', { count: diffMins });
    if (diffHours < 24) return t('notifications.hoursAgo', { count: diffHours });
    if (diffDays < 7) return t('notifications.daysAgo', { count: diffDays });

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  /**
   * Smart text resolver with priority:
   * 1. If titleKey exists → t(titleKey, vars)
   * 2. Else if title exists and looks like key → try t(title), fallback to generic
   * 3. Else render title as plain string
   */
  const resolveTitle = () => {
    const vars = notification.vars || {};

    // Priority 1: titleKey (modern approach)
    if (notification.titleKey) {
      const translated = t(notification.titleKey, vars);
      // If translation returned the key itself (missing), show fallback
      if (translated === notification.titleKey) {
        throttledWarn(`[NotificationRow] Missing translation for titleKey: ${notification.titleKey}`, 'i18n');
        return t('notifications.title'); // Generic fallback
      }
      return translated;
    }

    // Priority 2: title that looks like a key (legacy migration)
    if (notification.title && looksLikeTranslationKey(notification.title)) {
      const translated = t(notification.title, vars);
      // If translation fails, show generic fallback (don't render raw key)
      if (translated === notification.title) {
        throttledWarn(`[NotificationRow] Missing translation for title key: ${notification.title}`, 'i18n');
        return t('notifications.title'); // Generic fallback
      }
      return translated;
    }

    // Priority 3: Plain string title
    return notification.title || t('notifications.title');
  };

  /**
   * Smart message resolver (same logic as title)
   */
  const resolveMessage = () => {
    const vars = notification.vars || {};

    // Priority 1: messageKey
    if (notification.messageKey) {
      const translated = t(notification.messageKey, vars);
      if (translated === notification.messageKey) {
        return ''; // Don't show raw key
      }
      return translated;
    }

    // Priority 2: message that looks like a key
    if (notification.message && looksLikeTranslationKey(notification.message)) {
      const translated = t(notification.message, vars);
      if (translated === notification.message) {
        return ''; // Don't show raw key
      }
      return translated;
    }

    // Priority 3: Plain string or text property (legacy)
    return notification.message || notification.text || '';
  };

  /**
   * Determine icon and background color based on notification content
   * Priority: titleKey > title > eventKey > type fallback
   */
  const getNotificationIcon = () => {
    const titleKey = notification.titleKey || '';
    const title = notification.title || '';
    const eventKey = notification.eventKey || '';
    const content = `${titleKey} ${title} ${eventKey}`.toLowerCase();

    // Login Successful
    if (content.includes('login') && content.includes('success')) {
      return { icon: notificationCheckmark, bg: '#E8F5E9' }; // Light green
    }

    // Verification SMS/Email sent
    if (content.includes('verification') && (content.includes('sms') || content.includes('email')) && content.includes('sent')) {
      return { icon: notificationEye, bg: '#E3F2FD' }; // Light blue
    }

    // Phone number added
    if (content.includes('phone') && content.includes('added')) {
      return { icon: notificationBell, bg: '#F3E5F5' }; // Light purple
    }

    // Upload success
    if (content.includes('upload') && (content.includes('success') || content.includes('complete'))) {
      return { icon: notificationUpload, bg: '#E8F5E9' }; // Light green
    }

    // Upload failed
    if (content.includes('upload') && content.includes('fail')) {
      return { icon: notificationCancel, bg: '#FFEBEE' }; // Light red
    }

    // File already exists
    if (content.includes('already exist')) {
      return { icon: notificationCancel, bg: '#FFF3E0' }; // Light orange
    }

    // Document/Folder deleted
    if (content.includes('deleted')) {
      return { icon: notificationTrash, bg: '#FFEBEE' }; // Light red
    }

    // Document/Folder moved or renamed
    if (content.includes('moved') || content.includes('renamed')) {
      return { icon: notificationMove, bg: '#E3F2FD' }; // Light blue
    }

    // Storage warnings
    if (content.includes('storage')) {
      return { icon: notificationStorage, bg: '#FFF3E0' }; // Light orange
    }

    // Unsupported files, limited support, no text
    if (content.includes('unsupported') || content.includes('limited support') || content.includes('no text')) {
      return { icon: notificationCancel, bg: '#FFF3E0' }; // Light orange
    }

    // Rate limit / Too many requests
    if (content.includes('rate') || content.includes('too many')) {
      return { icon: notificationCancel, bg: '#FFEBEE' }; // Light red
    }

    // Error type fallback
    if (notification.type === 'error' || content.includes('fail') || content.includes('error')) {
      return { icon: notificationCancel, bg: '#FFEBEE' }; // Light red
    }

    // Warning type fallback
    if (notification.type === 'warning') {
      return { icon: notificationCancel, bg: '#FFF3E0' }; // Light orange
    }

    // Default: info icon (checkmark for success, eye for info)
    if (notification.type === 'success') {
      return { icon: notificationCheckmark, bg: '#E8F5E9' }; // Light green
    }

    // Default info
    return { icon: notificationEye, bg: '#E3F2FD' }; // Light blue
  };

  const iconData = getNotificationIcon();

  // Handle click
  const handleClick = (e) => {
    // Don't trigger if clicking delete button
    if (e.target.closest('[data-delete-button]')) {
      return;
    }

    onMarkAsRead(notification.id);
    if (notification.action?.type === 'navigate' && notification.action?.target) {
      navigate(notification.action.target);
    }
  };

  // Handle delete
  const handleDelete = (e) => {
    e.stopPropagation();
    if (onDelete) {
      onDelete(notification.id);
    }
  };

  // Check if notification is navigable
  const isNavigable = notification.action?.type === 'navigate' && notification.action?.target;

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        cursor: 'pointer',
        background: notification.isRead ? 'white' : '#FAFAFA',
        borderBottom: '1px solid #E6E6EC',
        transition: 'background 0.15s ease',
        position: 'relative'
      }}
    >
      {/* Unread indicator */}
      {!notification.isRead && (
        <div style={{
          position: 'absolute',
          left: 6,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: '#3B82F6'
        }} />
      )}

      {/* Icon */}
      <div style={{
        width: 32,
        height: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        marginLeft: 8
      }}>
        <img
          src={iconData.icon}
          alt=""
          style={{
            width: 32,
            height: 32,
            filter: 'brightness(0) saturate(100%) invert(32%) sepia(9%) saturate(759%) hue-rotate(182deg) brightness(96%) contrast(89%)'
          }}
        />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          color: '#171717',
          fontSize: 14,
          fontFamily: 'Plus Jakarta Sans',
          fontWeight: notification.isRead ? '500' : '600',
          lineHeight: '20px',
          marginBottom: 2
        }}>
          {resolveTitle()}
        </div>
        {resolveMessage() && (
          <div style={{
            color: '#6C6B6E',
            fontSize: 13,
            fontFamily: 'Plus Jakarta Sans',
            fontWeight: '400',
            lineHeight: '18px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {resolveMessage()}
          </div>
        )}
      </div>

      {/* Right side: Timestamp + Chevron/Delete */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
        minWidth: 'fit-content' // Prevent timestamp from wrapping
      }}>
        {/* Timestamp */}
        <div style={{
          color: '#9CA3AF',
          fontSize: 12,
          fontFamily: 'Plus Jakarta Sans',
          fontWeight: '400',
          whiteSpace: 'nowrap'
        }}>
          {formatTimestamp(notification.timestamp)}
        </div>

        {/* Icon slot - fixed width to prevent layout shift */}
        <div style={{
          width: 28,
          height: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          {/* Navigable chevron or Delete button */}
          {isHovered && onDelete ? (
            <button
              data-delete-button
              onClick={handleDelete}
              aria-label="Delete notification"
              style={{
                width: 28,
                height: 28,
                padding: 0,
                background: 'transparent',
                border: 'none',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'background 0.15s ease, color 0.15s ease',
                color: '#9CA3AF'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#FEE2E2';
                e.currentTarget.style.color = '#DC2626';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#9CA3AF';
              }}
            >
              <Trash2 size={14} />
            </button>
          ) : isNavigable ? (
            <div style={{
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <img
                src={chevronLeftIcon}
                alt=""
                style={{ width: 16, height: 16, filter: 'brightness(0) invert(0.2)' }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default NotificationRow;
