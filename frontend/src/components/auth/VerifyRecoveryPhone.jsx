import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import '../styles/VerifyRecovery.css';

const VerifyRecoveryPhone = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('verifying'); // verifying, success, error
  const [message, setMessage] = useState('');

  useEffect(() => {
    const verifyPhone = async () => {
      const token = searchParams.get('token');

      if (!token) {
        setStatus('error');
        setMessage(t('verifyRecoveryPhone.invalidLink'));
        return;
      }

      try {
        const response = await axios.get(
          `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/api/recovery-verification/verify-phone?token=${token}`
         );

        if (response.data.success) {
          setStatus('success');
          setMessage(t('verifyRecoveryPhone.verifiedSuccess'));

          // Redirect to settings after 3 seconds
          setTimeout(() => {
            navigate('/settings');
          }, 3000);
        } else {
          setStatus('error');
          setMessage(response.data.message || t('verifyRecoveryPhone.verificationFailed'));
        }
      } catch (error) {
        setStatus('error');
        setMessage(error.response?.data?.error || t('verifyRecoveryPhone.errorOccurred'));
      }
    };

    verifyPhone();
  }, [searchParams, navigate]);

  return (
    <div className="verify-recovery-container">
      <div className="verify-recovery-card">
        {status === 'verifying' && (
          <>
            <div className="verify-icon verifying">⏳</div>
            <h1>{t('verifyRecoveryPhone.verifying')}</h1>
            <p>{t('verifyRecoveryPhone.pleaseWait')}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="verify-icon success">✅</div>
            <h1>{t('verifyRecoveryPhone.phoneVerified')}</h1>
            <p>{message}</p>
            <p className="redirect-message">{t('verifyRecoveryPhone.redirectingToSettings')}</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="verify-icon error">❌</div>
            <h1>{t('verifyRecoveryPhone.verificationFailed')}</h1>
            <p>{message}</p>
            <button
              className="button-primary"
              onClick={() => navigate('/settings')}
            >
              {t('verifyRecoveryPhone.goToSettings')}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default VerifyRecoveryPhone;
