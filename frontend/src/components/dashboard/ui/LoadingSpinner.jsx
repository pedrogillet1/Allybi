import React from 'react';
import { RefreshCw } from 'lucide-react';

/**
 * Loading spinner component for dashboard pages
 * @param {Object} props
 * @param {string} [props.message='Loading...'] - Optional loading message
 * @returns {React.ReactElement}
 */
export const LoadingSpinner = ({ message = 'Loading...' }) => {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <RefreshCw className="text-gray-400 animate-spin mb-3" size={40} />
      <p className="text-gray-600 text-sm">{message}</p>
    </div>
  );
};
