import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { buildRoute, AUTH_MODES } from '../constants/routes';
import { ReactComponent as XCloseIcon } from '../assets/x-close.svg';
import { useIsMobile } from '../hooks/useIsMobile';

const LogoutModal = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleLogout = () => {
    // Clear authentication data
    localStorage.removeItem('token');
    localStorage.removeItem('user');

    // Navigate to auth page (login mode)
    navigate(buildRoute.auth(AUTH_MODES.LOGIN));
  };

  return (
    <>
      {/* Dark Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'linear-gradient(180deg, rgba(17, 19, 21, 0.50) 0%, rgba(17, 19, 21, 0.90) 100%)',
          zIndex: 1100,
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
            display: 'flex'
          }}
        >
          {/* Header */}
          <div style={{alignSelf: 'stretch', justifyContent: 'space-between', alignItems: 'center', display: 'flex'}}>
            <div style={{width: 30, height: 30, opacity: 0}} />
            <div style={{flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'center', gap: 12, display: 'flex'}}>
              <div style={{textAlign: 'center', color: '#32302C', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '700', lineHeight: '24px'}}>{t('modals.logout.title')}</div>
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
            <div style={{textAlign: 'center', color: '#32302C', fontSize: 16, fontFamily: 'Plus Jakarta Sans', lineHeight: '24px'}}>
              <span style={{fontWeight: '500'}}>{t('modals.logout.confirmText')} </span>
              <span style={{fontWeight: '700'}}>{t('modals.logout.title')}</span>
              <span style={{fontWeight: '500'}}>?</span>
            </div>
          </div>

          {/* Divider */}
          <div style={{alignSelf: 'stretch', height: 1, background: '#E6E6EC'}} />

          {/* Buttons */}
          <div style={{alignSelf: 'stretch', justifyContent: 'flex-start', alignItems: 'flex-start', gap: 8, display: 'flex'}}>
            <div
              onClick={onClose}
              style={{flex: '1 1 0', height: 52, paddingLeft: 18, paddingRight: 18, paddingTop: 10, paddingBottom: 10, background: '#F5F5F5', borderRadius: 100, outline: '1px #E6E6EC solid', outlineOffset: '-1px', justifyContent: 'center', alignItems: 'center', gap: 8, display: 'flex', cursor: 'pointer'}}
            >
              <div style={{color: '#323232', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '700', textTransform: 'capitalize', lineHeight: '24px'}}>{t('modals.logout.cancel')}</div>
            </div>
            <div
              onClick={handleLogout}
              style={{flex: '1 1 0', height: 52, paddingLeft: 18, paddingRight: 18, paddingTop: 10, paddingBottom: 10, background: '#F5F5F5', borderRadius: 100, outline: '1px #E6E6EC solid', outlineOffset: '-1px', justifyContent: 'center', alignItems: 'center', gap: 8, display: 'flex', cursor: 'pointer'}}
            >
              <div style={{color: '#D92D20', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '700', textTransform: 'capitalize', lineHeight: '24px'}}>{t('modals.logout.confirm')}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default LogoutModal;
