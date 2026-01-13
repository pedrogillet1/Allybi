import React from 'react';
import UnifiedToast from './UnifiedToast';
import { spacing, zIndex } from '../../constants/designTokens';

/**
 * Toast Container - Manages stacking of multiple toasts
 *
 * - Fixed position at top-center (20px from top)
 * - Stacks toasts vertically with 12px gap
 * - Max 3 visible toasts (enforced in NotificationsStore)
 * - Z-index management for layering
 * - Responsive width: calc(100% - 40px), max 960px, min 400px (desktop)
 *
 * @param {Array} toasts - Array of toast notification objects
 * @param {function} onDismiss - Callback when a toast is dismissed
 */
export default function ToastContainer({ toasts = [], onDismiss }) {
  const TOAST_HEIGHT = 80; // Approximate height of toast + gap
  const TOAST_GAP = spacing.md; // 12px gap between toasts

  // Only show up to 3 toasts (should be enforced in store, but double-check here)
  const visibleToasts = toasts.slice(0, 3);

  return (
    <div
      style={{
        position: 'fixed',
        top: spacing.xl, // 20px from top
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 40px)',
        maxWidth: 960,
        minWidth: 400,
        zIndex: zIndex.toast,
        pointerEvents: 'none',
        // Responsive: on small screens, remove minWidth
      }}
    >
      <style>
        {`
          @media (max-width: 480px) {
            [data-toast-container] {
              min-width: 0 !important;
              width: calc(100% - 32px) !important;
            }
          }
        `}
      </style>
      <div data-toast-container>
        {visibleToasts.map((toast, index) => (
          <div
            key={toast.id}
            style={{
              position: 'absolute',
              top: index * (TOAST_HEIGHT + TOAST_GAP),
              left: 0,
              right: 0,
              zIndex: zIndex.toast - index, // Stack with decreasing z-index
              pointerEvents: 'auto',
            }}
          >
            <UnifiedToast notification={toast} onDismiss={onDismiss} />
          </div>
        ))}
      </div>
    </div>
  );
}
