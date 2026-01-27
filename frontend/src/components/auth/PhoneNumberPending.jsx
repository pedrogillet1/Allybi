import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import backArrow from '../assets/arrow-narrow-left.svg';

const PhoneNumberPending = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { addPendingPhone } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Get email from navigation state or localStorage
  const email = location.state?.email || localStorage.getItem('pendingEmail') || '';

  const handleSendCode = async () => {
    if (!phoneNumber) {
      setError(t('phoneNumber.pleaseEnterPhoneNumber'));
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      await addPendingPhone({ email, phoneNumber });

      console.log('✅ SMS code sent to phone');
      // Navigate to phone verification
      navigate('/verification-pending', { state: { email, phoneNumber } });
    } catch (error) {
      console.error('Error sending code:', error);
      setError(error.message || t('phoneNumber.failedToSendCode'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{width: '100%', minHeight: '100vh', padding: '20px', background: 'white', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'center'}}>
      <div onClick={() => navigate(-1)} style={{alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', marginBottom: 'auto'}}>
        <img src={backArrow} alt="Back" />
        <div style={{color: '#181818', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '600'}}>{t('common.back')}</div>
      </div>

      <div style={{width: '100%', maxWidth: 450, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32, flexGrow: 1, justifyContent: 'center'}}>
        {/* Icon */}
        <div style={{
          marginBottom: '8px',
          fontSize: '72px',
          textShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          display: 'inline-block',
          transform: 'rotate(-15deg)'
        }}>
          📱
        </div>
        <div style={{alignSelf: 'stretch', textAlign: 'center', flexDirection: 'column', gap: 12}}>
          <div style={{color: '#32302C', fontSize: 30, fontFamily: 'Plus Jakarta Sans', fontWeight: '600'}}>{t('phoneNumber.enterYourPhone')}</div>
          <div style={{color: '#6C6B6E', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '500'}}>{t('phoneNumber.authenticateViaSms')}</div>
        </div>

        <div style={{alignSelf: 'stretch', display: 'flex', flexDirection: 'column', gap: 20}}>
          <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
            <label style={{fontWeight: '600', fontSize: 14}}>{t('phoneNumber.phoneNumberLabel')}</label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder={t('phoneNumber.enterPhoneNumber')}
              style={{
                height: 52,
                padding: '0 18px',
                background: '#F5F5F5',
                borderRadius: 26,
                border: '1px solid #E6E6EC',
                fontSize: 16,
                outline: 'none'
              }}
            />
          </div>

          {error && (
            <div style={{background: '#FEE2E2', color: '#DC2626', padding: '12px 16px', borderRadius: 26, fontSize: 14}}>
              {error}
            </div>
          )}

          <button
            onClick={handleSendCode}
            disabled={isLoading || !phoneNumber}
            style={{
              height: 52,
              background: (!phoneNumber || isLoading) ? '#F5F5F5' : '#181818',
              color: (!phoneNumber || isLoading) ? '#6C6B6E' : 'white',
              borderRadius: 26,
              border: 'none',
              fontSize: 16,
              fontWeight: '600',
              cursor: (!phoneNumber || isLoading) ? 'not-allowed' : 'pointer',
              marginTop: 12,
              opacity: isLoading ? 0.6 : 1
            }}
          >
            {isLoading ? t('phoneNumber.sending') : t('phoneNumber.sendCode')}
          </button>
        </div>
      </div>
      <div style={{height: 52}} />
    </div>
  );
};

export default PhoneNumberPending;
