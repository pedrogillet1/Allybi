import React from 'react';
import { useTranslation } from 'react-i18next';
import silverImage from '../../assets/Official-Color-Card2.svg';

/**
 * Slide 2: See your work organized into Categories - Refined
 *
 * Shows Silver.svg centered in the card
 */
const Slide2 = () => {
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
        {t('onboarding.step', { current: 2, total: 3 })}
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
        {t('onboarding.slide2.title')}
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
        {t('onboarding.slide2.subtitle')}
      </div>

      {/* Centered Official-Color.svg Image with bottom fade */}
      <div style={{
        width: '100%',
        height: '300px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        margin: '0 auto',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <img
          src={silverImage}
          alt="Categories illustration"
          style={{
            width: 'auto',
            height: 'auto',
            maxWidth: '100%',
            maxHeight: 360,
            objectFit: 'contain'
          }}
        />
        {/* White fade overlay at bottom */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '40px',
          background: 'linear-gradient(to bottom, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.85) 40%, rgba(255, 255, 255, 1) 100%)',
          pointerEvents: 'none'
        }} />
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
          <span>{t('onboarding.slide2.bullet1')}</span>
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
          <span>{t('onboarding.slide2.bullet2')}</span>
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
          <span>{t('onboarding.slide2.bullet3')}</span>
        </div>
      </div>
    </div>
  );
};

export default Slide2;
