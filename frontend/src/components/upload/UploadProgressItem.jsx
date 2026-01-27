import React from 'react';
import { useTranslation } from 'react-i18next';
import './UploadProgressItem.css';
import pdfIcon from '../assets/pdf-icon.png';
import docIcon from '../assets/doc-icon.png';
import txtIcon from '../assets/txt-icon.png';
import xlsIcon from '../assets/xls.png';
import jpgIcon from '../assets/jpg-icon.png';
import pngIcon from '../assets/png-icon.png';
import pptxIcon from '../assets/pptx.png';
import movIcon from '../assets/mov.png';
import mp4Icon from '../assets/mp4.png';
import mp3Icon from '../assets/mp3.svg';
import folderIcon from '../assets/folder_icon.svg';

export default function UploadProgressItem({
  file,
  progress = 0,
  status = 'uploading', // 'uploading', 'completed', 'failed', 'pending', 'processing'
  onRemove,
  onRetry,
  totalSize = null, // For folders
  fileCount = null, // For folders
  isFolder = false,
  folderName = null
}) {
  const { t } = useTranslation();
  const getFileIcon = () => {
    if (isFolder) return folderIcon;
    if (!file) return docIcon;

    const filename = file.name || '';
    const extension = filename.split('.').pop()?.toLowerCase();
    const mimeType = file.type || '';

    // Check by extension first
    if (extension === 'pdf' || mimeType === 'application/pdf') return pdfIcon;
    if (['doc', 'docx'].includes(extension) || mimeType.includes('word')) return docIcon;
    if (['xls', 'xlsx'].includes(extension) || mimeType.includes('sheet')) return xlsIcon;
    if (['ppt', 'pptx'].includes(extension) || mimeType.includes('presentation')) return pptxIcon;
    if (extension === 'txt' || mimeType === 'text/plain') return txtIcon;
    if (extension === 'jpg' || extension === 'jpeg' || mimeType === 'image/jpeg') return jpgIcon;
    if (extension === 'png' || mimeType === 'image/png') return pngIcon;
    if (extension === 'mov' || mimeType === 'video/quicktime') return movIcon;
    if (extension === 'mp4' || mimeType === 'video/mp4') return mp4Icon;
    if (extension === 'mp3' || mimeType === 'audio/mpeg') return mp3Icon;

    // Check by mime type category
    if (mimeType.startsWith('image/')) return pngIcon;
    if (mimeType.startsWith('video/')) return mp4Icon;
    if (mimeType.startsWith('audio/')) return mp3Icon;

    return docIcon; // Default icon
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getDisplayName = () => {
    if (isFolder && folderName) {
      return folderName;
    }
    return file?.name || t('upload.unknownFile');
  };

  const getDisplaySize = () => {
    if (isFolder && totalSize !== null) {
      const sizeStr = formatFileSize(totalSize);
      if (fileCount !== null) {
        return `${sizeStr} - ${t('folderPreview.filesCount', { count: fileCount })}`;
      }
      return sizeStr;
    }
    return formatFileSize(file?.size);
  };

  const getDisplayStatus = () => {
    if (status === 'completed') {
      return t('upload.percentUploaded', { percent: 100 });
    }
    if (status === 'failed') {
      return t('upload.failedToUpload');
    }
    if (status === 'pending') {
      return t('upload.waiting');
    }
    if (status === 'processing') {
      return t('upload.processing');
    }
    return t('upload.percentUploaded', { percent: Math.round(progress) });
  };

  const isComplete = status === 'completed';
  const isFailed = status === 'failed';
  const isUploading = status === 'uploading' || status === 'processing';

  return (
    <div className={`upload-progress-item ${status}`}>
      {/* Progress bar background - fills from left */}
      {isUploading && (
        <div className="upload-progress-background">
          <div
            className="upload-progress-fill-bg"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* File Icon */}
      <div className="upload-file-icon">
        <img src={getFileIcon()} alt={getDisplayName()} />
      </div>

      {/* File Info */}
      <div className="upload-file-info">
        <div className="upload-file-name">{getDisplayName()}</div>
        <div className="upload-file-meta">
          <span className="upload-file-size">{getDisplaySize()}</span>
          <span className="upload-file-separator">-</span>
          <span className={`upload-file-progress ${isFailed ? 'failed' : ''} ${isComplete ? 'complete' : ''}`}>
            {getDisplayStatus()}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="upload-actions">
        {isFailed && onRetry && (
          <button
            className="upload-retry-btn"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRetry();
            }}
            aria-label={t('common.retry')}
          >
            {t('common.retry')}
          </button>
        )}
        {onRemove && status !== 'uploading' && status !== 'processing' && (
          <button
            className="upload-remove-btn"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRemove();
            }}
            aria-label={t('upload.removeFile')}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
