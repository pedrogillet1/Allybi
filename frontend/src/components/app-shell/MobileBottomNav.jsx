import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useAuthGate } from '../auth/ProtectedRoute';
import { useAuthModal, isAuthPathname } from '../../context/AuthModalContext';
import { TAB_CONFIG } from '../../config/tabConfig';

// Keep mobile nav icons aligned with desktop sidebar icon set.
import homeSidebarIcon from '../../assets/home-sidebar-icon.svg';
import uploadSidebarIcon from '../../assets/upload-sidebar-icon.svg';
import chatSidebarIcon from '../../assets/chat-sidebar-icon.svg';
import settingsSidebarIcon from '../../assets/settings-sidebar-icon.svg';

// Icon map for dynamic rendering
const ICON_MAP = {
  home: homeSidebarIcon,
  upload: uploadSidebarIcon,
  chat: chatSidebarIcon,
  settings: settingsSidebarIcon,
};

/**
 * Mobile Bottom Navigation Bar
 * Only renders on mobile devices (max-width: 768px)
 * Fixed at bottom of screen with safe area insets
 *
 * Now uses centralized TAB_CONFIG for consistency with swipe navigation
 */
const MobileBottomNav = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { triggerAuthGate, isUnauthenticated } = useAuthGate();
  const { backgroundLocation, isOpen: authModalOpen } = useAuthModal();
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  // Resolve path against auth background location when modal routes are active.
  const effectivePathname =
    (isAuthPathname(location.pathname) && backgroundLocation?.pathname)
      ? backgroundLocation.pathname
      : location.pathname;

  // Mobile Keyboard Detection: Hide nav when keyboard opens
  useEffect(() => {
    if (!isMobile) return;

    const handleFocusIn = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        setIsKeyboardOpen(true);
      }
    };

    const handleFocusOut = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        setTimeout(() => {
          const activeEl = document.activeElement;
          if (!activeEl || (activeEl.tagName !== 'INPUT' && activeEl.tagName !== 'TEXTAREA')) {
            setIsKeyboardOpen(false);
          }
        }, 100);
      }
    };

    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, [isMobile]);

  // Auth routes where bottom nav should be hidden — check actual URL, not
  // effectivePathname (which resolves to the background location on auth routes).
  const actualPath = location.pathname;
  const isAuthRoute = actualPath.startsWith('/a/') ||
                      actualPath.startsWith('/v/') ||
                      actualPath.startsWith('/r/') ||
                      actualPath.startsWith('/legal/');

  // Also hide when unauthenticated at root (renders UnifiedAuth inline)
  const isRootAuth = actualPath === '/' && isUnauthenticated;

  // Hide when mobile PDF viewer is open (class set by MobilePdfViewer)
  const [pdfOpen, setPdfOpen] = useState(false);
  useEffect(() => {
    const html = document.documentElement;
    const obs = new MutationObserver(() => {
      setPdfOpen(html.classList.contains('pdf-mobile-open'));
    });
    obs.observe(html, { attributes: true, attributeFilter: ['class'] });
    // Check initial state
    setPdfOpen(html.classList.contains('pdf-mobile-open'));
    return () => obs.disconnect();
  }, []);

  // Don't render on desktop, auth pages, auth modal open, or mobile PDF viewer
  if (!isMobile || isAuthRoute || isRootAuth || authModalOpen || pdfOpen) return null;

  // Check if current path matches any of the item's paths
  const isActive = (tabConfig) => {
    return tabConfig.matchPaths.some(path =>
      location.pathname === path || location.pathname.startsWith(path + '/')
    );
  };

  // Handle navigation with auth gate support
  const handleNavigate = (tabConfig) => {
    // If unauthenticated and tab requires auth gate, show gate
    if (isUnauthenticated && tabConfig.authGateFeature) {
      triggerAuthGate(tabConfig.authGateFeature);
      return;
    }

    navigate(tabConfig.path);
  };

  return (
    <nav
      className="mobile-bottom-nav"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        width: '100%',
        height: 'auto',
        backgroundColor: '#181818',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        zIndex: 20,
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingTop: '2px',
        transition: 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.25s ease-out',
        transform: isKeyboardOpen ? 'translateY(100%)' : 'translateY(0)',
        opacity: isKeyboardOpen ? 0 : 1,
        pointerEvents: isKeyboardOpen ? 'none' : 'auto',
      }}
    >
      {TAB_CONFIG.map((tabConfig) => {
        const active = isActive(tabConfig);
        const iconSrc = ICON_MAP[tabConfig.id];

        return (
          <div
            key={tabConfig.id}
            onClick={() => handleNavigate(tabConfig)}
            className={`mobile-bottom-nav-item ${active ? 'active' : ''}`}
            data-tab-id={tabConfig.id}
            data-tab-index={tabConfig.index}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '1px',
              padding: '2px 8px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              flex: 1
            }}
          >
            <div
              className="mobile-bottom-nav-item-icon"
              style={{
                width: active ? '30px' : 'auto',
                height: active ? '30px' : 'auto',
                borderRadius: active ? '50%' : '0',
                background: active ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.2s ease'
              }}
            >
              {iconSrc && (
                <img
                  src={iconSrc}
                  alt=""
                  aria-hidden="true"
                  style={{
                    width: '20px',
                    height: '20px',
                    objectFit: 'contain',
                    imageRendering: 'auto',
                    WebkitFontSmoothing: 'antialiased',
                  }}
                />
              )}
            </div>
            <span
              className="mobile-bottom-nav-item-label"
              style={{
                fontSize: '10px',
                fontWeight: '500',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                whiteSpace: 'nowrap',
                color: '#FFFFFF'
              }}
            >
              {t(tabConfig.labelKey)}
            </span>
          </div>
        );
      })}
    </nav>
  );
};

export default MobileBottomNav;
