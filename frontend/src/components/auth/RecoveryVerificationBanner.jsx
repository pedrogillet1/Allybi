import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import PhoneInput from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import '../../styles/RecoveryVerificationBanner.css';
import { useNotifications } from '../../context/NotificationsStore';

const RecoveryVerificationBanner = () => {
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotifications();
  const [verificationStatus, setVerificationStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);

  useEffect(() => {
    fetchVerificationStatus();
  }, []);

  const fetchVerificationStatus = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await axios.get(
        `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/recovery-verification/status`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
       );
      console.log('📊 [Banner] Verification status received:', response.data);
      setVerificationStatus(response.data);
    } catch (error) {
      console.error('Error fetching verification status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendEmailVerification = async () => {
    setSending(true);
    try {
      const token = localStorage.getItem('accessToken');
      await axios.post(
        `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/recovery-verification/send-email-link`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
       );
      showSuccess(t('notifications.recoveryVerification.emailSent'));
    } catch (error) {
      showError(error.response?.data?.error || t('notifications.recoveryVerification.emailFailed'));
    } finally {
      setSending(false);
    }
  };

  const handleSendPhoneVerification = async () => {
    setSending(true);
    try {
      const token = localStorage.getItem('accessToken');
      await axios.post(
        `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/recovery-verification/send-phone-link`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
       );
      showSuccess(t('notifications.recoveryVerification.smsSent'));
    } catch (error) {
      showError(error.response?.data?.error || t('notifications.recoveryVerification.smsFailed'));
    } finally {
      setSending(false);
    }
  };

  const handleAddPhone = () => {
    setShowPhoneModal(true);
  };

  // Don't render if loading or both channels are verified
  if (loading) {
    console.log('📊 [Banner] Not rendering - still loading');
    return null;
  }
  if (!verificationStatus) {
    console.log('📊 [Banner] Not rendering - no verification status');
    return null;
  }
  if (verificationStatus.isEmailVerified && verificationStatus.isPhoneVerified) {
    console.log('📊 [Banner] Not rendering - both email and phone verified');
    return null;
  }

  // Determine banner content based on verification status
  let bannerContent = null;

  console.log('📊 [Banner] Checking conditions:', {
    isEmailVerified: verificationStatus.isEmailVerified,
    isPhoneVerified: verificationStatus.isPhoneVerified,
    hasPhone: verificationStatus.hasPhone
  });

  if (!verificationStatus.isEmailVerified && verificationStatus.isPhoneVerified) {
    // Phone verified, email not verified
    console.log('📊 [Banner] Showing: Verify email (phone verified)');
    bannerContent = {
      icon: '📧',
      title: 'Verify your recovery email',
      body: `Add a second way to regain access. We'll send a verification link to ${verificationStatus.maskedEmail}.`,
      ctaText: 'Send verification link',
      ctaAction: handleSendEmailVerification,
    };
  } else if (verificationStatus.isEmailVerified && !verificationStatus.hasPhone) {
    // Email verified, no phone added
    console.log('📊 [Banner] Showing: Add phone');
    bannerContent = {
      icon: <span style={{ fontSize: 40, display: 'inline-block', transform: 'rotate(-15deg)', filter: 'drop-shadow(2px 4px 6px rgba(0, 0, 0, 0.2))' }}>📱</span>,
      title: 'Add a recovery phone',
      body: 'Use your phone as a second way to recover your account.',
      ctaText: 'Add phone',
      ctaAction: handleAddPhone,
    };
  } else if (verificationStatus.isEmailVerified && verificationStatus.hasPhone && !verificationStatus.isPhoneVerified) {
    // Email verified, phone added but not verified
    console.log('📊 [Banner] Showing: Verify phone');
    bannerContent = {
      icon: <span style={{ fontSize: 40, display: 'inline-block', transform: 'rotate(-15deg)', filter: 'drop-shadow(2px 4px 6px rgba(0, 0, 0, 0.2))' }}>📱</span>,
      title: 'Verify your recovery phone',
      body: `Add a second way to regain access. We'll send a verification link to ${verificationStatus.maskedPhone}.`,
      ctaText: 'Send verification link',
      ctaAction: handleSendPhoneVerification,
    };
  }

  if (!bannerContent) {
    console.log('📊 [Banner] Not rendering - no matching condition');
    return null;
  }

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
            fetchVerificationStatus();
            showSuccess(t('notifications.recoveryVerification.phoneAdded'));
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
    setSubmitting(true);

    try {
      const token = localStorage.getItem('accessToken');

      // Add phone number
      await axios.post(
        `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/recovery-verification/add-phone`,
        { phoneNumber },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
       );

      // Send verification SMS
      await axios.post(
        `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/recovery-verification/send-phone-link`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
       );

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
          Enter Your Phone
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
          Authenticate your account via SMS.
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
              Phone Number <span style={{color: '#ef4444'}}>*</span>
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
                placeholder={t('phoneNumber.enterPhoneNumber')}
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
            disabled={submitting}
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
              opacity: submitting ? 0.6 : 1,
              transition: 'opacity 0.2s ease'
            }}
          >
            {submitting ? t('phoneNumber.sendingCode') : t('phoneNumber.sendCode')}
          </button>
        </form>
      </div>
    </div>
  );
};

export default RecoveryVerificationBanner;
