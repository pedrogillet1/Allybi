import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  FileText,
  Search,
  CheckCircle,
  Cpu,
  ShieldCheck,
  Lock,
  Activity,
  LogOut,
  Menu,
  X,
  ChevronLeft,
} from 'lucide-react';
import { useAdminAuth } from '../../context/AdminAuthContext';
import './AdminStyles.css';

const navItems = [
  { path: '/admin', icon: LayoutDashboard, label: 'Overview' },
  { path: '/admin/users', icon: Users, label: 'Users' },
  { path: '/admin/files', icon: FileText, label: 'Files' },
  { path: '/admin/queries', icon: Search, label: 'Queries' },
  { path: '/admin/quality', icon: CheckCircle, label: 'Answer Quality' },
  { path: '/admin/llm', icon: Cpu, label: 'LLM / Cost' },
  { path: '/admin/reliability', icon: ShieldCheck, label: 'Reliability' },
  { path: '/admin/security', icon: Lock, label: 'Security' },
  { path: '/admin/api-metrics', icon: Activity, label: 'API Metrics' },
];

const AdminLayout = ({ children, title, subtitle }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAdminAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isActive = (path) => {
    if (path === '/admin') {
      return location.pathname === '/admin' || location.pathname === '/admin/';
    }
    // Exact match or match with trailing slash/segment
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  return (
    <div className="admin-layout">
      {/* Mobile menu button */}
      <button
        className="admin-mobile-menu"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Sidebar */}
      <aside className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="admin-sidebar-header">
          <Link to="/admin" className="admin-sidebar-logo" onClick={() => setSidebarOpen(false)}>
            <span className="admin-sidebar-logo-mark">K</span>
            Koda Admin
          </Link>
        </div>

        <nav className="admin-sidebar-nav">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`admin-nav-item ${isActive(item.path) ? 'active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <item.icon size={16} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <Link
            to="/"
            className="admin-nav-item"
            onClick={() => setSidebarOpen(false)}
          >
            <ChevronLeft size={16} />
            <span>Back to App</span>
          </Link>
          <button className="admin-nav-item" onClick={handleLogout}>
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="admin-main">
        <header className="admin-header">
          <div className="admin-header-title">
            <h1>{title || 'Admin'}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
        </header>

        {children}
      </main>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="admin-mobile-overlay"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
};

export default AdminLayout;
