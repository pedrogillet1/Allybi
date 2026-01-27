import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationsStore';
import { useIsMobile } from '../hooks/useIsMobile';
import { ROUTES, AUTH_MODES, DEFAULT_AUTH_REDIRECT, STORAGE_KEYS } from '../constants/routes';
import logo from '../assets/logo.svg';
import googleIcon from '../assets/Social icon 2.svg';
import appleIcon from '../assets/Social icon.svg';
import hideIcon from '../assets/Hide.svg';

const UnifiedAuth = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { login, register, loginWithGoogle, loginWithApple, setAuthState } = useAuth();
  const { addNotification } = useNotifications();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const containerRef = useRef(null);

  // Determine initial mode from URL or first-time detection
  const getInitialMode = () => {
    const modeParam = searchParams.get('mode');

    // If mode is specified in URL, use it
    if (modeParam === AUTH_MODES.LOGIN || modeParam === AUTH_MODES.SIGNUP) {
      return modeParam;
    }

    // Otherwise, check if user has visited before
    const hasVisited = localStorage.getItem(STORAGE_KEYS.HAS_VISITED);

    // First-time users see signup, returning users see login
    return hasVisited ? AUTH_MODES.LOGIN : AUTH_MODES.SIGNUP;
  };

  const [mode, setMode] = useState(getInitialMode());
  const isSignupMode = mode === AUTH_MODES.SIGNUP;

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Signup-specific state
  const [passwordCriteria, setPasswordCriteria] = useState({
    minLength: false,
    hasUppercase: false,
    hasLowercase: false,
    hasNumber: false,
    hasSpecialChar: false,
  });

  // Focus/hover states
  const [nameFocused, setNameFocused] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [checkboxHover, setCheckboxHover] = useState(false);

  // Update URL when mode changes
  useEffect(() => {
    setSearchParams({ mode }, { replace: true });
  }, [mode, setSearchParams]);

  // Mark that user has visited (for first-time detection)
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.HAS_VISITED, 'true');
  }, []);

  // Validate password in real-time (for signup)
  useEffect(() => {
    if (isSignupMode) {
      const validations = {
        minLength: password.length >= 8,
        hasUppercase: /[A-Z]/.test(password),
        hasLowercase: /[a-z]/.test(password),
        hasNumber: /[0-9]/.test(password),
        hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password),
      };
      setPasswordCriteria(validations);
    }
  }, [password, isSignupMode]);

  // Scroll to top when mode changes
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [mode]);

  // Toggle between login and signup
  const toggleMode = () => {
    setMode(isSignupMode ? AUTH_MODES.LOGIN : AUTH_MODES.SIGNUP);
    setError('');
    // Clear signup-only fields when switching to login
    if (isSignupMode) {
      setName('');
    }
  };

  // Handle login
  const handleLogin = async (e) => {
    e.preventDefault();

    if (!email || !password) {
      setError(t('auth.login.invalidCredentials'));
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await login({ email, password, rememberMe });

      // If 2FA is required, navigate to 2FA verification page
      if (response.requires2FA) {
        navigate(ROUTES.AUTHENTICATION, {
          state: {
            userId: response.userId,
            tempToken: response.tempToken,
            email: email
          }
        });
        return;
      }

      // Add security notification
      addNotification({
        type: 'security',
        title: t('auth.login.loginSuccess'),
        text: t('auth.login.loginSecurityNotice'),
        action: { type: 'navigate', target: ROUTES.SETTINGS },
        skipToast: true
      });

      // Navigate to chat after successful login
      navigate(DEFAULT_AUTH_REDIRECT);
    } catch (error) {
      console.error('Login error:', error);
      setError(error.message || t('auth.login.loginError'));
    } finally {
      setIsLoading(false);
    }
  };

  // Handle signup
  const handleSignup = async (e) => {
    e.preventDefault();

    if (!name || !email || !password) {
      setError(t('auth.signup.fillAllFields'));
      return;
    }

    if (!passwordCriteria.minLength || !passwordCriteria.hasUppercase ||
        !passwordCriteria.hasLowercase || !passwordCriteria.hasNumber ||
        !passwordCriteria.hasSpecialChar) {
      setError(t('auth.signup.meetPasswordRequirements'));
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await register({ name, email, password });

      // Save recovery key silently (no modal)
      if (response.recoveryKey) {
        console.log('🔐 [Recovery] Recovery key received:', response.recoveryKey);
      }

      // Check which flow the backend is using
      if (response.requiresVerification) {
        // Verification flow: navigate to authentication choice page
        navigate(ROUTES.AUTHENTICATION, { state: { email: response.email } });
      } else if (response.user && response.accessToken) {
        // Direct creation flow: user is already created and logged in
        localStorage.setItem('accessToken', response.accessToken);
        localStorage.setItem('refreshToken', response.refreshToken);
        localStorage.setItem('user', JSON.stringify(response.user));

        setAuthState(response.user);

        console.log('✅ User registered and logged in successfully');
        navigate(DEFAULT_AUTH_REDIRECT);
      } else {
        console.error('Unexpected response format:', response);
        setError(t('auth.signup.unexpectedError'));
      }
    } catch (error) {
      console.error('Registration error:', error);
      setError(error.message || t('auth.signup.registrationFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  // Handle form submission (login or signup)
  const handleSubmit = (e) => {
    e.preventDefault();
    if (isSignupMode) {
      handleSignup(e);
    } else {
      handleLogin(e);
    }
  };

  const handleGoogleAuth = () => {
    loginWithGoogle();
  };

  const handleAppleAuth = () => {
    loginWithApple();
  };

  // Password validation item (for signup)
  const ValidationItem = ({ text, isValid }) => (
    <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
      <div style={{
        width: 14,
        height: 14,
        borderRadius: '50%',
        border: isValid ? 'none' : '1.5px solid #E6E6EC',
        background: isValid ? '#10B981' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {isValid && <span style={{color: 'white', fontSize: 9}}>✓</span>}
      </div>
      <div style={{color: isValid ? '#10B981' : '#6C6B6E', fontSize: 13, fontFamily: 'Plus Jakarta Sans', fontWeight: '500'}}>{text}</div>
    </div>
  );

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        padding: isSignupMode ? '20px 20px 40px' : '20px 20px 40px',
        background: 'white',
        overflowY: 'auto',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'center'
      }}>
      <div style={{
        width: '100%',
        maxWidth: 'var(--container-max-width)',
        padding: 'var(--container-padding)',
        borderRadius: 16,
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'center',
        gap: 32,
        display: 'flex'
      }}>
        {/* Logo */}
        <img
          style={{
            width: 120,
            height: 120,
            borderRadius: 120,
            filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15))'
          }}
          src={logo}
          alt="Logo"
        />

        {/* Title and subtitle */}
        <div style={{
          alignSelf: 'stretch',
          textAlign: 'center',
          flexDirection: 'column',
          gap: 12
        }}>
          <div style={{
            color: '#32302C',
            fontSize: 30,
            fontFamily: 'Plus Jakarta Sans',
            fontWeight: '600'
          }}>
            {isSignupMode ? t('auth.signup.title') : t('auth.login.title')}
          </div>
          <div style={{
            color: '#6C6B6E',
            fontSize: 16,
            fontFamily: 'Plus Jakarta Sans',
            fontWeight: '500'
          }}>
            {isSignupMode ? t('auth.signup.subtitle') : t('auth.login.subtitle')}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{
          alignSelf: 'stretch',
          display: 'flex',
          flexDirection: 'column',
          gap: 20
        }}>
          {/* Name field (signup only) */}
          {isSignupMode && (
            <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
              <label style={{fontWeight: '600', fontSize: 14}}>{t('auth.signup.name')}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onFocus={() => setNameFocused(true)}
                onBlur={() => setNameFocused(false)}
                placeholder={t('auth.signup.namePlaceholder')}
                style={{
                  height: 52,
                  padding: '0 20px',
                  background: 'transparent',
                  borderRadius: 26,
                  border: nameFocused ? '1px solid #181818' : '1px solid #E6E6EC',
                  fontSize: 16,
                  outline: 'none',
                  transform: nameFocused ? 'scale(1.02)' : 'scale(1)',
                  transition: 'transform 0.2s ease, border-color 0.2s ease'
                }}
              />
            </div>
          )}

          {/* Email field */}
          <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
            <label style={{
              color: '#32302C',
              fontSize: 14,
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: '600'
            }}>
              {isSignupMode ? t('auth.signup.email') : t('auth.login.email')}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              placeholder={isSignupMode ? t('auth.signup.emailPlaceholder') : t('auth.login.emailPlaceholder')}
              style={{
                height: 52,
                padding: '0 20px',
                background: 'transparent',
                borderRadius: 26,
                border: emailFocused ? '1px solid #181818' : '1px solid #E6E6EC',
                fontSize: 16,
                outline: 'none',
                transform: emailFocused ? 'scale(1.02)' : 'scale(1)',
                transition: 'transform 0.2s ease, border-color 0.2s ease'
              }}
            />
          </div>

          {/* Password field */}
          <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
            <label style={{
              color: '#32302C',
              fontSize: 14,
              fontFamily: 'Plus Jakarta Sans',
              fontWeight: '600'
            }}>
              {isSignupMode ? t('auth.signup.password') : t('auth.login.password')}
            </label>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              height: 52,
              padding: '0 20px',
              background: 'transparent',
              borderRadius: 26,
              border: passwordFocused ? '1px solid #181818' : '1px solid #E6E6EC',
              transform: passwordFocused ? 'scale(1.02)' : 'scale(1)',
              transition: 'transform 0.2s ease, border-color 0.2s ease'
            }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                placeholder="••••••••"
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: 16
                }}
              />
              <img
                src={hideIcon}
                alt="Show/Hide"
                onClick={() => setShowPassword(!showPassword)}
                style={{cursor: 'pointer'}}
              />
            </div>
          </div>

          {/* Password validation (signup only) */}
          {isSignupMode && (
            <div style={{display: 'flex', flexDirection: 'column', gap: 8, marginTop: -8}}>
              <ValidationItem text={t('auth.signup.validation.minLength')} isValid={passwordCriteria.minLength} />
              <ValidationItem text={t('auth.signup.validation.uppercase')} isValid={passwordCriteria.hasUppercase} />
              <ValidationItem text={t('auth.signup.validation.lowercase')} isValid={passwordCriteria.hasLowercase} />
              <ValidationItem text={t('auth.signup.validation.number')} isValid={passwordCriteria.hasNumber} />
              <ValidationItem text={t('auth.signup.validation.specialChar')} isValid={passwordCriteria.hasSpecialChar} />
            </div>
          )}

          {/* Remember me & Forgot password (login only) */}
          {!isSignupMode && (
            <div style={{
              alignSelf: 'stretch',
              justifyContent: 'space-between',
              alignItems: 'center',
              display: 'flex'
            }}>
              <div
                style={{
                  justifyContent: 'flex-start',
                  alignItems: 'center',
                  gap: 8,
                  display: 'flex',
                  cursor: 'pointer'
                }}
                onClick={() => setRememberMe(!rememberMe)}
                onMouseEnter={() => setCheckboxHover(true)}
                onMouseLeave={() => setCheckboxHover(false)}
              >
                <div style={{
                  width: 20,
                  height: 20,
                  background: rememberMe ? '#181818' : 'transparent',
                  borderRadius: 6,
                  border: checkboxHover || rememberMe ? '1px #181818 solid' : '1px #E6E6EC solid',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  transform: checkboxHover ? 'scale(1.1)' : 'scale(1)',
                  transition: 'transform 0.2s ease, border-color 0.2s ease, background 0.2s ease'
                }}>
                  {rememberMe && <span style={{color: 'white', fontSize: 12}}>✓</span>}
                </div>
                <div style={{
                  color: '#32302C',
                  fontSize: 14,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '500'
                }}>
                  {t('auth.login.rememberMe')}
                </div>
              </div>
              <Link to={ROUTES.RECOVER_ACCESS} style={{textDecoration: 'none'}}>
                <div style={{
                  color: '#181818',
                  fontSize: 14,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}>
                  {t('auth.login.forgotPassword')}
                </div>
              </Link>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div style={{
              color: '#DC2626',
              background: '#FEE2E2',
              padding: '12px 16px',
              borderRadius: 26,
              marginTop: 8
            }}>
              {error}
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={isLoading}
            style={{
              height: 52,
              background: 'rgba(24, 24, 24, 0.90)',
              color: 'white',
              borderRadius: 26,
              border: 'none',
              fontSize: 16,
              fontWeight: '600',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              marginTop: 12,
              opacity: isLoading ? 0.6 : 1
            }}
          >
            {isLoading
              ? (isSignupMode ? t('auth.signup.creatingAccount') : t('auth.login.loggingIn'))
              : (isSignupMode ? t('auth.signup.continue') : t('auth.login.signIn'))
            }
          </button>
        </form>

        {/* Toggle between login/signup */}
        <div style={{textAlign: 'center', fontSize: 14, marginTop: -16}}>
          <span style={{color: '#6C6B6E'}}>
            {isSignupMode ? t('auth.signup.haveAccount') : t('auth.login.noAccount')}{' '}
          </span>
          <span
            onClick={toggleMode}
            style={{
              fontWeight: '700',
              color: '#181818',
              cursor: 'pointer',
              textDecoration: 'none'
            }}
          >
            {isSignupMode ? t('auth.signup.logIn') : t('auth.login.signUp')}
          </span>
        </div>

        {/* Divider */}
        <div style={{
          alignSelf: 'stretch',
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          <div style={{flex: 1, height: 1, background: '#E6E6EC'}} />
          <span style={{color: '#6C6B6E'}}>
            {isSignupMode ? t('auth.signup.or') : t('auth.login.or')}
          </span>
          <div style={{flex: 1, height: 1, background: '#E6E6EC'}} />
        </div>

        {/* Social auth buttons */}
        <div style={{
          alignSelf: 'stretch',
          display: 'flex',
          flexDirection: 'column',
          gap: 16
        }}>
          <button onClick={handleGoogleAuth} style={{
            height: 52,
            background: 'transparent',
            borderRadius: 26,
            border: '1px solid #E6E6EC',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 12,
            cursor: 'pointer',
            fontSize: 16,
            fontWeight: '500'
          }}>
            <img src={googleIcon} alt="Google icon" style={{filter: 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.15))'}} />
            {isSignupMode ? t('auth.signup.continueWithGoogle') : t('auth.login.continueWithGoogle')}
          </button>
          <button onClick={handleAppleAuth} style={{
            height: 52,
            background: 'transparent',
            borderRadius: 26,
            border: '1px solid #E6E6EC',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 12,
            cursor: 'pointer',
            fontSize: 16,
            fontWeight: '500'
          }}>
            <img src={appleIcon} alt="Apple icon" style={{filter: 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.15))'}} />
            {isSignupMode ? t('auth.signup.continueWithApple') : t('auth.login.continueWithApple')}
          </button>
        </div>

        {/* Terms and privacy (signup only) */}
        {isSignupMode && (
          <div style={{textAlign: 'center', fontSize: 14}}>
            <span style={{color: '#6C6B6E'}}>{t('auth.signup.termsAgree')} </span>
            <Link to="/terms" style={{
              fontWeight: '600',
              color: '#181818',
              textDecoration: 'none'
            }}>
              {t('auth.signup.terms')}
            </Link>
            <span style={{color: '#6C6B6E'}}> {t('auth.signup.and')} </span>
            <Link to="/privacy" style={{
              fontWeight: '600',
              color: '#181818',
              textDecoration: 'none'
            }}>
              {t('auth.signup.privacy')}
            </Link>.
          </div>
        )}
      </div>
    </div>
  );
};

export default UnifiedAuth;
