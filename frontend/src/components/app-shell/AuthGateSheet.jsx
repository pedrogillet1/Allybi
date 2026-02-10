import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import kodaLogoWhite from '../../assets/koda-knot-black.svg';
import { AUTH_MODES } from '../../constants/routes';
import { useAuthModal } from '../../context/AuthModalContext';

/**
 * AuthGateSheet - Mobile-only bottom sheet for unauthenticated users
 *
 * Features:
 * - Full-screen dimmed overlay with bottom sheet (mobile only)
 * - Intent-based triggering (shows when user tries to interact)
 * - Large 44x44 close button for accessibility
 * - Trust-building copy with concrete value props
 * - Secondary "Log in" action
 * - Desktop: Falls back to original WelcomePopup behavior
 */
const AuthGateSheet = ({
  isOpen,
  onClose,
  triggerSource = 'default' // 'input', 'upload', 'history', 'default'
}) => {
  const { t } = useTranslation();
  const authModal = useAuthModal();
  const [isAnimating, setIsAnimating] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // Handle open/close animations
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      // Small delay for animation
      requestAnimationFrame(() => {
        setIsAnimating(true);
      });
    } else {
      setIsAnimating(false);
      const timer = setTimeout(() => setIsVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleSignUp = useCallback(() => {
    authModal.open({ mode: AUTH_MODES.SIGNUP, reason: 'auth_gate_sheet' });
  }, [authModal]);

  const handleLogin = useCallback(() => {
    authModal.open({ mode: AUTH_MODES.LOGIN, reason: 'auth_gate_sheet' });
  }, [authModal]);

  const handleClose = useCallback((e) => {
    e?.stopPropagation();
    onClose?.();
  }, [onClose]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  if (!isVisible) return null;

  // Value propositions - concrete benefits
  const valueProps = [
    t('authGateSheet.feature1'),
    t('authGateSheet.feature2'),
    t('authGateSheet.feature3'),
  ];

  return (
    <>
      {/* Mobile Bottom Sheet with Overlay */}
      <div className="md:hidden">
        {/* Dimmed backdrop overlay */}
        <div
          className={`fixed inset-0 z-[1001] bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
            isAnimating ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={handleClose}
          aria-hidden="true"
        />

        {/* Bottom Sheet */}
        <div
          className={`fixed inset-x-0 bottom-0 z-[1002] rounded-t-2xl bg-neutral-900 p-6 pb-8 transition-transform duration-300 ease-out ${
            isAnimating ? 'translate-y-0' : 'translate-y-full'
          }`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-gate-title"
        >
          {/* Drag indicator */}
          <div className="absolute left-1/2 top-3 h-1 w-10 -translate-x-1/2 rounded-full bg-white/20" />

          {/* Close Button - 44x44 touch target */}
          <button
            onClick={handleClose}
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white active:bg-white/20"
            aria-label={t('common.close')}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* Logo */}
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-white p-2">
            <img
              src={kodaLogoWhite}
              alt="Allybi"
              className="h-full w-full object-contain"
            />
          </div>

          {/* Content */}
          <h2
            id="auth-gate-title"
            className="mb-2 font-['Plus_Jakarta_Sans'] text-xl font-bold leading-7 text-white"
          >
            {t('authGateSheet.title')}
          </h2>

          <p className="mb-5 font-['Plus_Jakarta_Sans'] text-sm font-medium leading-5 text-neutral-400">
            {t('authGateSheet.subtitle')}
          </p>

          {/* Value Props */}
          <ul className="mb-6 space-y-2">
            {valueProps.map((prop, index) => (
              <li key={index} className="flex items-center gap-3">
                <svg className="h-5 w-5 flex-shrink-0 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <span className="font-['Plus_Jakarta_Sans'] text-sm font-medium text-white/90">
                  {prop}
                </span>
              </li>
            ))}
          </ul>

          {/* CTA Buttons */}
          <button
            onClick={handleSignUp}
            className="mb-3 w-full rounded-xl bg-white py-3.5 font-['Plus_Jakarta_Sans'] text-sm font-bold text-neutral-900 transition-all active:scale-[0.98] active:bg-neutral-100"
          >
            {t('authGateSheet.signUp')}
          </button>

          {/* Secondary Login Link */}
          <div className="text-center">
            <span className="font-['Plus_Jakarta_Sans'] text-sm text-white/60">
              {t('authGateSheet.alreadyHaveAccount')}{' '}
            </span>
            <button
              onClick={handleLogin}
              className="font-['Plus_Jakarta_Sans'] text-sm font-semibold text-white/90 underline underline-offset-2 transition-colors hover:text-white"
            >
              {t('authGateSheet.logIn')}
            </button>
          </div>
        </div>
      </div>

      {/* Desktop: Original floating card style (unchanged) */}
      <div className="hidden md:block">
        <div
          className="fixed bottom-10 right-10 z-[1001] flex w-[360px] cursor-pointer flex-col gap-4 rounded-2xl border border-neutral-200 bg-neutral-900 p-5 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
          onClick={handleSignUp}
          style={{
            animation: 'welcomeSlideIn 0.3s ease-out'
          }}
        >
          {/* Close Button */}
          <button
            onClick={handleClose}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-white transition-opacity hover:opacity-70"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* Logo */}
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white p-2">
            <img src={kodaLogoWhite} alt="Allybi" className="h-full w-full object-contain" />
          </div>

          {/* Content */}
          <div className="flex flex-col gap-2">
            <h3 className="font-['Plus_Jakarta_Sans'] text-lg font-bold leading-6 text-white">
              {t('authGateSheet.title')}
            </h3>
            <p className="font-['Plus_Jakarta_Sans'] text-sm font-medium leading-5 text-neutral-400">
              {t('authGateSheet.subtitle')}
            </p>
          </div>

          {/* CTA Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleSignUp();
            }}
            className="w-full rounded-xl bg-white py-3 font-['Plus_Jakarta_Sans'] text-sm font-bold text-neutral-900 transition-all hover:scale-[1.02] hover:bg-neutral-100"
          >
            {t('authGateSheet.signUp')}
          </button>
        </div>

        {/* Animation Keyframes */}
        <style>{`
          @keyframes welcomeSlideIn {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>
      </div>
    </>
  );
};

export default AuthGateSheet;
