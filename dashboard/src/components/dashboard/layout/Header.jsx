import React from 'react';
import { Search, Bell } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';

/**
 * Header component for the dashboard
 * @param {Object} props
 * @param {string} props.breadcrumb - Breadcrumb text to display
 * @returns {React.ReactElement}
 */
export const Header = ({ breadcrumb }) => {
  const { user } = useAuth();

  // Get initials from user email or name
  const getInitials = () => {
    if (user?.name) {
      return user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    if (user?.email) {
      return user.email.slice(0, 2).toUpperCase();
    }
    return 'AD';
  };

  return (
    <header className="h-[64px] bg-background border-b border-border flex items-center justify-between px-10">
      <p className="text-text-secondary text-sm">{breadcrumb}</p>
      <div className="flex items-center gap-6">
        <Search size={20} className="text-text-secondary cursor-pointer hover:text-text" />
        <div className="relative cursor-pointer">
          <Bell size={20} className="text-text-secondary hover:text-text" />
          <div className="absolute -top-1 -right-1 w-2 h-2 bg-danger rounded-full"></div>
        </div>
        <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center font-bold text-text text-sm">
          {getInitials()}
        </div>
      </div>
    </header>
  );
};
