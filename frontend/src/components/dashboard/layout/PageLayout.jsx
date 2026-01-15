import React from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

/**
 * Page layout wrapper for dashboard pages
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components to render
 * @param {string} props.breadcrumb - Breadcrumb text for the header
 * @returns {React.ReactElement}
 */
export const PageLayout = ({ children, breadcrumb }) => {
  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header breadcrumb={breadcrumb} />
        <div className="flex-1 overflow-y-auto p-10">{children}</div>
      </main>
    </div>
  );
};
