/**
 * CONVERSATION MESSAGE PICKER SERVICE
 *
 * Picks conversation messages (greeting, thanks, ack, goodbye) from banks
 * using seeded randomness for anti-repetition and consistent regenerate behavior.
 *
 * This replaces all hardcoded greeting/ack/thanks strings.
 */

import { getBank } from './bankLoader.service';
import { seededPick, seededPickWithHistory, finalizeOutput } from './answerComposer.service';
import type { ComposerContext } from './answerComposer.service';

// =============================================================================
// TYPES
// =============================================================================

interface ConversationMessagesBank {
  _meta: { id: string; version: string };
  config: {
    enabled: boolean;
    antiRepetition: { enabled: boolean; historySize: number };
    optionalSecondSentence: { enabled: boolean; probability: number };
  };
  greeting: Record<string, { primary: string[]; secondSentence?: string[] }>;
  thanks: Record<string, { primary: string[]; secondSentence?: string[] }>;
  ack: Record<string, { primary: string[] }>;
  goodbye: Record<string, { primary: string[]; secondSentence?: string[] }>;
}

interface ScopedNotFoundMessagesBank {
  _meta: { id: string; version: string };
  config: { enabled: boolean };
  byReasonCode: Record<string, Record<string, { primary: string[]; followup?: string[] }>>;
  default: Record<string, { primary: string[]; followup?: string[] }>;
}

type MessageCategory = 'greeting' | 'thanks' | 'ack' | 'goodbye';

// =============================================================================
// MESSAGE HISTORY (for anti-repetition)
// =============================================================================

// Track recently used messages per category to avoid repetition
const messageHistory: Record<MessageCategory, string[]> = {
  greeting: [],
  thanks: [],
  ack: [],
  goodbye: [],
};

const MAX_HISTORY = 3;

function addToHistory(category: MessageCategory, message: string): void {
  const history = messageHistory[category];
  history.push(message);
  if (history.length > MAX_HISTORY) {
    history.shift();
  }
}

// =============================================================================
// CONVERSATION MESSAGE PICKER
// =============================================================================

let conversationBank: ConversationMessagesBank | null = null;
let scopedNotFoundBank: ScopedNotFoundMessagesBank | null = null;

function getConversationBank(): ConversationMessagesBank | null {
  if (!conversationBank) {
    conversationBank = getBank<ConversationMessagesBank>('conversation_messages');
  }
  return conversationBank;
}

function getScopedNotFoundBank(): ScopedNotFoundMessagesBank | null {
  if (!scopedNotFoundBank) {
    scopedNotFoundBank = getBank<ScopedNotFoundMessagesBank>('scoped_not_found_messages');
  }
  return scopedNotFoundBank;
}

/**
 * Pick a conversation message with optional second sentence.
 * Uses seeded randomness for deterministic selection during regenerate.
 */
export function pickConversationMessage(
  category: MessageCategory,
  language: 'en' | 'pt' | 'es',
  variationSeed: string,
  includeSecondSentence: boolean = false
): string {
  const bank = getConversationBank();
  if (!bank) {
    // Fallback if bank not loaded
    return getFallbackMessage(category, language);
  }

  const categoryData = bank[category];
  const langData = categoryData?.[language] || categoryData?.['en'];

  if (!langData?.primary?.length) {
    return getFallbackMessage(category, language);
  }

  // Pick primary message with history-based anti-repetition
  const primary = seededPickWithHistory(
    langData.primary,
    variationSeed,
    messageHistory[category],
    MAX_HISTORY
  );

  addToHistory(category, primary);

  // Optionally add second sentence (ack doesn't have secondSentence)
  const secondSentences = (langData as { primary: string[]; secondSentence?: string[] }).secondSentence;
  if (includeSecondSentence && secondSentences?.length) {
    const config = bank.config?.optionalSecondSentence;
    const probability = config?.probability ?? 0.4;

    // Use seed to deterministically decide if we add second sentence
    const hash = variationSeed.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const shouldAddSecond = (hash % 100) / 100 < probability;

    if (shouldAddSecond) {
      const secondSeed = variationSeed + '_second';
      const second = seededPick(secondSentences, secondSeed);
      return `${primary} ${second}`;
    }
  }

  return primary;
}

/**
 * Pick a scoped not found message based on reason code.
 * Used when docs exist but no evidence found in scoped search.
 */
export function pickScopedNotFoundMessage(
  reasonCode: string,
  language: 'en' | 'pt' | 'es',
  variationSeed: string,
  placeholders: Record<string, string> = {}
): string {
  const bank = getScopedNotFoundBank();
  if (!bank) {
    return getDefaultNotFoundMessage(language);
  }

  // Get messages for this reason code, or fall back to default
  const reasonData = bank.byReasonCode?.[reasonCode]?.[language]
    || bank.byReasonCode?.[reasonCode]?.['en']
    || bank.default?.[language]
    || bank.default?.['en'];

  if (!reasonData?.primary?.length) {
    return getDefaultNotFoundMessage(language);
  }

  // Pick primary message
  let message = seededPick(reasonData.primary, variationSeed);

  // Add followup if available
  if (reasonData.followup?.length) {
    const followupSeed = variationSeed + '_followup';
    const followup = seededPick(reasonData.followup, followupSeed);
    message = `${message} ${followup}`;
  }

  // Replace placeholders
  for (const [key, value] of Object.entries(placeholders)) {
    message = message.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
  }

  return message;
}

/**
 * Compose a full conversation response (greeting, thanks, etc.)
 * This ensures the message passes through finalizeOutput.
 */
export function composeConversationResponse(
  category: MessageCategory,
  context: Partial<ComposerContext>,
  includeSecondSentence: boolean = true
): { content: string; answerMode: string } {
  const language = context.language || 'en';
  const seed = context.variationSeed || Date.now().toString();

  const message = pickConversationMessage(
    category,
    language as 'en' | 'pt' | 'es',
    seed,
    includeSecondSentence
  );

  // Pass through unified finalization
  const result = finalizeOutput(message, context, { answerMode: 'conversation' });

  return {
    content: result.content,
    answerMode: 'conversation',
  };
}

/**
 * Compose a scoped not found response.
 * This ensures the message passes through finalizeOutput.
 */
export function composeScopedNotFoundResponse(
  reasonCode: string,
  context: Partial<ComposerContext>,
  placeholders: Record<string, string> = {}
): { content: string; answerMode: string } {
  const language = context.language || 'en';
  const seed = context.variationSeed || Date.now().toString();

  const message = pickScopedNotFoundMessage(
    reasonCode,
    language as 'en' | 'pt' | 'es',
    seed,
    placeholders
  );

  // Pass through unified finalization
  const result = finalizeOutput(message, context, { answerMode: 'scoped_not_found' });

  return {
    content: result.content,
    answerMode: 'scoped_not_found',
  };
}

// =============================================================================
// FALLBACKS
// =============================================================================

function getFallbackMessage(category: MessageCategory, language: string): string {
  const fallbacks: Record<MessageCategory, Record<string, string>> = {
    greeting: {
      en: 'Hi! How can I help you?',
      pt: 'Oi! Como posso ajudar?',
      es: 'Hola! Cómo puedo ayudarte?',
    },
    thanks: {
      en: "You're welcome!",
      pt: 'De nada!',
      es: 'De nada!',
    },
    ack: {
      en: 'Got it!',
      pt: 'Entendi!',
      es: 'Entendido!',
    },
    goodbye: {
      en: 'See you!',
      pt: 'Até mais!',
      es: 'Hasta luego!',
    },
  };

  return fallbacks[category]?.[language] || fallbacks[category]?.['en'] || 'Hi!';
}

function getDefaultNotFoundMessage(language: string): string {
  const defaults: Record<string, string> = {
    en: "I couldn't find that information in the current scope. Would you like me to search more broadly?",
    pt: 'Não consegui encontrar essa informação no escopo atual. Gostaria que eu buscasse mais amplamente?',
    es: 'No pude encontrar esa información en el alcance actual. Quieres que busque más ampliamente?',
  };

  return defaults[language] || defaults['en'];
}

// =============================================================================
// EXPORTS
// =============================================================================

export const conversationMessagePicker = {
  pickConversationMessage,
  pickScopedNotFoundMessage,
  composeConversationResponse,
  composeScopedNotFoundResponse,
};

export default conversationMessagePicker;
