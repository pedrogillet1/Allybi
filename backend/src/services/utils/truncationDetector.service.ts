/**
 * Truncation Detector Service - Production V3
 * 
 * Detects if LLM output was truncated mid-generation
 * Enables retry logic to ensure complete answers
 */

import { hasIncompleteMarkers } from './markerUtils';

export interface TruncationDetectionResult {
  isTruncated: boolean;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
  recommendations: string[];
}

export class TruncationDetectorService {
  private readonly logger: any;

  constructor(logger?: any) {
    this.logger = logger || console;
  }

  /**
   * Detect if text appears to be truncated
   * Returns detailed analysis
   */
  detectTruncation(text: string): TruncationDetectionResult {
    const reasons: string[] = [];
    const recommendations: string[] = [];
    let confidence: 'high' | 'medium' | 'low' = 'low';

    if (!text || text.trim().length === 0) {
      return {
        isTruncated: false,
        confidence: 'low',
        reasons: [],
        recommendations: [],
      };
    }

    const trimmed = text.trim();

    // Check 1: Incomplete markers (HIGH confidence)
    if (hasIncompleteMarkers(trimmed)) {
      reasons.push('Incomplete marker detected ({{... without }})');
      recommendations.push('Retry with fewer chunks or higher answer token budget');
      confidence = 'high';
    }

    // Check 2: Unclosed code fences (HIGH confidence)
    const codeFenceCount = (trimmed.match(/```/g) || []).length;
    if (codeFenceCount % 2 !== 0) {
      reasons.push('Unclosed code fence detected');
      recommendations.push('Retry generation');
      confidence = 'high';
    }

    // Check 3: Unclosed markdown formatting (MEDIUM confidence)
    const boldCount = (trimmed.match(/\*\*/g) || []).length;
    if (boldCount % 2 !== 0) {
      reasons.push('Unclosed bold formatting (**) detected');
      confidence = confidence === 'high' ? 'high' : 'medium';
    }

    // Check 4: Unclosed brackets (MEDIUM confidence)
    const openBrackets = (trimmed.match(/\[/g) || []).length;
    const closeBrackets = (trimmed.match(/\]/g) || []).length;
    if (openBrackets > closeBrackets) {
      reasons.push('Unclosed brackets detected');
      confidence = confidence === 'high' ? 'high' : 'medium';
    }

    // Check 5: Ends with incomplete sentence (MEDIUM confidence)
    const endsWithIncomplete = /[,;:]$/.test(trimmed);
    if (endsWithIncomplete) {
      reasons.push('Text ends with comma/semicolon/colon (incomplete sentence)');
      if (confidence === 'low') {
        confidence = 'medium';
      }
    }

    // Check 5.5: Ends with lowercase word (MID-SENTENCE TRUNCATION - HIGH priority)
    // If text is substantial (>50 chars), ends with a word (no punctuation),
    // and that word is lowercase, it's likely truncated mid-sentence
    const lastChar = trimmed.charAt(trimmed.length - 1);
    const isNotPunctuation = !/[.!?:;,\-\|\"]/.test(lastChar);
    const endsWithLowercaseWord = /\s[a-zA-ZáéíóúâêôãõçàèìòùñÁÉÍÓÚÂÊÔÃÕÇÀÈÌÒÙÑ]+$/.test(trimmed) && /[a-záéíóúâêôãõçàèìòù]$/.test(trimmed);

    if (isNotPunctuation && endsWithLowercaseWord && trimmed.length > 50) {
      reasons.push('Text ends with lowercase word (mid-sentence truncation)');
      confidence = 'high';
    }

    // CERT-110 FIX: Check 5.6: Ends with ellipsis "..." (HIGH confidence)
    // This is a clear truncation signal - triggers repair to remove "..." and add proper sentence ending
    const endsWithEllipsis = trimmed.endsWith('...') || trimmed.endsWith('…');
    const isIntentionalEtc = trimmed.includes('etc...') || trimmed.includes('etc…') ||
                            trimmed.includes('e.g...') || trimmed.includes('i.e...');
    if (endsWithEllipsis && !isIntentionalEtc) {
      reasons.push('Text ends with ellipsis (...) - truncation marker');
      recommendations.push('Remove trailing ellipsis and complete sentence');
      confidence = 'high';
    }

    // Check 6: Ends with cut word (LOW confidence)
    const endsWithCutWord = /\s[a-zA-Z]{1,3}$/.test(trimmed);
    if (endsWithCutWord && trimmed.length > 100) {
      reasons.push('Text may end with cut-off word');
      // Don't change confidence for this alone
    }

    // Check 7: Unclosed table (MEDIUM confidence)
    const tableRows = trimmed.match(/\|[^\n]+\|/g) || [];
    if (tableRows.length > 0) {
      const lastLine = trimmed.split('\n').pop() || '';
      if (lastLine.includes('|') && !lastLine.trim().endsWith('|')) {
        reasons.push('Incomplete table row detected');
        confidence = confidence === 'high' ? 'high' : 'medium';
      }
    }

    // Check 8: Ends mid-list (LOW confidence)
    const lines = trimmed.split('\n');
    const lastLine = lines[lines.length - 1];
    const isListItem = /^[\s]*[-*\d+.]\s/.test(lastLine);
    if (isListItem && lastLine.length < 20) {
      reasons.push('Text may end mid-list');
      // Don't change confidence for this alone
    }

    // Add recommendations based on findings
    if (reasons.length > 0 && recommendations.length === 0) {
      recommendations.push('Retry generation with adjusted parameters');
      recommendations.push('Consider reducing chunk count or increasing answer token budget');
    }

    const isTruncated = reasons.length > 0;

    if (isTruncated) {
      this.logger.warn('Truncation detected', {
        confidence,
        reasons,
        textLength: trimmed.length,
        lastChars: trimmed.slice(-50),
      });
    }

    return {
      isTruncated,
      confidence,
      reasons,
      recommendations,
    };
  }

  /**
   * Check if markdown structure is valid
   * Returns list of structural issues
   */
  validateMarkdownStructure(text: string): string[] {
    const issues: string[] = [];

    // Check code fences
    const codeFenceCount = (text.match(/```/g) || []).length;
    if (codeFenceCount % 2 !== 0) {
      issues.push('Unbalanced code fences');
    }

    // Check bold markers
    const boldCount = (text.match(/\*\*/g) || []).length;
    if (boldCount % 2 !== 0) {
      issues.push('Unbalanced bold markers (**)');
    }

    // Check italic markers
    const italicCount = (text.match(/(?<!\*)\*(?!\*)/g) || []).length;
    if (italicCount % 2 !== 0) {
      issues.push('Unbalanced italic markers (*)');
    }

    // Check brackets
    const openBrackets = (text.match(/\[/g) || []).length;
    const closeBrackets = (text.match(/\]/g) || []).length;
    if (openBrackets !== closeBrackets) {
      issues.push('Unbalanced brackets');
    }

    // Check parentheses in links
    const openParens = (text.match(/\(/g) || []).length;
    const closeParens = (text.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      issues.push('Unbalanced parentheses');
    }

    return issues;
  }

  /**
   * Attempt to repair truncated text by:
   * 1. Removing trailing ellipsis (...)
   * 2. Truncating to last complete sentence
   * 3. Closing unclosed markdown elements
   *
   * QUICK_FIXES #4: Truncation repair for answers ending with "..."
   */
  repairTruncation(text: string): { repaired: string; wasRepaired: boolean; repairs: string[] } {
    if (!text || text.trim().length === 0) {
      return { repaired: text, wasRepaired: false, repairs: [] };
    }

    let repaired = text.trim();
    const repairs: string[] = [];

    // Repair 1: Remove trailing ellipsis (not "etc..." which is intentional)
    if (repaired.endsWith('...') && !repaired.includes('etc...') && !repaired.includes('etc…')) {
      const cleaned = repaired.replace(/\.\.\.(\s*)$/, '');

      // Find last complete sentence
      const lastPeriod = cleaned.lastIndexOf('.');
      const lastExclaim = cleaned.lastIndexOf('!');
      const lastQuestion = cleaned.lastIndexOf('?');
      const lastSentenceEnd = Math.max(lastPeriod, lastExclaim, lastQuestion);

      // If we can truncate to a complete sentence without losing too much content (>70%)
      if (lastSentenceEnd > cleaned.length * 0.7) {
        repaired = cleaned.slice(0, lastSentenceEnd + 1);
        repairs.push('Truncated to last complete sentence (removed trailing ...)');
      } else if (cleaned.length > 0) {
        // Just remove the ellipsis and add a period
        repaired = cleaned.replace(/[,;:\s]+$/, '') + '.';
        repairs.push('Removed trailing ellipsis and added period');
      }
    }

    // Repair 2: Close unclosed bold markers (**)
    const boldCount = (repaired.match(/\*\*/g) || []).length;
    if (boldCount % 2 !== 0) {
      repaired = repaired + '**';
      repairs.push('Closed unclosed bold marker');
    }

    // Repair 3: Close unclosed code fences
    const codeFenceCount = (repaired.match(/```/g) || []).length;
    if (codeFenceCount % 2 !== 0) {
      repaired = repaired + '\n```';
      repairs.push('Closed unclosed code fence');
    }

    // Repair 4: Fix incomplete markdown link
    // Pattern: [text]( without closing )
    if (/\[[^\]]+\]\([^)]*$/.test(repaired)) {
      repaired = repaired.replace(/\[[^\]]+\]\([^)]*$/, '');
      repairs.push('Removed incomplete markdown link');
    }

    // Repair 5: Fix text ending with comma/semicolon/colon
    if (/[,;:]$/.test(repaired)) {
      const cleaned = repaired.replace(/[,;:]$/, '');
      // Try to find last complete sentence
      const lastEnd = Math.max(
        cleaned.lastIndexOf('.'),
        cleaned.lastIndexOf('!'),
        cleaned.lastIndexOf('?')
      );
      if (lastEnd > cleaned.length * 0.6) {
        repaired = cleaned.slice(0, lastEnd + 1);
        repairs.push('Truncated to last complete sentence (removed trailing punctuation)');
      } else {
        repaired = cleaned + '.';
        repairs.push('Replaced trailing comma/semicolon/colon with period');
      }
    }

    // Repair 5.5: Fix text ending with lowercase word (mid-sentence truncation)
    // If text ends with a lowercase word (no punctuation), find and truncate to last complete sentence
    const lastCharCheck = repaired.charAt(repaired.length - 1);
    const isNoPunctuation = !/[.!?:;,\-\|"]/.test(lastCharCheck);
    const endsLowercase = /[a-záéíóúâêôãõçàèìòù]$/.test(repaired);

    if (isNoPunctuation && endsLowercase && repaired.length > 50) {
      // Try to find last complete sentence
      const lastPeriodIdx = repaired.lastIndexOf('.');
      const lastExclaimIdx = repaired.lastIndexOf('!');
      const lastQuestionIdx = repaired.lastIndexOf('?');
      const lastSentenceEndIdx = Math.max(lastPeriodIdx, lastExclaimIdx, lastQuestionIdx);

      if (lastSentenceEndIdx > repaired.length * 0.5) {
        repaired = repaired.slice(0, lastSentenceEndIdx + 1);
        repairs.push('Truncated to last complete sentence (mid-sentence truncation repair)');
      } else {
        // Can't find good sentence boundary, add period to make it grammatically complete
        repaired = repaired.trimEnd() + '.';
        repairs.push('Added period to complete truncated sentence');
      }
    }

    // Repair 6: Remove incomplete bullet/list item at end
    const lines = repaired.split('\n');
    const lastLine = lines[lines.length - 1].trim();
    // Check if last line is incomplete bullet (just "- " or "1. " with no content)
    if (/^[\s]*[-*]\s*$/.test(lastLine) || /^[\s]*\d+\.\s*$/.test(lastLine)) {
      lines.pop();
      repaired = lines.join('\n');
      repairs.push('Removed incomplete bullet/list item');
    }

    if (repairs.length > 0) {
      this.logger.info('Truncation repaired', {
        repairs,
        originalLength: text.length,
        repairedLength: repaired.length,
      });
    }

    return {
      repaired,
      wasRepaired: repairs.length > 0,
      repairs,
    };
  }

  /**
   * Suggest retry parameters based on truncation analysis
   */
  suggestRetryParameters(
    truncationResult: TruncationDetectionResult,
    currentChunkCount: number,
    currentAnswerTokens: number
  ): {
    reduceChunks: boolean;
    newChunkCount?: number;
    increaseAnswerTokens: boolean;
    newAnswerTokens?: number;
    switchModel: boolean;
  } {
    if (!truncationResult.isTruncated) {
      return {
        reduceChunks: false,
        increaseAnswerTokens: false,
        switchModel: false,
      };
    }

    const suggestions: any = {
      reduceChunks: false,
      increaseAnswerTokens: false,
      switchModel: false,
    };

    // High confidence truncation - aggressive changes
    if (truncationResult.confidence === 'high') {
      suggestions.reduceChunks = true;
      suggestions.newChunkCount = Math.max(3, Math.floor(currentChunkCount * 0.6));
      
      suggestions.increaseAnswerTokens = true;
      suggestions.newAnswerTokens = Math.min(4000, currentAnswerTokens + 500);
    }
    // Medium confidence - moderate changes
    else if (truncationResult.confidence === 'medium') {
      suggestions.reduceChunks = true;
      suggestions.newChunkCount = Math.max(4, Math.floor(currentChunkCount * 0.75));
      
      suggestions.increaseAnswerTokens = true;
      suggestions.newAnswerTokens = Math.min(3000, currentAnswerTokens + 300);
    }
    // Low confidence - minor changes
    else {
      suggestions.increaseAnswerTokens = true;
      suggestions.newAnswerTokens = Math.min(2500, currentAnswerTokens + 200);
    }

    return suggestions;
  }
}

// Singleton instance
// Singleton removed - use container.getTruncationDetector() instead

export default TruncationDetectorService;
