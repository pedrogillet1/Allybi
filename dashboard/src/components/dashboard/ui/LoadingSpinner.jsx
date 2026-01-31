import React from 'react';
import { RefreshCw } from 'lucide-react';

/**
 * Loading spinner component for dashboard pages
 * @param {Object} props
 * @param {string} [props.message='Loading...'] - Optional loading message
 * @param {string} [props.size='default'] - Size variant: 'small' | 'default' | 'large'
 * @returns {React.ReactElement}
 */
export const LoadingSpinner = ({ message = 'Loading...', size = 'default' }) => {
  const sizeMap = {
    small: 16,
    default: 40,
    large: 56,
  };

  const iconSize = sizeMap[size] || sizeMap.default;

  return (
    <div className="flex flex-col items-center justify-center py-12">
      <RefreshCw className="text-gray-400 animate-spin mb-3" size={iconSize} />
      {message && <p className="text-gray-600 text-sm">{message}</p>}
    </div>
  );
};
