import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { useTranslation } from 'react-i18next';
import { ROUTES, STORAGE_KEYS } from '../../constants/routes';
import { useDocuments } from '../../context/DocumentsContext';
import unifiedUploadService from '../../services/unifiedUploadService';
import dropzoneIllustration from '../../assets/dropzone-files-illustration.svg';
import dropzoneIllustrationMobile from '../../assets/dropzone-files-illustration-mobile.png';
import { useIsMobile } from '../../hooks/useIsMobile';

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
  const isMobile = useIsMobile();
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
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  const hasUploadedFiles = files.some(f => f.status === 'uploaded');
  const hasFilesSelected = files.length > 0;

  const addSelectedFiles = useCallback((acceptedFiles) => {
    if (!Array.isArray(acceptedFiles) || acceptedFiles.length === 0) return;
    const newFiles = acceptedFiles.map(file => ({
      file,
      id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
      status: 'pending',
      progress: 0,
    }));
    setFiles(prev => [...prev, ...newFiles]);
  }, []);

  const onDrop = useCallback((acceptedFiles) => {
    addSelectedFiles(acceptedFiles);
  }, [addSelectedFiles]);

  const handleFilePickerChange = useCallback((event) => {
    const picked = Array.from(event.target.files || []);
    addSelectedFiles(picked);
    // Allow selecting the same file/folder again.
    // eslint-disable-next-line no-param-reassign
    event.target.value = '';
  }, [addSelectedFiles]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: DROPZONE_ACCEPT,
    multiple: true,
    noClick: false,
    // Disable File System Access API — its async fallback breaks on non-HTTPS (localhost)
    useFsAccessApi: false,
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
        justifyContent: isMobile ? 'flex-start' : 'center',
        padding: isMobile ? '24px 24px calc(env(safe-area-inset-bottom) + 48px)' : '0 24px calc(env(safe-area-inset-bottom) + 48px)',
        maxWidth: 560,
        width: '100%',
        margin: '0 auto',
      }}>
        {/* Illustration */}
        <img
          src={isMobile ? dropzoneIllustrationMobile : dropzoneIllustration}
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

        {/* Dropzone — hidden on mobile (tap Select Files / Select Folder instead) */}
        {!isMobile && (
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
        )}

        {/* Quick actions: same behavior as Upload flow */}
        <div style={{
          width: '100%',
          display: 'flex',
          gap: 12,
          marginTop: 16,
        }}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={{
              flex: 1,
              height: 48,
              borderRadius: 999,
              border: '1px solid #E6E6EC',
              background: 'white',
              color: '#323232',
              fontSize: 15,
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Select Files
          </button>
          <button
            type="button"
            onClick={() => folderInputRef.current?.click()}
            style={{
              flex: 1,
              height: 48,
              borderRadius: 999,
              border: '1px solid #E6E6EC',
              background: 'white',
              color: '#323232',
              fontSize: 15,
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Select Folder
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={Object.values(DROPZONE_ACCEPT).flat().join(',')}
          onChange={handleFilePickerChange}
          style={{ display: 'none' }}
        />
        <input
          ref={folderInputRef}
          type="file"
          // eslint-disable-next-line react/no-unknown-property
          webkitdirectory=""
          // eslint-disable-next-line react/no-unknown-property
          directory=""
          multiple
          onChange={handleFilePickerChange}
          style={{ display: 'none' }}
        />

        {/* File list */}
        {files.length > 0 && (
          <div style={{
            width: '100%',
            marginTop: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}>
            {files.map(f => {
              const isUploading = f.status === 'uploading';
              const isUploaded = f.status === 'uploaded';
              const isError = f.status === 'error';
              const progressWidth = isUploaded ? 100 : Math.max(0, Math.min(100, Number(f.progress) || 0));
              const chipLabel = isError
                ? t('common.error')
                : isUploaded
                  ? t('upload.uploaded')
                  : isUploading
                    ? `${Math.round(progressWidth)}%`
                    : t('uploadHub.ready');
              const chipColor = isError ? '#D92D20' : isUploaded ? '#34A853' : '#181818';
              const chipBg = isError ? '#FEF3F2' : isUploaded ? '#F0FDF4' : '#F5F5F5';

              return (
                <div
                  key={f.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: '1px solid #E6E6EC',
                    position: 'relative',
                    overflow: 'hidden',
                    background: '#FFFFFF',
                  }}
                >
                  {isUploading && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        height: '100%',
                        width: `${progressWidth}%`,
                        background: 'rgba(24,24,24,0.04)',
                        borderRadius: 12,
                        transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)',
                        zIndex: 0,
                      }}
                    />
                  )}
                {/* File info */}
                <div style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
                  <div style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: '#32302C',
                    lineHeight: '20px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {f.file.name}
                  </div>
                  <div style={{
                    fontSize: 12,
                    color: '#6C6B6E',
                    marginTop: 1,
                    lineHeight: '18px',
                  }}>
                    {formatFileSize(f.file.size)}
                  </div>
                </div>

                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: chipColor,
                  background: chipBg,
                  padding: '2px 8px',
                  borderRadius: 9999,
                  fontFamily: 'Plus Jakarta Sans, sans-serif',
                  lineHeight: '18px',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  position: 'relative',
                  zIndex: 1,
                }}>
                  {chipLabel}
                </span>

                {/* Remove button (only when not uploading) */}
                {!isUploading && (
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
                      position: 'relative',
                      zIndex: 1,
                    }}
                    aria-label={`Remove ${f.file.name}`}
                  >
                    &times;
                  </button>
                )}
                </div>
              );
            })}
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
