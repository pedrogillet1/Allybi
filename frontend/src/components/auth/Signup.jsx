import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logo.svg';
import googleIcon from '../assets/Social icon 2.svg';
import appleIcon from '../assets/Social icon.svg';
import hideIcon from '../assets/Hide.svg';

const SignUp = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { register, loginWithGoogle, setAuthState } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [passwordCriteria, setPasswordCriteria] = useState({
    minLength: false,
    hasUppercase: false,
    hasLowercase: false,
    hasNumber: false,
    hasSpecialChar: false,
  });
  const [nameFocused, setNameFocused] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [loginHover, setLoginHover] = useState(false);
  const [termsHover, setTermsHover] = useState(false);
  const [privacyHover, setPrivacyHover] = useState(false);


  useEffect(() => {
    const validations = {
      minLength: password.length >= 8,
      hasUppercase: /[A-Z]/.test(password),
      hasLowercase: /[a-z]/.test(password),
      hasNumber: /[0-9]/.test(password),
      hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    };
    setPasswordCriteria(validations);
  }, [password]);

  const handleSignUp = async (e) => {
    e.preventDefault();

    if (!name || !email || !password) {
      setError(t('auth.signup.fillAllFields'));
      return;
    }

    if (!passwordCriteria.minLength || !passwordCriteria.hasUppercase || !passwordCriteria.hasLowercase || !passwordCriteria.hasNumber || !passwordCriteria.hasSpecialChar) {
      setError(t('auth.signup.meetPasswordRequirements'));
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await register({ name, email, password });

      // ⚡ ZERO-KNOWLEDGE ENCRYPTION: Save recovery key silently (no modal)
      if (response.recoveryKey) {
        console.log('🔐 [Recovery] Recovery key received:', response.recoveryKey);
        // TODO: Consider adding recovery key to user profile or sending via email
      }

      // Check which flow the backend is using
      if (response.requiresVerification) {
        // Verification flow: navigate to authentication choice page
        navigate('/authentication', { state: { email: response.email } });
      } else if (response.user && response.accessToken) {
        // Direct creation flow: user is already created and logged in
        // Store tokens in localStorage
        localStorage.setItem('accessToken', response.accessToken);
        localStorage.setItem('refreshToken', response.refreshToken);
        localStorage.setItem('user', JSON.stringify(response.user));

        // Set auth state
        setAuthState(response.user);

        console.log('✅ User registered and logged in successfully');
        navigate('/home');
      } else {
        // Unknown response format
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

  const handleGoogleSignUp = () => {
    loginWithGoogle();
  };

  const ValidationItem = ({ text, isValid }) => (
    <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
      <div style={{
        width: 16,
        height: 16,
        borderRadius: '50%',
        border: isValid ? 'none' : '1.5px solid #E6E6EC',
        background: isValid ? '#10B981' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {isValid && <span style={{color: 'white', fontSize: 10}}>✓</span>}
      </div>
      <div style={{color: isValid ? '#10B981' : '#6C6B6E', fontSize: 14, fontFamily: 'Plus Jakarta Sans', fontWeight: '500'}}>{text}</div>
    </div>
  );

  return (
    <div style={{width: '100%', minHeight: '100vh', padding: '60px 20px 40px', background: 'white', overflow: 'auto', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'center', position: 'relative'}}>
      <div style={{width: '100%', maxWidth: 'var(--container-max-width)', padding: 'var(--container-padding)', borderRadius: 16, flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'center', gap: 32, display: 'flex'}}>
        <img style={{width: 120, height: 120, borderRadius: 120, filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15))'}} src={logo} alt="Logo" />

        <div style={{alignSelf: 'stretch', textAlign: 'center', flexDirection: 'column', gap: 12}}>
          <div style={{color: '#32302C', fontSize: 30, fontFamily: 'Plus Jakarta Sans', fontWeight: '600'}}>{t('auth.signup.title')}</div>
          <div style={{color: '#6C6B6E', fontSize: 16, fontFamily: 'Plus Jakarta Sans', fontWeight: '500'}}>{t('auth.signup.subtitle')}</div>
        </div>

        <form onSubmit={handleSignUp} style={{alignSelf: 'stretch', display: 'flex', flexDirection: 'column', gap: 20}}>
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
          <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
            <label style={{fontWeight: '600', fontSize: 14}}>{t('auth.signup.email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              placeholder={t('auth.signup.emailPlaceholder')}
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
          <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
            <label style={{fontWeight: '600', fontSize: 14}}>{t('auth.signup.password')}</label>
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
                style={{flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 16}}
              />
              <img src={hideIcon} alt="Show/Hide" onClick={() => setShowPassword(!showPassword)} style={{cursor: 'pointer'}}/>
            </div>
          </div>

          <div style={{display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4}}>
            <ValidationItem text={t('auth.signup.validation.minLength')} isValid={passwordCriteria.minLength} />
            <ValidationItem text={t('auth.signup.validation.uppercase')} isValid={passwordCriteria.hasUppercase} />
            <ValidationItem text={t('auth.signup.validation.lowercase')} isValid={passwordCriteria.hasLowercase} />
            <ValidationItem text={t('auth.signup.validation.number')} isValid={passwordCriteria.hasNumber} />
            <ValidationItem text={t('auth.signup.validation.specialChar')} isValid={passwordCriteria.hasSpecialChar} />
          </div>

          {error && <div style={{color: '#DC2626', background: '#FEE2E2', padding: '12px 16px', borderRadius: 26, marginTop: 8}}>{error}</div>}

          <button type="submit" disabled={isLoading} style={{height: 52, background: 'rgba(24, 24, 24, 0.90)', color: 'white', borderRadius: 26, border: 'none', fontSize: 16, fontWeight: '600', cursor: 'pointer', marginTop: 12, opacity: isLoading ? 0.6 : 1}}>
            {isLoading ? t('auth.signup.creatingAccount') : t('auth.signup.continue')}
          </button>
        </form>

        <div style={{textAlign: 'center', fontSize: 14}}>
          <span style={{color: '#6C6B6E'}}>{t('auth.signup.haveAccount')} </span>
          <Link
            to="/login"
            style={{
              fontWeight: '700',
              color: '#181818',
              textDecoration: 'none',
              display: 'inline-block',
              transform: loginHover ? 'scale(1.05)' : 'scale(1)',
              transition: 'transform 0.2s ease'
            }}
            onMouseEnter={() => setLoginHover(true)}
            onMouseLeave={() => setLoginHover(false)}
          >{t('auth.signup.logIn')}</Link>
        </div>

        <div style={{alignSelf: 'stretch', display: 'flex', alignItems: 'center', gap: 8}}>
          <div style={{flex: 1, height: 1, background: '#E6E6EC'}} />
          <span style={{color: '#6C6B6E'}}>{t('auth.signup.or')}</span>
          <div style={{flex: 1, height: 1, background: '#E6E6EC'}} />
        </div>

        <div style={{alignSelf: 'stretch', display: 'flex', flexDirection: 'column', gap: 16}}>
          <button onClick={handleGoogleSignUp} style={{height: 52, background: 'transparent', borderRadius: 26, border: '1px solid #E6E6EC', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, cursor: 'pointer', fontSize: 16, fontWeight: '500'}}>
            <img src={googleIcon} alt="Google icon" style={{filter: 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.15))'}} />
            {t('auth.signup.continueWithGoogle')}
          </button>
          <button style={{height: 52, background: 'transparent', borderRadius: 26, border: '1px solid #E6E6EC', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, cursor: 'pointer', fontSize: 16, fontWeight: '500'}}>
            <img src={appleIcon} alt="Apple icon" style={{filter: 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.15))'}} />
            {t('auth.signup.continueWithApple')}
          </button>
        </div>

        <div style={{textAlign: 'center', fontSize: 14}}>
          <span style={{color: '#6C6B6E'}}>{t('auth.signup.termsAgree')} </span>
          <Link
            to="/terms"
            style={{
              fontWeight: '600',
              color: '#181818',
              textDecoration: 'none',
              display: 'inline-block',
              transform: termsHover ? 'scale(1.05)' : 'scale(1)',
              transition: 'transform 0.2s ease'
            }}
            onMouseEnter={() => setTermsHover(true)}
            onMouseLeave={() => setTermsHover(false)}
          >{t('auth.signup.terms')}</Link>
          <span style={{color: '#6C6B6E'}}> {t('auth.signup.and')} </span>
          <Link
            to="/privacy"
            style={{
              fontWeight: '600',
              color: '#181818',
              textDecoration: 'none',
              display: 'inline-block',
              transform: privacyHover ? 'scale(1.05)' : 'scale(1)',
              transition: 'transform 0.2s ease'
            }}
            onMouseEnter={() => setPrivacyHover(true)}
            onMouseLeave={() => setPrivacyHover(false)}
          >{t('auth.signup.privacy')}</Link>.
        </div>
      </div>
    </div>
  );
};

export default SignUp;
