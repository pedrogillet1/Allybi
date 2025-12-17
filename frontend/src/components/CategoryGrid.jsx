import React, { useMemo, useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useDocuments } from '../context/DocumentsContext';
import { useIsMobile, useMobileBreakpoints } from '../hooks/useIsMobile';
import { useToast } from '../context/ToastContext';
import CategoryIcon from './CategoryIcon';
import EditCategoryModal from './EditCategoryModal';
import UniversalUploadModal from './UniversalUploadModal';
import DeleteConfirmationModal from './DeleteConfirmationModal';
import { ReactComponent as DotsIcon } from '../assets/dots.svg';
import { ReactComponent as EditIcon } from '../assets/Edit 5.svg';
import { ReactComponent as LogoutBlackIcon } from '../assets/Logout-black.svg';
import { ReactComponent as TrashCanIcon } from '../assets/Trash can-red.svg';

const CategoryGrid = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const mobile = useMobileBreakpoints();
  const { folders: contextFolders, documents: contextDocuments, deleteFolder } = useDocuments();
  const { showSuccess, showDeleteSuccess, showError } = useToast();

  // Calculate document count for each folder
  const getDocumentCountByFolder = (folderId) => {
    return contextDocuments.filter(doc => doc.folderId === folderId).length;
  };

  // Get top-level folders with their file counts
  const categories = useMemo(() => {
    const cats = contextFolders
      .filter(folder => !folder.parentFolderId)
      .map(folder => {
        return {
          id: folder.id,
          name: folder.name,
          emoji: folder.emoji || '__FOLDER_SVG__',
          fileCount: getDocumentCountByFolder(folder.id)
        };
      });
    return cats;
  }, [contextFolders, contextDocuments]);

  // ✅ NEW: Dropdown state management
  const [categoryMenu, setCategoryMenu] = useState({ id: null, top: 0, left: 0 });
  const categoryMenuOpen = categoryMenu.id;
  const setCategoryMenuOpen = (id) => setCategoryMenu(prev => id === null ? { id: null, top: 0, left: 0 } : { ...prev, id });

  // ✅ NEW: Modal states
  const [editingCategory, setEditingCategory] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showUniversalUploadModal, setShowUniversalUploadModal] = useState(false);
  const [uploadCategoryId, setUploadCategoryId] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);

  // ✅ NEW: Ref to track current state for event listener
  const categoryMenuRef = useRef(categoryMenu);

  useEffect(() => {
    categoryMenuRef.current = categoryMenu;
  }, [categoryMenu]);

  // ✅ NEW: Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (categoryMenuRef.current.id && !event.target.closest('[data-category-menu]')) {
        setCategoryMenu({ id: null, top: 0, left: 0 });
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ✅ NEW: Handle category update
  const handleCategoryUpdate = async (updatedCategory) => {
    setShowEditModal(false);
    setEditingCategory(null);
    // Context will auto-update
  };

  // ✅ NEW: Handle delete confirmation
  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;

    try {
      await deleteFolder(itemToDelete.id);
      showDeleteSuccess(t('alerts.categoryDeleted'));
      setShowDeleteModal(false);
      setItemToDelete(null);
    } catch (error) {
      console.error('Error deleting category:', error);
      showError(t('alerts.deleteFailed'));
    }
  };

  const handleCategoryClick = (categoryId) => {
    navigate(`/category/${categoryId}`);
  };

  // On mobile, show fewer categories initially (3 visible + "Add New" = 4 total)
  // On desktop, show 7 visible + "Add New" = 8 total (2 rows of 4)
  const maxVisibleCategories = isMobile ? 3 : 7;
  const hasMoreCategories = categories.length > maxVisibleCategories;
  const visibleCategories = hasMoreCategories ? categories.slice(0, maxVisibleCategories) : categories;

  // ADAPTIVE SIZING - MOBILE ONLY
  const gridGap = isMobile ? mobile.gap : 12;
  const cardPadding = isMobile ? mobile.padding.base : 14;
  const cardBorderRadius = isMobile ? mobile.borderRadius.lg : 14;
  const cardMinHeight = isMobile ? (mobile.isSmallPhone ? 90 : 100) : 72;
  const iconSize = isMobile ? (mobile.isSmallPhone ? 32 : 36) : 42;
  const titleFontSize = isMobile ? mobile.fontSize.sm : 14;
  const subtitleFontSize = isMobile ? mobile.fontSize.xs : 14;

  // ADAPTIVE GRID COLUMNS - different for phone sizes
  const getGridColumns = () => {
    if (!isMobile) return 'repeat(4, 1fr)';
    if (mobile.isSmallPhone) return 'repeat(2, 1fr)';
    if (mobile.isSmallTablet) return 'repeat(3, 1fr)';
    return 'repeat(2, 1fr)';
  };

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: gridGap, width: '100%', alignSelf: 'stretch' }}>
        {/* Responsive grid - adaptive columns based on screen size */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: getGridColumns(),
          gap: gridGap,
          width: '100%'
        }}>
          {/* Add New Smart Category Button */}
          <div
            onClick={() => navigate('/documents')}
            style={{
              padding: cardPadding,
              background: 'white',
              borderRadius: cardBorderRadius,
              border: '1px #E6E6EC solid',
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: isMobile ? mobile.gap : 8,
              cursor: 'pointer',
              minHeight: cardMinHeight,
              width: '100%',
              boxSizing: 'border-box',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease'
            }}
            onMouseEnter={(e) => !isMobile && (e.currentTarget.style.transform = 'translateY(-2px)')}
            onMouseLeave={(e) => !isMobile && (e.currentTarget.style.transform = 'translateY(0)')}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <svg width={mobile.isSmallPhone ? 20 : isMobile ? 24 : 28} height={mobile.isSmallPhone ? 20 : isMobile ? 24 : 28} viewBox="0 0 20 20" fill="none">
                <path d="M10 4V16M4 10H16" stroke="black" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <span style={{
              color: '#32302C',
              fontSize: titleFontSize,
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: '600',
              lineHeight: 1.3,
              textAlign: 'center',
              wordBreak: 'break-word'
            }}>
              {isMobile ? t('documents.addNewCategory').split(' ').slice(0, 2).join(' ') : t('documents.addNewCategory')}
            </span>
          </div>

          {/* Display categories with dropdown menus */}
          {visibleCategories.map((category) => (
            <div
              key={category.id}
              style={{
                padding: cardPadding,
                background: 'white',
                borderRadius: cardBorderRadius,
                border: '1px #E6E6EC solid',
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: isMobile ? mobile.gap : 12,
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                position: 'relative',
                minHeight: cardMinHeight,
                width: '100%',
                boxSizing: 'border-box',
                cursor: 'pointer',
                zIndex: categoryMenuOpen === category.id ? 99999 : 1
              }}
              onMouseEnter={(e) => !isMobile && (e.currentTarget.style.transform = 'translateY(-2px)')}
              onMouseLeave={(e) => !isMobile && (e.currentTarget.style.transform = 'translateY(0)')}
            >
              {/* ✅ NEW: Category content (clickable) */}
              <div
                onClick={() => handleCategoryClick(category.id)}
                style={{
                  display: 'flex',
                  flexDirection: isMobile ? 'column' : 'row',
                  alignItems: 'center',
                  gap: isMobile ? mobile.gap : 12,
                  flex: 1,
                  minWidth: 0
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: iconSize,
                  flexShrink: 0
                }}>
                  <CategoryIcon emoji={category.emoji} size={iconSize} />
                </div>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: mobile.isSmallPhone ? 2 : 4,
                  flex: isMobile ? 'none' : 1,
                  alignItems: isMobile ? 'center' : 'flex-start',
                  textAlign: isMobile ? 'center' : 'left',
                  width: isMobile ? '100%' : 'auto',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    color: '#32302C',
                    fontSize: titleFontSize,
                    fontFamily: 'Plus Jakarta Sans',
                    fontWeight: '600',
                    lineHeight: '1.3',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: isMobile ? 'normal' : 'nowrap',
                    maxWidth: '100%',
                    wordBreak: 'break-word'
                  }}>
                    {category.name}
                  </div>
                  <div style={{
                    color: '#6C6B6E',
                    fontSize: subtitleFontSize,
                    fontFamily: 'Plus Jakarta Sans',
                    fontWeight: '500',
                    lineHeight: '1.3'
                  }}>
                    {category.fileCount || 0} {category.fileCount === 1 ? t('common.file') : t('common.files')}
                  </div>
                </div>
              </div>

              {/* ✅ NEW: Three Dots Menu Button (desktop only) */}
              {!isMobile && (
                <div style={{ position: 'relative' }} data-category-menu>
                  <button
                    data-category-id={category.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      const clickedId = e.currentTarget.getAttribute('data-category-id');
                      if (categoryMenuOpen === clickedId) {
                        setCategoryMenu({ id: null, top: 0, left: 0 });
                      } else {
                        const buttonRect = e.currentTarget.getBoundingClientRect();
                        const dropdownHeight = 160;
                        const dropdownWidth = 160;
                        const spaceBelow = window.innerHeight - buttonRect.bottom;
                        const openUpward = spaceBelow < dropdownHeight && buttonRect.top > dropdownHeight;
                        let leftPos = buttonRect.right - dropdownWidth;
                        leftPos = Math.max(8, Math.min(leftPos, window.innerWidth - dropdownWidth - 8));
                        setCategoryMenu({
                          id: clickedId,
                          top: openUpward ? buttonRect.top - dropdownHeight - 4 : buttonRect.bottom + 4,
                          left: leftPos
                        });
                      }
                    }}
                    style={{
                      width: 32,
                      height: 32,
                      background: 'transparent',
                      borderRadius: '50%',
                      border: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      flexShrink: 0,
                      transition: 'transform 0.2s ease'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                  >
                    <DotsIcon style={{width: 24, height: 24}} />
                  </button>

                </div>
              )}
            </div>
          ))}
        </div>

        {/* Show "See All" only if there are more categories than visible */}
        {hasMoreCategories && (
          <div
            onClick={() => navigate('/documents')}
            style={{
              color: '#171717',
              fontSize: isMobile ? mobile.fontSize.base : 16,
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: '700',
              lineHeight: '22.40px',
              cursor: 'pointer',
              textAlign: 'right',
              paddingRight: isMobile ? mobile.padding.xs : 8,
              transition: 'transform 0.2s ease, opacity 0.2s ease'
            }}
            onMouseEnter={(e) => !isMobile && (e.currentTarget.style.opacity = '0.7')}
            onMouseLeave={(e) => !isMobile && (e.currentTarget.style.opacity = '1')}
          >
            {t('documents.seeAll')} ({categories.length})
          </div>
        )}
      </div>

      {/* ✅ FIXED: Single Category Dropdown Portal (outside map loop to avoid closure bugs) */}
      {categoryMenuOpen && ReactDOM.createPortal(
        <div
          data-category-menu
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: categoryMenu.top,
            left: categoryMenu.left,
            background: 'white',
            borderRadius: 12,
            border: '1px solid #E6E6EC',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
            zIndex: 999999,
            minWidth: 160,
            overflow: 'hidden'
          }}
        >
          {/* Edit Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              const targetCategory = categories.find(c => c.id === categoryMenuOpen);
              if (targetCategory) {
                setEditingCategory(targetCategory);
                setShowEditModal(true);
              }
              setCategoryMenuOpen(null);
            }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid #F5F5F5',
              cursor: 'pointer',
              fontSize: 14,
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: '500',
              color: '#32302C',
              transition: 'background 0.2s ease',
              textAlign: 'left'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#F5F5F5'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <EditIcon style={{width: 16, height: 16}} />
            {t('common.edit')}
          </button>

          {/* Upload Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (categoryMenuOpen) {
                setUploadCategoryId(categoryMenuOpen);
                setShowUniversalUploadModal(true);
                setCategoryMenuOpen(null);
              }
            }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid #F5F5F5',
              cursor: 'pointer',
              fontSize: 14,
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: '500',
              color: '#32302C',
              transition: 'background 0.2s ease',
              textAlign: 'left'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#F5F5F5'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <LogoutBlackIcon style={{width: 16, height: 16, color: '#32302C'}} />
            {t('common.upload')}
          </button>

          {/* Delete Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              const targetCategory = categories.find(c => c.id === categoryMenuOpen);
              if (targetCategory) {
                setItemToDelete({ type: 'category', id: targetCategory.id, name: targetCategory.name });
                setShowDeleteModal(true);
              }
              setCategoryMenuOpen(null);
            }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: 14,
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: '500',
              color: '#D92D20',
              transition: 'background 0.2s ease',
              textAlign: 'left'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#FEE2E2'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <TrashCanIcon style={{width: 16, height: 16}} />
            {t('common.delete')}
          </button>
        </div>,
        document.body
      )}

      {/* ✅ NEW: Modals */}
      <EditCategoryModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingCategory(null);
        }}
        category={editingCategory}
        onUpdate={handleCategoryUpdate}
      />

      <UniversalUploadModal
        isOpen={showUniversalUploadModal}
        onClose={() => {
          setShowUniversalUploadModal(false);
          setUploadCategoryId(null);
        }}
        categoryId={uploadCategoryId}
      />

      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setItemToDelete(null);
        }}
        onConfirm={handleDeleteConfirm}
        itemName={itemToDelete?.name}
        itemType={itemToDelete?.type}
      />
    </>
  );
};

export default CategoryGrid;
