import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import {
  DEFAULT_AUTH_REDIRECT,
  STORAGE_KEYS,
  buildRoute,
  AUTH_MODES,
  ROUTES,
} from '../../constants/routes';
import { useAuthModal } from '../../context/AuthModalContext';
import { fetchBootstrapSession } from '../../services/authBootstrap';

const OAuthCallback = ({ variant = 'page' }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setAuthState } = useAuth();
  const { completeAuth } = useAuthModal();
  const isModal = variant === 'modal';

  useEffect(() => {
    const handleOAuthCallback = async () => {
      const error = searchParams.get('error');
      const authStatus = searchParams.get('auth');

      // Handle errors
      if (error) {
        console.error('OAuth error:', error);
        let errorMessage = 'Authentication failed';

        switch (error) {
          case 'oauth_failed':
            errorMessage = 'Google authentication failed';
            break;
          case 'no_email':
            errorMessage = 'Could not get email from Google account';
            break;
          case 'oauth_error':
            errorMessage = 'An error occurred during authentication';
            break;
          case 'invalid_state':
            errorMessage = 'Authentication request expired. Please try again.';
            break;
          case 'email_not_verified':
            errorMessage = 'Google account email is not verified';
            break;
          default:
            errorMessage = 'Authentication failed';
        }

        navigate(`${buildRoute.auth(AUTH_MODES.LOGIN)}?error=${errorMessage}`);
        return;
      }

      if (authStatus === '2fa_required') {
        navigate(ROUTES.TWO_FACTOR_LOGIN, {
          replace: true,
          state: { source: 'oauth' },
        });
        return;
      }

      // Cookie-first bootstrap: backend sets httpOnly cookies during OAuth callback.
      try {
        const bootstrap = await fetchBootstrapSession();
        if (bootstrap?.ok && bootstrap?.user) {
          const userData = { user: bootstrap.user };

          // Cache non-sensitive profile locally for quick boot.
          const safeUser = { id: userData.user.id, name: userData.user.name, avatar: userData.user.avatar, locale: userData.user.locale };
          localStorage.setItem('user', JSON.stringify(safeUser));

          // Update AuthContext state (full user object in React state only)
          setAuthState(userData.user);

          // Set flag so new OAuth users go to first-upload onboarding
          if (!localStorage.getItem(STORAGE_KEYS.FIRST_UPLOAD_DONE)) {
            localStorage.setItem(STORAGE_KEYS.PENDING_FIRST_UPLOAD, 'true');
          }
          // Navigate after successful OAuth login
          completeAuth({ fallback: DEFAULT_AUTH_REDIRECT });
        } else {
          throw new Error('Failed to fetch user data');
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
        navigate(`${buildRoute.auth(AUTH_MODES.LOGIN)}?error=Session bootstrap failed`, { replace: true });
      }
    };

    handleOAuthCallback();
  }, [searchParams, navigate, setAuthState, completeAuth]);

  return (
    <div style={{
      width: '100%',
      minHeight: isModal ? '100%' : '100vh',
      padding: '40px 20px',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      background: 'white',
      overflowY: 'auto',
      overflowX: 'hidden'
    }}>
      <div style={{
        textAlign: 'center',
        padding: 40
      }}>
        {/* Loading spinner */}
        <div style={{
          width: 40,
          height: 40,
          border: '4px solid #E6E6EC',
          borderTop: '4px solid #181818',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto 20px'
        }}></div>

        <div style={{
          color: '#32302C',
          fontSize: 18,
          fontFamily: 'Plus Jakarta Sans',
          fontWeight: '600',
          marginBottom: 8
        }}>
          {t('oauth.completingSignIn')}
        </div>

        <div style={{
          color: '#6C6B6E',
          fontSize: 14,
          fontFamily: 'Plus Jakarta Sans',
          fontWeight: '400'
        }}>
          {t('oauth.pleaseWait')}
        </div>
      </div>

      {/* CSS animation for loading spinner */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}} />
    </div>
  );
};

export default OAuthCallback;
