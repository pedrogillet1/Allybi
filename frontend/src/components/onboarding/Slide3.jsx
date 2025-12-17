import React from 'react';
import { useTranslation } from 'react-i18next';
import chatImage from '../../assets/Silver-Card3.svg';
import searchbarPopup from '../../assets/Searchbar-Popup.svg';

/**
 * Slide 3: Send your files and ask your first question - Refined
 *
 * Shows chat interface mockup with:
 * - Koda welcome bubble
 * - User example question
 * - Two stacked example questions (darker grey)
 * - "START HERE" label above input bar
 * - Highlighted input bar with pulse animation (1-2 second loop)
 */
const Slide3 = () => {
  const { t } = useTranslation();
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }}>
      {/* Micro Label */}
      <div style={{
        fontSize: 11,
        fontWeight: '500',
        color: '#6B7280',
        fontFamily: 'Plus Jakarta Sans',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        marginBottom: 4
      }}>
        {t('onboarding.step', { current: 3, total: 3 })}
      </div>

      {/* Title */}
      <div style={{
        fontSize: 22,
        fontWeight: '600',
        color: '#111827',
        fontFamily: 'Plus Jakarta Sans',
        lineHeight: '28px',
        maxWidth: 520
      }}>
        {t('onboarding.slide3.title')}
      </div>

      {/* Subline */}
      <div style={{
        fontSize: 14,
        fontWeight: '400',
        color: '#111827',
        fontFamily: 'Plus Jakarta Sans',
        lineHeight: '20px',
        marginTop: 0,
        marginBottom: 24
      }}>
        {t('onboarding.slide3.subtitle')}
      </div>

      {/* Centered Chat Image with top and bottom fade */}
      <div style={{
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        margin: '0 auto',
        position: 'relative'
      }}>
        <img
          src={chatImage}
          alt="Chat interface illustration"
          style={{
            width: 'auto',
            height: 'auto',
            maxWidth: '100%',
            maxHeight: 300,
            objectFit: 'contain'
          }}
        />

        {/* Searchbar Popup Overlay - positioned where the searchbar is in the SVG */}
        <img
          src={searchbarPopup}
          alt="Search bar"
          style={{
            position: 'absolute',
            bottom: '27.5%',
            left: '51%',
            transform: 'translateX(-50%)',
            width: '54%',
            height: 'auto',
            objectFit: 'contain',
            animation: 'popupPulse 2s ease-in-out infinite',
            filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15))',
            zIndex: 10
          }}
        />

        {/* White fade overlay at top */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '100px',
          background: 'linear-gradient(to bottom, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 0.8) 30%, rgba(255, 255, 255, 0) 100%)',
          pointerEvents: 'none'
        }} />
        {/* White fade overlay at bottom */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '100px',
          background: 'linear-gradient(to bottom, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.8) 70%, rgba(255, 255, 255, 1) 100%)',
          pointerEvents: 'none'
        }} />
      </div>

      {/* Keyframe for Popup Pulse Animation */}
      <style>{`
        @keyframes popupPulse {
          0%, 100% {
            transform: translateX(-50%) scale(1);
            filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15));
          }
          50% {
            transform: translateX(-50%) scale(1.01);
            filter: drop-shadow(0 8px 20px rgba(0, 0, 0, 0.25));
          }
        }
      `}</style>

      {/* Bullets */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        marginTop: 24
      }}>
        <div style={{
          fontSize: 14,
          fontWeight: '400',
          color: '#111827',
          fontFamily: 'Plus Jakarta Sans',
          lineHeight: '22px',
          display: 'flex',
          gap: 8
        }}>
          <span style={{ color: '#6B7280' }}>•</span>
          <span>{t('onboarding.slide3.bullet1')}</span>
        </div>
        <div style={{
          fontSize: 14,
          fontWeight: '400',
          color: '#111827',
          fontFamily: 'Plus Jakarta Sans',
          lineHeight: '22px',
          display: 'flex',
          gap: 8
        }}>
          <span style={{ color: '#6B7280' }}>•</span>
          <span>{t('onboarding.slide3.bullet2')}</span>
        </div>
        <div style={{
          fontSize: 14,
          fontWeight: '400',
          color: '#111827',
          fontFamily: 'Plus Jakarta Sans',
          lineHeight: '22px',
          display: 'flex',
          gap: 8
        }}>
          <span style={{ color: '#6B7280' }}>•</span>
          <span>{t('onboarding.slide3.bullet3')}</span>
        </div>
      </div>
    </div>
  );
};

export default Slide3;
