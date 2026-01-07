/**
 * FileActionCard Component
 *
 * Renders clickable file action buttons for file navigation queries.
 * Used when Koda returns file_action responses like "where is X", "open file Y".
 *
 * Action Types:
 * - SHOW_FILE: Preview button + optional location message
 * - OPEN_FILE: Auto-opens preview modal
 * - SELECT_FILE: Multiple file buttons to choose from
 * - LIST_FOLDER: Folder contents display
 * - NOT_FOUND: Error state (handled separately)
 */

import React from 'react';
import { FileText, Folder, Eye, Download, ExternalLink, Search } from 'lucide-react';

/**
 * Get file icon based on mime type
 */
const getFileIcon = (mimeType) => {
  if (!mimeType) return '/icons/file-unknown.svg';

  if (mimeType.includes('pdf')) return '/icons/file-pdf.svg';
  if (mimeType.includes('word') || mimeType.includes('document')) return '/icons/file-doc.svg';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return '/icons/file-xls.svg';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '/icons/file-ppt.svg';
  if (mimeType.includes('image')) return '/icons/file-image.svg';
  if (mimeType.includes('video')) return '/icons/file-video.svg';
  if (mimeType.includes('audio')) return '/icons/file-audio.svg';
  if (mimeType.includes('text')) return '/icons/file-txt.svg';

  return '/icons/file-unknown.svg';
};

/**
 * Format file size for display
 */
const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
};

export default function FileActionCard({
  action,
  files,
  message,
  onFileClick,
  onOpenFile,
  onDownload
}) {
  // Don't render for empty or NOT_FOUND actions (those are handled as text)
  if (!files || files.length === 0) {
    return null;
  }

  const getActionIcon = (actionType) => {
    switch (actionType) {
      case 'SHOW_FILE':
      case 'SELECT_FILE':
        return <Eye className="w-4 h-4" />;
      case 'OPEN_FILE':
        return <ExternalLink className="w-4 h-4" />;
      case 'LIST_FOLDER':
        return <Folder className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const getActionLabel = (actionType) => {
    switch (actionType) {
      case 'SHOW_FILE':
        return 'Preview';
      case 'OPEN_FILE':
        return 'Open';
      case 'SELECT_FILE':
        return 'Open';
      case 'LIST_FOLDER':
        return 'Browse';
      default:
        return 'View';
    }
  };

  const handleFileClick = (file) => {
    if (onFileClick) {
      onFileClick(file);
    }
  };

  return (
    <div style={{
      marginTop: '12px',
      padding: '12px',
      background: 'var(--bg-secondary, #f8f9fa)',
      borderRadius: '12px',
      border: '1px solid var(--border-color, #e9ecef)',
    }}>
      {/* Message if provided */}
      {message && (
        <p style={{
          margin: '0 0 12px 0',
          color: 'var(--text-secondary, #6c757d)',
          fontSize: '14px',
        }}>
          {message}
        </p>
      )}

      {/* File buttons */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}>
        {files.map((file) => (
          <button
            key={file.id}
            onClick={() => handleFileClick(file)}
            title={file.folderPath ? `Location: ${file.folderPath}` : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 16px',
              background: 'var(--bg-primary, #ffffff)',
              border: '1px solid var(--border-color, #e9ecef)',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              textAlign: 'left',
              width: '100%',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-hover, #f1f3f4)';
              e.currentTarget.style.borderColor = 'var(--accent-color, #4285f4)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--bg-primary, #ffffff)';
              e.currentTarget.style.borderColor = 'var(--border-color, #e9ecef)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            {/* File icon */}
            <span style={{
              flexShrink: 0,
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--bg-secondary, #f8f9fa)',
              borderRadius: '8px',
            }}>
              <img
                src={getFileIcon(file.mimeType)}
                alt=""
                style={{ width: '24px', height: '24px' }}
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'block';
                }}
              />
              <FileText
                style={{ width: '24px', height: '24px', display: 'none', color: '#6c757d' }}
              />
            </span>

            {/* File details */}
            <span style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
            }}>
              <span style={{
                fontWeight: 500,
                color: 'var(--text-primary, #202124)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {file.filename}
              </span>
              {file.folderPath && (
                <span style={{
                  fontSize: '12px',
                  color: 'var(--text-tertiary, #9aa0a6)',
                }}>
                  {file.folderPath}
                </span>
              )}
              {file.fileSize > 0 && (
                <span style={{
                  fontSize: '11px',
                  color: 'var(--text-tertiary, #9aa0a6)',
                }}>
                  {formatFileSize(file.fileSize)}
                </span>
              )}
            </span>

            {/* Action button */}
            <span style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: 'var(--accent-color, #4285f4)',
              color: 'white',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 500,
            }}>
              {getActionIcon(action)}
              <span>{getActionLabel(action)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
