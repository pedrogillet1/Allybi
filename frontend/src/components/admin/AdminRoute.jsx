/**
 * AdminRoute Component
 *
 * Protected route wrapper that checks for admin authentication
 * via the separate AdminAuthContext (not the user AuthContext).
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { Loader } from 'lucide-react';
import './AdminStyles.css';

const AdminRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAdminAuth();

  if (loading) {
    return (
      <div className="admin-loading" style={{ minHeight: '100vh', background: '#f8fafc' }}>
        <Loader className="admin-spinner" size={40} />
        <p>Verifying admin access...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />;
  }

  return children;
};

export default AdminRoute;
