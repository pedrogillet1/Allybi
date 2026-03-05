import React, { useCallback } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { AUTH_MODES, ROUTES, STORAGE_KEYS } from '../../constants/routes';
import { useAuthModal } from '../../context/AuthModalContext';

export const useAuthGate = () => {
    const location = useLocation();
    const { isAuthenticated, loading } = useAuth();
    const { open, isOpen } = useAuthModal();

    const triggerAuthGate = useCallback((reason) => {
        const returnTo = `${location.pathname}${location.search || ''}`;
        open({ mode: getAuthRedirectMode(), returnTo, reason: reason || 'auth_gate' });
    }, [location.pathname, location.search, open]);

    return {
        triggerAuthGate,
        isAuthGateOpen: Boolean(isOpen),
        isUnauthenticated: !loading && !isAuthenticated,
    };
};

/**
 * Helper to determine if user has visited before
 * First-time visitors -> Signup page
 * Returning visitors -> Login page
 */
const getAuthRedirectMode = () => {
    const hasVisited = localStorage.getItem(STORAGE_KEYS.HAS_VISITED);
    if (hasVisited === 'true') {
        return AUTH_MODES.LOGIN;
    }
    // Mark as visited for future visits
    localStorage.setItem(STORAGE_KEYS.HAS_VISITED, 'true');
    return AUTH_MODES.SIGNUP;
};

/**
 * Protected Route Component
 *
 * Redirects unauthenticated users to auth page:
 * - First-time visitors → Signup page
 * - Returning visitors → Login page
 *
 * Includes mobile bottom navigation for authenticated users.
 */
const ProtectedRoute = ({ children }) => {
    const location = useLocation();
    const { isAuthenticated, loading } = useAuth();

    if (loading) {
        return (
            <div style={{
                width: '100%',
                height: '100vh',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                background: 'white'
            }}>
                <div style={{
                    color: '#6C6B6E',
                    fontSize: 16,
                    fontFamily: 'Plus Jakarta Sans',
                    fontWeight: '500'
                }}>
                    Loading...
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        const returnTo = `${location.pathname}${location.search || ''}`;
        return (
            <Navigate
                to={`${ROUTES.AUTH}?returnTo=${encodeURIComponent(returnTo)}`}
                replace
                state={{ from: location }}
            />
        );
    }

    return children;
};

export default ProtectedRoute;
