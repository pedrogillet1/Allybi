import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import './FileUploadPreview.css';
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

export default function FileUploadPreview({ file, progress = 0, onRemove }) {
  const { t } = useTranslation();
  const [thumbnail, setThumbnail] = useState(null);

  useEffect(() => {
    // Generate thumbnail for images
    if (file && file.type && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setThumbnail(e.target.result);
      reader.readAsDataURL(file);
    }

    // Cleanup
    return () => {
      setThumbnail(null);
    };
  }, [file]);

  const getFileIcon = () => {
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

  const isComplete = progress >= 100;
  const isImage = file?.type?.startsWith('image/');

  return (
    <div className="file-upload-preview" style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Grey progress fill background */}
      {!isComplete && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          height: '100%',
          width: `${progress}%`,
          background: 'rgba(169, 169, 169, 0.12)',
          borderRadius: 12,
          transition: 'width 0.3s ease-out',
          zIndex: 0
        }} />
      )}

      {/* Always show file type icon on the left */}
      <div className="file-thumbnail" style={{ position: 'relative', zIndex: 1 }}>
        <img src={getFileIcon()} alt={file?.name || 'File'} className="file-icon" />
      </div>

      <div className="file-info" style={{ position: 'relative', zIndex: 1 }}>
        <div className="file-name">{file?.name || t('upload.unknownFile')}</div>
        <div className="file-meta">
          {!isComplete ? (
            <>
              <span className="file-size">{formatFileSize(file?.size)} – {t('upload.percentUploaded', { percent: Math.round(progress) })}</span>
            </>
          ) : (
            <div className="upload-complete">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path
                  d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"
                  fill="#10B981"
                />
              </svg>
              <span>{t('upload.uploaded')}</span>
            </div>
          )}
        </div>

      </div>

      {/* Image thumbnail preview on the right */}
      {thumbnail && (
        <div className="image-preview-thumbnail" style={{ position: 'relative', zIndex: 1 }}>
          <img src={thumbnail} alt={file?.name || 'Preview'} />
        </div>
      )}

      {onRemove && (
        <button
          className="remove-file-btn"
          style={{ position: 'relative', zIndex: 1 }}
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
  );
}
