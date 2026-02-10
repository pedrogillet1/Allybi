import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useAuthModal } from '../../context/AuthModalContext';
import { AUTH_MODES, STORAGE_KEYS } from '../../constants/routes';
import { useIsMobile } from '../../hooks/useIsMobile';

function getAuthRedirectMode() {
  const hasVisited = localStorage.getItem(STORAGE_KEYS.HAS_VISITED);
  return hasVisited === 'true' ? AUTH_MODES.LOGIN : AUTH_MODES.SIGNUP;
}

export default function SignedOutSignInButton() {
  const { isAuthenticated, loading } = useAuth();
  const { dismissed, isOpen, open, clearDismissed } = useAuthModal();
  const isMobile = useIsMobile();

  if (loading) return null;
  if (isAuthenticated) return null;
  if (isOpen) return null;
  // Desktop already has a sidebar sign-in/out affordance. Avoid overlapping UI.
  if (!isMobile) return null;

  return (
    <button
      onClick={() => {
        clearDismissed();
        open({ mode: getAuthRedirectMode(), reason: 'sign_in_button' });
      }}
      style={{
        position: 'fixed',
        left: 18,
        bottom: 18,
        zIndex: 12010,
        height: 44,
        padding: '0 16px',
        borderRadius: 999,
        border: '1px solid rgba(230, 230, 236, 1)',
        background: 'rgba(255, 255, 255, 0.95)',
        color: '#181818',
        fontFamily: 'Plus Jakarta Sans',
        fontWeight: 700,
        fontSize: 14,
        cursor: 'pointer',
        boxShadow: '0 12px 24px rgba(0,0,0,0.12)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      Sign in
    </button>
  );
}
