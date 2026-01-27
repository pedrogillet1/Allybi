import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { buildRoute, AUTH_MODES } from '../constants/routes';

function ForgotPasswordVerification() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  const { method } = location.state || {};
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const [resendHover, setResendHover] = useState(false);
  const [backHover, setBackHover] = useState(false);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setCanResend(true);
    }
  }, [countdown]);

  const handleResend = async () => {
    if (!canResend) return;
    // TODO: Implement resend functionality
    setCountdown(60);
    setCanResend(false);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isEmail = method === 'email';
  const title = isEmail ? t('forgotPassword.checkYourEmail') : t('forgotPassword.checkYourMessages');
  const subtitle = isEmail
    ? t('forgotPassword.secureLinkSentWithSpam')
    : t('forgotPassword.secureLinkSentSms');

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
        {t('common.back')}
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
          {isEmail ? '📧' : '💬'}
        </div>

        <h1 style={{
          fontSize: '32px',
          fontWeight: '600',
          margin: 0,
          marginBottom: '16px'
        }}>
          {title}
        </h1>

        <p style={{
          fontSize: '16px',
          color: '#666',
          margin: 0,
          marginBottom: '48px',
          lineHeight: '1.5'
        }}>
          {subtitle}
        </p>

        <div style={{ marginBottom: '24px' }}>
          <span style={{ fontSize: '14px', color: '#666' }}>
            {isEmail ? t('forgotPassword.didntGetEmail') : t('forgotPassword.didntGetLink')}{' '}
          </span>
          {canResend ? (
            <button
              onClick={handleResend}
              onMouseEnter={() => setResendHover(true)}
              onMouseLeave={() => setResendHover(false)}
              style={{
                background: 'none',
                border: 'none',
                color: '#000',
                fontWeight: '600',
                cursor: 'pointer',
                textDecoration: 'underline',
                fontSize: '14px',
                transform: resendHover ? 'scale(1.05)' : 'scale(1)',
                transition: 'transform 0.2s ease'
              }}
            >
              {t('common.resend')}
            </button>
          ) : (
            <span style={{ fontSize: '14px', color: '#000', fontWeight: '600' }}>
              {t('forgotPassword.resendIn', { time: formatTime(countdown) })}
            </span>
          )}
        </div>

        <button
          onClick={() => navigate(buildRoute.auth(AUTH_MODES.LOGIN))}
          onMouseEnter={() => setBackHover(true)}
          onMouseLeave={() => setBackHover(false)}
          style={{
            width: '100%',
            height: '52px',
            padding: '14px 24px',
            fontSize: '16px',
            fontWeight: '600',
            color: '#000',
            background: '#FFF',
            border: backHover ? '1px solid #181818' : '1px solid #E0E0E0',
            borderRadius: '26px',
            cursor: 'pointer',
            boxSizing: 'border-box',
            transform: backHover ? 'scale(1.02)' : 'scale(1)',
            transition: 'transform 0.2s ease, border-color 0.2s ease'
          }}
        >
          {t('passwordChanged.backToLogin')}
        </button>
      </div>
    </div>
  );
}

export default ForgotPasswordVerification;
