import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { useIsMobile } from '../hooks/useIsMobile';
import OnboardingModal from '../components/onboarding/OnboardingModal';

const OnboardingContext = createContext();

export const useOnboarding = () => {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding must be used within OnboardingProvider');
  }
  return context;
};

export const OnboardingProvider = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [source, setSource] = useState(null); // 'auto' | 'settings'
  const isMobile = useIsMobile();

  /**
   * Open the onboarding modal
   * @param {number} startStep - Step to start at (0-4)
   * @param {string} triggerSource - Where the modal was triggered from ('auto' | 'settings')
   */
  const open = useCallback((startStep = 0, triggerSource = 'auto') => {
    // Skip auto-trigger on mobile, but allow manual trigger from settings
    if (triggerSource === 'auto' && (isMobile || (typeof window !== 'undefined' && window.innerWidth < 1024))) {
      console.log('[OnboardingContext] Skipping auto-onboarding on mobile');
      return;
    }

    console.log(`[OnboardingContext] Opening onboarding - step ${startStep}, source: ${triggerSource}`);
    setCurrentStep(startStep);
    setSource(triggerSource);
    setIsOpen(true);
  }, [isMobile]);

  /**
   * Close the onboarding modal
   * @param {boolean} markCompleted - Whether to mark onboarding as completed
   */
  const close = useCallback((markCompleted = true) => {
    console.log(`[OnboardingContext] Closing onboarding - markCompleted: ${markCompleted}`);

    if (markCompleted) {
      localStorage.setItem('koda_onboarding_completed', 'true');
    }

    setIsOpen(false);
    setCurrentStep(0);
    setSource(null);
  }, []);

  /**
   * Navigate to a specific step
   * @param {number} step - Step index (0-4)
   */
  const goToStep = useCallback((step) => {
    if (step >= 0 && step <= 4) {
      setCurrentStep(step);
    }
  }, []);

  /**
   * Go to next step or complete if on last step
   * Uses functional update to avoid stale closure
   */
  const next = useCallback(() => {
    setCurrentStep(prev => {
      if (prev < 4) {
        return prev + 1;
      } else {
        // Close on last step - use setTimeout to avoid state update during render
        setTimeout(() => {
          localStorage.setItem('koda_onboarding_completed', 'true');
          setIsOpen(false);
          setSource(null);
        }, 0);
        return 0;
      }
    });
  }, []);

  /**
   * Go to previous step
   */
  const back = useCallback(() => {
    setCurrentStep(prev => (prev > 0 ? prev - 1 : prev));
  }, []);

  /**
   * Skip onboarding (marks as completed)
   */
  const skip = useCallback(() => {
    localStorage.setItem('koda_onboarding_completed', 'true');
    setIsOpen(false);
    setCurrentStep(0);
    setSource(null);
  }, []);

  const value = useMemo(() => ({
    isOpen,
    currentStep,
    source,
    open,
    close,
    goToStep,
    next,
    back,
    skip
  }), [isOpen, currentStep, source, open, close, goToStep, next, back, skip]);

  return (
    <OnboardingContext.Provider value={value}>
      {children}
      {/* Render the modal at root level so it overlays any page */}
      {isOpen && (
        <OnboardingModal
          currentStep={currentStep}
          onNext={next}
          onBack={back}
          onSkip={skip}
          onComplete={() => close(true)}
          onGoToStep={goToStep}
        />
      )}
    </OnboardingContext.Provider>
  );
};
