import React from 'react';
import { Header } from './Header';

/**
 * Page layout wrapper for dashboard pages (without sidebar - handled at App level)
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components to render
 * @param {string} props.breadcrumb - Breadcrumb text for the header
 * @returns {React.ReactElement}
 */
export const PageLayout = ({ children, breadcrumb }) => {
  return (
    <main className="flex-1 flex flex-col overflow-hidden" style={{ height: '100vh' }}>
      <Header breadcrumb={breadcrumb} />
      <div className="flex-1 overflow-y-auto p-10" style={{ overflowY: 'scroll', maxHeight: 'calc(100vh - 80px)' }}>
        {children}
      </div>
    </main>
  );
};
