import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { buildRoute, AUTH_MODES, ROUTES } from '../../constants/routes';
import { useIsMobile } from '../../hooks/useIsMobile';
import MobileBottomNav from '../app-shell/MobileBottomNav';
import WelcomePopup from '../app-shell/WelcomePopup';

/**
 * Protected Route Component
 *
 * Desktop: Redirects unauthenticated users to login page.
 * Mobile: Shows content with WelcomePopup for unauthenticated users (chat-first experience).
 * Includes mobile bottom navigation for all users.
 */
const ProtectedRoute = ({ children }) => {
    const { isAuthenticated, loading } = useAuth();
    const isMobile = useIsMobile();
    const location = useLocation();

    // Check if this is the main chat route (root or /c/k4r8f5)
    const isChatRoute = location.pathname === '/' || location.pathname === ROUTES.CHAT;

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

    // Mobile + chat route: Show chat with WelcomePopup for unauthenticated users
    if (!isAuthenticated && isMobile && isChatRoute) {
        return (
            <>
                {children}
                <WelcomePopup isOpen={true} />
                <MobileBottomNav />
            </>
        );
    }

    // Desktop or non-chat routes: Redirect unauthenticated users to login
    if (!isAuthenticated) {
        return <Navigate to={buildRoute.auth(AUTH_MODES.LOGIN)} replace />;
    }

    // Authenticated users: Show content with mobile bottom navigation
    return (
        <>
            {children}
            <MobileBottomNav />
        </>
    );
};

export default ProtectedRoute;
