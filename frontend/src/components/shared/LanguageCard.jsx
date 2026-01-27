import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '../hooks/useIsMobile';
import LanguageDropdown from './LanguageDropdown';

const LanguageCard = () => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      style={{
        alignSelf: 'stretch',
        padding: isMobile ? 16 : 24,
        background: isHovered ? '#F5F5F5' : 'white',
        borderRadius: isMobile ? 12 : 20,
        border: '2px solid #E6E6EC',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06)',
        justifyContent: 'flex-start',
        alignItems: 'center',
        gap: isMobile ? 12 : 20,
        display: 'flex',
        transition: 'background 0.2s ease'
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Globe Emoji with shadow */}
      <div style={{
        width: 56,
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 42,
        filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.15))'
      }}>
        🌐
      </div>

      {/* Text content */}
      <div style={{ flex: '1 1 0', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', gap: 6, display: 'flex' }}>
        <div style={{
          color: '#32302C',
          fontSize: 20,
          fontFamily: 'Plus Jakarta Sans',
          fontWeight: '700',
          lineHeight: '28px'
        }}>
          {t('settings.language.title')}
        </div>
        <div style={{
          color: '#6C6B6E',
          fontSize: 15,
          fontFamily: 'Plus Jakarta Sans',
          fontWeight: '500',
          lineHeight: '20px'
        }}>
          {t('settings.language.subtitle')}
        </div>
      </div>

      {/* Right side - Language dropdown */}
      <div style={{ flexShrink: 0 }}>
        <LanguageDropdown type="interface" variant="pill" />
      </div>
    </div>
  );
};

export default LanguageCard;
