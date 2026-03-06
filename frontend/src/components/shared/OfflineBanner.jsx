import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export default function OfflineBanner() {
  const { t } = useTranslation();
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        background: '#FBBF24',
        color: '#92400E',
        fontFamily: 'Plus Jakarta Sans, sans-serif',
        fontWeight: 800,
        fontSize: 13,
        textAlign: 'center',
        padding: '8px 16px',
      }}
    >
      {t('errors.networkError', "You're offline \u2014 changes may not save")}
    </div>
  );
}
