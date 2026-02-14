import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ROUTES, buildRoute } from '../../constants/routes';
import { useIsMobile } from '../../hooks/useIsMobile';
import CategoryIcon from '../library/CategoryIcon';
import { ReactComponent as DotsIcon } from '../../assets/dots.svg';
import { ReactComponent as ArrowIcon } from '../../assets/arrow-narrow-right.svg';
import { ReactComponent as EditIcon } from '../../assets/Edit 5.svg';
import { ReactComponent as UploadIcon } from '../../assets/upload.svg';
import { ReactComponent as AddIcon } from '../../assets/add.svg';
import { ReactComponent as DownloadIcon } from '../../assets/download.svg';
import { ReactComponent as TrashCanIcon } from '../../assets/Trash can-red.svg';

export default function SmartCategoriesCard({
  categories = [],
  onCreateCategory,
  onEditCategory,
  onDeleteCategory,
  onUploadToCategory,
  onMoveCategoryDocuments,
  onDownloadCategory,
  categoryMenuOpen,
  setCategoryMenuOpen,
  categoryMenuPosition,
  setCategoryMenuPosition,
  onDragOverCategory,
  onDragLeaveCategory,
  onDropOnCategory,
  dragOverCategoryId,
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Responsive column count: 3 cols >=1200, 2 cols >=900, 1 col below
  const gridCols = windowWidth >= 1200 ? 3 : windowWidth >= 900 ? 2 : 1;

  // Show max 6 categories + "View all" tile
  const MAX_VISIBLE = 6;
  const sorted = [...categories].sort((a, b) => {
    if (a.fileCount > 0 && b.fileCount === 0) return -1;
    if (a.fileCount === 0 && b.fileCount > 0) return 1;
    if (a.fileCount > 0 && b.fileCount > 0) return b.fileCount - a.fileCount;
    return a.name.localeCompare(b.name);
  });
  const visible = sorted.slice(0, MAX_VISIBLE);
  const hasMore = categories.length > MAX_VISIBLE;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: isMobile ? 8 : 12,
    }}>
      {/* Section header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <h2 style={{
          color: '#32302C',
          fontSize: isMobile ? 16 : 18,
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          fontWeight: 600,
          lineHeight: '26px',
          margin: 0,
        }}>
          {t('documents.smartCategories')}
        </h2>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={onCreateCategory}
            style={{
              height: 34,
              padding: '0 14px',
              borderRadius: 9999,
              border: '1px solid #E6E6EC',
              background: 'white',
              cursor: 'pointer',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontWeight: 600,
              fontSize: 13,
              color: '#32302C',
              transition: 'background 120ms ease',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#F5F5F5'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'white'; }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M7 1v12M1 7h12" stroke="#32302C" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            New
          </button>

          {categories.length > 3 && (
            <button
              onClick={() => navigate(ROUTES.DOCUMENTS)}
              aria-label={t('documents.seeAllCategories')}
              style={{
                color: '#55534E',
                fontSize: 13,
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontWeight: 600,
                cursor: 'pointer',
                background: 'none',
                border: 'none',
                padding: '4px 0',
                transition: 'color 120ms ease',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#181818'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#55534E'; }}
            >
              See all
              <ArrowIcon style={{ width: 14, height: 14, filter: 'brightness(0) invert(0.3)' }} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      {categories.length === 0 ? (
        /* Empty state */
        <div style={{
          padding: '32px 24px',
          background: 'white',
          borderRadius: 16,
          border: '1px solid #E6E6EC',
          boxShadow: '0 1px 2px rgba(24,24,24,0.06), 0 12px 24px rgba(24,24,24,0.08)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          textAlign: 'center',
        }}>
          <div style={{
            fontSize: 30, lineHeight: 1, marginBottom: 4,
          }}>
            &#128193;
          </div>
          <div style={{
            fontSize: 16, fontWeight: 600, color: '#32302C',
            fontFamily: 'Plus Jakarta Sans, sans-serif',
          }}>
            Organize your files
          </div>
          <div style={{
            fontSize: 14, color: '#6C6B6E', maxWidth: 320,
            fontFamily: 'Plus Jakarta Sans, sans-serif', lineHeight: '20px',
          }}>
            Create categories to keep your documents organized and easy to find.
          </div>
          <button
            onClick={onCreateCategory}
            style={{
              height: 40,
              padding: '0 20px',
              borderRadius: 9999,
              background: '#181818',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontWeight: 600,
              fontSize: 14,
              marginTop: 4,
              transition: 'background 120ms ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#0F0F0F'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#181818'; }}
          >
            Create category
          </button>
        </div>
      ) : (
        <div
          role="list"
          aria-label={t('documents.smartCategories')}
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
            gap: isMobile ? 10 : 16,
            overflow: 'visible',
          }}
        >
          {visible.map(category => (
            <div
              key={`${category.id}-${category.emoji}`}
              role="listitem"
              onDragOver={e => {
                e.preventDefault();
                e.stopPropagation();
                onDragOverCategory?.(category.id);
              }}
              onDragLeave={e => {
                e.preventDefault();
                e.stopPropagation();
                onDragLeaveCategory?.();
              }}
              onDrop={e => {
                e.preventDefault();
                e.stopPropagation();
                onDropOnCategory?.(e, category.id);
              }}
              style={{
                padding: 16,
                height: 88,
                background: dragOverCategoryId === category.id ? '#F0F0F0' : 'white',
                borderRadius: 16,
                border: dragOverCategoryId === category.id ? '2px dashed #32302C' : '1px solid #E6E6EC',
                boxShadow: '0 1px 2px rgba(24,24,24,0.06), 0 12px 24px rgba(24,24,24,0.08)',
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                transition: 'transform 160ms cubic-bezier(0.2,0.8,0.2,1), box-shadow 160ms ease, background 160ms ease',
                position: 'relative',
                boxSizing: 'border-box',
                zIndex: categoryMenuOpen === category.id ? 99999 : 1,
                cursor: 'pointer',
              }}
              onMouseEnter={e => {
                if (!isMobile) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(24,24,24,0.08), 0 16px 28px rgba(24,24,24,0.10)';
                }
              }}
              onMouseLeave={e => {
                if (!isMobile) {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 1px 2px rgba(24,24,24,0.06), 0 12px 24px rgba(24,24,24,0.08)';
                }
              }}
            >
              <div
                onClick={() => navigate(buildRoute.category(category.name.toLowerCase().replace(/\s+/g, '-')))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  flex: 1,
                  minWidth: 0,
                  cursor: 'pointer',
                }}
              >
                <div style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <CategoryIcon emoji={category.emoji} size={38} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <div style={{
                    color: '#32302C',
                    fontSize: 14,
                    fontFamily: 'Plus Jakarta Sans, sans-serif',
                    fontWeight: 600,
                    lineHeight: '20px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {category.name}
                  </div>
                  <div style={{
                    color: category.fileCount ? '#6C6B6E' : '#A2A2A7',
                    fontSize: 12,
                    fontFamily: 'Plus Jakarta Sans, sans-serif',
                    fontWeight: 500,
                    lineHeight: '18px',
                  }}>
                    {category.fileCount || 0} {category.fileCount === 1 ? 'File' : 'Files'}
                  </div>
                </div>
              </div>

              {/* Kebab menu */}
              <div style={{ position: 'relative' }} data-category-menu>
                <button
                  data-category-id={category.id}
                  aria-label={`Options for ${category.name}`}
                  onClick={e => {
                    e.stopPropagation();
                    const clickedId = e.currentTarget.getAttribute('data-category-id');
                    if (categoryMenuOpen === clickedId) {
                      setCategoryMenuOpen(null);
                    } else {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const dropdownHeight = 220;
                      const dropdownWidth = 180;
                      const spaceBelow = window.innerHeight - rect.bottom;
                      const openUpward = spaceBelow < dropdownHeight && rect.top > dropdownHeight;
                      let leftPos = rect.right - dropdownWidth;
                      leftPos = Math.max(8, Math.min(leftPos, window.innerWidth - dropdownWidth - 8));
                      setCategoryMenuPosition?.({
                        top: openUpward ? rect.top - dropdownHeight - 4 : rect.bottom + 4,
                        left: leftPos,
                      });
                      setCategoryMenuOpen(clickedId);
                    }
                  }}
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
                    flexShrink: 0,
                    transition: 'background 120ms ease',
                    padding: 0,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#F5F5F5'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <DotsIcon style={{ width: 20, height: 20, filter: 'brightness(0) invert(0.3)' }} />
                </button>
              </div>
            </div>
          ))}

          {/* "View all categories" tile */}
          {hasMore && (
            <button
              role="listitem"
              onClick={() => navigate(ROUTES.DOCUMENTS)}
              style={{
                height: 88,
                padding: 16,
                background: '#F5F5F5',
                borderRadius: 16,
                border: '1px solid #E6E6EC',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                cursor: 'pointer',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
                fontWeight: 600,
                fontSize: 14,
                color: '#55534E',
                transition: 'background 120ms ease, color 120ms ease',
                boxSizing: 'border-box',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#ECECEC'; e.currentTarget.style.color = '#181818'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#F5F5F5'; e.currentTarget.style.color = '#55534E'; }}
            >
              View all categories
              <ArrowIcon style={{ width: 16, height: 16, filter: 'brightness(0) invert(0.3)' }} aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {/* Category context menu dropdown (fixed position) */}
      {categoryMenuOpen && categoryMenuPosition && (() => {
        const cat = categories.find(c => c.id === categoryMenuOpen);
        if (!cat) return null;
        const menuItems = [
          { label: 'Edit', icon: EditIcon, action: () => { onEditCategory?.(cat); setCategoryMenuOpen(null); }, color: '#32302C' },
          { label: 'Upload to', icon: UploadIcon, action: () => { onUploadToCategory?.(cat.id); setCategoryMenuOpen(null); }, color: '#32302C' },
          { label: 'Move to', icon: AddIcon, action: () => { onMoveCategoryDocuments?.(cat.id); setCategoryMenuOpen(null); }, color: '#32302C' },
          { label: 'Download', icon: DownloadIcon, action: () => { onDownloadCategory?.(cat); setCategoryMenuOpen(null); }, color: '#32302C' },
          { label: 'Delete', icon: TrashCanIcon, action: () => { onDeleteCategory?.(cat.id); setCategoryMenuOpen(null); }, color: '#D92D20' },
        ];
        return (
          <div
            data-category-menu
            style={{
              position: 'fixed',
              top: categoryMenuPosition.top,
              left: categoryMenuPosition.left,
              width: 180,
              background: 'white',
              borderRadius: 12,
              border: '1px solid #E6E6EC',
              boxShadow: '0 4px 16px rgba(24,24,24,0.12), 0 1px 4px rgba(24,24,24,0.06)',
              padding: 6,
              zIndex: 100000,
              overflow: 'hidden',
            }}
          >
            {menuItems.map(item => (
              <button
                key={item.label}
                onClick={e => { e.stopPropagation(); item.action(); }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 14,
                  fontWeight: 500,
                  fontFamily: 'Plus Jakarta Sans, sans-serif',
                  color: item.color,
                  transition: 'background 120ms ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = item.color === '#D92D20' ? '#FEE2E2' : '#F5F5F5'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <item.icon style={{ width: 18, height: 18, flexShrink: 0, filter: item.color === '#D92D20' ? 'brightness(0) saturate(100%) invert(19%) sepia(93%) saturate(7149%) hue-rotate(355deg) brightness(91%) contrast(89%)' : 'brightness(0) invert(0.2)' }} />
                {item.label}
              </button>
            ))}
          </div>
        );
      })()}
    </div>
  );
}
