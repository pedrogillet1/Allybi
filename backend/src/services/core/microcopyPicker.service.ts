/**
 * MICROCOPY PICKER SERVICE
 *
 * Unified bank-driven message picker for ALL user-facing microcopy.
 * Uses seeded randomness for anti-repetition and consistent regenerate behavior.
 *
 * This replaces ALL hardcoded user-facing strings throughout the app.
 */

import { getBank } from './bankLoader.service';
import { seededPick, seededPickWithHistory } from './answerComposer.service';

// =============================================================================
// TYPES
// =============================================================================

type SupportedLanguage = 'en' | 'pt' | 'es';

interface MessageEntry {
  primary: string[];
  suggestions?: string[];
  followup?: string[];
  secondSentence?: string[];
}

interface MicrocopyBank {
  _meta: { id: string; version: string };
  config: {
    enabled: boolean;
    antiRepetition?: { enabled: boolean; historySize: number };
    placeholders?: Record<string, string>;
  };
  [key: string]: any;
}

// =============================================================================
// MESSAGE HISTORY (for anti-repetition)
// =============================================================================

// Track recently used messages per bank+category
const messageHistory: Map<string, string[]> = new Map();
const MAX_HISTORY = 3;

function getHistory(key: string): string[] {
  if (!messageHistory.has(key)) {
    messageHistory.set(key, []);
  }
  return messageHistory.get(key)!;
}

function addToHistory(key: string, message: string): void {
  const history = getHistory(key);
  history.push(message);
  if (history.length > MAX_HISTORY) {
    history.shift();
  }
}

// =============================================================================
// BANK CACHE
// =============================================================================

const bankCache: Map<string, MicrocopyBank | null> = new Map();

function getMicrocopyBank(bankId: string): MicrocopyBank | null {
  if (!bankCache.has(bankId)) {
    bankCache.set(bankId, getBank<MicrocopyBank>(bankId));
  }
  return bankCache.get(bankId) || null;
}

// =============================================================================
// CORE PICKER
// =============================================================================

/**
 * Pick a message from any microcopy bank.
 *
 * @param bankId - The bank ID (e.g., 'file_actions_messages', 'conversation_messages')
 * @param category - The category within the bank (e.g., 'no_files_found', 'greeting')
 * @param language - Target language
 * @param variationSeed - Seed for deterministic randomness
 * @param options - Additional options
 */
export function pickMicrocopy(
  bankId: string,
  category: string,
  language: SupportedLanguage,
  variationSeed: string,
  options: {
    includeSuggestion?: boolean;
    includeFollowup?: boolean;
    placeholders?: Record<string, string>;
  } = {}
): string {
  const bank = getMicrocopyBank(bankId);

  if (!bank) {
    console.warn(`[MicrocopyPicker] Bank not found: ${bankId}`);
    return '';
  }

  // Get category data
  const categoryData = bank[category];
  if (!categoryData) {
    console.warn(`[MicrocopyPicker] Category not found: ${category} in ${bankId}`);
    return '';
  }

  // Get language-specific data
  const langData: MessageEntry = categoryData[language] || categoryData['en'];
  if (!langData?.primary?.length) {
    console.warn(`[MicrocopyPicker] No primary messages for ${category}/${language} in ${bankId}`);
    return '';
  }

  // Pick primary message with anti-repetition
  const historyKey = `${bankId}:${category}`;
  const primary = seededPickWithHistory(
    langData.primary,
    variationSeed,
    getHistory(historyKey),
    MAX_HISTORY
  );
  addToHistory(historyKey, primary);

  let result = primary;

  // Optionally add suggestion
  if (options.includeSuggestion && langData.suggestions?.length) {
    const suggestionSeed = variationSeed + '_suggestion';
    const suggestion = seededPick(langData.suggestions, suggestionSeed);
    result = `${result} ${suggestion}`;
  }

  // Optionally add followup
  if (options.includeFollowup && langData.followup?.length) {
    const followupSeed = variationSeed + '_followup';
    const followup = seededPick(langData.followup, followupSeed);
    result = `${result} ${followup}`;
  }

  // Replace placeholders
  if (options.placeholders) {
    for (const [key, value] of Object.entries(options.placeholders)) {
      result = result.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
    }
  }

  return result;
}

// =============================================================================
// CONVENIENCE FUNCTIONS FOR SPECIFIC BANKS
// =============================================================================

/**
 * Pick a file action message (no files, no folders, file not found, etc.)
 */
export function pickFileActionMessage(
  category: 'no_files_found' | 'no_matching_files' | 'no_folders' | 'folder_not_found' | 'no_capabilities' | 'file_not_found',
  language: SupportedLanguage,
  variationSeed: string,
  options: {
    includeSuggestion?: boolean;
    placeholders?: Record<string, string>;
  } = {}
): string {
  return pickMicrocopy('file_actions_messages', category, language, variationSeed, options);
}

/**
 * Pick a processing status message (indexing, uploading, queued, stuck)
 */
export function pickProcessingMessage(
  category: 'indexing_in_progress' | 'upload_pending' | 'processing_queued' | 'processing_stuck' | 'default',
  language: SupportedLanguage,
  variationSeed: string,
  options: {
    includeNextSteps?: boolean;
    placeholders?: Record<string, string>;
  } = {}
): string {
  return pickMicrocopy('fallback_processing', category, language, variationSeed, {
    includeFollowup: options.includeNextSteps,
    placeholders: options.placeholders,
  });
}

/**
 * Pick an extraction recovery message (scanned PDF, protected PDF, etc.)
 */
export function pickExtractionRecoveryMessage(
  docType: 'pdf_scanned' | 'pdf_protected' | 'excel' | 'powerpoint' | 'word' | 'default',
  language: SupportedLanguage,
  variationSeed: string,
  options: {
    includeSuggestion?: boolean;
    placeholders?: Record<string, string>;
  } = {}
): string {
  // This bank has byDocType structure
  const bank = getMicrocopyBank('fallback_extraction_recovery');
  if (!bank) return '';

  const categoryData = bank.byDocType?.[docType] || bank.default;
  if (!categoryData) return '';

  const langData = categoryData[language] || categoryData['en'];
  if (!langData?.primary?.length) return '';

  const historyKey = `extraction_recovery:${docType}`;
  const primary = seededPickWithHistory(
    langData.primary,
    variationSeed,
    getHistory(historyKey),
    MAX_HISTORY
  );
  addToHistory(historyKey, primary);

  let result = primary;

  if (options.includeSuggestion && langData.suggestions?.length) {
    const suggestion = seededPick(langData.suggestions, variationSeed + '_sug');
    result = `${result} ${suggestion}`;
  }

  if (options.placeholders) {
    for (const [key, value] of Object.entries(options.placeholders)) {
      result = result.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
    }
  }

  return result;
}

// =============================================================================
// EXPORTS
// =============================================================================

export const microcopyPicker = {
  pickMicrocopy,
  pickFileActionMessage,
  pickProcessingMessage,
  pickExtractionRecoveryMessage,
};

export default microcopyPicker;
