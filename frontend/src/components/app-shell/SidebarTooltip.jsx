import React, { useState } from 'react';
import { typography } from '../design/tokens';

/**
 * Tooltip component for sidebar items in collapsed state
 *
 * Features:
 * - Shows on hover and keyboard focus
 * - Positioned to the right of the icon
 * - Accessible with ARIA attributes
 * - Smooth fade-in animation
 * - Debounced show/hide for better UX
 *
 * @param {Object} props
 * @param {string} props.text - Tooltip text to display
 * @param {React.ReactNode} props.children - Icon/button to attach tooltip to
 * @param {boolean} props.show - Whether to show tooltip (when sidebar is collapsed)
 */
const SidebarTooltip = ({ text, children, show }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [timeoutId, setTimeoutId] = useState(null);

  const handleMouseEnter = () => {
    if (!show) return;

    // Clear any existing timeout
    if (timeoutId) clearTimeout(timeoutId);

    // Show tooltip after 200ms delay (debounce)
    const id = setTimeout(() => {
      setIsVisible(true);
    }, 200);
    setTimeoutId(id);
  };

  const handleMouseLeave = () => {
    // Clear timeout and hide immediately
    if (timeoutId) clearTimeout(timeoutId);
    setIsVisible(false);
  };

  const handleFocus = () => {
    if (!show) return;
    setIsVisible(true);
  };

  const handleBlur = () => {
    setIsVisible(false);
  };

  return (
    <div
      style={{ position: 'relative', display: 'flex' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      {children}

      {/* Tooltip */}
      {isVisible && show && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            left: 'calc(100% + 12px)',
            top: '50%',
            transform: 'translateY(-50%)',
            background: '#32302C',
            color: 'white',
            padding: '6px 12px',
            borderRadius: 6,
            fontSize: typography.caption.size,
            fontWeight: typography.bodyStrong.weight,
            fontFamily: typography.body.family,
            whiteSpace: 'nowrap',
            zIndex: 1000,
            pointerEvents: 'none',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
            animation: 'tooltipFadeIn 0.15s ease-out',
          }}
        >
          {text}
          {/* Arrow pointing left */}
          <div
            style={{
              position: 'absolute',
              right: '100%',
              top: '50%',
              transform: 'translateY(-50%)',
              width: 0,
              height: 0,
              borderTop: '4px solid transparent',
              borderBottom: '4px solid transparent',
              borderRight: '4px solid #32302C',
            }}
          />
        </div>
      )}

      {/* CSS animation for tooltip */}
      <style>{`
        @keyframes tooltipFadeIn {
          from {
            opacity: 0;
            transform: translateY(-50%) translateX(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(-50%) translateX(0);
          }
        }
      `}</style>
    </div>
  );
};

export default SidebarTooltip;
