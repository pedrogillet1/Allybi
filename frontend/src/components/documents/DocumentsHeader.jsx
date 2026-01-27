import React from 'react';
import { Search, Plus, Check, Trash2, FolderInput } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * Header for category and folder views with Select button
 * @param {Object} props
 * @param {string} props.title - Title to display
 * @param {string} props.searchQuery - Current search query
 * @param {Function} props.onSearchChange - Search input change handler
 * @param {Function} props.onNewClick - New document button click handler
 * @param {boolean} props.isSelectMode - Whether select mode is active
 * @param {Function} props.onSelectModeToggle - Select mode toggle handler
 * @param {number} props.selectedCount - Number of selected documents
 * @param {Function} props.onDelete - Delete selected documents handler
 * @param {Function} props.onMove - Move selected documents handler
 */
export default function DocumentsHeader({
  title,
  searchQuery,
  onSearchChange,
  onNewClick,
  isSelectMode,
  onSelectModeToggle,
  selectedCount = 0,
  onDelete,
  onMove
}) {
  const { t } = useTranslation();
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>

        <div className="flex items-center gap-3">
          {isSelectMode ? (
            <>
              {/* Delete Button */}
              <button
                onClick={onDelete}
                disabled={selectedCount === 0}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                  selectedCount === 0
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-red-600 text-white hover:bg-red-700'
                }`}
              >
                <Trash2 size={18} />
                Delete
              </button>

              {/* Move Button */}
              <button
                onClick={onMove}
                disabled={selectedCount === 0}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                  selectedCount === 0
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                <FolderInput size={18} />
                Move
              </button>

              {/* Select Button with Count */}
              <button
                onClick={onSelectModeToggle}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                <Check size={18} />
                Select ({selectedCount})
              </button>
            </>
          ) : (
            <>
              {/* Select Button */}
              <button
                onClick={onSelectModeToggle}
                className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-all"
              >
                <Check size={18} />
                Select
              </button>

              {/* New Document Button */}
              {onNewClick && (
                <button
                  onClick={onNewClick}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  <Plus size={18} />
                  New
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Search Bar - Hidden in select mode */}
      {!isSelectMode && (
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search size={20} className="text-gray-400" />
          </div>
          <input
            type="text"
            placeholder={t('placeholders.searchDocuments')}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      )}
    </div>
  );
}
