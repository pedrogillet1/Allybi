import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { colors, spacing, radius, typography, transitions } from '../../constants/designTokens';
import { useIsMobile } from '../../hooks/useIsMobile';

/**
 * Canonical Modal Component
 * Replaces all 17+ modal implementations with a single consistent component
 *
 * Mobile improvements:
 * - Renders in a portal at document.body to avoid stacking context issues
 * - Proper z-index layering (above bottom nav and floating buttons)
 * - Body scroll lock when open
 * - Close button always visible (not clipped)
 * - Native-feel animations
 *
 * @param {boolean} isOpen - Whether the modal is visible
 * @param {function} onClose - Function to call when modal should close
 * @param {string} title - Modal title text
 * @param {React.ReactNode} children - Modal content
 * @param {Array} actions - Array of action buttons [{label, onClick, variant}]
 * @param {number} maxWidth - Maximum width of modal (default: 400)
 * @param {boolean} showCloseButton - Whether to show the close button (default: true)
 */
export default function Modal({
  isOpen,
  onClose,
  title,
  header = null,
  children,
  actions = [],
  maxWidth = 400,
  showCloseButton = true,
  backdrop = 'dim', // 'dim' | 'blur' | 'none'
  placement = 'auto', // 'auto' | 'center' | 'bottom'
  contentPadding = 'default', // 'default' | 'none'
}) {
  const isMobile = useIsMobile();
  const [isExiting, setIsExiting] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  // Handle escape key and body scroll lock
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      setShouldRender(true);
      setIsExiting(false);
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
      // Add class for CSS-based interactions blocking
      document.body.classList.add('modal-open');
    } else if (shouldRender) {
      // Trigger exit animation
      setIsExiting(true);
      const timer = setTimeout(() => {
        setShouldRender(false);
        setIsExiting(false);
      }, 200); // Match animation duration
      return () => clearTimeout(timer);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
      document.body.classList.remove('modal-open');
    };
  }, [isOpen, onClose, shouldRender]);

  if (!shouldRender) return null;

  // Animation styles
  const backdropAnimation = isExiting ? 'modalBackdropExit' : 'modalBackdropEnter';
  const contentAnimation = isExiting ? 'modalContentExit' : 'modalContentEnter';
  const overlayBg = backdrop === 'none' ? 'transparent' : colors.overlay;
  const overlayFilter = backdrop === 'blur' ? 'blur(6px)' : undefined;
  const alignItems =
    placement === 'center'
      ? 'center'
      : placement === 'bottom'
        ? 'flex-end'
        : isMobile
          ? 'flex-end'
          : 'center';

  // Use portal to render at document body level (avoids stacking context issues)
  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      data-modal-backdrop="true"
      data-entering={!isExiting}
      data-exiting={isExiting}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
        background: overlayBg,
        backdropFilter: overlayFilter,
        WebkitBackdropFilter: overlayFilter,
        display: 'flex',
        justifyContent: 'center',
        alignItems,
        zIndex: 10000, // High z-index to be above everything
        animation: `${backdropAnimation} 0.2s ease-out forwards`,
        padding: isMobile ? 0 : spacing.lg,
        boxSizing: 'border-box',
      }}
      onClick={onClose}
    >
      <div
        data-modal-content="true"
        style={{
          width: '100%',
          maxWidth: isMobile ? '100%' : maxWidth,
          margin: 0,
          maxHeight: isMobile
            ? 'calc(var(--app-height, 100dvh) - 24px - env(safe-area-inset-top, 0px))'
            : '85vh',
          background: colors.white,
          borderRadius: isMobile ? '20px 20px 0 0' : radius.xl,
          border: `1px solid ${colors.gray[300]}`,
          display: 'flex',
          flexDirection: 'column',
          gap: header ? 0 : spacing.lg,
          paddingTop: header ? 0 : spacing.lg,
          // When embedding a full-bleed child (like FolderPreview in email attachments),
          // avoid extra bottom whitespace so the embedded UI matches its standalone layout.
          paddingBottom:
            contentPadding === 'none'
              ? 0
              : isMobile
                ? `calc(${spacing.lg}px + env(safe-area-inset-bottom, 0px))`
                : spacing.lg,
          animation: `${contentAnimation} 0.25s cubic-bezier(0.32, 0.72, 0, 1) forwards`,
          boxShadow: '0 -8px 24px rgba(0, 0, 0, 0.12)',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {header ? (
          header
        ) : (
          /* Header */
          <div
            style={{
              alignSelf: 'stretch',
              paddingLeft: spacing.lg,
              paddingRight: spacing.lg,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              position: 'sticky',
              top: 0,
              background: colors.white,
              zIndex: 1,
            }}
          >
            {/* Left spacer for centering title */}
            <div style={{ width: 44, height: 44, opacity: showCloseButton ? 1 : 0 }} />

            {/* Title */}
            <div
              style={{
                flex: 1,
                textAlign: 'center',
                color: colors.gray[900],
                fontSize: typography.sizes.lg,
                fontFamily: typography.fontFamily,
                fontWeight: typography.weights.bold,
                lineHeight: typography.lineHeights.lg,
              }}
            >
              {title}
            </div>

            {/* Close button - larger touch target for mobile */}
            {showCloseButton && (
              <button
                onClick={onClose}
                aria-label="Close"
                data-modal-close="true"
                style={{
                  width: 44,
                  height: 44,
                  minWidth: 44,
                  minHeight: 44,
                  padding: 0,
                  background: colors.white,
                  border: `1px solid ${colors.gray[300]}`,
                  borderRadius: '50%',
                  cursor: 'pointer',
                  fontSize: 20,
                  color: colors.gray[600],
                  transition: transitions.normal,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 1,
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = colors.gray[100])}
                onMouseLeave={(e) => (e.currentTarget.style.background = colors.white)}
              >
                ×
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div
          style={{
            paddingLeft: contentPadding === 'none' ? 0 : spacing.lg,
            paddingRight: contentPadding === 'none' ? 0 : spacing.lg,
            paddingTop: contentPadding === 'none' ? 0 : (header ? spacing.lg : 0),
            flex: 1,
            overflowY: 'auto',
          }}
        >
          {children}
        </div>

        {/* Actions - centered with pill-shaped buttons */}
        {actions.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: spacing.md,
              justifyContent: 'center',
              paddingLeft: spacing.lg,
              paddingRight: spacing.lg,
              flexShrink: 0,
            }}
          >
            {actions.map((action, idx) => {
              const isDanger = action.variant === 'danger';
              const isSecondary = action.variant === 'secondary' || action.variant === 'cancel';

              let bgColor = colors.primary;
              let hoverColor = colors.primaryDark;
              let textColor = colors.white;
              let border = 'none';

              if (isDanger) {
                bgColor = colors.error;
                hoverColor = '#B82415';
              } else if (isSecondary) {
                bgColor = '#F5F5F5';
                hoverColor = '#ECECEC';
                textColor = colors.gray[900];
                border = `1px solid ${colors.gray[300]}`;
              }

              return (
                <button
                  key={idx}
                  onClick={action.onClick}
                  disabled={action.disabled}
                  style={{
                    flex: 1,
                    height: 52,
                    minHeight: 44,
                    padding: `${spacing.md}px ${spacing.lg}px`,
                    background: bgColor,
                    color: textColor,
                    border: border,
                    borderRadius: 100,
                    cursor: action.disabled ? 'not-allowed' : 'pointer',
                    fontSize: typography.sizes.md,
                    fontFamily: typography.fontFamily,
                    fontWeight: typography.weights.bold,
                    transition: transitions.normal,
                    opacity: action.disabled ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!action.disabled) {
                      e.currentTarget.style.background = hoverColor;
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = bgColor;
                  }}
                >
                  {action.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes modalBackdropEnter {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modalBackdropExit {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes modalContentEnter {
          from {
            opacity: 0;
            transform: translateY(${isMobile ? '100%' : '20px'}) scale(${isMobile ? 1 : 0.95});
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes modalContentExit {
          from {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
          to {
            opacity: 0;
            transform: translateY(${isMobile ? '100%' : '20px'}) scale(${isMobile ? 1 : 0.95});
          }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-modal-backdrop="true"],
          [data-modal-content="true"] {
            animation-duration: 0.01ms !important;
          }
        }
      `}</style>
    </div>
  );

  // Render in portal at document.body
  return createPortal(modalContent, document.body);
}
