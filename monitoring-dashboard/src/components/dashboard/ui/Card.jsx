import React from 'react';

/**
 * Reusable card component for dashboard panels
 * @param {Object} props
 * @param {React.ReactNode} props.children - Card content
 * @param {string} [props.className] - Additional CSS classes
 * @param {string} [props.title] - Optional card title
 */
export const Card = ({ children, className = '', title }) => {
  return (
    <div className={`bg-white border border-gray-200 rounded-lg shadow-sm p-6 ${className}`}>
      {title && <h3 className="font-bold text-lg mb-4 text-gray-900">{title}</h3>}
      {children}
    </div>
  );
};
