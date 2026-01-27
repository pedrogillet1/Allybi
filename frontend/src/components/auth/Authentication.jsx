import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const Authentication = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
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
          marginBottom: '32px',
          fontSize: '72px',
          textShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
        }}>
          👤
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
          onClick={() => navigate('/verify-email')}
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
            fontSize: '16px',
            fontWeight: '500'
          }}
        >
          <span style={{ fontSize: '28px', textShadow: '0 2px 6px rgba(0, 0, 0, 0.15)' }}>📧</span>
          {t('authentication.continueWithEmail')}
        </button>

        {/* Phone Option */}
        <button
          onClick={() => navigate('/phone-number')}
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
            fontSize: '16px',
            fontWeight: '500'
          }}
        >
          <span style={{ fontSize: '28px', textShadow: '0 2px 6px rgba(0, 0, 0, 0.15)', display: 'inline-block', transform: 'rotate(-15deg)' }}>📱</span>
          {t('authentication.continueWithPhone')}
        </button>
      </div>
    </div>
  );
};

export default Authentication;
