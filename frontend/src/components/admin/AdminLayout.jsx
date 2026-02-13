import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ROUTES } from '../../constants/routes';
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
} from 'lucide-react';
import chevronLeftIcon from '../../assets/chevron-left.svg';
import closeIcon from '../../assets/x-close.svg';
import { useAdminAuth } from '../../context/AdminAuthContext';
import './AdminStyles.css';

const navItems = [
  { path: ROUTES.ADMIN, icon: LayoutDashboard, label: 'Overview' },
  { path: ROUTES.ADMIN_USERS, icon: Users, label: 'Users' },
  { path: ROUTES.ADMIN_FILES, icon: FileText, label: 'Files' },
  { path: ROUTES.ADMIN_QUERIES, icon: Search, label: 'Queries' },
  { path: ROUTES.ADMIN_QUALITY, icon: CheckCircle, label: 'Answer Quality' },
  { path: ROUTES.ADMIN_LLM, icon: Cpu, label: 'LLM / Cost' },
  { path: ROUTES.ADMIN_RELIABILITY, icon: ShieldCheck, label: 'Reliability' },
  { path: ROUTES.ADMIN_SECURITY, icon: Lock, label: 'Security' },
  { path: ROUTES.ADMIN_API_METRICS, icon: Activity, label: 'API Metrics' },
];

const AdminLayout = ({ children, title, subtitle }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAdminAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isActive = (path) => {
    if (path === ROUTES.ADMIN) {
      return location.pathname === ROUTES.ADMIN || location.pathname === ROUTES.ADMIN + '/';
    }
    // Exact match or match with trailing slash/segment
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const handleLogout = () => {
    logout();
    navigate(ROUTES.ADMIN_LOGIN);
  };

  return (
    <div className="admin-layout">
      {/* Mobile menu button */}
      <button
        className="admin-mobile-menu"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? (
          <img src={closeIcon} alt="" style={{ width: 20, height: 20, filter: 'brightness(0) invert(1)' }} />
        ) : (
          <Menu size={20} />
        )}
      </button>

      {/* Sidebar */}
      <aside className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="admin-sidebar-header">
          <Link to={ROUTES.ADMIN} className="admin-sidebar-logo" onClick={() => setSidebarOpen(false)}>
            <span className="admin-sidebar-logo-mark">A</span>
            Allybi Admin
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
            <img
              src={chevronLeftIcon}
              alt=""
              style={{ width: 16, height: 16, filter: 'brightness(0) invert(0.2)', transform: 'rotate(180deg)' }}
            />
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
