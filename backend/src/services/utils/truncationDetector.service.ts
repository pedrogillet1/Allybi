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
