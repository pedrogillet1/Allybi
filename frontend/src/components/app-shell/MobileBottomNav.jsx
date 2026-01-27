import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '../hooks/useIsMobile';

// Import icons - outline only
import { ReactComponent as HouseIcon } from '../assets/House.svg';
import { ReactComponent as FolderIcon } from '../assets/Folder.svg';
import { ReactComponent as UploadIcon } from '../assets/Logout-white.svg';
import { ReactComponent as MessageIcon } from '../assets/Message circle.svg';
import { ReactComponent as SettingsIcon } from '../assets/Settings.svg';

/**
 * Mobile Bottom Navigation Bar
 * Only renders on mobile devices (max-width: 768px)
 * Fixed at bottom of screen with safe area insets
 */
const MobileBottomNav = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  // ✅ MOBILE KEYBOARD DETECTION: Hide nav when keyboard opens
  // Uses document-level focus/blur events with capture phase to detect ANY input focus
  useEffect(() => {
    if (!isMobile) return;

    const handleFocusIn = (e) => {
      // Check if the focused element is an input or textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        setIsKeyboardOpen(true);
      }
    };

    const handleFocusOut = (e) => {
      // Check if the blurred element is an input or textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        // Small delay to check if focus moved to another input
        setTimeout(() => {
          const activeEl = document.activeElement;
          if (!activeEl || (activeEl.tagName !== 'INPUT' && activeEl.tagName !== 'TEXTAREA')) {
            setIsKeyboardOpen(false);
          }
        }, 100);
      }
    };

    // Use focusin/focusout which bubble (unlike focus/blur)
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, [isMobile]);

  // Don't render on desktop or when keyboard is open
  if (!isMobile || isKeyboardOpen) return null;

  // Navigation items configuration - 5 items: Home, Documents, Upload, Chat, Settings
  // Using outline icons only (no filled variants)
  const navItems = [
    {
      id: 'home',
      path: '/home',
      label: t('nav.home'),
      icon: HouseIcon,
      matchPaths: ['/home']
    },
    {
      id: 'documents',
      path: '/documents',
      label: t('nav.documents'),
      icon: FolderIcon,
      matchPaths: ['/documents', '/folder', '/filetype', '/category']
    },
    {
      id: 'upload',
      path: '/upload-hub',
      label: t('nav.upload'),
      icon: UploadIcon,
      matchPaths: ['/upload-hub', '/upload']
    },
    {
      id: 'chat',
      path: '/chat',
      label: t('nav.chat'),
      icon: MessageIcon,
      matchPaths: ['/chat', '/']
    },
    {
      id: 'settings',
      path: '/settings',
      label: t('nav.settings'),
      icon: SettingsIcon,
      matchPaths: ['/settings']
    }
  ];

  // Check if current path matches any of the item's paths
  const isActive = (item) => {
    return item.matchPaths.some(path => location.pathname.startsWith(path));
  };

  // Handle navigation
  const handleNavigate = (path) => {
    navigate(path);
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
        zIndex: 1000,
        paddingBottom: 'max(env(safe-area-inset-bottom), 12px)',
        paddingTop: '8px'
      }}
    >
      {navItems.map((item) => {
        const active = isActive(item);
        const Icon = item.icon;

        return (
          <div
            key={item.id}
            onClick={() => handleNavigate(item.path)}
            className={`mobile-bottom-nav-item ${active ? 'active' : ''}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '8px 12px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              flex: 1
            }}
          >
            <div
              className="mobile-bottom-nav-item-icon"
              style={{
                width: active ? '36px' : 'auto',
                height: active ? '36px' : 'auto',
                borderRadius: active ? '50%' : '0',
                background: active ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.2s ease'
              }}
            >
              <Icon
                style={{
                  width: '20px',
                  height: '20px',
                  color: '#FFFFFF'
                }}
              />
            </div>
            <span
              className="mobile-bottom-nav-item-label"
              style={{
                fontSize: '11px',
                fontWeight: '500',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                whiteSpace: 'nowrap',
                color: '#FFFFFF'
              }}
            >
              {item.label}
            </span>
          </div>
        );
      })}
    </nav>
  );
};

export default MobileBottomNav;
