import React from 'react';
import {
  Home,
  BrainCircuit,
  Search,
  AlertTriangle,
  Users,
  Database,
  LogOut,
} from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';

const navItems = [
  { to: '/', icon: Home, label: 'Overview' },
  { to: '/intent-analysis', icon: BrainCircuit, label: 'Intent Analysis' },
  { to: '/retrieval', icon: Search, label: 'Retrieval' },
  { to: '/errors', icon: AlertTriangle, label: 'Errors' },
  { to: '/users', icon: Users, label: 'Users' },
  { to: '/database', icon: Database, label: 'Database' },
];

/**
 * Sidebar navigation component for the monitoring dashboard
 * @returns {React.ReactElement}
 */
export const Sidebar = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className="w-[240px] bg-background border-r border-border flex flex-col justify-between p-4">
      <div>
        <div className="flex items-center gap-2 p-4 mb-8">
          <h1 className="text-2xl font-bold text-text">KODA</h1>
          <div className="w-2 h-2 bg-success rounded-full"></div>
        </div>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 p-3 rounded-md text-text-secondary hover:bg-gray-100 transition-colors ${
                  isActive ? 'bg-gray-100 text-text font-semibold border-l-2 border-text' : ''
                }`
              }
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="flex flex-col gap-1">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 p-3 rounded-md text-text-secondary hover:bg-gray-100 w-full text-left"
        >
          <LogOut size={20} />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
};
