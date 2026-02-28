import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildRoute } from '../../constants/routes';
import { useTranslation } from 'react-i18next';
import { useDocuments } from '../../context/DocumentsContext';
import { useIsMobile } from '../../hooks/useIsMobile';

// Import actual Koda file type icons
import pdfIcon from '../../assets/pdf-icon.png';
import docIcon from '../../assets/doc-icon.png';
import xlsIcon from '../../assets/xls.png';
import jpgIcon from '../../assets/jpg-icon.png';
import pngIcon from '../../assets/png-icon.png';
import pptxIcon from '../../assets/pptx.png';
import movIcon from '../../assets/mov.png';
import mp4Icon from '../../assets/mp4.png';
import { ReactComponent as ShieldIcon } from '../../assets/shield.svg';
import { ReactComponent as ArrowIcon } from '../../assets/arrow-narrow-right.svg';

const FileBreakdownDonut = ({ showEncryptionMessage = true, compact = false, semicircle = false, style = {} }) => {
  const { t } = useTranslation();
  const { documents, getRootFolders, getDocumentCountByFolder } = useDocuments();
  const navigate = useNavigate();
  const [hoveredType, setHoveredType] = useState(null);
  const [selectedType, setSelectedType] = useState(null);
  const isMobile = useIsMobile();
  const selectorRef = useRef(null);

  // Keyboard navigation for file type selector
  const handleSelectorKeyDown = useCallback((e) => {
    if (!activeGridData.length) return;
    const currentIdx = activeGridData.findIndex(d => d.type === selectedType);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIdx = currentIdx < activeGridData.length - 1 ? currentIdx + 1 : 0;
      setSelectedType(activeGridData[nextIdx].type);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIdx = currentIdx > 0 ? currentIdx - 1 : activeGridData.length - 1;
      setSelectedType(activeGridData[prevIdx].type);
    } else if (e.key === 'Escape') {
      setSelectedType(null);
    }
  }, [selectedType]);

  // Get file extension from document
  const getFileExtension = (doc) => {
    const filename = doc.filename || doc.name || '';
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return ext;
  };

  // Normalize extension - group uncommon types under 'other'
  const normalizeExtension = (ext) => {
    const mainTypes = {
      'pdf': 'pdf',
      'docx': 'docx',
      'doc': 'docx',
      'xlsx': 'xlsx',
      'xls': 'xlsx',
      'pptx': 'pptx',
      'ppt': 'pptx',
      'png': 'png',
      'jpg': 'jpg',
      'jpeg': 'jpg',
      'mov': 'mov',
      'mp4': 'mp4',
    };
    return mainTypes[ext] || 'other';
  };

  // Build breakdown with sizes and timestamps
  const { extensionBreakdown, totalCount, totalFiles } = useMemo(() => {
    const breakdown = {};
    let total = 0;

    documents.forEach(doc => {
      const ext = getFileExtension(doc);
      const normalizedExt = normalizeExtension(ext);

      if (!breakdown[normalizedExt]) {
        breakdown[normalizedExt] = { count: 0, size: 0, lastAdded: null, docs: [] };
      }

      breakdown[normalizedExt].count++;
      breakdown[normalizedExt].size += (doc.fileSize || 0);
      breakdown[normalizedExt].docs.push(doc);
      total++;

      const docDate = new Date(doc.createdAt);
      if (!breakdown[normalizedExt].lastAdded || docDate > breakdown[normalizedExt].lastAdded) {
        breakdown[normalizedExt].lastAdded = docDate;
      }
    });

    return { extensionBreakdown: breakdown, totalCount: total, totalFiles: documents.length };
  }, [documents]);

  // Format bytes to human readable
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  // Format relative date
  const formatRelativeDate = (date) => {
    if (!date) return '—';
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return date.toLocaleDateString();
  };

  // Unified color system
  const colorMap = {
    'png': '#22C55E',
    'jpg': '#16A34A',
    'pdf': '#A23C38',
    'docx': '#5280EF',
    'xlsx': '#10B981',
    'pptx': '#E45554',
    'mov': '#3B82F6',
    'mp4': '#A855F7',
    'other': '#6B7280'
  };

  const gridData = [
    { type: 'png', label: 'PNG', icon: pngIcon, color: colorMap['png'] },
    { type: 'jpg', label: 'JPG', icon: jpgIcon, color: colorMap['jpg'] },
    { type: 'pdf', label: 'PDF', icon: pdfIcon, color: colorMap['pdf'] },
    { type: 'docx', label: 'DOC', icon: docIcon, color: colorMap['docx'] },
    { type: 'mov', label: 'MOV', icon: movIcon, color: colorMap['mov'] },
    { type: 'xlsx', label: 'XLS', icon: xlsIcon, color: colorMap['xlsx'] },
    { type: 'mp4', label: 'MP4', icon: mp4Icon, color: colorMap['mp4'] },
    { type: 'pptx', label: 'PPTX', icon: pptxIcon, color: colorMap['pptx'] }
  ];

  // Filter to only show file types that exist in documents (data-driven)
  const activeGridData = gridData.filter(item => {
    const count = extensionBreakdown[item.type]?.count || 0;
    return count > 0;
  });

  // Handle 'other' type if it exists
  if (extensionBreakdown['other']?.count > 0) {
    const existsInActive = activeGridData.some(d => d.type === 'other');
    if (!existsInActive) {
      activeGridData.push({ type: 'other', label: 'Other', icon: null, color: colorMap['other'] });
    }
  }

  const displayData = activeGridData.length > 0 ? activeGridData : gridData;

  // Get top categories for selected type
  const getTopCategoriesForType = (type) => {
    const data = extensionBreakdown[type];
    if (!data?.docs?.length) return [];

    const folders = getRootFolders?.() || [];
    const catCounts = {};

    data.docs.forEach(doc => {
      if (doc.folderId) {
        const folder = folders.find(f => f.id === doc.folderId);
        if (folder && folder.name.toLowerCase() !== 'recently added') {
          catCounts[folder.name] = (catCounts[folder.name] || 0) + 1;
        }
      }
    });

    return Object.entries(catCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => ({ name, count }));
  };

  const selectedData = selectedType ? extensionBreakdown[selectedType] : null;
  const selectedMeta = selectedType ? gridData.find(d => d.type === selectedType) || activeGridData.find(d => d.type === selectedType) : null;
  const topCats = selectedType ? getTopCategoriesForType(selectedType) : [];

  // Reduced motion preference
  const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const transitionDuration = prefersReducedMotion ? '0ms' : '200ms';

  return (
    <div style={{
      padding: compact ? '16px' : '24px',
      background: 'white',
      borderRadius: isMobile ? '14px' : '20px',
      border: '1px solid #E6E6EC',
      boxShadow: '0 10px 30px rgba(0, 0, 0, 0.08), 0 2px 10px rgba(0, 0, 0, 0.04)',
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      boxSizing: 'border-box',
      height: '100%',
      overflow: 'hidden',
      ...style
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: compact ? '4px' : '12px'
      }}>
        <div style={{
          color: '#32302C',
          fontSize: '18px',
          fontFamily: 'Plus Jakarta Sans',
          fontWeight: '700',
          lineHeight: '26px'
        }}>
          {t('fileBreakdown.title')}
        </div>
      </div>

      {/* Main content area: selector + detail panel side by side */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        gap: 0
      }}>
        {/* Icon Grid / Selector Row */}
        {semicircle ? (
          /* Settings page grid layout */
          <div style={{
            display: 'grid',
            gridTemplateColumns: displayData.length <= 4
              ? `repeat(${displayData.length}, 1fr)`
              : 'repeat(4, 1fr)',
            gridTemplateRows: displayData.length > 4 ? 'repeat(2, auto)' : 'auto',
            width: '100%',
            marginTop: 16,
            marginBottom: 16,
            justifyItems: 'center',
            alignItems: 'flex-start',
            gap: isMobile ? '16px 8px' : '8px 8px'
          }}>
            {displayData.map((item) => {
              const fileCount = extensionBreakdown[item.type]?.count || 0;
              const hasFiles = fileCount > 0;
              const isHovered = hoveredType === item.type;
              const otherIsHovered = hoveredType !== null && hoveredType !== item.type;

              return (
                <div
                  key={item.type}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    opacity: !hasFiles ? 0.3 : (otherIsHovered ? 0.5 : 1),
                    transition: `opacity ${transitionDuration} ease-out, transform ${transitionDuration} ease`,
                    transform: isHovered ? 'scale(1.08)' : 'scale(1)',
                    cursor: hasFiles ? 'pointer' : 'default'
                  }}
                  onClick={() => hasFiles && navigate(buildRoute.fileType(item.type))}
                  onMouseEnter={() => hasFiles && setHoveredType(item.type)}
                  onMouseLeave={() => setHoveredType(null)}
                >
                  <div style={{
                    width: isMobile ? 48 : 68,
                    height: isMobile ? 48 : 68,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {item.icon && (
                      <img
                        src={item.icon}
                        alt={item.label}
                        style={{
                          width: isMobile ? 48 : 68,
                          height: isMobile ? 48 : 68,
                          objectFit: 'contain'
                        }}
                      />
                    )}
                  </div>
                  <div style={{
                    fontSize: isMobile ? '11px' : '13px',
                    fontWeight: '600',
                    color: '#32302C',
                    fontFamily: 'Plus Jakarta Sans',
                    textAlign: 'center'
                  }}>
                    {item.label}
                  </div>
                  <div style={{
                    fontSize: isMobile ? '10px' : '12px',
                    fontWeight: '500',
                    color: '#6C6B6E',
                    fontFamily: 'Plus Jakarta Sans'
                  }}>
                    {fileCount}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Centered file-type icon cluster — icons 76×70, ~520px cluster, ~110px gap */
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              marginTop: compact ? '4px' : '28px',
              marginBottom: compact ? '12px' : '18px'
            }}
          >
            <div
              ref={selectorRef}
              role="tablist"
              aria-label="File type selector"
              tabIndex={0}
              onKeyDown={handleSelectorKeyDown}
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-start',
                columnGap: isMobile ? '32px' : '110px',
                rowGap: isMobile ? '16px' : '24px',
                flexWrap: 'wrap',
                maxWidth: '520px',
                width: '100%',
                outline: 'none'
              }}
            >
              {displayData.map((item) => {
                const fileCount = extensionBreakdown[item.type]?.count || 0;
                const hasFiles = fileCount > 0;
                const isSelected = selectedType === item.type;
                const isHovered = hoveredType === item.type;
                const otherIsActive = (selectedType !== null && !isSelected) || (hoveredType !== null && !isHovered && selectedType === null);

                return (
                  <button
                    key={item.type}
                    role="tab"
                    aria-selected={isSelected}
                    aria-label={`${item.label}: ${fileCount} files`}
                    tabIndex={isSelected ? 0 : -1}
                    onClick={() => {
                      if (hasFiles) {
                        setSelectedType(isSelected ? null : item.type);
                        setHoveredType(null);
                      }
                    }}
                    onMouseEnter={() => hasFiles && setHoveredType(item.type)}
                    onMouseLeave={() => setHoveredType(null)}
                    style={{
                      background: 'transparent',
                      border: 0,
                      padding: 0,
                      width: isMobile ? 80 : 110,
                      textAlign: 'center',
                      cursor: hasFiles ? 'pointer' : 'default',
                      opacity: !hasFiles ? 0.3 : (otherIsActive && !isSelected ? 0.6 : 1),
                      transition: `opacity ${transitionDuration} ease`,
                      fontFamily: 'Plus Jakarta Sans',
                      outline: 'none'
                    }}
                  >
                    {item.icon ? (
                      <img
                        src={item.icon}
                        alt=""
                        style={{
                          width: isMobile ? 52 : 76,
                          height: isMobile ? 48 : 70,
                          objectFit: 'contain',
                          filter: 'drop-shadow(0 14px 16px rgba(0, 0, 0, 0.22))'
                        }}
                      />
                    ) : (
                      <div style={{
                        width: isMobile ? 52 : 76,
                        height: isMobile ? 48 : 70,
                        margin: '0 auto',
                        borderRadius: 10,
                        background: '#F3F3F5',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 18,
                        fontWeight: '700',
                        color: '#6C6B6E',
                        fontFamily: 'Plus Jakarta Sans',
                        filter: 'drop-shadow(0 14px 16px rgba(0, 0, 0, 0.22))'
                      }}>
                        ?
                      </div>
                    )}
                    <div style={{
                      marginTop: '12px',
                      fontSize: isMobile ? '12px' : '14px',
                      fontWeight: '700',
                      color: '#32302C',
                      lineHeight: '1.15'
                    }}>
                      {item.label}
                    </div>
                    <div style={{
                      marginTop: '6px',
                      fontSize: isMobile ? '10px' : '12px',
                      fontWeight: '500',
                      color: '#6C6B6E',
                      lineHeight: '1.15'
                    }}>
                      {fileCount} {fileCount === 1 ? 'File' : 'Files'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Distribution bar + total count */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: compact ? '4px' : '8px',
          width: '100%'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{
              color: '#32302C',
              fontSize: compact ? '16px' : '20px',
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: '700',
              lineHeight: '30px'
            }}>
              {t('fileBreakdown.files')}
            </div>
            <div style={{
              color: '#32302C',
              fontSize: compact ? '16px' : '20px',
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: '700',
              lineHeight: '30px'
            }}>
              {t('fileBreakdown.totalFiles', { count: totalFiles })}
            </div>
          </div>

          {/* Distribution bar - 22px height, fully rounded */}
          <div style={{
            width: '100%',
            height: compact ? '12px' : '22px',
            background: '#F3F3F5',
            borderRadius: '100px',
            overflow: 'hidden',
            display: 'flex',
            position: 'relative'
          }}>
            {gridData.map((item) => {
              const count = extensionBreakdown[item.type]?.count || 0;
              const widthPercent = totalCount > 0 ? (count / totalCount) * 100 : 0;
              if (widthPercent === 0) return null;

              const isActive = hoveredType === item.type || selectedType === item.type;
              const otherIsActive = (hoveredType !== null && hoveredType !== item.type) || (selectedType !== null && selectedType !== item.type);

              return (
                <div
                  key={item.type}
                  role="presentation"
                  style={{
                    width: `${widthPercent}%`,
                    height: '100%',
                    background: item.color,
                    opacity: isActive ? 1.0 : (otherIsActive ? 0.35 : 0.8),
                    transform: isActive ? 'scaleY(1.15)' : 'scaleY(1)',
                    transformOrigin: 'center',
                    transition: `opacity ${transitionDuration} ease-out, transform ${transitionDuration} ease-out, width 300ms ease`,
                    cursor: 'pointer',
                    borderRadius: '2px'
                  }}
                  onMouseEnter={() => setHoveredType(item.type)}
                  onMouseLeave={() => setHoveredType(null)}
                  onClick={() => setSelectedType(selectedType === item.type ? null : item.type)}
                />
              );
            })}
            {/* Handle 'other' type in bar */}
            {extensionBreakdown['other']?.count > 0 && (() => {
              const count = extensionBreakdown['other'].count;
              const widthPercent = totalCount > 0 ? (count / totalCount) * 100 : 0;
              if (widthPercent === 0) return null;
              const isActive = hoveredType === 'other' || selectedType === 'other';
              const otherIsActive = (hoveredType !== null && hoveredType !== 'other') || (selectedType !== null && selectedType !== 'other');

              return (
                <div
                  key="other"
                  style={{
                    width: `${widthPercent}%`,
                    height: '100%',
                    background: colorMap['other'],
                    opacity: isActive ? 1.0 : (otherIsActive ? 0.35 : 0.8),
                    transform: isActive ? 'scaleY(1.15)' : 'scaleY(1)',
                    transformOrigin: 'center',
                    transition: `opacity ${transitionDuration} ease-out, transform ${transitionDuration} ease-out`,
                    cursor: 'pointer',
                    borderRadius: '2px'
                  }}
                  onMouseEnter={() => setHoveredType('other')}
                  onMouseLeave={() => setHoveredType(null)}
                  onClick={() => setSelectedType(selectedType === 'other' ? null : 'other')}
                />
              );
            })()}
          </div>
        </div>

        {/* Detail Panel - slides in when a type is selected */}
        <div
          role="tabpanel"
          aria-label={selectedMeta ? `${selectedMeta.label} details` : 'File type details'}
          style={{
            maxHeight: selectedType ? '280px' : '0px',
            opacity: selectedType ? 1 : 0,
            overflow: 'hidden',
            transition: prefersReducedMotion ? 'none' : 'max-height 240ms ease, opacity 200ms ease, margin 200ms ease',
            marginTop: selectedType ? '16px' : '0px',
          }}
        >
          {selectedData && selectedMeta && (
            <div style={{
              background: '#FAFAFA',
              borderRadius: '14px',
              border: '1px solid #E6E6EC',
              padding: isMobile ? '16px' : '20px',
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              gap: isMobile ? '16px' : '32px',
              alignItems: isMobile ? 'stretch' : 'flex-start',
            }}>
              {/* Left: Stats */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  {selectedMeta.icon && (
                    <img src={selectedMeta.icon} alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} />
                  )}
                  <div style={{
                    fontSize: '16px',
                    fontWeight: '700',
                    color: selectedMeta.color || '#32302C',
                    fontFamily: 'Plus Jakarta Sans'
                  }}>
                    {selectedMeta.label} Files
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: '#6C6B6E', fontFamily: 'Plus Jakarta Sans', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>
                      {t('fileBreakdown.files')}
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: '700', color: '#32302C', fontFamily: 'Plus Jakarta Sans' }}>
                      {selectedData.count}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: '#6C6B6E', fontFamily: 'Plus Jakarta Sans', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>
                      {t('fileBreakdown.totalSize')}
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: '700', color: '#32302C', fontFamily: 'Plus Jakarta Sans' }}>
                      {formatBytes(selectedData.size)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: '#6C6B6E', fontFamily: 'Plus Jakarta Sans', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>
                      {t('fileBreakdown.lastAdded')}
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#32302C', fontFamily: 'Plus Jakarta Sans' }}>
                      {formatRelativeDate(selectedData.lastAdded)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Top categories + CTA */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: isMobile ? 'auto' : '200px' }}>
                {topCats.length > 0 && (
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: '#6C6B6E', fontFamily: 'Plus Jakarta Sans', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                      {t('fileBreakdown.topCategories')}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {topCats.map(cat => (
                        <div key={cat.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '13px', fontWeight: '500', color: '#32302C', fontFamily: 'Plus Jakarta Sans' }}>
                            {cat.name}
                          </span>
                          <span style={{ fontSize: '12px', fontWeight: '500', color: '#6C6B6E', fontFamily: 'Plus Jakarta Sans' }}>
                            {cat.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => navigate(buildRoute.fileType(selectedType))}
                  aria-label={`View ${selectedMeta.label} files`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '10px 20px',
                    background: '#32302C',
                    color: 'white',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '600',
                    fontFamily: 'Plus Jakarta Sans',
                    transition: `all ${transitionDuration} ease`,
                    marginTop: topCats.length > 0 ? '4px' : '0px',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#1a1916'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#32302C'; e.currentTarget.style.transform = 'translateY(0)'; }}
                >
                  {t('fileBreakdown.viewFiles')}
                  <ArrowIcon style={{ width: 16, height: 16, filter: 'brightness(0) invert(1)' }} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Encryption Message */}
        {showEncryptionMessage && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 16,
            paddingTop: 16,
            borderTop: '1px solid #E6E6EC',
            width: '100%'
          }}>
            <ShieldIcon style={{ width: 16, height: 16, flexShrink: 0, filter: 'brightness(0) invert(0.2)' }} aria-hidden="true" />
            <div style={{
              fontSize: 12,
              fontWeight: 400,
              color: '#6C6B6E',
              fontFamily: 'Plus Jakarta Sans',
              lineHeight: 1.5
            }}>
              {(() => {
                const msg = String(t('fileBreakdown.encryptionMessage') || '');
                const parts = msg.split('Allybi');
                if (parts.length <= 1) return msg;
                return parts.map((p, idx) => (
                  <React.Fragment key={`${idx}:${p}`}>
                    {p}
                    {idx < parts.length - 1 ? (
                      <span style={{ color: '#111827', fontWeight: 900 }}>Allybi</span>
                    ) : null}
                  </React.Fragment>
                ));
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileBreakdownDonut;
