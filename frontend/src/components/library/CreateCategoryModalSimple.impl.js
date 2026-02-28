import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ReactComponent as CloseIcon } from '../../assets/x-close.svg';
import CategoryIcon from './CategoryIcon';
import { useIsMobile } from '../../hooks/useIsMobile';
import folderIcon from '../../assets/folder_icon.svg';

/**
 * Simple Create Category Modal
 *
 * Streamlined category creation modal for use with CategoryPickerModal.
 * Only handles name and emoji selection - no document selection.
 * After creation, the new category is returned to the caller.
 *
 * @param {boolean} isOpen - Modal visibility state
 * @param {function} onClose - Handler for closing modal
 * @param {function} onCreate - Handler for category creation (name, emoji) => Promise<folder>
 */
export default function CreateCategoryModalSimple({ isOpen, onClose, onCreate }) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [categoryName, setCategoryName] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('__FOLDER_SVG__');
  const [nameError, setNameError] = useState(false);
  const [showAllEmojis, setShowAllEmojis] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Common & popular emojis (same as original)
  const commonEmojis = [
    '__FOLDER_SVG__',
    '📄', '📋', '📝', '📌', '📎', '🔖', '📚',
    '💼', '📊', '📈', '🏢', '✈️', '🌍', '🍕',
    '⚽', '🎨', '🎬', '⭐', '❤️', '🔥', '💡',
    '🎓', '💻', '🌲', '☀️', '🎉'
  ];

  const allEmojis = [
    '__FOLDER_SVG__',
    '📄', '📋', '📝', '📌', '📎', '🔖', '📚',
    '💼', '📊', '📈', '📉', '💰', '💵', '💳', '🏢', '🏦', '📞',
    '✈️', '🌍', '🗺️', '🏠', '🏥', '🏪',
    '🍕', '🍔', '🍟', '🍎', '🍊', '🍇', '🥗', '☕', '🍷', '🍺',
    '⚽', '🏀', '🎾', '🎮', '🎨', '🎬', '📷', '🎵', '🎸',
    '⭐', '❤️', '💙', '💚', '💛', '🔥', '💡', '🔔', '🎯', '🎁',
    '🎓', '🔬', '🔭', '⚗️', '🧪', '💻', '⌨️', '🖥️',
    '🌲', '🌳', '🌴', '🌵', '🌺', '🌻', '🌼', '🐶', '🐱', '🐭',
    '☀️', '⛅', '☁️', '🌧️', '⛈️', '🌈', '⏰', '⏳', '⌛', '📅',
    '🎉', '🎊', '🎈', '🎀', '🎪', '🎭', '🔑', '🔒', '🔓', '🛠️'
  ];

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setCategoryName('');
      setSelectedEmoji('__FOLDER_SVG__');
      setNameError(false);
      setShowAllEmojis(false);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  // Handle Esc key
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, isSubmitting, onClose]);

  const handleCreate = async () => {
    if (!categoryName.trim()) {
      setNameError(true);
      return;
    }

    setNameError(false);
    setIsSubmitting(true);

    try {
      await onCreate(categoryName.trim(), selectedEmoji);
      // Modal will be closed by parent after successful creation
    } catch (error) {
      console.error('Error creating category:', error);
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const emojisToDisplay = showAllEmojis ? allEmojis : commonEmojis;

  return (
    <div
      onClick={() => !isSubmitting && onClose()}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: isMobile ? 'flex-end' : 'center',
        zIndex: 1001,
        padding: isMobile ? '0 16px' : 16,
        paddingBottom: isMobile ? 'calc(env(safe-area-inset-bottom, 0px) + 16px)' : 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: isMobile ? '100%' : 520,
          maxHeight: isMobile ? 'calc(90vh - 70px)' : '80vh',
          background: 'white',
          borderRadius: 14,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          overflowY: 'auto',
          boxSizing: 'border-box'
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{
            color: '#32302C',
            fontSize: 18,
            fontFamily: 'Plus Jakarta Sans',
            fontWeight: '600'
          }}>
            {t('modals.createCategory.title')}
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              width: 32,
              height: 32,
              background: '#F5F5F5',
              border: 'none',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
              opacity: isSubmitting ? 0.5 : 1
            }}
            onMouseEnter={(e) => !isSubmitting && (e.currentTarget.style.background = '#E6E6EC')}
            onMouseLeave={(e) => !isSubmitting && (e.currentTarget.style.background = '#F5F5F5')}
          >
            <CloseIcon style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Category Name Input */}
        <div>
          <label style={{
            display: 'block',
            color: '#32302C',
            fontSize: 14,
            fontFamily: 'Plus Jakarta Sans',
            fontWeight: '600',
            marginBottom: 8
          }}>
            {t('modals.createCategory.categoryName')}
          </label>
          <input
            type="text"
            value={categoryName}
            onChange={(e) => {
              setCategoryName(e.target.value);
              if (nameError) setNameError(false);
            }}
            placeholder={t('modals.createCategory.categoryNamePlaceholder')}
            disabled={isSubmitting}
            style={{
              width: '100%',
              padding: '12px 16px',
              background: 'white',
              borderRadius: 12,
              border: nameError ? '2px #EF4444 solid' : '1px #E6E6EC solid',
              fontSize: 14,
              fontFamily: 'Plus Jakarta Sans',
              outline: 'none',
              boxSizing: 'border-box',
              transition: 'border 0.2s'
            }}
            onFocus={(e) => !nameError && (e.currentTarget.style.border = '1px #32302C solid')}
            onBlur={(e) => !nameError && (e.currentTarget.style.border = '1px #E6E6EC solid')}
          />
          {nameError && (
            <div style={{
              color: '#EF4444',
              fontSize: 12,
              fontFamily: 'Plus Jakarta Sans',
              marginTop: 6
            }}>
              {t('modals.createCategory.nameRequired')}
            </div>
          )}
        </div>

        {/* Emoji Selector */}
        <div>
          <label style={{
            display: 'block',
            color: '#32302C',
            fontSize: 14,
            fontFamily: 'Plus Jakarta Sans',
            fontWeight: '600',
            marginBottom: 8
          }}>
            {t('modals.createCategory.selectEmoji')}
          </label>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))',
            gap: 8,
            maxHeight: 240,
            overflowY: 'auto',
            padding: 4
          }}>
            {emojisToDisplay.map((emoji, index) => (
              <button
                key={index}
                onClick={() => setSelectedEmoji(emoji)}
                disabled={isSubmitting}
                style={{
                  width: 44,
                  height: 44,
                  background: selectedEmoji === emoji ? '#F5F5F5' : 'white',
                  border: selectedEmoji === emoji ? '2px #32302C solid' : '1px #E6E6EC solid',
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 22,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  opacity: isSubmitting ? 0.5 : 1
                }}
                onMouseEnter={(e) => {
                  if (!isSubmitting && selectedEmoji !== emoji) {
                    e.currentTarget.style.background = '#F9FAFB';
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedEmoji !== emoji) {
                    e.currentTarget.style.background = 'white';
                  }
                }}
              >
                <CategoryIcon emoji={emoji} size={22} />
              </button>
            ))}
          </div>
          {!showAllEmojis && (
            <button
              onClick={() => setShowAllEmojis(true)}
              disabled={isSubmitting}
              style={{
                marginTop: 12,
                width: '100%',
                padding: '10px 16px',
                background: '#F5F5F5',
                border: '1px #E6E6EC solid',
                borderRadius: 100,
                color: '#32302C',
                fontSize: 14,
                fontFamily: 'Plus Jakarta Sans',
                fontWeight: '600',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s',
                opacity: isSubmitting ? 0.5 : 1
              }}
              onMouseEnter={(e) => !isSubmitting && (e.currentTarget.style.background = '#E6E6EC')}
              onMouseLeave={(e) => !isSubmitting && (e.currentTarget.style.background = '#F5F5F5')}
            >
              {t('modals.createCategory.showMoreEmojis')}
            </button>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          gap: 12,
          marginTop: 8
        }}>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              flex: 1,
              padding: '12px 18px',
              background: 'white',
              border: '1px #E6E6EC solid',
              borderRadius: 100,
              color: '#32302C',
              fontSize: 16,
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: '500',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
              opacity: isSubmitting ? 0.5 : 1
            }}
            onMouseEnter={(e) => !isSubmitting && (e.currentTarget.style.background = '#F5F5F5')}
            onMouseLeave={(e) => !isSubmitting && (e.currentTarget.style.background = 'white')}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleCreate}
            disabled={isSubmitting || !categoryName.trim()}
            style={{
              flex: 1,
              padding: '12px 18px',
              background: (!isSubmitting && categoryName.trim()) ? '#32302C' : '#E6E6EC',
              border: 'none',
              borderRadius: 100,
              color: (!isSubmitting && categoryName.trim()) ? 'white' : '#9CA3AF',
              fontSize: 16,
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: '600',
              cursor: (!isSubmitting && categoryName.trim()) ? 'pointer' : 'not-allowed',
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => {
              if (!isSubmitting && categoryName.trim()) {
                e.currentTarget.style.opacity = '0.9';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
          >
            {isSubmitting ? t('common.creating') : t('common.create')}
          </button>
        </div>
      </div>
    </div>
  );
}
