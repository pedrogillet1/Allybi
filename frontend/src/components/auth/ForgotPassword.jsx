import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

function ForgotPassword() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  const { maskedEmail, maskedPhone, hasPhone, canUseEmail = true, canUsePhone, hasUnverifiedPhone } = location.state || {};

  const [selectedMethod, setSelectedMethod] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailHover, setEmailHover] = useState(false);
  const [smsHover, setSmsHover] = useState(false);

  useEffect(() => {
    console.log('🔐 [ForgotPassword] Component mounted');
    console.log('📧 [ForgotPassword] maskedEmail:', maskedEmail);
    console.log('📱 [ForgotPassword] maskedPhone:', maskedPhone);
    console.log('🔑 [ForgotPassword] location.state:', location.state);

    const sessionToken = sessionStorage.getItem('resetSessionToken');
    console.log('🗝️  [ForgotPassword] sessionToken in sessionStorage:', sessionToken ? sessionToken.substring(0, 20) + '...' : 'NOT FOUND');

    if (!maskedEmail) {
      console.warn('⚠️  [ForgotPassword] No maskedEmail found, redirecting to /recover-access');
      navigate('/recover-access');
    }
  }, [maskedEmail, navigate, maskedPhone, location.state]);

  const handleContinue = async () => {
    if (!selectedMethod) {
      setError(t('auth.forgotPassword.selectMethod'));
      return;
    }

    setError('');
    setLoading(true);

    try {
      const sessionToken = sessionStorage.getItem('resetSessionToken');

      if (!sessionToken) {
        setError(t('auth.forgotPassword.sessionExpired'));
        setTimeout(() => navigate('/recover-access'), 2000);
        return;
      }

      // Send reset LINK (not code) via selected method
      const response = await api.post('/api/auth/send-reset-link', {
        sessionToken,
        method: selectedMethod
      });

      if (response.data.success) {
        navigate('/forgot-password-verification', {
          state: {
            method: selectedMethod,
            maskedEmail,
            maskedPhone
          }
        });
      }
    } catch (error) {
      console.error('Send reset link error:', error);

      if (error.response?.data?.error) {
        setError(error.response.data.error);
      } else {
        setError(t('auth.forgotPassword.sendFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: '#FFF',
      position: 'relative'
    }}>
      {/* Back Button */}
      <button
        onClick={() => navigate('/recover-access')}
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
          🔐
        </div>

        <h1 style={{
          fontSize: '32px',
          fontWeight: '600',
          textAlign: 'center',
          margin: 0,
          marginBottom: '16px'
        }}>
          {t('auth.forgotPassword.title')}
        </h1>

        <p style={{
          fontSize: '16px',
          color: '#666',
          textAlign: 'center',
          margin: 0,
          marginBottom: '48px',
          lineHeight: '1.5'
        }}>
          {t('auth.forgotPassword.subtitle')}
        </p>

        {/* Email Option */}
        <button
          onClick={() => canUseEmail && setSelectedMethod('email')}
          onMouseEnter={() => setEmailHover(true)}
          onMouseLeave={() => setEmailHover(false)}
          disabled={!canUseEmail}
          style={{
            width: '100%',
            padding: '16px 20px',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: selectedMethod === 'email' ? '#F5F5F5' : '#FFF',
            border: selectedMethod === 'email' ? '1px solid #181818' : '1px solid #E0E0E0',
            borderRadius: '26px',
            cursor: canUseEmail ? 'pointer' : 'not-allowed',
            opacity: canUseEmail ? 1 : 0.5,
            transform: canUseEmail && emailHover ? 'scale(1.02)' : 'scale(1)',
            transition: 'transform 0.2s ease, border-color 0.2s ease'
          }}
        >
          <div style={{ width: '32px', height: '32px', fontSize: '28px', textShadow: '0 2px 6px rgba(0, 0, 0, 0.15)' }}>📧</div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontSize: '16px', fontWeight: '600', color: canUseEmail ? '#000' : '#999', marginBottom: '4px' }}>
              {t('auth.forgotPassword.sendViaEmail')}
            </div>
            <div style={{ fontSize: '14px', color: canUseEmail ? '#666' : '#999' }}>
              {canUseEmail ? maskedEmail : t('auth.forgotPassword.emailNotVerified')}
            </div>
          </div>
          {canUseEmail && (
            <div style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              border: '2px solid ' + (selectedMethod === 'email' ? '#000' : '#CCC'),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {selectedMethod === 'email' && (
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#000' }} />
              )}
            </div>
          )}
        </button>

        {/* Phone Option */}
        <button
          onClick={() => canUsePhone && setSelectedMethod('sms')}
          onMouseEnter={() => setSmsHover(true)}
          onMouseLeave={() => setSmsHover(false)}
          disabled={!canUsePhone}
          style={{
            width: '100%',
            padding: '16px 20px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: selectedMethod === 'sms' ? '#F5F5F5' : '#FFF',
            border: selectedMethod === 'sms' ? '1px solid #181818' : '1px solid #E0E0E0',
            borderRadius: '26px',
            cursor: canUsePhone ? 'pointer' : 'not-allowed',
            opacity: canUsePhone ? 1 : 0.5,
            transform: canUsePhone && smsHover ? 'scale(1.02)' : 'scale(1)',
            transition: 'transform 0.2s ease, border-color 0.2s ease'
          }}
        >
          <div style={{ width: '32px', height: '32px', fontSize: '28px', textShadow: '0 2px 6px rgba(0, 0, 0, 0.15)' }}>💬</div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontSize: '16px', fontWeight: '600', color: canUsePhone ? '#000' : '#999', marginBottom: '4px' }}>
              {t('auth.forgotPassword.sendViaSms')}
            </div>
            <div style={{ fontSize: '14px', color: canUsePhone ? '#666' : '#999' }}>
              {hasUnverifiedPhone ? (
                <>
                  <div>{maskedPhone}</div>
                  <div style={{ fontSize: '12px', color: '#999', marginTop: '2px' }}>{t('auth.forgotPassword.numberNotVerified')}</div>
                </>
              ) : canUsePhone ? maskedPhone : t('auth.forgotPassword.noPhoneLinked')}
            </div>
          </div>
          {canUsePhone && (
            <div style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              border: '2px solid ' + (selectedMethod === 'sms' ? '#000' : '#CCC'),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {selectedMethod === 'sms' && (
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#000' }} />
              )}
            </div>
          )}
        </button>

        {error && (
          <div style={{
            width: '100%',
            padding: '14px 20px',
            marginBottom: '16px',
            background: '#FEE',
            border: '1px solid #FCC',
            borderRadius: '26px',
            color: '#C00',
            fontSize: '14px'
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleContinue}
          disabled={!selectedMethod || loading}
          style={{
            width: '100%',
            height: '52px',
            padding: '14px 24px',
            fontSize: '16px',
            fontWeight: '600',
            color: '#FFF',
            background: (!selectedMethod || loading) ? '#999' : '#000',
            border: 'none',
            borderRadius: '26px',
            cursor: (!selectedMethod || loading) ? 'not-allowed' : 'pointer',
            boxSizing: 'border-box'
          }}
        >
          {loading ? t('auth.forgotPassword.sending') : t('auth.signup.continue')}
        </button>
      </div>
    </div>
  );
}

export default ForgotPassword;
