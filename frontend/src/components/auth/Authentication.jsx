import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ROUTES } from '../../constants/routes';
import emailIcon from '../../assets/email-icon.svg';
import authenticationIcon from '../../assets/profile-user-icon.svg';
import phoneIcon from '../../assets/notification-bell.svg';

const Authentication = ({ variant = 'page' }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const isModal = variant === 'modal';

  // Forward state from signup/login (email, 2FA info) to verification pages
  const forwardState = location.state || {};

  return (
    <div style={{
      width: '100%',
      minHeight: isModal ? '100%' : '100vh',
      background: '#FFF',
      position: 'relative'
    }}>
      {/* Back Button */}
      <button
        onClick={() => navigate(-1)}
        style={{
          position: 'absolute',
          top: '24px',
          left: '24px',
          background: 'none',
          border: 'none',
          fontSize: '16px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          color: '#000',
          padding: 0
        }}
      >
        ← {t('common.back')}
      </button>

      {/* Content Container */}
      <div style={{
        width: '100%',
        maxWidth: '400px',
        margin: '0 auto',
        padding: '0 24px',
        boxSizing: 'border-box',
        paddingTop: '140px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center'
      }}>
        {/* Icon */}
        <div style={{
          marginBottom: '32px'
        }}>
          <img src={authenticationIcon} alt="Authentication" style={{ width: '100px', height: '100px', filter: 'brightness(0) saturate(100%) invert(32%) sepia(9%) saturate(759%) hue-rotate(182deg) brightness(96%) contrast(89%)' }} />
        </div>

        <h1 style={{
          fontSize: '32px',
          fontWeight: '600',
          textAlign: 'center',
          margin: 0,
          marginBottom: '16px'
        }}>
          {t('authentication.title')}
        </h1>

        <p style={{
          fontSize: '16px',
          color: '#666',
          textAlign: 'center',
          margin: 0,
          marginBottom: '48px',
          lineHeight: '1.5'
        }}>
          {t('authentication.subtitle')}
        </p>

        {/* Email Option */}
        <button
          onClick={() => navigate(ROUTES.VERIFY_EMAIL, { state: forwardState })}
          style={{
            width: '100%',
            height: '52px',
            padding: '14px 24px',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            background: '#FFF',
            border: '1px solid #E0E0E0',
            borderRadius: '26px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500'
          }}
        >
          <img src={emailIcon} alt="Email" style={{ width: '28px', height: '28px', filter: 'brightness(0) saturate(100%) invert(32%) sepia(9%) saturate(759%) hue-rotate(182deg) brightness(96%) contrast(89%)' }} />
          {t('authentication.continueWithEmail')}
        </button>

        {/* Phone Option */}
        <button
          onClick={() => navigate(ROUTES.PHONE_NUMBER, { state: forwardState })}
          style={{
            width: '100%',
            height: '52px',
            padding: '14px 24px',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            background: '#FFF',
            border: '1px solid #E0E0E0',
            borderRadius: '26px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500'
          }}
        >
          <img src={phoneIcon} alt="Phone" style={{ width: '28px', height: '28px', filter: 'brightness(0) saturate(100%) invert(32%) sepia(9%) saturate(759%) hue-rotate(182deg) brightness(96%) contrast(89%)' }} />
          {t('authentication.continueWithPhone')}
        </button>
      </div>
    </div>
  );
};

export default Authentication;
