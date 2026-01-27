import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import '../styles/VerifyRecovery.css';

const VerifyRecoveryEmail = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('verifying'); // verifying, success, error
  const [message, setMessage] = useState('');

  useEffect(() => {
    const verifyEmail = async () => {
      const token = searchParams.get('token');

      if (!token) {
        setStatus('error');
        setMessage(t('verifyRecovery.invalidLinkNoToken'));
        return;
      }

      try {
        const response = await axios.get(
          `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/recovery-verification/verify-email?token=${token}`
         );

        if (response.data.success) {
          setStatus('success');
          setMessage(t('verifyRecovery.emailVerifiedSuccess'));

          // Redirect to settings after 3 seconds
          setTimeout(() => {
            navigate('/settings');
          }, 3000);
        } else {
          setStatus('error');
          setMessage(response.data.message || t('verifyRecovery.verificationFailed'));
        }
      } catch (error) {
        setStatus('error');
        setMessage(error.response?.data?.error || t('verifyRecovery.errorOccurred'));
      }
    };

    verifyEmail();
  }, [searchParams, navigate]);

  return (
    <div className="verify-recovery-container">
      <div className="verify-recovery-card">
        {status === 'verifying' && (
          <>
            <div className="verify-icon verifying">⏳</div>
            <h1>{t('verifyRecovery.verifyingEmail')}</h1>
            <p>{t('verifyRecovery.pleaseWait')}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="verify-icon success">✅</div>
            <h1>{t('verifyRecovery.emailVerified')}</h1>
            <p>{message}</p>
            <p className="redirect-message">{t('verifyRecovery.redirectingToSettings')}</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="verify-icon error">❌</div>
            <h1>{t('verifyRecovery.verificationFailedTitle')}</h1>
            <p>{message}</p>
            <button
              className="button-primary"
              onClick={() => navigate('/settings')}
            >
              {t('verifyRecovery.goToSettings')}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default VerifyRecoveryEmail;
