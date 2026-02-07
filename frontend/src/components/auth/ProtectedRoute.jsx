import React, { useState, useCallback, createContext, useContext } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { buildRoute, AUTH_MODES, STORAGE_KEYS } from '../../constants/routes';
import { useIsMobile } from '../../hooks/useIsMobile';
import MobileBottomNav from '../app-shell/MobileBottomNav';

/**
 * Auth Gate Context - Allows child components to trigger the auth gate
 * when user shows intent (taps input, tries to upload, etc.)
 */
const AuthGateContext = createContext(null);

export const useAuthGate = () => {
    const context = useContext(AuthGateContext);
    if (!context) {
        // Return a no-op if used outside ProtectedRoute (for authenticated users)
        return { triggerAuthGate: () => {}, isAuthGateOpen: false, isUnauthenticated: false };
    }
    return context;
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
    const { isAuthenticated, loading } = useAuth();
    const isMobile = useIsMobile();
    const location = useLocation();

    // Auth gate state (kept for backwards compatibility with useAuthGate hook)
    const [isAuthGateOpen, setIsAuthGateOpen] = useState(false);

    // Callback for child components (no-op now since we redirect instead)
    const triggerAuthGate = useCallback(() => {}, []);
    const closeAuthGate = useCallback(() => setIsAuthGateOpen(false), []);

    // Context value for child components
    const authGateContextValue = {
        triggerAuthGate,
        closeAuthGate,
        isAuthGateOpen,
        isUnauthenticated: !isAuthenticated
    };

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

    // Redirect unauthenticated users to appropriate auth page
    // First-time visitors -> Signup, Returning visitors -> Login
    if (!isAuthenticated) {
        const authMode = getAuthRedirectMode();
        return <Navigate to={buildRoute.auth(authMode)} replace />;
    }

    // Authenticated users: Show content with mobile bottom navigation
    return (
        <AuthGateContext.Provider value={authGateContextValue}>
            {children}
            <MobileBottomNav />
        </AuthGateContext.Provider>
    );
};

export default ProtectedRoute;
