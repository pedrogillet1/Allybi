/**
 * Script to add repetition detection to KodaAnswerValidationService
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'services', 'validation', 'kodaAnswerValidation.service.ts');

// Read file
let content = fs.readFileSync(filePath, 'utf-8');

// Check if already applied
if (content.includes('RepetitionCheckResult')) {
  console.log('✅ Repetition detection already added!');
  process.exit(0);
}

// 1. Add RepetitionCheckResult interface after ValidationRequest
const interfaceToAdd = `

export interface RepetitionCheckResult {
  isRepetition: boolean;
  similarity: number;
  shortConfirmation?: string;
}`;

content = content.replace(
  /export interface ValidationRequest \{[\s\S]*?\n\}/,
  match => match + interfaceToAdd
);

// 2. Add repetition detection methods before the closing brace of the class
const methodsToAdd = `

  // ============================================================================
  // REPETITION DETECTION
  // ============================================================================

  /**
   * Threshold for considering two answers as "same" (0.9 = 90% similar)
   */
  private readonly REPETITION_THRESHOLD = 0.9;

  /**
   * Check if new answer is a repetition of the previous assistant message.
   * Uses normalized Levenshtein similarity for comparison.
   *
   * @param newAnswer - The new answer to check
   * @param previousAnswer - The previous assistant answer
   * @param language - Language for short confirmation message
   * @returns RepetitionCheckResult with similarity score and optional short confirmation
   */
  public checkRepetition(
    newAnswer: string,
    previousAnswer: string | undefined,
    language: 'en' | 'pt' | 'es' = 'en'
  ): RepetitionCheckResult {
    if (!previousAnswer || !newAnswer) {
      return { isRepetition: false, similarity: 0 };
    }

    // Normalize both texts for comparison
    const normalizedNew = this.normalizeForComparison(newAnswer);
    const normalizedPrev = this.normalizeForComparison(previousAnswer);

    // Quick exact match check (hash comparison)
    if (normalizedNew === normalizedPrev) {
      return {
        isRepetition: true,
        similarity: 1.0,
        shortConfirmation: this.getShortConfirmation(previousAnswer, language),
      };
    }

    // Calculate similarity
    const similarity = this.calculateSimilarity(normalizedNew, normalizedPrev);

    if (similarity >= this.REPETITION_THRESHOLD) {
      return {
        isRepetition: true,
        similarity,
        shortConfirmation: this.getShortConfirmation(previousAnswer, language),
      };
    }

    return { isRepetition: false, similarity };
  }

  /**
   * Normalize text for comparison:
   * - Lowercase
   * - Remove extra whitespace
   * - Remove markdown formatting
   * - Remove citation markers
   */
  private normalizeForComparison(text: string): string {
    return text
      .toLowerCase()
      .replace(/\\{\\{[^}]+\\}\\}/g, '') // Remove {{DOC::...}} markers
      .replace(/📚.*$/gm, '') // Remove source lines
      .replace(/\\*\\*|__|~~|\\[|\\]|\\(|\\)|#|>/g, '') // Remove markdown
      .replace(/\\s+/g, ' ')
      .trim();
  }

  /**
   * Calculate normalized similarity between two strings.
   * Uses Levenshtein distance normalized by max length.
   *
   * @returns Similarity score 0-1 (1 = identical)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    if (!str1 && !str2) return 1;
    if (!str1 || !str2) return 0;

    const maxLen = Math.max(str1.length, str2.length);
    if (maxLen === 0) return 1;

    const distance = this.levenshteinDistance(str1, str2);
    return 1 - (distance / maxLen);
  }

  /**
   * Calculate Levenshtein distance between two strings.
   * Optimized for memory using two-row approach.
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;

    // Quick checks
    if (m === 0) return n;
    if (n === 0) return m;

    // For very long strings, use sampling to avoid O(m*n) complexity
    if (m > 500 || n > 500) {
      return this.approximateLevenshtein(str1, str2);
    }

    // Two-row approach for memory efficiency
    let prevRow = new Array(n + 1);
    let currRow = new Array(n + 1);

    // Initialize first row
    for (let j = 0; j <= n; j++) {
      prevRow[j] = j;
    }

    for (let i = 1; i <= m; i++) {
      currRow[0] = i;

      for (let j = 1; j <= n; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        currRow[j] = Math.min(
          prevRow[j] + 1,      // deletion
          currRow[j - 1] + 1,  // insertion
          prevRow[j - 1] + cost // substitution
        );
      }

      // Swap rows
      [prevRow, currRow] = [currRow, prevRow];
    }

    return prevRow[n];
  }

  /**
   * Approximate Levenshtein for very long strings using sampling.
   */
  private approximateLevenshtein(str1: string, str2: string): number {
    const sampleSize = 200;
    const samples = 5;
    let totalDistance = 0;

    for (let i = 0; i < samples; i++) {
      const start1 = Math.floor((str1.length / samples) * i);
      const start2 = Math.floor((str2.length / samples) * i);
      const sample1 = str1.substr(start1, sampleSize);
      const sample2 = str2.substr(start2, sampleSize);

      // Simple character difference count for samples
      let diff = 0;
      const maxLen = Math.max(sample1.length, sample2.length);
      for (let j = 0; j < maxLen; j++) {
        if (sample1[j] !== sample2[j]) diff++;
      }
      totalDistance += diff;
    }

    // Scale to approximate full string distance
    const avgSampleDist = totalDistance / samples;
    const scaleFactor = Math.max(str1.length, str2.length) / sampleSize;
    return Math.floor(avgSampleDist * scaleFactor);
  }

  /**
   * Generate a short confirmation message when repetition is detected.
   */
  private getShortConfirmation(
    previousAnswer: string,
    language: 'en' | 'pt' | 'es'
  ): string {
    // Extract first meaningful sentence (up to 150 chars)
    const firstSentence = previousAnswer
      .replace(/\\n+/g, ' ')
      .replace(/📚.*$/g, '')
      .trim()
      .split(/[.!?]/)
      .filter(s => s.trim().length > 10)[0] || '';

    const snippet = firstSentence.length > 120
      ? firstSentence.substring(0, 120) + '...'
      : firstSentence;

    const confirmations: Record<'en' | 'pt' | 'es', string> = {
      en: \`As I mentioned: \${snippet}\`,
      pt: \`Como mencionei: \${snippet}\`,
      es: \`Como mencioné: \${snippet}\`,
    };

    return confirmations[language] || confirmations.en;
  }`;

// Find the closing brace of the class and add methods before it
content = content.replace(
  /(\n})(\s*\n\s*export default)/,
  methodsToAdd + '$1$2'
);

// Write back
fs.writeFileSync(filePath, content, 'utf-8');
console.log('✅ Repetition detection added to KodaAnswerValidationService!');
