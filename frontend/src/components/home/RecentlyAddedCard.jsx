import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ROUTES, buildRoute } from '../../constants/routes';
import { useIsMobile } from '../../hooks/useIsMobile';
import cleanDocumentName from '../../utils/cleanDocumentName';
import { ReactComponent as DotsIcon } from '../../assets/dots.svg';
import { ReactComponent as DownloadIcon } from '../../assets/download.svg';
import { ReactComponent as EditIcon } from '../../assets/Edit 5.svg';
import { ReactComponent as AddIcon } from '../../assets/add.svg';
import { ReactComponent as TrashCanIcon } from '../../assets/Trash can-red.svg';
import pdfIcon from '../../assets/pdf-icon.png';
import docIcon from '../../assets/doc-icon.png';
import txtIcon from '../../assets/txt-icon.png';
import xlsIcon from '../../assets/xls.png';
import jpgIcon from '../../assets/jpg-icon.png';
import pngIcon from '../../assets/png-icon.png';
import pptxIcon from '../../assets/pptx.png';
import movIcon from '../../assets/mov.png';
import mp4Icon from '../../assets/mp4.png';
import mp3Icon from '../../assets/mp3.svg';

function getFileIcon(doc) {
  const mimeType = doc?.mimeType || '';
  const filename = doc?.filename || '';
  if (mimeType === 'video/quicktime') return movIcon;
  if (mimeType === 'video/mp4') return mp4Icon;
  if (mimeType.startsWith('video/')) return mp4Icon;
  if (mimeType.startsWith('audio/')) return mp3Icon;
  if (mimeType === 'application/pdf') return pdfIcon;
  if (mimeType.includes('word') || mimeType.includes('msword')) return docIcon;
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return xlsIcon;
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return pptxIcon;
  if (mimeType === 'text/plain' || mimeType === 'text/csv') return txtIcon;
  if (mimeType.startsWith('image/')) {
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return jpgIcon;
    return pngIcon;
  }
  if (filename) {
    const ext = filename.toLowerCase();
    if (ext.match(/\.(pdf)$/)) return pdfIcon;
    if (ext.match(/\.(doc|docx)$/)) return docIcon;
    if (ext.match(/\.(xls|xlsx)$/)) return xlsIcon;
    if (ext.match(/\.(ppt|pptx)$/)) return pptxIcon;
    if (ext.match(/\.(txt)$/)) return txtIcon;
    if (ext.match(/\.(jpg|jpeg)$/)) return jpgIcon;
    if (ext.match(/\.(png)$/)) return pngIcon;
    if (ext.match(/\.(mov)$/)) return movIcon;
    if (ext.match(/\.(mp4)$/)) return mp4Icon;
    if (ext.match(/\.(mp3|wav|aac|m4a)$/)) return mp3Icon;
  }
  return txtIcon;
}

function getFileType(doc) {
  const filename = doc?.filename || '';
  const ext = filename.match(/\.([^.]+)$/)?.[1]?.toUpperCase() || '';
  return ext || 'File';
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

function SkeletonRow({ isMobile }) {
  return (
    <div style={{
      display: isMobile ? 'flex' : 'grid',
      gridTemplateColumns: isMobile ? undefined : '1fr 120px 140px 140px 44px',
      gap: 12,
      alignItems: 'center',
      padding: isMobile ? 10 : '0 14px',
      borderRadius: 12,
      background: 'white',
      height: 56,
      boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'linear-gradient(90deg, #F5F5F5 25%, #ECECEC 50%, #F5F5F5 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1400ms linear infinite',
        }} />
        <div style={{
          height: 14, width: '60%', borderRadius: 6,
          background: 'linear-gradient(90deg, #F5F5F5 25%, #ECECEC 50%, #F5F5F5 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1400ms linear infinite',
        }} />
      </div>
      {!isMobile && (
        <>
          <div style={{ height: 12, width: '40%', borderRadius: 6, background: '#F5F5F5' }} />
          <div style={{ height: 12, width: '50%', borderRadius: 6, background: '#F5F5F5' }} />
          <div style={{ height: 12, width: '60%', borderRadius: 6, background: '#F5F5F5' }} />
        </>
      )}
    </div>
  );
}

export default function RecentlyAddedCard({
  documents = [],
  loading = false,
  error = null,
  onRetry,
  onDownload,
  onRename,
  onAddToCategory,
  onDelete,
  onDragStart,
  onNavigateDocument,
  maxRows = 8,
  isSelectMode = false,
  onToggleDocument,
  isDocumentSelected,
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [sortColumn, setSortColumn] = useState('date');
  const [sortDirection, setSortDirection] = useState('desc');
  const [openDropdownId, setOpenDropdownId] = useState(null);
  const [dropdownDirection, setDropdownDirection] = useState('down');
  const dropdownRefs = useRef({});

  // Close dropdown on outside click
  const handleClickOutside = useCallback((e) => {
    if (!e.target.closest('[data-dropdown]')) {
      setOpenDropdownId(null);
    }
  }, []);

  React.useEffect(() => {
    if (openDropdownId) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [openDropdownId, handleClickOutside]);

  // Sort & slice documents
  const sortedDocs = React.useMemo(() => {
    const sorted = [...documents].sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case 'name':
          cmp = (a.filename || '').localeCompare(b.filename || '');
          break;
        case 'type':
          cmp = getFileType(a).localeCompare(getFileType(b));
          break;
        case 'size':
          cmp = (a.fileSize || 0) - (b.fileSize || 0);
          break;
        case 'date':
        default:
          cmp = new Date(a.createdAt) - new Date(b.createdAt);
          break;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return sorted.slice(0, maxRows);
  }, [documents, sortColumn, sortDirection, maxRows]);

  return (
    <div style={{
      width: '100%',
      maxWidth: '100%',
      boxSizing: 'border-box',
      padding: isMobile ? 16 : 24,
      background: 'white',
      borderRadius: 16,
      border: '1px solid #E6E6EC',
      boxShadow: '0 1px 2px rgba(24,24,24,0.06), 0 12px 24px rgba(24,24,24,0.08)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'visible',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: isMobile ? 12 : 20,
      }}>
        <h3 style={{
          margin: 0,
          color: '#32302C',
          fontSize: isMobile ? 16 : 18,
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          fontWeight: 600,
          lineHeight: '26px',
        }}>
          {t('documents.recentlyAdded')}
        </h3>
        {documents.length > maxRows && (
          <button
            onClick={() => navigate(ROUTES.DOCUMENTS)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#55534E',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              padding: '4px 0',
              transition: 'color 120ms ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#181818'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#55534E'; }}
          >
            {t('common.seeAll')}
          </button>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 12,
          background: '#FEF3F2',
          border: '1px solid #FCA5A5',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}>
          <span style={{
            fontSize: 14, fontWeight: 500, color: '#D92D20',
            fontFamily: 'Plus Jakarta Sans, sans-serif',
          }}>
            {t('home.recentlyAdded.failedToLoad')}
          </span>
          <button
            onClick={onRetry}
            style={{
              height: 32, padding: '0 14px', borderRadius: 9999,
              border: '1px solid #D92D20', background: 'white',
              cursor: 'pointer', fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontWeight: 600, fontSize: 12, color: '#D92D20',
            }}
          >
            {t('home.recentlyAdded.retry')}
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && !documents.length ? (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {[...Array(6)].map((_, i) => <SkeletonRow key={i} isMobile={isMobile} />)}
        </div>
      ) : documents.length > 0 ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          flex: 1,
          overflow: 'visible',
          minHeight: 0,
          position: 'relative',
        }}>
          {/* Table Header (desktop only) */}
          {!isMobile && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: isSelectMode ? '36px 1fr 120px 140px 140px' : '1fr 120px 140px 140px 44px',
              gap: 12,
              padding: '10px 14px',
              borderBottom: '1px solid #E6E6EC',
              marginBottom: 4,
            }}>
              {isSelectMode && <div />}
              {[
                { key: 'name', label: t('documents.tableHeaders.name') },
                { key: 'type', label: t('documents.tableHeaders.type') },
                { key: 'size', label: t('documents.tableHeaders.size') },
                { key: 'date', label: t('documents.tableHeaders.date') },
              ].map(col => (
                <button
                  key={col.key}
                  onClick={() => {
                    if (sortColumn === col.key) {
                      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortColumn(col.key);
                      setSortDirection('asc');
                    }
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    color: sortColumn === col.key ? '#32302C' : '#55534E',
                    fontSize: 14,
                    fontFamily: 'Plus Jakarta Sans, sans-serif',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    userSelect: 'none',
                    lineHeight: '20px',
                  }}
                >
                  {col.label}
                  {sortColumn === col.key && (
                    <span style={{ fontSize: 10 }}>
                      {sortDirection === 'asc' ? '▲' : '▼'}
                    </span>
                  )}
                </button>
              ))}
              {!isSelectMode && <div />}
            </div>
          )}

          {/* Rows */}
          {sortedDocs.map(doc => {
            const isUploading = doc.status === 'uploading';
            const docSelected = isSelectMode && isDocumentSelected?.(doc.id);

            return (
              <div
                key={doc.id}
                draggable={!isSelectMode}
                onDragStart={e => {
                  if (isSelectMode) return;
                  e.dataTransfer.setData('application/json', JSON.stringify({ type: 'document', id: doc.id }));
                  e.dataTransfer.effectAllowed = 'move';
                  onDragStart?.(doc);
                }}
                onClick={() => {
                  if (isSelectMode) {
                    onToggleDocument?.(doc.id);
                  } else if (onNavigateDocument) {
                    onNavigateDocument(doc);
                  } else {
                    navigate(buildRoute.document(doc.id));
                  }
                }}
                style={isMobile ? {
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '0 10px',
                  borderRadius: 12,
                  background: docSelected ? '#F0F0F0' : 'white',
                  cursor: 'pointer',
                  position: 'relative',
                  overflow: openDropdownId === doc.id ? 'visible' : 'hidden',
                  zIndex: openDropdownId === doc.id ? 99999 : 1,
                  height: 52,
                  boxSizing: 'border-box',
                } : {
                  display: 'grid',
                  gridTemplateColumns: isSelectMode ? '36px 1fr 120px 140px 140px' : '1fr 120px 140px 140px 44px',
                  gap: 12,
                  alignItems: 'center',
                  padding: '0 14px',
                  borderRadius: 12,
                  background: docSelected ? '#F0F0F0' : 'white',
                  cursor: 'pointer',
                  transition: 'background 120ms ease',
                  marginBottom: 0,
                  position: 'relative',
                  overflow: openDropdownId === doc.id ? 'visible' : 'hidden',
                  zIndex: openDropdownId === doc.id ? 99999 : 1,
                  height: 56,
                  boxSizing: 'border-box',
                }}
                onMouseEnter={e => { if (!isUploading && !isMobile) e.currentTarget.style.background = docSelected ? '#E8E8E8' : '#F5F5F5'; }}
                onMouseLeave={e => { if (!isUploading && !isMobile) e.currentTarget.style.background = docSelected ? '#F0F0F0' : 'white'; }}
              >
                {/* Upload progress */}
                {isUploading && (
                  <div style={{
                    position: 'absolute', top: 0, left: 0, height: '100%',
                    width: `${doc.uploadProgress || 0}%`,
                    background: '#E8E8E8', borderRadius: 12,
                    transition: 'width 0.3s ease-out', zIndex: 0,
                  }} />
                )}

                {/* Selection checkbox */}
                {isSelectMode && !isMobile && (
                  <div style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    border: docSelected ? 'none' : '2px solid #D0D0D0',
                    background: docSelected ? '#181818' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    transition: 'all 160ms ease',
                    zIndex: 1,
                  }}>
                    {docSelected && (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M3 7L6 10L11 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                )}

                {isMobile ? (
                  <>
                    {isSelectMode && (
                      <div style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        border: docSelected ? 'none' : '2px solid #D0D0D0',
                        background: docSelected ? '#181818' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        transition: 'all 160ms ease',
                        zIndex: 1,
                      }}>
                        {docSelected && (
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M3 7L6 10L11 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                    )}
                    <img src={getFileIcon(doc)} alt="" style={{ width: 32, height: 32, objectFit: 'contain', zIndex: 1 }} />
                    <div style={{ flex: 1, overflow: 'hidden', zIndex: 1 }}>
                      <div style={{ color: '#32302C', fontSize: 14, fontWeight: 600, fontFamily: 'Plus Jakarta Sans, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cleanDocumentName(doc.filename)}
                      </div>
                      <div style={{ color: '#6C6B6E', fontSize: 12, fontWeight: 500, fontFamily: 'Plus Jakarta Sans, sans-serif', marginTop: 2 }}>
                        {isUploading
                          ? `${formatBytes(doc.fileSize)} – ${Math.round(doc.uploadProgress || 0)}%`
                          : `${formatBytes(doc.fileSize)} · ${new Date(doc.createdAt).toLocaleDateString()}`
                        }
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden', zIndex: 1 }}>
                      <img src={getFileIcon(doc)} alt="" style={{ width: 32, height: 32, flexShrink: 0, objectFit: 'contain' }} />
                      <div style={{ color: '#32302C', fontSize: 14, fontWeight: 600, fontFamily: 'Plus Jakarta Sans, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cleanDocumentName(doc.filename)}
                      </div>
                    </div>
                    <div style={{ color: '#55534E', fontSize: 14, fontFamily: 'Plus Jakarta Sans, sans-serif', zIndex: 1 }}>
                      {isUploading ? '' : getFileType(doc)}
                    </div>
                    <div style={{ color: '#55534E', fontSize: 14, fontFamily: 'Plus Jakarta Sans, sans-serif', zIndex: 1 }}>
                      {isUploading ? '' : formatBytes(doc.fileSize)}
                    </div>
                    <div style={{ color: '#55534E', fontSize: 14, fontFamily: 'Plus Jakarta Sans, sans-serif', zIndex: 1 }}>
                      {isUploading ? '' : new Date(doc.createdAt).toLocaleDateString()}
                    </div>
                  </>
                )}

                {/* Kebab menu - hidden in select mode */}
                {!isSelectMode && (
                <div style={{ position: 'relative', flexShrink: 0 }} data-dropdown>
                  <button
                    ref={el => { if (el) dropdownRefs.current[doc.id] = el; }}
                    onClick={e => {
                      e.stopPropagation();
                      if (openDropdownId === doc.id) {
                        setOpenDropdownId(null);
                      } else {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const spaceBelow = window.innerHeight - rect.bottom;
                        setDropdownDirection(spaceBelow < 200 && rect.top > spaceBelow ? 'up' : 'down');
                        setOpenDropdownId(doc.id);
                      }
                    }}
                    aria-label={`Actions for ${cleanDocumentName(doc.filename)}`}
                    style={{
                      width: 44,
                      height: 44,
                      minWidth: 44,
                      minHeight: 44,
                      background: 'transparent',
                      borderRadius: '50%',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'background 120ms ease',
                      padding: 0,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#ECECEC'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <DotsIcon style={{ width: 20, height: 20, filter: 'brightness(0) invert(0.3)' }} />
                  </button>

                  {openDropdownId === doc.id && (
                    <div
                      data-dropdown
                      onClick={e => e.stopPropagation()}
                      style={{
                        position: 'absolute',
                        right: 0,
                        ...(dropdownDirection === 'up'
                          ? { bottom: '100%', marginBottom: 4 }
                          : { top: '100%', marginTop: 4 }),
                        background: 'white',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                        borderRadius: 12,
                        border: '1px solid #E6E6EC',
                        zIndex: 99999,
                        minWidth: 160,
                        overflow: 'hidden',
                      }}
                    >
                      <div style={{ padding: 6, display: 'flex', flexDirection: 'column' }}>
                        {[
                          { label: t('common.download'), icon: DownloadIcon, action: () => onDownload?.(doc), color: '#32302C' },
                          { label: t('common.rename'), icon: EditIcon, action: () => onRename?.(doc), color: '#32302C' },
                          { label: t('common.move'), icon: AddIcon, action: () => onAddToCategory?.(doc), color: '#32302C' },
                          { label: t('common.delete'), icon: TrashCanIcon, action: () => onDelete?.(doc), color: '#D92D20' },
                        ].map(item => (
                          <button
                            key={item.label}
                            onClick={e => {
                              e.stopPropagation();
                              setOpenDropdownId(null);
                              item.action();
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              padding: '8px 12px',
                              background: 'transparent',
                              border: 'none',
                              borderRadius: 8,
                              cursor: 'pointer',
                              fontSize: 14,
                              fontFamily: 'Plus Jakarta Sans, sans-serif',
                              fontWeight: 500,
                              color: item.color,
                              transition: 'background 120ms ease',
                              textAlign: 'left',
                              width: '100%',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = item.color === '#D92D20' ? '#FEE2E2' : '#F5F5F5'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                          >
                            <item.icon style={{ width: 18, height: 18, filter: item.color === '#D92D20' ? 'brightness(0) saturate(100%) invert(19%) sepia(93%) saturate(7149%) hue-rotate(355deg) brightness(91%) contrast(89%)' : 'brightness(0) invert(0.2)' }} />
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 160,
          gap: 8,
        }}>
          <div style={{ color: '#6C6B6E', fontSize: 15, fontFamily: 'Plus Jakarta Sans, sans-serif', fontWeight: 500 }}>
            {t('documents.noDocuments')}
          </div>
        </div>
      )}
    </div>
  );
}
