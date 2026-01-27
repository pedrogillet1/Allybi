import React from 'react';
import { FileText, File, FileSpreadsheet, Image as ImageIcon, Video, Music, Archive, Check } from 'lucide-react';

const FILE_ICONS = {
  'application/pdf': FileText,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': FileText,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': FileSpreadsheet,
  'application/vnd.ms-excel': FileSpreadsheet,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': FileText,
  'image/jpeg': ImageIcon,
  'image/png': ImageIcon,
  'image/gif': ImageIcon,
  'video/mp4': Video,
  'audio/mpeg': Music,
  'application/zip': Archive,
};

/**
 * Document list item with checkbox for selection mode
 */
export default function DocumentListItem({
  document,
  isSelectMode,
  isSelected,
  onToggleSelect,
  onClick
}) {
  const Icon = FILE_ICONS[document.mimeType] || File;
  const fileSize = formatFileSize(document.size);
  const uploadDate = new Date(document.uploadedAt).toLocaleDateString();

  const handleClick = () => {
    if (isSelectMode) {
      onToggleSelect(document.id);
    } else {
      onClick(document);
    }
  };

  const handleCheckboxClick = (e) => {
    e.stopPropagation();
    onToggleSelect(document.id);
  };

  return (
    <div
      onClick={handleClick}
      className={`flex items-center gap-4 p-4 bg-white border rounded-lg cursor-pointer transition-all ${
        isSelected
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
      }`}
    >
      {/* Checkbox (visible in select mode) */}
      {isSelectMode && (
        <div
          onClick={handleCheckboxClick}
          className={`flex-shrink-0 w-5 h-5 rounded border-2 cursor-pointer transition-all ${
            isSelected
              ? 'bg-blue-600 border-blue-600'
              : 'border-gray-300 hover:border-blue-500'
          }`}
        >
          {isSelected && (
            <Check size={16} className="text-white" strokeWidth={3} />
          )}
        </div>
      )}

      {/* File Icon */}
      <div className="flex-shrink-0">
        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
          <Icon size={20} className="text-blue-600" />
        </div>
      </div>

      {/* Document Info */}
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-gray-900 truncate">
          {document.originalName || document.filename}
        </h3>
        <p className="text-sm text-gray-500">
          {fileSize} • {uploadDate}
        </p>
      </div>

      {/* Processing Status Badge - HIDDEN: Documents should display normally regardless of status */}
      {/* Users don't need to see processing status - it happens silently in the background */}

      {/* Category Badge (if exists) */}
      {document.category && !document.status && (
        <div className="flex-shrink-0">
          <span className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full">
            {document.category.emoji && (
              <span>{document.category.emoji}</span>
            )}
            {document.category.name}
          </span>
        </div>
      )}
    </div>
  );
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}
