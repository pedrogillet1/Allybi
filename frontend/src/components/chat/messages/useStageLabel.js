import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import labels from './stageLabels';

function normalizeLang(lang) {
  if (!lang) return 'en';
  const lower = lang.toLowerCase();
  if (lower.startsWith('pt')) return 'pt';
  if (lower.startsWith('es')) return 'es';
  return 'en';
}

/**
 * useStageLabel(stage, isActive) → rotating label string
 *
 * Picks a random phrase for the current backend stage and language,
 * then rotates every ~900-1600ms while active.
 * Avoids repeating the last 4 used phrases per stage.
 */
export default function useStageLabel(stage, isActive) {
  const { i18n } = useTranslation();
  const lang = normalizeLang(i18n.language);

  const [currentLabel, setCurrentLabel] = useState('');
  const recentIndicesRef = useRef({});

  const pickPhrase = useCallback(
    (stageKey) => {
      const pool = labels[stageKey]?.[lang] || labels.thinking?.en || [];
      if (!pool.length) return '';

      const recent = recentIndicesRef.current[stageKey] || [];
      const recentSet = new Set(recent);
      const available = pool
        .map((_, i) => i)
        .filter((i) => !recentSet.has(i));

      const candidates = available.length > 0 ? available : pool.map((_, i) => i);
      const picked = candidates[Math.floor(Math.random() * candidates.length)];

      const updated = [...recent, picked].slice(-4);
      recentIndicesRef.current[stageKey] = updated;

      return pool[picked];
    },
    [lang]
  );

  // Pick immediately on stage change
  useEffect(() => {
    if (!stage) return;
    setCurrentLabel(pickPhrase(stage));
  }, [stage, pickPhrase]);

  // Rotate while active
  useEffect(() => {
    if (!isActive || !stage) return;

    const tick = () => {
      setCurrentLabel(pickPhrase(stage));
      const delay = 900 + Math.random() * 700;
      timerId = setTimeout(tick, delay);
    };

    const delay = 900 + Math.random() * 700;
    let timerId = setTimeout(tick, delay);

    return () => clearTimeout(timerId);
  }, [isActive, stage, pickPhrase]);

  return currentLabel;
}
