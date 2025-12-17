import React from 'react';
import { useTranslation } from 'react-i18next';
import laptopMockup from '../../assets/Space-Gray-Card1-New.svg';
import answer1 from '../../assets/answer1.svg';
import question1 from '../../assets/question1.svg';
import question2 from '../../assets/question2.svg';
import answer2 from '../../assets/answer2.svg';
import question3 from '../../assets/question3.svg';
import answer3 from '../../assets/answer3.svg';

/**
 * Slide 1: Organizing documents isn't your job. It's mine. - Refined
 *
 * Shows chat-style illustration with SVG images
 */
const Slide1 = () => {
  const { t } = useTranslation();
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 4
    }}>
      {/* Micro Label */}
      <div style={{
        fontSize: 11,
        fontWeight: '500',
        color: '#6B7280',
        fontFamily: 'Plus Jakarta Sans',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        marginBottom: 2
      }}>
        {t('onboarding.step', { current: 1, total: 3 })}
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
        {t('onboarding.slide1.title')}
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
        {t('onboarding.slide1.subtitle')}
      </div>

      {/* Centered MacBook Image with top and bottom fade */}
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
          src={laptopMockup}
          alt="Laptop showing chat interface"
          style={{
            width: 'auto',
            height: 'auto',
            maxWidth: '100%',
            maxHeight: 460,
            objectFit: 'contain'
          }}
        />

        {/* Question 1 - Top right (User message) */}
        <img
          src={question1}
          alt="Question 1"
          style={{
            position: 'absolute',
            top: '5%',
            right: '12%',
            width: 'auto',
            height: '45px',
            objectFit: 'contain',
            animation: 'shadowPopup 2s ease-in-out infinite',
            animationDelay: '0s',
            filter: 'brightness(0.88) invert(1)',
            zIndex: 10
          }}
        />

        {/* Answer 1 - Below Q1, left (Koda response) */}
        <img
          src={answer1}
          alt="Answer 1"
          style={{
            position: 'absolute',
            top: '22%',
            left: '12%',
            width: '48%',
            height: 'auto',
            objectFit: 'contain',
            filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15))',
            zIndex: 10
          }}
        />

        {/* White rectangle behind Question 2 */}
        <div style={{
          position: 'absolute',
          top: '36.5%',
          right: '16%',
          width: '260px',
          height: '38px',
          background: 'white',
          borderRadius: '24px',
          zIndex: 9
        }} />

        {/* Question 2 - Below A1, right (User message) */}
        <img
          src={question2}
          alt="Question 2"
          style={{
            position: 'absolute',
            top: '35%',
            right: '12%',
            width: 'auto',
            height: '48px',
            objectFit: 'contain',
            animation: 'shadowPopup 2s ease-in-out infinite',
            animationDelay: '0.4s',
            filter: 'invert(1)',
            zIndex: 10
          }}
        />

        {/* Answer 2 - Below Q2, left (Koda response) */}
        <img
          src={answer2}
          alt="Answer 2"
          style={{
            position: 'absolute',
            top: '52%',
            left: '12%',
            width: '48%',
            height: 'auto',
            objectFit: 'contain',
            filter: 'drop-shadow(0 4px 12px rgba(0, 0, 0, 0.15))',
            zIndex: 10
          }}
        />

        {/* White rectangle behind Question 3 */}
        <div style={{
          position: 'absolute',
          top: '69.5%',
          right: '16%',
          width: '280px',
          height: '38px',
          background: 'white',
          borderRadius: '24px',
          zIndex: 9
        }} />

        {/* Question 3 - Below A2, right (User message) */}
        <img
          src={question3}
          alt="Question 3"
          style={{
            position: 'absolute',
            top: '68%',
            right: '12%',
            width: 'auto',
            height: '48px',
            objectFit: 'contain',
            animation: 'shadowPopup 2s ease-in-out infinite',
            animationDelay: '0.8s',
            filter: 'invert(1)',
            zIndex: 10
          }}
        />

        {/* Answer 3 - Below Q3, left (Koda response) */}
        <img
          src={answer3}
          alt="Answer 3"
          style={{
            position: 'absolute',
            top: '84%',
            left: '12%',
            width: '48%',
            height: 'auto',
            objectFit: 'contain',
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

      {/* Keyframe for Shadow Popup Animation */}
      <style>{`
        @keyframes shadowPopup {
          0%, 100% {
            filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.15));
          }
          50% {
            filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.35));
          }
        }
      `}</style>

      {/* Bullets */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        marginTop: 16
      }}>
        <div style={{
          fontSize: 14,
          fontWeight: '400',
          color: '#111827',
          fontFamily: 'Plus Jakarta Sans',
          lineHeight: '20px',
          display: 'flex',
          gap: 8
        }}>
          <span style={{ color: '#6B7280' }}>•</span>
          <span>
            {t('onboarding.slide1.bullet1')}<br />
            {t('onboarding.slide1.bullet1Sub')}
          </span>
        </div>
        <div style={{
          fontSize: 14,
          fontWeight: '400',
          color: '#111827',
          fontFamily: 'Plus Jakarta Sans',
          lineHeight: '20px',
          display: 'flex',
          gap: 8
        }}>
          <span style={{ color: '#6B7280' }}>•</span>
          <span>{t('onboarding.slide1.bullet2')}</span>
        </div>
        <div style={{
          fontSize: 14,
          fontWeight: '400',
          color: '#111827',
          fontFamily: 'Plus Jakarta Sans',
          lineHeight: '20px',
          display: 'flex',
          gap: 8
        }}>
          <span style={{ color: '#6B7280' }}>•</span>
          <span>{t('onboarding.slide1.bullet3')}</span>
        </div>
      </div>
    </div>
  );
};

export default Slide1;
