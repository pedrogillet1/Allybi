import React, { useEffect, useState, useRef } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { colors, spacing, radius, zIndex, typography, transitions } from '../../constants/designTokens';

/**
 * Unified Toast Component - Koda Canonical Notification System
 *
 * Single notification design used across the entire app.
 * Matches Koda design identity: #181818 background, Plus Jakarta Sans, top-center positioning.
 *
 * Design Specifications:
 * - Position: Fixed top-center, 20px from top
 * - Background: #181818
 * - Text: #FFFFFF
 * - Font: Plus Jakarta Sans (14px/20px body, 12px/16px details)
 * - Border-radius: 14px
 * - Status colors: Success #34A853, Error #D92D20, Warning #FBBC04, Info #4285F4
 * - Auto-dismiss: success 5s, error 8s, warning 7s, info 5s, sticky mode duration=0
 * - Exit animation: 200ms fade + slide
 *
 * @param {object} notification - Notification object
 * @param {string} notification.id - Unique notification ID
 * @param {string} notification.type - 'success' | 'error' | 'warning' | 'info'
 * @param {string} notification.title - Main notification message
 * @param {string} notification.message - Optional details text
 * @param {number} notification.duration - Auto-dismiss duration in ms (0 = sticky, no auto-dismiss)
 * @param {object} notification.action - Optional action button {label, onClick}
 * @param {function} onDismiss - Callback when toast is dismissed
 */
export default function UnifiedToast({ notification, onDismiss }) {
  const [isVisible, setIsVisible] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const timerRef = useRef(null);
  const startTimeRef = useRef(Date.now());
  const remainingTimeRef = useRef(notification.duration || 0);

  const {
    id,
    type = 'info',
    title,
    message,
    duration = getDurationForType(type),
    action,
  } = notification;

  // Get default duration based on type
  function getDurationForType(type) {
    const durations = {
      success: 5000,
      error: 8000,
      warning: 7000,
      info: 5000,
    };
    return durations[type] || 5000;
  }

  // Auto-dismiss logic with pause on hover
  useEffect(() => {
    if (duration === 0) return; // Sticky mode - no auto-dismiss

    const startTimer = () => {
      startTimeRef.current = Date.now();
      timerRef.current = setTimeout(() => {
        handleClose();
      }, remainingTimeRef.current);
    };

    const pauseTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        const elapsed = Date.now() - startTimeRef.current;
        remainingTimeRef.current = Math.max(0, remainingTimeRef.current - elapsed);
      }
    };

    if (isHovered) {
      pauseTimer();
    } else {
      startTimer();
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [duration, isHovered]);

  // ✅ ACCESSIBILITY: Keyboard support (Escape key to close)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleClose = () => {
    setIsVisible(false);
    // Wait for exit animation before calling onDismiss
    setTimeout(() => {
      if (onDismiss) {
        onDismiss(id);
      }
    }, 200);
  };

  const handleActionClick = () => {
    if (action?.onClick) {
      action.onClick();
    }
    // Don't auto-close - let action handler decide
  };

  // Type-specific styling
  const typeConfig = {
    success: {
      icon: CheckCircle,
      iconColor: colors.success,
      iconBg: colors.success,
    },
    error: {
      icon: XCircle,
      iconColor: colors.error,
      iconBg: colors.error,
    },
    warning: {
      icon: AlertTriangle,
      iconColor: colors.warning,
      iconBg: colors.warning,
    },
    info: {
      icon: Info,
      iconColor: '#4285F4', // Info blue
      iconBg: '#4285F4',
    },
  };

  const config = typeConfig[type] || typeConfig.info;
  const IconComponent = config.icon;

  return (
    <div
      role="alert"
      aria-live="polite"
      aria-atomic="true"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: '100%',
        opacity: isVisible ? 1 : 0,
        transform: `translateY(${isVisible ? 0 : -20}px)`,
        transition: `opacity ${transitions.normal}, transform ${transitions.normal}`,
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          width: '100%',
          padding: `${spacing.md}px ${spacing.lg}px`,
          background: colors.primary,
          borderRadius: radius.xl,
          display: 'flex',
          alignItems: message ? 'flex-start' : 'center',
          gap: spacing.md,
          fontFamily: typography.fontFamily,
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          position: 'relative',
        }}
      >
        {/* Status Icon */}
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: radius.full,
            backgroundColor: config.iconBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <IconComponent size={14} color={colors.white} strokeWidth={3} />
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title */}
          <div
            style={{
              color: colors.white,
              fontSize: typography.sizes.sm,
              lineHeight: typography.lineHeights.sm,
              fontWeight: typography.weights.medium,
              marginBottom: message ? spacing.xs : 0,
            }}
          >
            {title}
          </div>

          {/* Details/Message */}
          {message && (
            <div
              style={{
                color: colors.white,
                fontSize: typography.sizes.xs,
                lineHeight: '16px',
                opacity: 0.8,
                marginTop: spacing.xs,
              }}
            >
              {message}
            </div>
          )}
        </div>

        {/* Action Button */}
        {action && (
          <button
            onClick={handleActionClick}
            aria-label={action.label}
            style={{
              padding: `${spacing.xs}px ${spacing.md}px`,
              background: 'rgba(255, 255, 255, 0.15)',
              border: 'none',
              borderRadius: radius.md,
              color: colors.white,
              fontSize: typography.sizes.xs,
              fontWeight: typography.weights.semibold,
              fontFamily: typography.fontFamily,
              cursor: 'pointer',
              transition: transitions.fast,
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
            }}
          >
            {action.label}
          </button>
        )}

        {/* Close Button */}
        <button
          onClick={handleClose}
          aria-label="Close notification"
          style={{
            width: 20,
            height: 20,
            padding: 0,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: colors.white,
            opacity: 0.6,
            transition: transitions.fast,
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '1';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '0.6';
          }}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
