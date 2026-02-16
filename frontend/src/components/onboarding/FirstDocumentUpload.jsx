import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { useTranslation } from 'react-i18next';
import { ROUTES, STORAGE_KEYS } from '../../constants/routes';
import { useDocuments } from '../../context/DocumentsContext';
import unifiedUploadService from '../../services/unifiedUploadService';
import UploadProgressBar from '../upload/UploadProgressBar';
import dropzoneIllustration from '../../assets/dropzone-files-illustration.svg';

const DROPZONE_ACCEPT = {
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-powerpoint': ['.ppt'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'text/plain': ['.txt'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'audio/mpeg': ['.mp3'],
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov'],
};

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FirstDocumentUpload() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { refreshDocuments } = useDocuments();

  // Guard: if user already completed first upload, redirect to Home
  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEYS.FIRST_UPLOAD_DONE) === 'true') {
      navigate(ROUTES.HOME, { replace: true });
    }
  }, [navigate]);

  // files: [{ file, id, status: 'pending'|'uploading'|'uploaded'|'error', progress: 0-100 }]
  const [files, setFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);

  const hasUploadedFiles = files.some(f => f.status === 'uploaded');
  const hasFilesSelected = files.length > 0;

  const onDrop = useCallback((acceptedFiles) => {
    const newFiles = acceptedFiles.map(file => ({
      file,
      id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
      status: 'pending',
      progress: 0,
    }));
    setFiles(prev => [...prev, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: DROPZONE_ACCEPT,
    multiple: true,
    noClick: false,
  });

  const removeFile = useCallback((id) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  const uploadAllFiles = useCallback(async () => {
    const pendingFiles = files.filter(f => f.status === 'pending' || f.status === 'error');
    if (pendingFiles.length === 0) return;

    setIsUploading(true);

    // Mark all pending as uploading
    setFiles(prev => prev.map(f =>
      (f.status === 'pending' || f.status === 'error') ? { ...f, status: 'uploading', progress: 0 } : f
    ));

    try {
      const rawFiles = pendingFiles.map(f => f.file);
      await unifiedUploadService.uploadFiles(rawFiles, null, (progressData) => {
        if (progressData.percentage != null) {
          // Update all uploading files with overall progress
          setFiles(prev => prev.map(f =>
            f.status === 'uploading' ? { ...f, progress: Math.round(progressData.percentage) } : f
          ));
        }
      });

      // Mark all uploading files as uploaded
      setFiles(prev => prev.map(f =>
        f.status === 'uploading' ? { ...f, status: 'uploaded', progress: 100 } : f
      ));

      refreshDocuments();
    } catch (err) {
      console.error('Upload failed:', err);
      setFiles(prev => prev.map(f =>
        f.status === 'uploading' ? { ...f, status: 'error', progress: 0 } : f
      ));
    } finally {
      setIsUploading(false);
    }
  }, [files, refreshDocuments]);

  // Auto-upload when files are added
  useEffect(() => {
    const hasPending = files.some(f => f.status === 'pending');
    if (hasPending && !isUploading) {
      uploadAllFiles();
    }
  }, [files, isUploading, uploadAllFiles]);

  const handleSkip = () => {
    localStorage.setItem(STORAGE_KEYS.FIRST_UPLOAD_DONE, 'true');
    navigate(ROUTES.HOME, { replace: true });
  };

  const handleContinue = () => {
    localStorage.setItem(STORAGE_KEYS.FIRST_UPLOAD_DONE, 'true');
    navigate(ROUTES.HOME, { replace: true });
  };

  const handleBack = () => {
    navigate(-1);
  };

  return (
    <div style={{
      background: '#FFFFFF',
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'Plus Jakarta Sans, sans-serif',
      overflowY: 'auto',
      WebkitOverflowScrolling: 'touch',
    }}>
      {/* Top bar: Back + Skip */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '24px 32px',
      }}>
        <button
          onClick={handleBack}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 500,
            color: '#6C6B6E',
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            padding: '8px 0',
          }}
          aria-label={t('firstUpload.back')}
        >
          {t('firstUpload.back')}
        </button>
        <button
          onClick={handleSkip}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 500,
            color: '#6C6B6E',
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            padding: '8px 0',
          }}
          aria-label={t('firstUpload.skip')}
        >
          {t('firstUpload.skip')}
        </button>
      </div>

      {/* Centered content */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 24px calc(env(safe-area-inset-bottom) + 48px)',
        maxWidth: 560,
        width: '100%',
        margin: '0 auto',
      }}>
        {/* Illustration */}
        <img
          src={dropzoneIllustration}
          alt=""
          aria-hidden="true"
          style={{
            width: 240,
            height: 'auto',
            marginBottom: 32,
          }}
        />

        {/* Title + Subtitle */}
        <h1 style={{
          fontSize: 24,
          fontWeight: 700,
          color: '#32302C',
          margin: '0 0 8px',
          textAlign: 'center',
          lineHeight: '32px',
        }}>
          {t('firstUpload.title')}
        </h1>
        <p style={{
          fontSize: 14,
          fontWeight: 400,
          color: '#6C6B6E',
          margin: '0 0 32px',
          textAlign: 'center',
          lineHeight: '22px',
          maxWidth: 420,
        }}>
          {t('firstUpload.subtitle')}
        </p>

        {/* Dropzone */}
        <div
          {...getRootProps()}
          style={{
            width: '100%',
            border: isDragActive ? '2px dashed #32302C' : '2px dashed #D0D0D6',
            borderRadius: 16,
            padding: 32,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            background: isDragActive ? '#F9F9F8' : 'transparent',
            transition: 'border-color 160ms ease, background 160ms ease',
            minHeight: 120,
          }}
        >
          <input {...getInputProps()} />
          <p style={{
            fontSize: 14,
            fontWeight: 500,
            color: '#32302C',
            margin: '0 0 4px',
            textAlign: 'center',
          }}>
            {t('firstUpload.dropzoneText')}
          </p>
          <p style={{
            fontSize: 12,
            fontWeight: 400,
            color: '#9B9B9E',
            margin: 0,
            textAlign: 'center',
          }}>
            {t('firstUpload.supportedFormats')}
          </p>
        </div>

        {/* File list */}
        {files.length > 0 && (
          <div style={{
            width: '100%',
            marginTop: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}>
            {files.map(f => (
              <div
                key={f.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 12,
                  background: '#F9F9F8',
                  border: '1px solid #E6E6EC',
                }}
              >
                {/* File info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#32302C',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {f.file.name}
                  </div>
                  <div style={{
                    fontSize: 11,
                    color: '#6C6B6E',
                    marginTop: 2,
                  }}>
                    {formatFileSize(f.file.size)}
                  </div>
                </div>

                {/* Status */}
                {f.status === 'uploading' && (
                  <div style={{ width: 100, flexShrink: 0 }}>
                    <UploadProgressBar
                      progress={f.progress}
                      status="uploading"
                      showStatus={false}
                      variant="compact"
                    />
                  </div>
                )}
                {f.status === 'uploaded' && (
                  <div style={{ width: 100, flexShrink: 0 }}>
                    <UploadProgressBar
                      progress={100}
                      status="completed"
                      showStatus={false}
                      variant="compact"
                    />
                  </div>
                )}
                {f.status === 'error' && (
                  <div style={{ width: 100, flexShrink: 0 }}>
                    <UploadProgressBar
                      progress={f.progress || 0}
                      status="error"
                      showStatus={false}
                      variant="compact"
                    />
                  </div>
                )}

                {/* Remove button (only when not uploading) */}
                {f.status !== 'uploading' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFile(f.id); }}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 4,
                      color: '#9B9B9E',
                      fontSize: 16,
                      lineHeight: 1,
                      flexShrink: 0,
                    }}
                    aria-label={`Remove ${f.file.name}`}
                  >
                    &times;
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Continue button */}
        <button
          onClick={handleContinue}
          disabled={!hasUploadedFiles}
          style={{
            marginTop: 32,
            width: '100%',
            maxWidth: 320,
            padding: '14px 24px',
            borderRadius: 12,
            border: 'none',
            background: hasUploadedFiles ? '#32302C' : '#E6E6EC',
            color: hasUploadedFiles ? '#FFFFFF' : '#9B9B9E',
            fontSize: 15,
            fontWeight: 600,
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            cursor: hasUploadedFiles ? 'pointer' : 'not-allowed',
            transition: 'background 160ms ease, color 160ms ease',
          }}
        >
          {t('firstUpload.continue')}
        </button>
      </div>
    </div>
  );
}
