import { useMemo } from 'react';
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
 * useStageLabel(stage, isActive, langOverride?) → rotating label string
 *
 * Deterministic stage label for the current backend stage and language.
 *
 * NOTE: The backend streams explicit `stage.message` strings for key actions
 * (finding files, reading docs, building Slides, etc). The UI displays that
 * message when present. This hook is the fallback when no message is provided.
 *
 * langOverride: if provided, use this language instead of the UI language.
 * This allows the thinking labels to match the chat answer language.
 */
export default function useStageLabel(stage, isActive, langOverride) {
  const { i18n } = useTranslation();
  const lang = normalizeLang(langOverride || i18n.language);

  return useMemo(() => {
    const stageKey = stage || 'thinking';
    const pool = labels[stageKey]?.[lang] || labels.thinking?.en || [];
    // Deterministic: pick the first phrase only (no random rotation).
    return pool[0] || '';
  }, [lang, stage]);
}
