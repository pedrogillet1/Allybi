import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import PhoneInput from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import '../../styles/RecoveryVerificationBanner.css';
import { useNotifications } from '../../context/NotificationsStore';
import api from '../../services/api';

/**
 * Mask an email address: "john@example.com" → "j***@example.com"
 */
const maskEmail = (email) => {
  if (!email) return '';
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  return local[0] + '***@' + domain;
};

/**
 * Mask a phone number: "+5511999887766" → "+55***7766"
 */
const maskPhone = (phone) => {
  if (!phone) return '';
  if (phone.length <= 4) return phone;
  return phone.slice(0, 3) + '***' + phone.slice(-4);
};

const RecoveryVerificationBanner = () => {
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotifications();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);

  useEffect(() => {
    fetchUserStatus();
  }, []);

  const fetchUserStatus = async () => {
    try {
      const response = await api.get('/api/auth/me');
      setUser(response.data.user);
    } catch (error) {
      // Silently fail — banner won't render
    } finally {
      setLoading(false);
    }
  };

  const handleSendEmailVerification = async () => {
    setSending(true);
    try {
      await api.post('/api/auth/verify/send-email');
      showSuccess(t('notifications.recoveryVerification.emailSent', 'Verification email sent! Check your inbox.'));
    } catch (error) {
      showError(error.response?.data?.error || t('notifications.recoveryVerification.emailFailed', 'Failed to send verification email'));
    } finally {
      setSending(false);
    }
  };

  const handleSendPhoneVerification = async () => {
    if (!user?.phoneNumber) return;
    setSending(true);
    try {
      await api.post('/api/auth/verify/send-phone', { phoneNumber: user.phoneNumber });
      showSuccess(t('notifications.recoveryVerification.smsSent', 'Verification SMS sent! Check your phone.'));
    } catch (error) {
      showError(error.response?.data?.error || t('notifications.recoveryVerification.smsFailed', 'Failed to send verification SMS'));
    } finally {
      setSending(false);
    }
  };

  const handleAddPhone = () => {
    setShowPhoneModal(true);
  };

  // Don't render if loading or no user data
  if (loading || !user) return null;

  // Don't render if both channels are verified
  if (user.isEmailVerified && user.isPhoneVerified) return null;

  // Determine banner content based on verification status
  let bannerContent = null;
  const hasPhone = !!user.phoneNumber;

  if (!user.isEmailVerified && user.isPhoneVerified) {
    bannerContent = {
      icon: '📧',
      title: 'Verify your recovery email',
      body: `Add a second way to regain access. We'll send a verification link to ${maskEmail(user.email)}.`,
      ctaText: 'Send verification link',
      ctaAction: handleSendEmailVerification,
    };
  } else if (user.isEmailVerified && !hasPhone) {
    bannerContent = {
      icon: <span style={{ fontSize: 40, display: 'inline-block', transform: 'rotate(-15deg)', filter: 'drop-shadow(2px 4px 6px rgba(0, 0, 0, 0.2))' }}>📱</span>,
      title: 'Add a recovery phone',
      body: 'Use your phone as a second way to recover your account.',
      ctaText: 'Add phone',
      ctaAction: handleAddPhone,
    };
  } else if (user.isEmailVerified && hasPhone && !user.isPhoneVerified) {
    bannerContent = {
      icon: <span style={{ fontSize: 40, display: 'inline-block', transform: 'rotate(-15deg)', filter: 'drop-shadow(2px 4px 6px rgba(0, 0, 0, 0.2))' }}>📱</span>,
      title: 'Verify your recovery phone',
      body: `Add a second way to regain access. We'll send a verification link to ${maskPhone(user.phoneNumber)}.`,
      ctaText: 'Send verification link',
      ctaAction: handleSendPhoneVerification,
    };
  }

  if (!bannerContent) return null;

  return (
    <>
      <div className="recovery-verification-banner">
        <div className="banner-icon">{bannerContent.icon}</div>
        <div className="banner-content">
          <h3 className="banner-title">{bannerContent.title}</h3>
          <p className="banner-body">{bannerContent.body}</p>
        </div>
        <button
          className="banner-cta"
          onClick={bannerContent.ctaAction}
          disabled={sending}
        >
          {sending ? 'Sending...' : bannerContent.ctaText}
        </button>
      </div>

      {showPhoneModal && (
        <AddPhoneModal
          onClose={() => setShowPhoneModal(false)}
          onSuccess={() => {
            setShowPhoneModal(false);
            fetchUserStatus();
            showSuccess(t('notifications.recoveryVerification.phoneAdded', 'Phone number added! Verification SMS sent.'));
          }}
          onError={(message) => showError(message)}
        />
      )}
    </>
  );
};

// Phone number input modal component
const AddPhoneModal = ({ onClose, onSuccess, onError }) => {
  const { t } = useTranslation();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [phoneFocused, setPhoneFocused] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!phoneNumber) return;
    setSubmitting(true);

    try {
      // Add phone number to profile
      await api.patch('/api/users/me', { phoneNumber });

      // Send verification SMS
      await api.post('/api/auth/verify/send-phone', { phoneNumber });

      onSuccess();
    } catch (error) {
      onError(error.response?.data?.error || 'Failed to add phone number');
    } finally {
      setSubmitting(false);
    }
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
        zIndex: 10000
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '420px',
          margin: '0 24px',
          padding: '48px 32px',
          background: 'white',
          borderRadius: 24,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
        }}
      >
        {/* Phone Icon */}
        <div style={{
          marginBottom: '24px',
          fontSize: '72px',
          textShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          display: 'inline-block',
          transform: 'rotate(-15deg)'
        }}>
          📱
        </div>

        {/* Title */}
        <h1 style={{
          fontSize: '32px',
          fontWeight: '600',
          fontFamily: 'Plus Jakarta Sans',
          textAlign: 'center',
          margin: 0,
          marginBottom: '12px',
          color: '#32302C'
        }}>
          {t('settingsPage.enterYourPhone', 'Enter Your Phone')}
        </h1>

        {/* Subtitle */}
        <p style={{
          fontSize: '16px',
          color: '#666',
          textAlign: 'center',
          margin: 0,
          marginBottom: '32px',
          lineHeight: '1.5',
          fontFamily: 'Plus Jakarta Sans'
        }}>
          {t('settingsPage.authenticateViaSms', 'Authenticate your account via SMS.')}
        </p>

        {/* Phone Input */}
        <form onSubmit={handleSubmit} style={{ width: '100%' }}>
          <div style={{ width: '100%', marginBottom: '16px' }}>
            <label style={{
              display: 'block',
              color: '#32302C',
              fontSize: 14,
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: '600',
              lineHeight: '20px',
              marginBottom: '8px',
              textAlign: 'left'
            }}>
              {t('settingsPage.phoneNumber', 'Phone Number')} <span style={{color: '#ef4444'}}>*</span>
            </label>
            <div
              onFocus={() => setPhoneFocused(true)}
              onBlur={() => setPhoneFocused(false)}
              style={{
                width: '100%',
                minHeight: 52,
                paddingLeft: 18,
                paddingRight: 18,
                paddingTop: 10,
                paddingBottom: 10,
                background: 'transparent',
                overflow: 'visible',
                borderRadius: 26,
                border: phoneFocused ? '1px solid #181818' : '1px solid #E0E0E0',
                boxSizing: 'border-box',
                display: 'flex',
                alignItems: 'center',
                transform: phoneFocused ? 'scale(1.02)' : 'scale(1)',
                transition: 'transform 0.2s ease, border-color 0.2s ease'
              }}
            >
              <PhoneInput
                international
                defaultCountry="US"
                value={phoneNumber}
                onChange={setPhoneNumber}
                placeholder={t('settingsPage.phonePlaceholder', '+ 1 123 456 7890')}
                disabled={submitting}
                style={{
                  flex: '1 1 0',
                  width: '100%',
                  border: 'none',
                  background: 'transparent'
                }}
                className="custom-phone-input"
              />
            </div>
          </div>

          {/* Send Code Button */}
          <button
            type="submit"
            disabled={submitting || !phoneNumber}
            style={{
              width: '100%',
              height: '52px',
              padding: '14px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(24, 24, 24, 0.90)',
              border: 'none',
              borderRadius: '26px',
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              fontWeight: '600',
              fontFamily: 'Plus Jakarta Sans',
              color: 'white',
              opacity: (submitting || !phoneNumber) ? 0.6 : 1,
              transition: 'opacity 0.2s ease'
            }}
          >
            {submitting ? 'Sending...' : 'Add Phone'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default RecoveryVerificationBanner;
