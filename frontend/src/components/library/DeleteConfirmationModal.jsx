import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ReactComponent as XCloseIcon } from '../assets/x-close.svg';
import { useAuth } from '../context/AuthContext';
import { useIsMobile } from '../hooks/useIsMobile';

/**
 * Delete Confirmation Modal
 * Matches LogoutModal design exactly
 */
const DeleteConfirmationModal = ({ isOpen, onClose, onConfirm, itemName, itemType = 'item' }) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [cancelHover, setCancelHover] = useState(false);
  const [deleteHover, setDeleteHover] = useState(false);
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  if (!isOpen) return null;

  // ✅ Auth check wrapper for delete action
  const handleDelete = () => {
    if (!isAuthenticated) {
      navigate('/signup');
      return;
    }
    onConfirm();
  };

  // Format the item name for display
  const getDisplayName = () => {
    if (itemType === 'multiple') {
      return `${itemName} ${t('modals.delete.items')}`;
    }
    return itemName || t('modals.delete.thisItem');
  };

  // Use portal to render at document body level, bypassing any parent overflow/stacking issues
  return ReactDOM.createPortal(
    <>
      {/* Dark Overlay - CENTERED on both mobile and desktop */}
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
        {/* Modal - CENTERED */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: isMobile ? 'calc(100% - 32px)' : 400,
            maxWidth: 400,
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
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }}
        >
          {/* Header */}
          <div style={{alignSelf: 'stretch', justifyContent: 'space-between', alignItems: 'center', display: 'flex'}}>
            <div style={{width: 30, height: 30, opacity: 0}} />
            <div style={{flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'center', gap: 12, display: 'flex'}}>
              <div style={{textAlign: 'center', color: '#32302C', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '700', lineHeight: '24px'}}>{t('modals.delete.title')}</div>
            </div>
            <div
              onClick={onClose}
              style={{width: 30, height: 30, paddingLeft: 8, paddingRight: 8, paddingTop: 4, paddingBottom: 4, background: 'white', borderRadius: 100, outline: '1px #E6E6EC solid', outlineOffset: '-1px', justifyContent: 'center', alignItems: 'center', display: 'flex', cursor: 'pointer'}}
            >
              <XCloseIcon style={{width: 18, height: 18}} />
            </div>
          </div>

          {/* Divider */}
          <div style={{alignSelf: 'stretch', height: 1, background: '#E6E6EC'}} />

          {/* Message */}
          <div style={{alignSelf: 'stretch', justifyContent: 'center', alignItems: 'center', gap: 10, display: 'flex'}}>
            <div style={{textAlign: 'center', color: '#32302C', fontSize: 16, fontFamily: 'Plus Jakarta Sans', lineHeight: '24px', wordBreak: 'break-word', overflowWrap: 'break-word', maxWidth: '100%'}}>
              <span style={{fontWeight: '500'}}>{t('modals.delete.confirmText')} </span>
              <span style={{fontWeight: '700'}}>{getDisplayName()}</span>
              <span style={{fontWeight: '500'}}>?</span>
            </div>
          </div>

          {/* Divider */}
          <div style={{alignSelf: 'stretch', height: 1, background: '#E6E6EC'}} />

          {/* Buttons */}
          <div style={{alignSelf: 'stretch', justifyContent: 'flex-start', alignItems: 'flex-start', gap: 8, display: 'flex'}}>
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
              <div style={{color: '#323232', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '700', textTransform: 'capitalize', lineHeight: '24px'}}>{t('modals.delete.cancel')}</div>
            </div>
            <div
              onClick={handleDelete}
              onMouseEnter={() => setDeleteHover(true)}
              onMouseLeave={() => setDeleteHover(false)}
              style={{
                flex: '1 1 0',
                height: 52,
                paddingLeft: 18,
                paddingRight: 18,
                paddingTop: 10,
                paddingBottom: 10,
                background: deleteHover ? '#FEE2E2' : '#F5F5F5',
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
              <div style={{color: '#D92D20', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '700', textTransform: 'capitalize', lineHeight: '24px'}}>{t('modals.delete.confirm')}</div>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
};

export default DeleteConfirmationModal;
