import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ReactComponent as CloseIcon } from '../../assets/x-close.svg';
import { ReactComponent as AddIcon } from '../../assets/add.svg';
import { ReactComponent as CheckIcon } from '../../assets/check.svg';
import CategoryIcon from './CategoryIcon';
import { useIsMobile } from '../../hooks/useIsMobile';

/**
 * UNIVERSAL Category Picker Modal
 *
 * This is the SINGLE source of truth for category selection across the entire app.
 * Replaces: MoveToCategoryModal, MoveToFolderModal, AddToCategoryModal, UniversalAddToCategoryModal
 *
 * Non-negotiable UX Standards:
 * - Full-screen overlay with backdrop
 * - Close on outside click, close button, and Esc key
 * - Title: "Move to Category"
 * - 2-column grid layout
 * - Root categories only (no subfolders)
 * - Excludes "recently added" system folder
 * - Selected state with checkmark and border
 * - Primary button: "Move" (disabled until selection)
 * - Secondary button: "Create New Category"
 * - Selection resets to null on open (unless preselectedCategoryId provided)
 * - On confirm: closes immediately, performs move, shows toast, updates UI
 *
 * @param {boolean} isOpen - Modal visibility state
 * @param {function} onClose - Handler for closing modal
 * @param {array} categories - Array of root categories [{id, name, emoji, _count: {documents}}]
 * @param {function} onMove - Handler for move action (documentIds, categoryId) => Promise<void>
 * @param {function} onCreateNew - Handler for opening create category modal
 * @param {string|null} preselectedCategoryId - Optional pre-selected category ID
 * @param {number} selectedCount - Number of documents/items being moved (for display)
 * @param {string} entityType - Type of entity being moved: 'document', 'folder', or 'documents'
 */
export default function CategoryPickerModal({
  isOpen,
  onClose,
  categories,
  onMove,
  onCreateNew,
  preselectedCategoryId = null,
  selectedCount = 0,
  entityType = 'document'
}) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [selectedCategoryId, setSelectedCategoryId] = React.useState(preselectedCategoryId);

  // Reset selection when modal opens (unless preselected)
  useEffect(() => {
    if (isOpen) {
      setSelectedCategoryId(preselectedCategoryId);
    }
  }, [isOpen, preselectedCategoryId]);

  // Handle Esc key press
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (selectedCategoryId) {
      onMove(selectedCategoryId);
    }
  };

  // Get display text based on entity type and count
  const getDisplayText = () => {
    if (selectedCount > 1) {
      return t('modals.categoryPicker.movingItems', { count: selectedCount });
    }
    if (entityType === 'folder') {
      return t('modals.categoryPicker.movingFolder');
    }
    return t('modals.categoryPicker.movingDocument');
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: isMobile ? 16 : 24,
        paddingBottom: isMobile ? 'calc(80px + env(safe-area-inset-bottom, 0px))' : 24
      }}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: isMobile ? 'calc(100% - 32px)' : 520,
          maxHeight: isMobile ? 'calc(100vh - 160px)' : '80vh',
          paddingTop: 20,
          paddingBottom: 20,
          background: 'white',
          borderRadius: 14,
          outline: '1px #E6E6EC solid',
          outlineOffset: '-1px',
          flexDirection: 'column',
          justifyContent: 'flex-start',
          alignItems: 'stretch',
          gap: 20,
          display: 'flex',
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          boxSizing: 'border-box'
        }}>

        {/* Header */}
        <div style={{
          width: '100%',
          paddingLeft: 24,
          paddingRight: 24,
          justifyContent: 'space-between',
          alignItems: 'center',
          display: 'flex',
          boxSizing: 'border-box'
        }}>
          <div style={{
            color: '#32302C',
            fontSize: 18,
            fontFamily: 'Plus Jakarta Sans',
            fontWeight: '600',
            lineHeight: '25.20px'
          }}>
            {t('modals.categoryPicker.title')}
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              background: '#F5F5F5',
              border: 'none',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#E6E6EC'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#F5F5F5'}
          >
            <CloseIcon style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Info Banner */}
        {selectedCount > 0 && (
          <div style={{
            width: '100%',
            paddingLeft: 24,
            paddingRight: 24,
            boxSizing: 'border-box'
          }}>
            <div style={{
              padding: 12,
              background: '#F5F5F5',
              borderRadius: 12,
              border: '1px #E6E6EC solid',
              color: '#6C6B6E',
              fontSize: 14,
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: '500',
              textAlign: 'center'
            }}>
              {getDisplayText()}
            </div>
          </div>
        )}

        {/* Categories Grid */}
        <div style={{
          width: '100%',
          paddingLeft: 24,
          paddingRight: 24,
          paddingTop: 4,
          paddingBottom: 4,
          maxHeight: '320px',
          overflowY: 'auto',
          boxSizing: 'border-box'
        }}>
          {categories.length === 0 ? (
            <div style={{
              padding: 40,
              textAlign: 'center',
              color: '#6C6B6E',
              fontSize: 14,
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: '500'
            }}>
              {t('modals.categoryPicker.noCategories')}
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 12
            }}>
              {categories.map((category) => {
                const fileCount = category._count?.documents || category.fileCount || 0;
                const isSelected = selectedCategoryId === category.id;

                return (
                  <div
                    key={category.id}
                    onClick={() => setSelectedCategoryId(category.id)}
                    style={{
                      padding: 14,
                      background: isSelected ? '#F5F5F5' : 'white',
                      borderRadius: 12,
                      border: isSelected ? '2px #32302C solid' : '1px #E6E6EC solid',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 10,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      position: 'relative',
                      boxSizing: 'border-box',
                      minWidth: 0,
                      minHeight: 120
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = '#F9FAFB';
                        e.currentTarget.style.border = '1px #D1D5DB solid';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = 'white';
                        e.currentTarget.style.border = '1px #E6E6EC solid';
                      }
                    }}
                  >
                    {/* Selected Checkmark */}
                    {isSelected && (
                      <div style={{
                        position: 'absolute',
                        top: 10,
                        right: 10
                      }}>
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <circle cx="9" cy="9" r="9" fill="#32302C"/>
                          <path d="M5 9L8 12L13 7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    )}

                    {/* Category Emoji */}
                    <div style={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      background: '#F5F5F5',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 22
                    }}>
                      <CategoryIcon emoji={category.emoji} size={22} />
                    </div>

                    {/* Category Name */}
                    <div style={{
                      width: '100%',
                      color: '#32302C',
                      fontSize: 14,
                      fontFamily: 'Plus Jakarta Sans',
                      fontWeight: '600',
                      lineHeight: '19.60px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      textAlign: 'center',
                      paddingLeft: 4,
                      paddingRight: 4
                    }}>
                      {category.name}
                    </div>

                    {/* File Count */}
                    <div style={{
                      color: '#6C6B6E',
                      fontSize: 12,
                      fontFamily: 'Plus Jakarta Sans',
                      fontWeight: '500',
                      lineHeight: '15.40px'
                    }}>
                      {fileCount} {fileCount === 1 ? t('modals.categoryPicker.file') : t('modals.categoryPicker.files')}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Create New Category Button */}
        <div style={{
          width: '100%',
          paddingLeft: 24,
          paddingRight: 24,
          boxSizing: 'border-box'
        }}>
          <button
            onClick={onCreateNew}
            style={{
              width: '100%',
              paddingLeft: 18,
              paddingRight: 18,
              paddingTop: 12,
              paddingBottom: 12,
              background: '#F5F5F5',
              borderRadius: 100,
              border: '1px #E6E6EC solid',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#E6E6EC';
              e.currentTarget.style.border = '1px #D1D5DB solid';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#F5F5F5';
              e.currentTarget.style.border = '1px #E6E6EC solid';
            }}
          >
            <AddIcon style={{ width: 20, height: 20 }} />
            <div style={{
              color: '#32302C',
              fontSize: 16,
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: '600',
              lineHeight: '24px'
            }}>
              {t('modals.categoryPicker.createNew')}
            </div>
          </button>
        </div>

        {/* Action Buttons */}
        <div style={{
          width: '100%',
          paddingLeft: 24,
          paddingRight: 24,
          justifyContent: 'flex-start',
          alignItems: 'flex-start',
          gap: 12,
          display: 'flex',
          boxSizing: 'border-box'
        }}>
          {/* Cancel Button */}
          <button
            onClick={onClose}
            style={{
              flex: 1,
              paddingLeft: 18,
              paddingRight: 18,
              paddingTop: 12,
              paddingBottom: 12,
              background: 'white',
              borderRadius: 100,
              border: '1px #E6E6EC solid',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 6,
              display: 'flex',
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#F5F5F5'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'white'}
          >
            <div style={{
              color: '#32302C',
              fontSize: 16,
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: '500',
              lineHeight: '24px'
            }}>
              {t('common.cancel')}
            </div>
          </button>

          {/* Move Button */}
          <button
            onClick={handleConfirm}
            disabled={!selectedCategoryId}
            style={{
              flex: 1,
              paddingLeft: 18,
              paddingRight: 18,
              paddingTop: 12,
              paddingBottom: 12,
              background: selectedCategoryId ? '#32302C' : '#E6E6EC',
              borderRadius: 100,
              border: 'none',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 6,
              display: 'flex',
              cursor: selectedCategoryId ? 'pointer' : 'not-allowed',
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => {
              if (selectedCategoryId) {
                e.currentTarget.style.opacity = '0.9';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
          >
            <div style={{
              color: selectedCategoryId ? 'white' : '#9CA3AF',
              fontSize: 16,
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: '600',
              lineHeight: '24px'
            }}>
              {t('modals.categoryPicker.move')}
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
