import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

function SetNewPassword() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlToken = searchParams.get('token');

  // Store token in sessionStorage to persist across page refreshes on mobile
  const [token, setToken] = useState(() => {
    const storedToken = sessionStorage.getItem('passwordResetToken');
    if (urlToken) {
      sessionStorage.setItem('passwordResetToken', urlToken);
      return urlToken;
    }
    return storedToken;
  });

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Password validation state
  const [passwordValidation, setPasswordValidation] = useState({
    noPersonalInfo: false,
    minLength: false,
    hasSymbolOrNumber: false,
  });

  // Check if token exists and sync with URL
  useEffect(() => {
    console.log('🔍 [SetNewPassword] Component mounted');
    console.log('🔍 [SetNewPassword] URL Token:', urlToken ? urlToken.substring(0, 20) + '...' : 'null');
    console.log('🔍 [SetNewPassword] Stored Token:', token ? token.substring(0, 20) + '...' : 'null');
    console.log('🔍 [SetNewPassword] Full URL:', window.location.href);
    console.log('🔍 [SetNewPassword] User Agent:', navigator.userAgent);

    // Update token if URL has a new one
    if (urlToken && urlToken !== token) {
      console.log('🔄 [SetNewPassword] Updating token from URL');
      sessionStorage.setItem('passwordResetToken', urlToken);
      setToken(urlToken);
    }

    if (!token && !urlToken) {
      console.error('❌ [SetNewPassword] No token found');
      setError(t('auth.setNewPassword.invalidLink'));
    } else {
      console.log('✅ [SetNewPassword] Token found, ready to reset password');
    }
  }, [urlToken, token]);

  // Real-time password validation
  const validatePassword = (pwd) => {
    const validation = {
      noPersonalInfo: true, // Simplified - always true for now
      minLength: pwd.length >= 8,
      hasSymbolOrNumber: /[0-9!@#$%^&*(),.?":{}|<>]/.test(pwd),
    };

    setPasswordValidation(validation);
  };

  const handlePasswordChange = (e) => {
    const newPassword = e.target.value;
    setPassword(newPassword);
    validatePassword(newPassword);
  };

  const isPasswordValid = () => {
    return (
      password === confirmPassword &&
      password.length > 0 &&
      passwordValidation.noPersonalInfo &&
      passwordValidation.minLength &&
      passwordValidation.hasSymbolOrNumber
    );
  };

  const handleSubmit = async () => {
    setError('');

    if (!password || !confirmPassword) {
      setError(t('auth.setNewPassword.fillAllFields'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('auth.setNewPassword.passwordsNoMatch'));
      return;
    }

    if (!isPasswordValid()) {
      setError(t('auth.setNewPassword.meetRequirements'));
      return;
    }

    setLoading(true);

    try {
      console.log('🔐 [SetNewPassword] Submitting password reset with token:', token?.substring(0, 20) + '...');

      const response = await api.post('/api/auth/reset-password-with-token', {
        token,
        newPassword: password
      });

      console.log('✅ [SetNewPassword] Password reset successful');

      // Clear the stored token
      sessionStorage.removeItem('passwordResetToken');

      if (response.data.success) {
        navigate('/password-changed');
      }
    } catch (error) {
      console.error('❌ [SetNewPassword] Reset password error:', error);

      if (error.response?.data?.error) {
        setError(error.response.data.error);
      } else {
        setError(t('auth.setNewPassword.resetFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '20px',
      background: '#FFF',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
      }}>
        {/* Title */}
        <h1 style={{
          fontSize: '28px',
          fontWeight: '600',
          color: '#000',
          textAlign: 'left',
          marginBottom: '8px',
        }}>
          {t('auth.setNewPassword.title')}
        </h1>

        {/* Subtitle */}
        <p style={{
          fontSize: '14px',
          color: '#666',
          textAlign: 'left',
          marginBottom: '32px',
        }}>
          {t('auth.setNewPassword.subtitle')}
        </p>

        {/* New Password Input */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{
            display: 'block',
            fontSize: '13px',
            fontWeight: '500',
            color: '#000',
            marginBottom: '8px',
          }}>
            {t('auth.setNewPassword.newPassword')}
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={handlePasswordChange}
              placeholder="••••••••"
              disabled={loading || !token}
              style={{
                width: '100%',
                height: '48px',
                padding: '0 40px 0 16px',
                background: '#F9FAFB',
                border: '1px solid #E5E7EB',
                borderRadius: '8px',
                fontSize: '16px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '8px',
                fontSize: '18px',
                color: '#9CA3AF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {showPassword ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Confirm Password Input */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{
            display: 'block',
            fontSize: '13px',
            fontWeight: '500',
            color: '#000',
            marginBottom: '8px',
          }}>
            {t('auth.setNewPassword.confirmPassword')}
          </label>
          <div style={{ position: 'relative' }}>
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              disabled={loading || !token}
              style={{
                width: '100%',
                height: '48px',
                padding: '0 40px 0 16px',
                background: '#F9FAFB',
                border: '1px solid #E5E7EB',
                borderRadius: '8px',
                fontSize: '16px',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '8px',
                fontSize: '18px',
                color: '#9CA3AF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {showConfirmPassword ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Password Requirements with Real-Time Validation */}
        <div style={{ marginBottom: '24px' }}>
          {/* Requirement 1: No Personal Info */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '12px',
          }}>
            <div style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              border: passwordValidation.noPersonalInfo ? '2px solid #10B981' : '2px solid #D1D5DB',
              background: passwordValidation.noPersonalInfo ? '#10B981' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
              flexShrink: 0,
            }}>
              {passwordValidation.noPersonalInfo && (
                <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                  <path d="M1 5L4.5 8.5L11 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <span style={{
              fontSize: '14px',
              color: passwordValidation.noPersonalInfo ? '#10B981' : '#666',
              transition: 'color 0.2s ease',
            }}>
              {t('auth.setNewPassword.noPersonalInfo')}
            </span>
          </div>

          {/* Requirement 2: Minimum Length */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '12px',
          }}>
            <div style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              border: passwordValidation.minLength ? '2px solid #10B981' : '2px solid #D1D5DB',
              background: passwordValidation.minLength ? '#10B981' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
              flexShrink: 0,
            }}>
              {passwordValidation.minLength && (
                <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                  <path d="M1 5L4.5 8.5L11 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <span style={{
              fontSize: '14px',
              color: passwordValidation.minLength ? '#10B981' : '#666',
              transition: 'color 0.2s ease',
            }}>
              {t('auth.setNewPassword.minLength')}
            </span>
          </div>

          {/* Requirement 3: Symbol or Number */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}>
            <div style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              border: passwordValidation.hasSymbolOrNumber ? '2px solid #10B981' : '2px solid #D1D5DB',
              background: passwordValidation.hasSymbolOrNumber ? '#10B981' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
              flexShrink: 0,
            }}>
              {passwordValidation.hasSymbolOrNumber && (
                <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                  <path d="M1 5L4.5 8.5L11 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <span style={{
              fontSize: '14px',
              color: passwordValidation.hasSymbolOrNumber ? '#10B981' : '#666',
              transition: 'color 0.2s ease',
            }}>
              {t('auth.setNewPassword.symbolOrNumber')}
            </span>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div style={{
            width: '100%',
            padding: '12px 16px',
            marginBottom: '16px',
            background: '#FEE2E2',
            border: '1px solid #FCA5A5',
            borderRadius: '26px',
            color: '#DC2626',
            fontSize: '14px',
          }}>
            {error}
          </div>
        )}

        {/* Save Button */}
        <button
          onClick={handleSubmit}
          disabled={!isPasswordValid() || loading || !token}
          style={{
            width: '100%',
            height: '48px',
            background: (isPasswordValid() && !loading && token) ? '#000' : '#D1D5DB',
            color: '#FFF',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: (isPasswordValid() && !loading && token) ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s ease',
          }}
        >
          {loading ? t('auth.setNewPassword.saving') : t('auth.setNewPassword.save')}
        </button>
      </div>
    </div>
  );
}

export default SetNewPassword;
