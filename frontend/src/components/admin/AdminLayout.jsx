/**
 * AdminLayout Component
 *
 * PURPOSE: Main layout wrapper for admin dashboard pages
 */

import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  FileText,
  Activity,
  DollarSign,
  Radio,
  Settings,
  LogOut,
  Menu,
  X,
  RefreshCw,
  ChevronLeft,
  BarChart3
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { refreshAnalyticsCache } from '../../hooks/useAnalytics';
import './AdminStyles.css';

const AdminLayout = ({ children, title, subtitle }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { accessToken, logout, user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const navItems = [
    { path: '/admin', icon: LayoutDashboard, label: 'Overview' },
    { path: '/admin/users', icon: Users, label: 'Users' },
    { path: '/admin/conversations', icon: MessageSquare, label: 'Conversations' },
    { path: '/admin/documents', icon: FileText, label: 'Documents' },
    { path: '/admin/system', icon: Activity, label: 'System Health' },
    { path: '/admin/costs', icon: DollarSign, label: 'Costs' },
    { path: '/admin/realtime', icon: Radio, label: 'Real-time' },
    { path: '/monitoring', icon: BarChart3, label: 'Monitoring' },
  ];

  const isActive = (path) => {
    if (path === '/admin') {
      return location.pathname === '/admin' || location.pathname === '/admin/';
    }
    return location.pathname.startsWith(path);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshAnalyticsCache(accessToken);
      window.location.reload();
    } catch (error) {
      console.error('Failed to refresh:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleBackToApp = () => {
    navigate('/');
  };

  return (
    <div className="admin-layout">
      {/* Mobile menu button */}
      <button
        className="admin-mobile-menu"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        style={{
          position: 'fixed',
          top: 16,
          left: 16,
          zIndex: 200,
          display: 'none',
          padding: 8,
          background: '#1e293b',
          border: 'none',
          borderRadius: 8,
          color: 'white',
          cursor: 'pointer'
        }}
      >
        {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Sidebar */}
      <aside className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="admin-sidebar-header">
          <div className="admin-sidebar-logo">
            <LayoutDashboard size={24} />
            <span>Koda</span> Analytics
          </div>
        </div>

        <nav className="admin-sidebar-nav">
          {navItems.map((item) => (
            <div
              key={item.path}
              className={`admin-nav-item ${isActive(item.path) ? 'active' : ''}`}
              onClick={() => {
                navigate(item.path);
                setSidebarOpen(false);
              }}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </div>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <div
            className="admin-nav-item"
            onClick={handleBackToApp}
          >
            <ChevronLeft size={20} />
            <span>Back to App</span>
          </div>
          <div
            className="admin-nav-item"
            onClick={handleLogout}
          >
            <LogOut size={20} />
            <span>Logout</span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="admin-main">
        <header className="admin-header">
          <div className="admin-header-title">
            <h1>{title || 'Analytics Dashboard'}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>

          <div className="admin-header-actions">
            <button
              className="admin-btn admin-btn-secondary"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw size={16} className={refreshing ? 'spinning' : ''} />
              {refreshing ? 'Refreshing...' : 'Refresh Data'}
            </button>
          </div>
        </header>

        {children}
      </main>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 90
          }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <style>{`
        @media (max-width: 768px) {
          .admin-mobile-menu {
            display: flex !important;
          }
        }

        .spinning {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default AdminLayout;
