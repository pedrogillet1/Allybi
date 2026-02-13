import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import LanguageDropdown from './LanguageDropdown';
import translationIcon from '../../assets/translation-icon.svg';
import SettingsIcon from '../settings/SettingsIcon';

/**
 * LanguageCard - Language & Region settings row
 * Uses consistent styling with SettingsRow pattern
 */
const LanguageCard = () => {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      style={{
        alignSelf: 'stretch',
        minHeight: 74,
        padding: '18px',
        background: isHovered ? '#F5F5F5' : 'white',
        borderRadius: 18,
        border: '1px solid #E6E6EC',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.06)',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        transition: 'background 0.15s ease'
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Translation Icon - 56px container, 32px icon with hover state */}
      <SettingsIcon src={translationIcon} alt="Language" isHovered={isHovered} />

      {/* Text content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          color: '#1F1F1F',
          fontSize: 16,
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          fontWeight: 600,
          lineHeight: '22px',
          margin: 0
        }}>
          {t('settings.language.title')}
        </div>
        <div style={{
          color: '#6B7280',
          fontSize: 13,
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          fontWeight: 500,
          lineHeight: '18px',
          margin: 0,
          marginTop: 2
        }}>
          {t('settings.language.subtitle')}
        </div>
      </div>

      {/* Right side - Language dropdown */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <LanguageDropdown type="interface" variant="pill" />
      </div>
    </div>
  );
};

export default LanguageCard;
