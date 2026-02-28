import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ReactComponent as XCloseIcon } from '../../assets/x-close.svg';
import { useAuth } from '../../context/AuthContext';
import { useAuthModal } from '../../context/AuthModalContext';
import { useIsMobile } from '../../hooks/useIsMobile';
import CategoryIcon from './CategoryIcon';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001/api';

/**
 * Delete Category Modal - Option C Implementation
 * Two modes: Delete category only (keep files) or Delete category + all files (cascade)
 */
const DeleteCategoryModal = ({ isOpen, onClose, onConfirm, category }) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { isAuthenticated, token } = useAuth();
  const authModal = useAuthModal();

  // State
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [selectedMode, setSelectedMode] = useState(null); // 'folderOnly' or 'cascade'
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Hover states
  const [cancelHover, setCancelHover] = useState(false);
  const [folderOnlyHover, setFolderOnlyHover] = useState(false);
  const [cascadeHover, setCascadeHover] = useState(false);
  const [confirmHover, setConfirmHover] = useState(false);

  // Fetch deletion stats when modal opens
  useEffect(() => {
    if (isOpen && category?.id) {
      fetchDeletionStats();
    }
  }, [isOpen, category?.id]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedMode(null);
      setDeleteConfirmText('');
      setStats(null);
      setError(null);
      setLoading(true);
    }
  }, [isOpen]);

  const fetchDeletionStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/folders/${category.id}/deletion-stats`, {
        credentials: 'include',
        headers: token ? { 'Authorization': `Bearer ${token}` } : undefined,
      });
      if (!response.ok) {
        throw new Error('Failed to fetch deletion stats');
      }
      const data = await response.json();
      setStats(data);
    } catch (err) {
      console.error('Error fetching deletion stats:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Auth check wrapper
  const handleConfirm = async () => {
    if (!isAuthenticated) {
      authModal.open({ mode: 'signup', reason: 'delete_category' });
      return;
    }

    if (!selectedMode) return;

    // For cascade mode, require typing DELETE
    if (selectedMode === 'cascade' && deleteConfirmText !== 'DELETE') {
      return;
    }

    setIsDeleting(true);
    try {
      await onConfirm(selectedMode);
      onClose();
    } catch (err) {
      console.error('Delete error:', err);
      setError(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const canConfirm = selectedMode === 'folderOnly' ||
    (selectedMode === 'cascade' && deleteConfirmText === 'DELETE');

  // Render loading state
  const renderLoading = () => (
    <div style={{ padding: 24, textAlign: 'center' }}>
      <div style={{ color: '#6C6B6E', fontSize: 14, fontFamily: 'Plus Jakarta Sans' }}>
        {t('common.loading')}
      </div>
    </div>
  );

  // Render error state
  const renderError = () => (
    <div style={{ padding: 24, textAlign: 'center' }}>
      <div style={{ color: '#D92D20', fontSize: 14, fontFamily: 'Plus Jakarta Sans', marginBottom: 12 }}>
        {error}
      </div>
      <button
        onClick={fetchDeletionStats}
        style={{
          padding: '8px 16px',
          background: '#F5F5F5',
          border: '1px solid #E6E6EC',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: 14,
          fontFamily: 'Plus Jakarta Sans',
        }}
      >
        {t('common.retry')}
      </button>
    </div>
  );

  // Render mode selection
  const renderModeSelection = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Category info header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <CategoryIcon emoji={category?.emoji || '__FOLDER_SVG__'} size={42} />
        <div>
          <div style={{ fontWeight: '600', color: '#32302C', fontSize: 16, fontFamily: 'Plus Jakarta Sans' }}>
            {stats?.folderName || category?.name}
          </div>
          <div style={{ color: '#6C6B6E', fontSize: 14, fontFamily: 'Plus Jakarta Sans' }}>
            {stats?.documentCount || 0} {stats?.documentCount === 1 ? t('common.file') : t('common.files')}
            {stats?.subfolderCount > 0 && ` • ${stats.subfolderCount} ${stats.subfolderCount === 1 ? t('common.folder') : t('common.folders')}`}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: '#E6E6EC' }} />

      {/* Mode selection buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Option 1: Delete category only */}
        <button
          onClick={() => setSelectedMode('folderOnly')}
          onMouseEnter={() => setFolderOnlyHover(true)}
          onMouseLeave={() => setFolderOnlyHover(false)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: 14,
            background: selectedMode === 'folderOnly' ? '#F0F9FF' : (folderOnlyHover ? '#F5F5F5' : 'white'),
            border: selectedMode === 'folderOnly' ? '2px solid #0EA5E9' : '1px solid #E6E6EC',
            borderRadius: 12,
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            border: selectedMode === 'folderOnly' ? '6px solid #0EA5E9' : '2px solid #D1D5DB',
            flexShrink: 0,
          }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: '600', color: '#32302C', fontSize: 14, fontFamily: 'Plus Jakarta Sans', marginBottom: 2 }}>
              {t('deleteCategory.folderOnlyTitle', 'Delete category only')}
            </div>
            <div style={{ color: '#6C6B6E', fontSize: 13, fontFamily: 'Plus Jakarta Sans' }}>
              {t('deleteCategory.folderOnlyDesc', 'Files will be moved to Unsorted')}
            </div>
          </div>
        </button>

        {/* Option 2: Delete category + files (cascade) */}
        <button
          onClick={() => setSelectedMode('cascade')}
          onMouseEnter={() => setCascadeHover(true)}
          onMouseLeave={() => setCascadeHover(false)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: 14,
            background: selectedMode === 'cascade' ? '#FEF2F2' : (cascadeHover ? '#FEF2F2' : 'white'),
            border: selectedMode === 'cascade' ? '2px solid #D92D20' : '1px solid #E6E6EC',
            borderRadius: 12,
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'all 0.2s ease',
          }}
        >
          <div style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            border: selectedMode === 'cascade' ? '6px solid #D92D20' : '2px solid #D1D5DB',
            flexShrink: 0,
          }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: '600', color: '#D92D20', fontSize: 14, fontFamily: 'Plus Jakarta Sans', marginBottom: 2 }}>
              {t('deleteCategory.cascadeTitle', 'Delete category + all files')}
            </div>
            <div style={{ color: '#6C6B6E', fontSize: 13, fontFamily: 'Plus Jakarta Sans' }}>
              {stats?.documentCount > 0
                ? t('deleteCategory.cascadeDesc', 'Permanently delete {{count}} files', { count: stats.documentCount })
                : t('deleteCategory.cascadeDescNoFiles', 'No files to delete')}
            </div>
          </div>
        </button>
      </div>

      {/* DELETE confirmation input for cascade mode */}
      {selectedMode === 'cascade' && stats?.documentCount > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{
            color: '#D92D20',
            fontSize: 13,
            fontFamily: 'Plus Jakarta Sans',
            marginBottom: 8,
            fontWeight: '500'
          }}>
            {t('deleteCategory.typeDeleteConfirm', 'Type DELETE to confirm permanent deletion:')}
          </div>
          <input
            type="text"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value.toUpperCase())}
            placeholder="DELETE"
            style={{
              width: '100%',
              padding: '10px 14px',
              border: deleteConfirmText === 'DELETE' ? '2px solid #D92D20' : '1px solid #E6E6EC',
              borderRadius: 8,
              fontSize: 14,
              fontFamily: 'Plus Jakarta Sans',
              outline: 'none',
              boxSizing: 'border-box',
              background: deleteConfirmText === 'DELETE' ? '#FEF2F2' : 'white',
              transition: 'all 0.2s ease',
            }}
            autoComplete="off"
          />
        </div>
      )}
    </div>
  );

  // Use portal to render at document body level
  return ReactDOM.createPortal(
    <>
      {/* Dark Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100vw',
          height: '100vh',
          background: 'linear-gradient(180deg, rgba(17, 19, 21, 0.50) 0%, rgba(17, 19, 21, 0.90) 100%)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: isMobile ? 16 : 16
        }}
      >
        {/* Modal */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: isMobile ? 'calc(100% - 32px)' : 440,
            maxWidth: 440,
            padding: 18,
            background: 'white',
            borderRadius: 14,
            outline: '1px #E6E6EC solid',
            outlineOffset: '-1px',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 18,
            display: 'flex',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            maxHeight: '90vh',
            overflow: 'auto'
          }}
        >
          {/* Header */}
          <div style={{ alignSelf: 'stretch', justifyContent: 'space-between', alignItems: 'center', display: 'flex' }}>
            <div style={{ width: 30, height: 30, opacity: 0 }} />
            <div style={{ flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'center', gap: 12, display: 'flex' }}>
              <div style={{ textAlign: 'center', color: '#32302C', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '700', lineHeight: '24px' }}>
                {t('deleteCategory.title', 'Delete Category')}
              </div>
            </div>
            <div
              onClick={onClose}
              style={{ width: 30, height: 30, paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4, background: 'white', borderRadius: 100, outline: '1px #E6E6EC solid', outlineOffset: '-1px', justifyContent: 'center', alignItems: 'center', display: 'flex', cursor: 'pointer' }}
            >
              <XCloseIcon style={{ width: 18, height: 18 }} />
            </div>
          </div>

          {/* Divider */}
          <div style={{ alignSelf: 'stretch', height: 1, background: '#E6E6EC' }} />

          {/* Content */}
          <div style={{ alignSelf: 'stretch' }}>
            {loading && renderLoading()}
            {error && !loading && renderError()}
            {!loading && !error && stats && renderModeSelection()}
          </div>

          {/* Divider */}
          {!loading && !error && (
            <div style={{ alignSelf: 'stretch', height: 1, background: '#E6E6EC' }} />
          )}

          {/* Buttons */}
          {!loading && !error && (
            <div style={{ alignSelf: 'stretch', justifyContent: 'flex-start', alignItems: 'flex-start', gap: 8, display: 'flex' }}>
              <div
                onClick={onClose}
                onMouseEnter={() => setCancelHover(true)}
                onMouseLeave={() => setCancelHover(false)}
                style={{
                  flex: '1 1 0',
                  height: 52,
                  paddingLeft: 18,
                  paddingRight: 18,
                  paddingTop: 10,
                  paddingBottom: 10,
                  background: cancelHover ? '#ECECEC' : '#F5F5F5',
                  borderRadius: 100,
                  outline: '1px #E6E6EC solid',
                  outlineOffset: '-1px',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 8,
                  display: 'flex',
                  cursor: 'pointer',
                  transition: 'background 0.2s ease'
                }}
              >
                <div style={{ color: '#323232', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '700', textTransform: 'capitalize', lineHeight: '24px' }}>
                  {t('common.cancel')}
                </div>
              </div>
              <div
                onClick={canConfirm && !isDeleting ? handleConfirm : undefined}
                onMouseEnter={() => setConfirmHover(true)}
                onMouseLeave={() => setConfirmHover(false)}
                style={{
                  flex: '1 1 0',
                  height: 52,
                  paddingLeft: 18,
                  paddingRight: 18,
                  paddingTop: 10,
                  paddingBottom: 10,
                  background: !canConfirm || isDeleting
                    ? '#F5F5F5'
                    : (selectedMode === 'cascade' ? (confirmHover ? '#FECACA' : '#FEE2E2') : (confirmHover ? '#DBEAFE' : '#EFF6FF')),
                  borderRadius: 100,
                  outline: '1px #E6E6EC solid',
                  outlineOffset: '-1px',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: 8,
                  display: 'flex',
                  cursor: canConfirm && !isDeleting ? 'pointer' : 'not-allowed',
                  transition: 'background 0.2s ease',
                  opacity: canConfirm && !isDeleting ? 1 : 0.5
                }}
              >
                <div style={{
                  color: !canConfirm || isDeleting
                    ? '#9CA3AF'
                    : (selectedMode === 'cascade' ? '#D92D20' : '#0EA5E9'),
                  fontSize: 16,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '700',
                  textTransform: 'capitalize',
                  lineHeight: '24px'
                }}>
                  {isDeleting
                    ? t('common.loading')
                    : (selectedMode === 'cascade'
                      ? t('deleteCategory.confirmCascade', 'Delete All')
                      : t('common.confirm'))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  );
};

export default DeleteCategoryModal;
