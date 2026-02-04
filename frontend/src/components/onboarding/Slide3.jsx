import React from 'react';
import { useTranslation } from 'react-i18next';
import slideImage from '../../assets/intro-modal-slide3.svg';

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

      {/* Centered Image with top and bottom fade */}
      <div style={{
        width: '100%',
        height: '300px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        margin: '0 auto',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <img
          src={slideImage}
          alt="Chat interface illustration"
          style={{
            width: 'auto',
            height: 'auto',
            maxWidth: '100%',
            maxHeight: 345,
            objectFit: 'contain',
            marginTop: 60
          }}
        />
      </div>

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
      </div>
    </div>
  );
};

export default Slide3;
