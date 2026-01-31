import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

/**
 * Error message component with retry functionality
 * @param {Object} props
 * @param {string} props.message - Error message to display
 * @param {Function} props.onRetry - Callback function for retry button
 * @returns {React.ReactElement}
 */
export const ErrorMessage = ({ message, onRetry }) => {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <AlertCircle className="text-red-500 mb-3" size={48} />
      <p className="text-gray-900 font-semibold mb-2">Something went wrong</p>
      <p className="text-gray-600 text-sm mb-4">{message}</p>
      <button
        onClick={onRetry}
        className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
      >
        <RefreshCw size={16} />
        Try Again
      </button>
    </div>
  );
};
