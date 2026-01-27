import React from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOpen, Tag, Trash2, X } from 'lucide-react';

/**
 * Floating action bar that appears when documents are selected
 * Provides bulk operations: Move to Folder, Move to Category, Delete
 */
export default function BulkActionsBar({
  selectedCount,
  onMoveToFolder,
  onMoveToCategory,
  onDelete,
  onCancel
}) {
  const { t } = useTranslation();

  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 animate-slide-up">
      <div className="bg-white rounded-lg shadow-2xl border border-gray-200 px-6 py-4 flex items-center gap-6">
        {/* Selected Count */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
            <span className="text-white font-semibold text-sm">{selectedCount}</span>
          </div>
          <span className="font-medium text-gray-900">
            {selectedCount === 1
              ? t('bulkActions.documentsSelected', { count: selectedCount })
              : t('bulkActions.documentsSelectedPlural', { count: selectedCount })}
          </span>
        </div>

        {/* Divider */}
        <div className="w-px h-8 bg-gray-300" />

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={onMoveToFolder}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            <FolderOpen size={18} />
            {t('bulkActions.moveToFolder')}
          </button>

          <button
            onClick={onMoveToCategory}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors"
          >
            <Tag size={18} />
            {t('bulkActions.moveToCategory')}
          </button>

          <button
            onClick={onDelete}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
          >
            <Trash2 size={18} />
            {t('bulkActions.delete')}
          </button>
        </div>

        {/* Cancel Button */}
        <button
          onClick={onCancel}
          className="ml-2 p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label={t('bulkActions.cancelSelection')}
        >
          <X size={20} />
        </button>
      </div>
    </div>
  );
}
