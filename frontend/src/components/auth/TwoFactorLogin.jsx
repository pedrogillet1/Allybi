import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { DEFAULT_AUTH_REDIRECT, STORAGE_KEYS } from '../../constants/routes';
import { useAuthModal } from '../../context/AuthModalContext';

const TwoFactorLogin = ({ variant = 'page' }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { verify2FALogin } = useAuth();
  const { completeAuth } = useAuthModal();
  const [token, setToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const isModal = variant === 'modal';

  const challengeToken =
    location.state?.challengeToken || location.state?.tempToken || '';

  const handleVerify = async () => {
    const clean = String(token || '').trim();
    if (!clean) {
      setError(t('settings.errors.invalidVerificationCode'));
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await verify2FALogin({
        token: clean,
        challengeToken,
      });
      localStorage.removeItem(STORAGE_KEYS.PENDING_FIRST_UPLOAD);
      completeAuth({ fallback: DEFAULT_AUTH_REDIRECT });
    } catch (err) {
      setError(
        err?.message ||
          t('settings.errors.invalidVerificationCode')
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      width: '100%',
      minHeight: isModal ? '100%' : '100vh',
      background: '#FFF',
      position: 'relative'
    }}>
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
        <h1 style={{
          fontSize: '32px',
          fontWeight: '600',
          textAlign: 'center',
          margin: 0,
          marginBottom: '16px'
        }}>
          {t('verification.twoStepVerification')}
        </h1>

        <p style={{
          fontSize: '16px',
          color: '#666',
          textAlign: 'center',
          margin: 0,
          marginBottom: '32px',
          lineHeight: '1.5'
        }}>
          {t('verification.keepAccountSafe')}
        </p>

        <div style={{ width: '100%', marginBottom: '16px' }}>
          <input
            type="text"
            autoComplete="one-time-code"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={t('verification.enterCode')}
            style={{
              width: '100%',
              height: 52,
              padding: '0 18px',
              background: 'transparent',
              borderRadius: 26,
              border: '1px solid #E6E6EC',
              fontSize: 16,
              boxSizing: 'border-box',
              outline: 'none'
            }}
          />
        </div>

        {error && (
          <div style={{
            width: '100%',
            background: '#FEE2E2',
            color: '#DC2626',
            padding: '12px 16px',
            borderRadius: 26,
            fontSize: 14,
            marginBottom: '16px',
            boxSizing: 'border-box'
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleVerify}
          disabled={isLoading}
          style={{
            width: '100%',
            height: '52px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: isLoading ? '#F5F5F5' : '#181818',
            border: 'none',
            borderRadius: '26px',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            fontSize: '16px',
            fontWeight: '600',
            color: isLoading ? '#6C6B6E' : 'white',
            opacity: isLoading ? 0.6 : 1
          }}
        >
          {isLoading ? t('verification.verifying') : t('verification.verifyAndContinue')}
        </button>
      </div>
    </div>
  );
};

export default TwoFactorLogin;
