import React, { useEffect, useMemo, useState } from 'react';
import closeIcon from '../../assets/x-close.svg';
import { createPortal } from 'react-dom';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAuthModal } from '../../context/AuthModalContext';

/**
 * Auth modal chrome. Intentionally minimal so existing auth screens keep
 * their current look; we just constrain them into a modal panel.
 */
export default function AuthModalShell({ children, isVisible }) {
  const isMobile = useIsMobile();
  const { dismiss } = useAuthModal();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Body scroll lock + escape to dismiss
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && isVisible) dismiss();
    };

    if (isVisible) {
      document.addEventListener('keydown', onKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [dismiss, isVisible]);

  const panelStyle = useMemo(() => ({
    width: isMobile ? 'calc(100% - 16px)' : '100%',
    maxWidth: isMobile ? '100%' : 520,
    maxHeight: isMobile ? 'calc(var(--app-height, 100dvh) - 16px)' : '90vh',
    background: '#FFFFFF',
    borderRadius: 20,
    boxShadow: '0 24px 72px rgba(0, 0, 0, 0.20)',
    overflow: 'hidden',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
  }), [isMobile]);

  if (!mounted || !isVisible) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        width: '100%',
        height: isMobile ? 'var(--app-height, 100dvh)' : '100%',
        background: 'rgba(17, 19, 21, 0.55)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: isMobile ? '8px 0' : 20,
        boxSizing: 'border-box',
        zIndex: 12000,
        transition: isMobile ? 'height 200ms ease' : 'none',
      }}
      onMouseDown={() => dismiss()}
    >
      <div
        style={panelStyle}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Close button floats above content to avoid changing existing layouts */}
        <button
          onClick={() => dismiss()}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 36,
            height: 36,
            borderRadius: 999,
            background: 'rgba(255, 255, 255, 0.95)',
            border: '1px solid #E6E6EC',
            cursor: 'pointer',
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            lineHeight: 1,
            color: '#32302C',
          }}
        >
          <img
            src={closeIcon}
            alt=""
            style={{ width: 16, height: 16 }}
          />
        </button>

        {/* Content scroll container */}
        <div
          style={{
            width: '100%',
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
