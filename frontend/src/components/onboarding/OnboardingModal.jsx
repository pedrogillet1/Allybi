import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ReactComponent as XCloseIcon } from '../../assets/x-close.svg';
import Slide1 from './Slide1';
import Slide2 from './Slide2';
import Slide3 from './Slide3';

/**
 * OnboardingModal Component - Refined
 *
 * Desktop-only 3-step onboarding that can be triggered from:
 * - Chat screen (auto, first login)
 * - Settings page (manual replay)
 *
 * Props are provided by OnboardingProvider:
 * - currentStep: Current slide index (0-2)
 * - onNext: Go to next slide or complete
 * - onBack: Go to previous slide
 * - onSkip: Skip onboarding
 * - onComplete: Complete and close
 * - onGoToStep: Jump to specific step
 */
const OnboardingModal = ({ currentStep, onNext, onBack, onSkip, onComplete, onGoToStep }) => {
  const { t } = useTranslation();
  const [previousSlide, setPreviousSlide] = useState(0);

  // Update previousSlide when currentStep changes (for animation direction)
  useEffect(() => {
    setPreviousSlide((prev) => {
      if (prev !== currentStep) {
        return prev;
      }
      return prev;
    });
  }, [currentStep]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onComplete();
      } else if (e.key === 'Enter') {
        onNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStep, onComplete, onNext]);

  // Jump to specific slide (for progress dots)
  const handleDotClick = (index) => {
    setPreviousSlide(currentStep);
    onGoToStep(index);
  };

  const slides = [
    <Slide1 key="slide1" />,
    <Slide2 key="slide2" />,
    <Slide3 key="slide3" />
  ];

  // Determine animation direction
  const isForward = currentStep > previousSlide;

  return (
    <>
      {/* Dark Overlay with blur */}
      <div
        onClick={onComplete}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.45)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          zIndex: 1100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16
        }}
      >
        {/* Modal Card */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            maxWidth: 860,
            width: 'min(860px, 90vw)',
            maxHeight: 'calc(100vh - 96px)',
            background: '#FFFFFF',
            borderRadius: 24,
            boxShadow: '0 24px 40px rgba(0, 0, 0, 0.18)',
            padding: '32px 32px 24px 32px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}
        >
          {/* Top Row: Close Button Only (titles are in slides) */}
          <div style={{
            position: 'absolute',
            top: 32,
            right: 32,
            zIndex: 10
          }}>
            <div
              onClick={onComplete}
              style={{
                width: 32,
                height: 32,
                background: '#F5F5F5',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#E6E6EC'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#F5F5F5'}
            >
              <XCloseIcon style={{ width: 24, height: 24 }} />
            </div>
          </div>

          {/* Slide Content with directional animation */}
          <div style={{
            flex: 1,
            overflow: 'hidden',
            paddingRight: 48 // Space for close button
          }}>
            <div
              key={currentStep}
              style={{
                animation: `slideIn${isForward ? 'Forward' : 'Back'} 220ms cubic-bezier(0.22, 0.61, 0.36, 1) forwards`,
                opacity: 0
              }}
            >
              {slides[currentStep]}
            </div>
          </div>

          {/* Keyframe animations */}
          <style>{`
            @keyframes slideInForward {
              from {
                opacity: 0;
                transform: translateX(12px);
              }
              to {
                opacity: 1;
                transform: translateX(0);
              }
            }
            @keyframes slideInBack {
              from {
                opacity: 0;
                transform: translateX(-12px);
              }
              to {
                opacity: 1;
                transform: translateX(0);
              }
            }
          `}</style>

          {/* Horizontal Divider */}
          <div style={{
            width: '100%',
            height: 1,
            background: '#E5E7EB',
            marginTop: 24,
            marginBottom: 16
          }} />

          {/* Bottom Row: Skip + Progress Dots + Back + Next/Start Button */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16
          }}>
            {/* Skip Button */}
            <button
              onClick={onSkip}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#6B7280',
                fontSize: 14,
                fontFamily: 'Plus Jakarta Sans',
                fontWeight: '400',
                cursor: 'pointer',
                padding: 0,
                transition: 'color 0.2s, text-decoration 0.2s',
                height: 'auto',
                display: 'flex',
                alignItems: 'center',
                textDecoration: 'none'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#111827';
                e.currentTarget.style.textDecoration = 'underline';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#6B7280';
                e.currentTarget.style.textDecoration = 'none';
              }}
            >
              {t('onboarding.skip')}
            </button>

            {/* Progress Dots - Clickable */}
            <div style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center'
            }}>
              {[0, 1, 2].map((index) => (
                <div
                  key={index}
                  onClick={() => handleDotClick(index)}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: currentStep === index ? '#111827' : '#D1D5DB',
                    boxShadow: currentStep === index ? '0 0 0 2px rgba(0, 0, 0, 0.04)' : 'none',
                    transition: 'background 0.3s, transform 0.2s, box-shadow 0.3s',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.3)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                />
              ))}
            </div>

            {/* Back + Next/Start Buttons */}
            <div style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center'
            }}>
              {/* Back Button - Hidden on slide 1 */}
              {currentStep > 0 && (
                <button
                  onClick={onBack}
                  style={{
                    background: '#FFFFFF',
                    border: '1px solid #D1D5DB',
                    borderRadius: 999,
                    color: '#111827',
                    fontSize: 14,
                    fontFamily: 'Plus Jakarta Sans',
                    fontWeight: '500',
                    height: 40,
                    padding: '0 18px',
                    cursor: 'pointer',
                    transition: 'background 0.2s, border-color 0.2s',
                    whiteSpace: 'nowrap',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#F9FAFB';
                    e.currentTarget.style.borderColor = '#9CA3AF';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#FFFFFF';
                    e.currentTarget.style.borderColor = '#D1D5DB';
                  }}
                >
                  {t('onboarding.back')}
                </button>
              )}

              {/* Next / Start Button */}
              <button
                onClick={onNext}
                style={{
                  background: '#111827',
                  border: 'none',
                  borderRadius: 999,
                  color: '#FFFFFF',
                  fontSize: 14,
                  fontFamily: 'Plus Jakarta Sans',
                  fontWeight: '500',
                  padding: '0 22px',
                  cursor: 'pointer',
                  transition: 'background 0.2s',
                  whiteSpace: 'nowrap',
                  height: 40,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#32302C'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#111827'}
              >
                {currentStep === 2 ? t('onboarding.start') : t('onboarding.next')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default OnboardingModal;
