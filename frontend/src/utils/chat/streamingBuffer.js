/**
 * Streaming Buffer Utility
 *
 * Handles streaming text with truncation detection and graceful endings.
 * Prevents displaying obviously incomplete/cut-off responses.
 *
 * Features:
 * - Truncation detection (unclosed markdown, incomplete sentences)
 * - Graceful ending addition for truncated content
 * - Buffer management for streaming chunks
 *
 * Used by: chat components that display streaming responses
 */

// ============================================================================
// TRUNCATION DETECTION
// ============================================================================

/**
 * Check if text appears to be truncated.
 *
 * @param {string} text - The text to check
 * @returns {boolean} - True if text appears truncated
 */
export function detectTruncation(text) {
  if (!text || text.trim().length === 0) {
    return false;
  }

  const trimmed = text.trim();

  // Check for incomplete sentences at the end
  const endsWithIncomplete = /[a-zA-Z0-9,;:\-]$/.test(trimmed);
  const endsWithCutWord = /\s[a-zA-Z]{1,3}$/.test(trimmed);

  // Check for unclosed formatting
  const unclosedBold = (trimmed.match(/\*\*/g) || []).length % 2 !== 0;
  const unclosedItalic = (trimmed.match(/(?<!\*)\*(?!\*)/g) || []).length % 2 !== 0;
  const unclosedBrackets = (trimmed.match(/\[/g) || []).length !== (trimmed.match(/\]/g) || []).length;
  const unclosedCodeBlock = (trimmed.match(/```/g) || []).length % 2 !== 0;
  const unclosedInlineCode = (trimmed.match(/`(?!``)/g) || []).length % 2 !== 0;

  // Check for incomplete list items
  const endsWithListMarker = /^\s*[-*]\s*$/m.test(trimmed.split('\n').pop() || '');
  const endsWithNumberedList = /^\s*\d+\.\s*$/m.test(trimmed.split('\n').pop() || '');

  return (
    endsWithIncomplete ||
    endsWithCutWord ||
    unclosedBold ||
    unclosedItalic ||
    unclosedBrackets ||
    unclosedCodeBlock ||
    unclosedInlineCode ||
    endsWithListMarker ||
    endsWithNumberedList
  );
}

// ============================================================================
// GRACEFUL ENDINGS
// ============================================================================

const GRACEFUL_ENDINGS = {
  en: '...',
  pt: '...',
  es: '...',
};

const TRUNCATION_NOTICES = {
  en: ' (response shortened)',
  pt: ' (resposta resumida)',
  es: ' (respuesta resumida)',
};

/**
 * Add a graceful ending to truncated text.
 *
 * @param {string} text - The truncated text
 * @param {string} language - Language code (en, pt, es)
 * @param {boolean} showNotice - Whether to add truncation notice
 * @returns {string} - Text with graceful ending
 */
export function addGracefulEnding(text, language = 'en', showNotice = false) {
  if (!text) return '';

  const trimmed = text.trim();

  // If already ends with proper punctuation, return as-is
  if (/[.!?。！？]$/.test(trimmed)) {
    return trimmed;
  }

  // Fix unclosed markdown
  let fixed = fixUnclosedMarkdown(trimmed);

  // Add ellipsis
  const ending = GRACEFUL_ENDINGS[language] || GRACEFUL_ENDINGS.en;
  const notice = showNotice ? (TRUNCATION_NOTICES[language] || TRUNCATION_NOTICES.en) : '';

  return `${fixed}${ending}${notice}`;
}

/**
 * Fix unclosed markdown formatting.
 *
 * @param {string} text - Text with potentially unclosed markdown
 * @returns {string} - Text with closed markdown
 */
export function fixUnclosedMarkdown(text) {
  let result = text;

  // Close unclosed bold
  const boldMatches = result.match(/\*\*/g) || [];
  if (boldMatches.length % 2 !== 0) {
    result += '**';
  }

  // Close unclosed code blocks
  const codeBlockMatches = result.match(/```/g) || [];
  if (codeBlockMatches.length % 2 !== 0) {
    result += '\n```';
  }

  // Close unclosed brackets
  const openBrackets = (result.match(/\[/g) || []).length;
  const closeBrackets = (result.match(/\]/g) || []).length;
  if (openBrackets > closeBrackets) {
    result += ']'.repeat(openBrackets - closeBrackets);
  }

  return result;
}

// ============================================================================
// STREAMING BUFFER CLASS
// ============================================================================

/**
 * StreamingBuffer - Manages streaming text with truncation handling.
 *
 * Usage:
 * ```js
 * const buffer = new StreamingBuffer();
 *
 * // On each chunk
 * const displayText = buffer.addChunk(chunk);
 *
 * // On stream complete
 * const { finalText, wasTruncated } = buffer.finalize();
 * ```
 */
export class StreamingBuffer {
  constructor(options = {}) {
    this.buffer = '';
    this.language = options.language || 'en';
    this.autoFixTruncation = options.autoFixTruncation !== false;
    this.showTruncationNotice = options.showTruncationNotice || false;
    this.wasTruncated = false;
  }

  /**
   * Add a chunk to the buffer.
   *
   * @param {string} chunk - New chunk of text
   * @returns {string} - Current full text
   */
  addChunk(chunk) {
    this.buffer += chunk;
    return this.buffer;
  }

  /**
   * Get current buffer content.
   *
   * @returns {string} - Current buffer content
   */
  getContent() {
    return this.buffer;
  }

  /**
   * Finalize the buffer and handle truncation.
   *
   * @param {boolean} wasServerTruncated - True if server indicated truncation
   * @returns {{ finalText: string, wasTruncated: boolean }}
   */
  finalize(wasServerTruncated = false) {
    this.wasTruncated = wasServerTruncated || detectTruncation(this.buffer);

    let finalText = this.buffer;

    if (this.wasTruncated && this.autoFixTruncation) {
      finalText = addGracefulEnding(this.buffer, this.language, this.showTruncationNotice);
    }

    return {
      finalText,
      wasTruncated: this.wasTruncated,
    };
  }

  /**
   * Reset the buffer.
   */
  reset() {
    this.buffer = '';
    this.wasTruncated = false;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  detectTruncation,
  addGracefulEnding,
  fixUnclosedMarkdown,
  StreamingBuffer,
};
