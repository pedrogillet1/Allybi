import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';

// ─── Reduced-motion query ───────────────────────────────────────────────────
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false,
  );
  useEffect(() => {
    const mql = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mql) return;
    const handler = (e) => setReduced(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return reduced;
}

// ─── Placement helpers ──────────────────────────────────────────────────────
const DEFAULT_FALLBACKS = {
  'top':          ['bottom', 'right', 'left'],
  'top-start':    ['bottom-start', 'right', 'left'],
  'top-end':      ['bottom-end', 'right', 'left'],
  'bottom':       ['top', 'right', 'left'],
  'bottom-start': ['top-start', 'right', 'left'],
  'bottom-end':   ['top-end', 'right', 'left'],
  'left':         ['right', 'bottom', 'top'],
  'right':        ['left', 'bottom', 'top'],
};

function positionFor(rect, tw, th, placement, gap) {
  const side = placement.split('-')[0];
  const align = placement.split('-')[1];
  let top = 0;
  let left = 0;

  switch (side) {
    case 'bottom': top = rect.top + rect.height + gap; break;
    case 'top':    top = rect.top - th - gap; break;
    case 'left':
      left = rect.left - tw - gap;
      top = rect.top + rect.height / 2 - th / 2;
      break;
    case 'right':
      left = rect.left + rect.width + gap;
      top = rect.top + rect.height / 2 - th / 2;
      break;
    default: break;
  }

  if (side === 'bottom' || side === 'top') {
    if (align === 'start')      left = rect.left;
    else if (align === 'end') left = rect.left + rect.width - tw;
    else                       left = rect.left + rect.width / 2 - tw / 2;
  }

  return { top, left };
}

function fits(pos, tw, th, vw, vh, pad) {
  return pos.top >= pad && pos.top + th <= vh - pad &&
         pos.left >= pad && pos.left + tw <= vw - pad;
}

function bestPlacement(rect, tw, th, preferred, fallbacks, gap, pad) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const toTry = [preferred, ...(fallbacks || DEFAULT_FALLBACKS[preferred] || [])];

  for (const p of toTry) {
    const pos = positionFor(rect, tw, th, p, gap);
    if (fits(pos, tw, th, vw, vh, pad)) return { ...pos, resolvedPlacement: p };
  }

  // Nothing fits perfectly — use preferred with clamping
  const pos = positionFor(rect, tw, th, preferred, gap);
  return {
    top:  Math.max(pad, Math.min(pos.top,  vh - th - pad)),
    left: Math.max(pad, Math.min(pos.left, vw - tw - pad)),
    resolvedPlacement: preferred,
  };
}

// ─── Arrow helpers ──────────────────────────────────────────────────────────
const ARROW = 10; // px size of the rotated square
const ARROW_HALF = ARROW / 2;
const ARROW_MIN_EDGE = 18; // min distance from tooltip corner

function arrowStyle(placement, targetRect, pos, tw, th) {
  if (!placement || !targetRect) return null;
  const side = placement.split('-')[0];
  const base = {
    position: 'absolute',
    width: ARROW,
    height: ARROW,
    background: '#FFFFFF',
    transform: 'rotate(45deg)',
  };

  const centerX = targetRect.left + targetRect.width / 2;
  const centerY = targetRect.top + targetRect.height / 2;

  if (side === 'bottom') {
    const x = clamp(centerX - pos.left - ARROW_HALF, ARROW_MIN_EDGE, tw - ARROW_MIN_EDGE - ARROW);
    return { ...base, top: -ARROW_HALF, left: x, boxShadow: '-1px -1px 2px rgba(0,0,0,0.06)' };
  }
  if (side === 'top') {
    const x = clamp(centerX - pos.left - ARROW_HALF, ARROW_MIN_EDGE, tw - ARROW_MIN_EDGE - ARROW);
    return { ...base, bottom: -ARROW_HALF, left: x, boxShadow: '1px 1px 2px rgba(0,0,0,0.06)' };
  }
  if (side === 'right') {
    const y = clamp(centerY - pos.top - ARROW_HALF, ARROW_MIN_EDGE, th - ARROW_MIN_EDGE - ARROW);
    return { ...base, left: -ARROW_HALF, top: y, boxShadow: '-1px 1px 2px rgba(0,0,0,0.06)' };
  }
  if (side === 'left') {
    const y = clamp(centerY - pos.top - ARROW_HALF, ARROW_MIN_EDGE, th - ARROW_MIN_EDGE - ARROW);
    return { ...base, right: -ARROW_HALF, top: y, boxShadow: '1px -1px 2px rgba(0,0,0,0.06)' };
  }
  return null;
}

function clamp(v, min, max) { return Math.max(min, Math.min(v, max)); }

// ─── Pulse keyframes (injected once via <style>) ────────────────────────────
const PULSE_CSS = `
@keyframes tourHighlightPulse {
  0%, 100% { box-shadow: 0 0 0 3px rgba(255,255,255,0.25); }
  50%      { box-shadow: 0 0 0 6px rgba(255,255,255,0.12), 0 0 16px rgba(255,255,255,0.10); }
}`;

// ─── Main component ─────────────────────────────────────────────────────────
/**
 * Shared Tour rendering engine.
 *
 * Props:
 *   steps        – array of { selector, i18nKey, preferredPlacement, fallbackPlacements?,
 *                              spotlightPadding?, spotlightRadius?, beforeEnter?, beforeLeave?, onBack? }
 *   namespace    – i18n namespace (e.g. 'homeTour')
 *   hasSeenFn    – (userId) => boolean
 *   markSeenFn   – (userId) => void
 *   onAction     – (hookName) => void  (called for beforeEnter / beforeLeave / onBack)
 *   onClose      – (stepIndex, steps) => void  (optional cleanup on tour close)
 *   displayTotal – optional override for displayed step count
 */
export default function TourEngine({
  steps,
  namespace,
  hasSeenFn,
  markSeenFn,
  onAction,
  onStepChange,
  onClose,
  displayTotal,
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const reducedMotion = usePrefersReducedMotion();

  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const [tooltipPos, setTooltipPos] = useState(null);
  const [resolvedPlacement, setResolvedPlacement] = useState(null);

  const tooltipRef = useRef(null);
  const rafRef = useRef(null);
  // Guard: prevent measureTarget from auto-skipping while a beforeEnter is pending
  const waitingForEnterRef = useRef(false);

  const userId = user?.id;
  const currentStep = steps[stepIndex] ?? null;
  const total = displayTotal || steps.length;

  // --- Launch decision ---------------------------------------------------
  useEffect(() => {
    if (!userId) return;
    if (hasSeenFn?.(userId)) return;
    const timer = setTimeout(() => {
      const first = steps.find((s) => document.querySelector(s.selector));
      if (first) setActive(true);
    }, 800);
    return () => clearTimeout(timer);
  }, [userId, hasSeenFn, steps]);

  // --- Measure target element -------------------------------------------
  const measureTarget = useCallback(() => {
    if (!currentStep) return;
    const el = document.querySelector(currentStep.selector);
    if (!el) {
      // Don't auto-skip if a beforeEnter action is pending (element may appear soon)
      if (waitingForEnterRef.current) return;
      if (stepIndex < steps.length - 1) {
        setStepIndex((i) => i + 1);
      } else {
        markSeenFn?.(userId);
        setActive(false);
      }
      return;
    }
    const r = el.getBoundingClientRect();
    setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height });

    const viewH = window.innerHeight;
    if (r.top < 80 || r.bottom > viewH - 80) {
      el.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
    }
  }, [currentStep, stepIndex, steps, reducedMotion, userId, markSeenFn]);

  // --- Track position (resize / scroll) ---------------------------------
  useEffect(() => {
    if (!active) return;
    measureTarget();
    const onUpdate = () => {
      rafRef.current = requestAnimationFrame(() => measureTarget());
    };
    window.addEventListener('scroll', onUpdate, true);
    window.addEventListener('resize', onUpdate);
    return () => {
      window.removeEventListener('scroll', onUpdate, true);
      window.removeEventListener('resize', onUpdate);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [active, measureTarget]);

  // --- Compute tooltip position (smart placement) -----------------------
  useEffect(() => {
    if (!targetRect || !tooltipRef.current) return;
    const tw = tooltipRef.current.offsetWidth;
    const th = tooltipRef.current.offsetHeight;
    const GAP = 14;
    const PAD = 16;
    const preferred = currentStep?.preferredPlacement || currentStep?.placement || 'bottom';
    const fallbacks = currentStep?.fallbackPlacements;

    const result = bestPlacement(targetRect, tw, th, preferred, fallbacks, GAP, PAD);
    setTooltipPos({ top: result.top, left: result.left });
    setResolvedPlacement(result.resolvedPlacement);
  }, [targetRect, currentStep]);

  // --- Step-change callback (defensive cleanup for consumers) -----------
  useEffect(() => {
    if (!active) return;
    onStepChange?.(stepIndex);
  }, [active, stepIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Before-enter hooks -----------------------------------------------
  useEffect(() => {
    if (!active || !currentStep?.beforeEnter) return;
    waitingForEnterRef.current = true;
    onAction?.(currentStep.beforeEnter);

    const timer = setTimeout(() => {
      waitingForEnterRef.current = false;
      // Re-check: if element still missing after action, skip
      const el = document.querySelector(currentStep.selector);
      if (!el) {
        if (stepIndex < steps.length - 1) {
          setStepIndex((i) => i + 1);
        } else {
          markSeenFn?.(userId);
          setActive(false);
        }
        return;
      }
      measureTarget();
    }, 400);
    return () => {
      clearTimeout(timer);
      waitingForEnterRef.current = false;
    };
  }, [active, stepIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Close tour --------------------------------------------------------
  const closeTour = useCallback(() => {
    const step = steps[stepIndex];
    if (step?.beforeLeave) onAction?.(step.beforeLeave);
    onClose?.(stepIndex, steps);
    markSeenFn?.(userId);
    setActive(false);
  }, [userId, stepIndex, steps, markSeenFn, onAction, onClose]);

  // --- Navigation --------------------------------------------------------
  const goNext = useCallback(() => {
    const leaving = steps[stepIndex];
    if (leaving?.beforeLeave) onAction?.(leaving.beforeLeave);
    if (stepIndex < steps.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      closeTour();
    }
  }, [stepIndex, steps, closeTour, onAction]);

  const goBack = useCallback(() => {
    if (stepIndex <= 0) return;
    const leaving = steps[stepIndex];
    if (leaving?.onBack) onAction?.(leaving.onBack);
    setStepIndex((i) => i - 1);
  }, [stepIndex, steps, onAction]);

  // --- Keyboard ----------------------------------------------------------
  useEffect(() => {
    if (!active) return;
    const handler = (e) => {
      if (e.key === 'Escape') { closeTour(); e.preventDefault(); }
      if (e.key === 'Enter')  { goNext();    e.preventDefault(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [active, closeTour, goNext]);

  // --- Focus trap --------------------------------------------------------
  useEffect(() => {
    if (!active || !tooltipRef.current) return;
    const container = tooltipRef.current;
    const focusable = container.querySelectorAll('button, [tabindex]');
    if (focusable.length) focusable[focusable.length - 1].focus();

    const trap = (e) => {
      if (e.key !== 'Tab') return;
      const first = focusable[0];
      const last  = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [active, stepIndex, tooltipPos]);

  // --- Clip path (overlay cutout) ----------------------------------------
  const spotPad = currentStep?.spotlightPadding ?? 8;
  const spotRad = currentStep?.spotlightRadius ?? 12;

  const clipPath = useMemo(() => {
    if (!targetRect) return 'none';
    const x = targetRect.left - spotPad;
    const y = targetRect.top  - spotPad;
    const w = targetRect.width  + spotPad * 2;
    const h = targetRect.height + spotPad * 2;
    const r = spotRad;
    return `path('M0,0 H${window.innerWidth} V${window.innerHeight} H0 Z M${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x + r} Q${x},${y + h} ${x},${y + h - r} V${y + r} Q${x},${y} ${x + r},${y} Z')`;
  }, [targetRect, spotPad, spotRad]);

  // --- Arrow style -------------------------------------------------------
  const arrow = useMemo(() => {
    if (!resolvedPlacement || !targetRect || !tooltipPos || !tooltipRef.current) return null;
    const tw = tooltipRef.current.offsetWidth;
    const th = tooltipRef.current.offsetHeight;
    return arrowStyle(resolvedPlacement, targetRect, tooltipPos, tw, th);
  }, [resolvedPlacement, targetRect, tooltipPos]);

  // --- Transition --------------------------------------------------------
  const transition = reducedMotion ? 'none' : 'all 220ms cubic-bezier(0.2, 0.8, 0.2, 1)';

  // --- Render guard ------------------------------------------------------
  if (!active || !currentStep) return null;

  const isFirst = stepIndex === 0;
  const isLast  = stepIndex === steps.length - 1;
  const displayStep = Math.min(stepIndex + 1, total);
  const stepTitle = t(`${currentStep.i18nKey}.title`);
  const stepBody  = t(`${currentStep.i18nKey}.body`);

  return ReactDOM.createPortal(
    <>
      {/* Pulse animation keyframes */}
      <style>{PULSE_CSS}</style>

      {/* Dark overlay with spotlight cutout */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0, zIndex: 10001,
          background: 'rgba(0, 0, 0, 0.55)',
          clipPath, transition, pointerEvents: 'auto',
        }}
      />

      {/* Highlight ring around target */}
      {targetRect && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            top:    targetRect.top  - spotPad,
            left:   targetRect.left - spotPad,
            width:  targetRect.width  + spotPad * 2,
            height: targetRect.height + spotPad * 2,
            borderRadius: spotRad,
            border: '2px solid rgba(255, 255, 255, 0.70)',
            boxShadow: '0 0 0 3px rgba(255,255,255,0.25)',
            pointerEvents: 'none',
            zIndex: 10001,
            transition,
            animation: reducedMotion ? 'none' : 'tourHighlightPulse 2s ease-in-out infinite',
          }}
        />
      )}

      {/* Click-blocker (backdrop clicks do NOT advance) */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0, zIndex: 10001,
          pointerEvents: 'auto', background: 'transparent',
        }}
        onClick={(e) => e.stopPropagation()}
      />

      {/* Tooltip ──────────────────────────────────────────────────── */}
      <div
        ref={tooltipRef}
        role="dialog"
        aria-modal="true"
        aria-label={t(`${namespace}.ariaLabel`)}
        aria-describedby="tour-engine-step-body"
        style={{
          position: 'fixed',
          top:  tooltipPos ? tooltipPos.top  : -9999,
          left: tooltipPos ? tooltipPos.left : -9999,
          zIndex: 10002,
          width: 320,
          background: '#FFFFFF',
          borderRadius: 14,
          boxShadow: '0 4px 6px rgba(0,0,0,0.07), 0 20px 40px rgba(0,0,0,0.14)',
          padding: '20px 20px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          fontFamily: 'Plus Jakarta Sans, sans-serif',
          transition,
          pointerEvents: tooltipPos ? 'auto' : 'none',
          opacity: tooltipPos ? 1 : 0,
          overflow: 'visible',
        }}
      >
        {/* Arrow */}
        {arrow && <div aria-hidden="true" style={arrow} />}

        {/* Step counter */}
        <span
          aria-live="polite"
          style={{
            fontSize: 11, fontWeight: 600, letterSpacing: '0.6px',
            textTransform: 'uppercase', color: '#A2A2A7',
          }}
        >
          {t(`${namespace}.stepOf`, { current: displayStep, total })}
        </span>

        {/* Title */}
        <h3 style={{
          margin: 0, fontSize: 16, fontWeight: 700,
          lineHeight: '22px', color: '#32302C',
        }}>
          {stepTitle}
        </h3>

        {/* Body */}
        <p
          id="tour-engine-step-body"
          style={{
            margin: 0, fontSize: 13.5,
            lineHeight: '20px', color: '#6C6B6E',
          }}
        >
          {stepBody}
        </p>

        {/* Buttons */}
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', marginTop: 6,
        }}>
          {/* Skip */}
          <button
            onClick={closeTour}
            aria-label={t(`${namespace}.skip`)}
            style={{
              background: 'none', border: 'none',
              fontSize: 13, fontWeight: 500, color: '#A2A2A7',
              cursor: 'pointer', padding: '4px 2px', fontFamily: 'inherit',
            }}
          >
            {t(`${namespace}.skip`)}
          </button>

          <div style={{ display: 'flex', gap: 8 }}>
            {/* Back */}
            <button
              onClick={goBack}
              disabled={isFirst}
              aria-label={t(`${namespace}.back`)}
              style={{
                height: 34, paddingLeft: 14, paddingRight: 14,
                borderRadius: 9999, border: '1px solid #E6E6EC',
                background: '#FFFFFF',
                fontSize: 13, fontWeight: 600,
                color: isFirst ? '#D0D0D3' : '#32302C',
                cursor: isFirst ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', transition: 'background 120ms ease',
              }}
            >
              {t(`${namespace}.back`)}
            </button>

            {/* Next / Done */}
            <button
              onClick={goNext}
              aria-label={isLast ? t(`${namespace}.done`) : t(`${namespace}.next`)}
              style={{
                height: 34, paddingLeft: 18, paddingRight: 18,
                borderRadius: 9999, border: 'none', background: '#181818',
                fontSize: 13, fontWeight: 600, color: '#FFFFFF',
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'background 120ms ease',
              }}
            >
              {isLast ? t(`${namespace}.done`) : t(`${namespace}.next`)}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
