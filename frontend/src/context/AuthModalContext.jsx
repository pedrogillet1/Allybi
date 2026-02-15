import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AUTH_MODES, DEFAULT_AUTH_REDIRECT, ROUTES, STORAGE_KEYS, buildRoute } from '../constants/routes';
import { subscribeAuthModalEvents } from '../utils/authModalBus';
import { useAuth } from './AuthContext';

const DISMISSED_KEY = 'koda_auth_modal_dismissed';

function safeSessionGet(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function safeSessionRemove(key) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

const AuthModalContext = createContext(null);

export function useAuthModal() {
  const ctx = useContext(AuthModalContext);
  if (!ctx) throw new Error('useAuthModal must be used within <AuthModalProvider>');
  return ctx;
}

// Minimal pathname classifier: auth flows live under /a/, /v/, /r/ in this codebase.
export function isAuthPathname(pathname) {
  const p = String(pathname || '');
  return p.startsWith('/a/') || p.startsWith('/v/') || p.startsWith('/r/');
}

export function AuthModalProvider({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, loading } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => safeSessionGet(DISMISSED_KEY) === '1');
  const [returnTo, setReturnTo] = useState(null);
  const [preferredMode, setPreferredMode] = useState(null); // 'login' | 'signup' | null
  const [backgroundLocation, setBackgroundLocation] = useState(null);

  const sanitizeReturnTo = useCallback((rt) => {
    if (!rt || typeof rt !== 'string') return null;
    // Never "return" to an auth route; doing so traps the user in the modal.
    const pathOnly = rt.split('?')[0] || rt;
    if (isAuthPathname(pathOnly)) return null;
    return rt;
  }, []);

  const open = useCallback(({ mode, returnTo: rt, reason } = {}) => {
    // Any explicit open clears dismissal (session-only).
    setDismissed(false);
    safeSessionRemove(DISMISSED_KEY);
    setIsOpen(true);
    if (mode === AUTH_MODES.LOGIN || mode === AUTH_MODES.SIGNUP) setPreferredMode(mode);
    const safeRt = sanitizeReturnTo(rt);
    if (safeRt) setReturnTo(safeRt);
    // If caller wants login/signup but we're on a legacy /login|/signup route, normalize.
    if (mode && location.pathname === ROUTES.LOGIN) {
      navigate(buildRoute.auth(AUTH_MODES.LOGIN), { replace: true });
    }
    if (mode && location.pathname === ROUTES.SIGNUP) {
      navigate(buildRoute.auth(AUTH_MODES.SIGNUP), { replace: true });
    }
    void reason;
  }, [location.pathname, navigate, sanitizeReturnTo]);

  const close = useCallback(() => {
    setIsOpen(false);
    // If we're currently on an auth route, return URL to the pinned background route.
    if (isAuthPathname(location.pathname)) {
      const bg = backgroundLocation || { pathname: '/', search: '' };
      navigate(`${bg.pathname}${bg.search || ''}`, { replace: true });
    }
  }, [backgroundLocation, location.pathname, navigate]);

  const dismiss = useCallback(() => {
    setIsOpen(false);
    setDismissed(true);
    safeSessionSet(DISMISSED_KEY, '1');
    if (isAuthPathname(location.pathname)) {
      const bg = backgroundLocation || { pathname: '/', search: '' };
      navigate(`${bg.pathname}${bg.search || ''}`, { replace: true });
    }
  }, [backgroundLocation, location.pathname, navigate]);

  const clearDismissed = useCallback(() => {
    setDismissed(false);
    safeSessionRemove(DISMISSED_KEY);
  }, []);

  const completeAuth = useCallback(({ fallback } = {}) => {
    // Close without dismissing; return to attempted route if present.
    setIsOpen(false);
    setDismissed(false);
    safeSessionRemove(DISMISSED_KEY);

    // Check if this is a first-time upload redirect (new user onboarding)
    const pendingFirstUpload = localStorage.getItem(STORAGE_KEYS.PENDING_FIRST_UPLOAD);
    if (pendingFirstUpload === 'true') {
      localStorage.removeItem(STORAGE_KEYS.PENDING_FIRST_UPLOAD);
      setReturnTo(null);
      navigate(ROUTES.FIRST_UPLOAD, { replace: true });
      return;
    }

    const target = sanitizeReturnTo(returnTo) || fallback || DEFAULT_AUTH_REDIRECT;
    setReturnTo(null);
    navigate(target, { replace: true });
  }, [navigate, returnTo, sanitizeReturnTo]);

  // Safety net: if we become authenticated while currently on an auth route,
  // force-exit to returnTo/fallback so the modal can't get "stuck".
  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) return;

    // Close any open modal state; authenticated users shouldn't see the auth modal.
    if (isOpen) setIsOpen(false);
    if (dismissed) {
      setDismissed(false);
      safeSessionRemove(DISMISSED_KEY);
    }

    if (!isAuthPathname(location.pathname)) return;

    // Check for first-time upload redirect in safety net too
    const pendingFirstUpload = localStorage.getItem(STORAGE_KEYS.PENDING_FIRST_UPLOAD);
    if (pendingFirstUpload === 'true') {
      localStorage.removeItem(STORAGE_KEYS.PENDING_FIRST_UPLOAD);
      setReturnTo(null);
      navigate(ROUTES.FIRST_UPLOAD, { replace: true });
      return;
    }

    const target = sanitizeReturnTo(returnTo) || DEFAULT_AUTH_REDIRECT;
    setReturnTo(null);
    navigate(target, { replace: true });
  }, [dismissed, isAuthenticated, isOpen, loading, location.pathname, navigate, returnTo, sanitizeReturnTo]);

  // Bridge: allow axios interceptors to open modal via event bus.
  useEffect(() => {
    return subscribeAuthModalEvents((evt) => {
      if (evt?.type === 'open') open(evt.payload);
      if (evt?.type === 'close') close();
    });
  }, [open, close]);

  // Keep background location synced whenever we're on a non-auth route.
  // When the URL enters an auth route, background stays pinned to the last non-auth location.
  useEffect(() => {
    if (loading) return;
    if (!isAuthPathname(location.pathname)) {
      setBackgroundLocation(location);
    }
  }, [loading, location]);

  const value = useMemo(() => ({
    isOpen,
    dismissed,
    returnTo,
    preferredMode,
    backgroundLocation,
    setBackgroundLocation,
    setReturnTo,
    setPreferredMode,
    open,
    close,
    dismiss,
    clearDismissed,
    completeAuth,
  }), [
    isOpen,
    dismissed,
    returnTo,
    preferredMode,
    backgroundLocation,
    open,
    close,
    dismiss,
    clearDismissed,
    completeAuth,
  ]);

  return (
    <AuthModalContext.Provider value={value}>
      {children}
    </AuthModalContext.Provider>
  );
}
