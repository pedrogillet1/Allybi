import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { buildRoute, AUTH_MODES } from '../constants/routes';
import MobileBottomNav from './MobileBottomNav';

/**
 * Protected Route Component
 *
 * Redirects unauthenticated users to login page.
 * Only authenticated users can access protected routes.
 * Includes mobile bottom navigation for authenticated users.
 */
const ProtectedRoute = ({ children }) => {
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

    // If not authenticated, redirect to unified auth
    if (!isAuthenticated) {
        return <Navigate to={buildRoute.auth(AUTH_MODES.LOGIN)} replace />;
    }

    // If authenticated, show content with mobile bottom navigation
    return (
        <>
            {children}
            <MobileBottomNav />
        </>
    );
};

export default ProtectedRoute;
