import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { ROUTES, DEFAULT_AUTH_REDIRECT, buildRoute, AUTH_MODES } from '../constants/routes';

const OAuthCallback = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setAuthState } = useAuth();

  useEffect(() => {
    const handleOAuthCallback = async () => {
      // Get tokens from URL
      const accessToken = searchParams.get('accessToken');
      const refreshToken = searchParams.get('refreshToken');
      const error = searchParams.get('error');

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
          default:
            errorMessage = 'Authentication failed';
        }

        navigate(`${buildRoute.auth(AUTH_MODES.LOGIN)}?error=${errorMessage}`);
        return;
      }

      // Check if tokens exist
      if (!accessToken || !refreshToken) {
        navigate(`${buildRoute.auth(AUTH_MODES.LOGIN)}?error=Missing authentication tokens`);
        return;
      }

      // Store tokens
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);

      // Fetch user data using the access token
      try {
        const response = await fetch(`${process.env.REACT_APP_API_URL}/api/auth/me`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        });

        if (response.ok) {
          const userData = await response.json();
          localStorage.setItem('user', JSON.stringify(userData.user));

          // Update AuthContext state with both user data and authentication status
          setAuthState(userData.user);

          // Navigate to chat after successful OAuth login
          navigate(DEFAULT_AUTH_REDIRECT);
        } else {
          throw new Error('Failed to fetch user data');
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
        navigate(`${buildRoute.auth(AUTH_MODES.LOGIN)}?error=Failed to fetch user data`);
      }
    };

    handleOAuthCallback();
  }, [searchParams, navigate, setAuthState]);

  return (
    <div style={{
      width: '100%',
      minHeight: '100vh',
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
