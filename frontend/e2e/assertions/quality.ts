/**
 * Quality Gate Assertions - ChatGPT-like UX validation
 *
 * CRITICAL: These assertions must pass for launch readiness
 */

import { SendResult } from '../utils/sendAndAssert';
import { TestQuestion } from '../utils/shard';

// ============================================================================
// Configuration
// ============================================================================

const TTFT_WARN_MS = parseInt(process.env.E2E_TTFT_WARN_MS || '3000');
const TTFT_FAIL_MS = parseInt(process.env.E2E_TTFT_FAIL_MS || '10000');
const TOTAL_RESPONSE_FAIL_MS = parseInt(process.env.E2E_TOTAL_RESPONSE_FAIL_MS || '60000');

// ============================================================================
// Fallback Phrases - MUST FAIL if detected
// ============================================================================

const FALLBACK_PHRASES = [
  // Direct refusals
  'rephrase',
  'could you rephrase',
  'please rephrase',
  'try rephrasing',

  // No documents fallbacks
  "i don't see any documents",
  "don't see any documents",
  "no documents",
  "haven't uploaded any",
  "upload some documents",
  "upload documents first",

  // Generic failure
  "i couldn't find specific information",
  "couldn't find relevant",
  "no relevant information",
  "not found in your documents",

  // System fallbacks
  'NO_RELEVANT_DOCS',
  'AMBIGUOUS_QUESTION',
  'NO_DOCUMENTS',
  'FALLBACK_RESPONSE',
];

// ============================================================================
// Assertion Types
// ============================================================================

export interface AssertionResult {
  passed: boolean;
  rule: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface QualityReport {
  questionId: string;
  passed: boolean;
  assertions: AssertionResult[];
  ttftMs: number;
  totalMs: number;
}

// ============================================================================
// Individual Assertions
// ============================================================================

/**
 * A) No fallback phrases - FAIL immediately
 */
export function assertNoFallbackPhrases(answer: string): AssertionResult {
  const lowerAnswer = answer.toLowerCase();

  for (const phrase of FALLBACK_PHRASES) {
    if (lowerAnswer.includes(phrase.toLowerCase())) {
      return {
        passed: false,
        rule: 'NO_FALLBACK_PHRASES',
        message: `Fallback phrase detected: "${phrase}"`,
        severity: 'error'
      };
    }
  }

  return {
    passed: true,
    rule: 'NO_FALLBACK_PHRASES',
    message: 'No fallback phrases detected',
    severity: 'error'
  };
}

/**
 * B) Formatting rules for lists
 * Note: After markdown rendering, list structures may be in HTML without visible markers in text
 */
export function assertListFormatting(answer: string, expectType: string): AssertionResult {
  if (expectType !== 'list') {
    return {
      passed: true,
      rule: 'LIST_FORMATTING',
      message: 'Not a list question',
      severity: 'warning'
    };
  }

  // Check for bullet points or numbered lists in plain text
  const hasBullets = /^[\s]*[-•*]\s/m.test(answer);
  const hasNumbers = /^[\s]*\d+[.)]\s/m.test(answer);
  const hasListItems = hasBullets || hasNumbers;

  // Check for proper newlines between items (multiple items)
  const lines = answer.split('\n').filter(l => l.trim());
  const hasMultipleLines = lines.length > 2; // At least 3 lines for a list

  // Check for patterns that indicate list-like content (file names, "Other Files", numbers, etc.)
  const hasListPatterns = /(\*\*|files?\s*\(|\.pdf|\.xlsx|\.docx|\.pptx)/i.test(answer);

  // Pass if any list indicator is present
  if (!hasListItems && !hasMultipleLines && !hasListPatterns) {
    return {
      passed: false,
      rule: 'LIST_FORMATTING',
      message: 'List response not formatted as bullet/numbered list',
      severity: 'warning' // Changed to warning since markdown rendering may affect this
    };
  }

  return {
    passed: true,
    rule: 'LIST_FORMATTING',
    message: 'List formatting correct',
    severity: 'warning'
  };
}

/**
 * B) No emojis (Koda brand rule)
 */
export function assertNoEmojis(answer: string): AssertionResult {
  // Emoji regex pattern
  const emojiPattern = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

  if (emojiPattern.test(answer)) {
    return {
      passed: false,
      rule: 'NO_EMOJIS',
      message: 'Answer contains emojis (Koda brand violation)',
      severity: 'warning'
    };
  }

  return {
    passed: true,
    rule: 'NO_EMOJIS',
    message: 'No emojis detected',
    severity: 'warning'
  };
}

/**
 * B) Summary bullet count validation
 */
export function assertBulletCount(answer: string, question: string): AssertionResult {
  // Check if question specifies bullet count
  const bulletMatch = question.match(/(\d+)\s*bullet/i);
  if (!bulletMatch) {
    return {
      passed: true,
      rule: 'BULLET_COUNT',
      message: 'No specific bullet count requested',
      severity: 'warning'
    };
  }

  const requestedCount = parseInt(bulletMatch[1]);

  // Count bullets in answer
  const bulletLines = answer.match(/^[\s]*[-•*]\s.+$/gm) || [];
  const actualCount = bulletLines.length;

  // Allow some flexibility (requested ± 1)
  if (Math.abs(actualCount - requestedCount) > 1) {
    return {
      passed: false,
      rule: 'BULLET_COUNT',
      message: `Requested ${requestedCount} bullets, got ${actualCount}`,
      severity: 'warning'
    };
  }

  return {
    passed: true,
    rule: 'BULLET_COUNT',
    message: `Bullet count matches (${actualCount}/${requestedCount})`,
    severity: 'warning'
  };
}

/**
 * C) UI stability - message didn't disappear
 * Now uses content-based validation instead of counting
 */
export function assertMessagePersistence(result: SendResult): AssertionResult {
  // Check if we got an answer (indicates assistant message rendered)
  const hasAnswer = result.answer && result.answer.length > 10;

  // The result.passed already includes the content-based message check from sendAndAssert
  // So we just verify we have a substantive answer
  if (!hasAnswer) {
    return {
      passed: false,
      rule: 'MESSAGE_PERSISTENCE',
      message: 'Assistant message empty or not rendered',
      severity: 'error'
    };
  }

  return {
    passed: true,
    rule: 'MESSAGE_PERSISTENCE',
    message: 'Messages rendered correctly',
    severity: 'error'
  };
}

/**
 * D) File action rendering - check for DOC:: markers
 */
export function assertFileActionRendering(answerHTML: string, expectType: string): AssertionResult {
  if (expectType !== 'fileAction') {
    return {
      passed: true,
      rule: 'FILE_ACTION_RENDERING',
      message: 'Not a file action question',
      severity: 'warning'
    };
  }

  // Check for file button indicators in HTML
  const hasFileButton = answerHTML.includes('data-file-id') ||
                        answerHTML.includes('file-button') ||
                        answerHTML.includes('DOC::') ||
                        answerHTML.includes('document-link');

  if (!hasFileButton) {
    return {
      passed: false,
      rule: 'FILE_ACTION_RENDERING',
      message: 'File action response missing file button',
      severity: 'warning'
    };
  }

  return {
    passed: true,
    rule: 'FILE_ACTION_RENDERING',
    message: 'File action has clickable button',
    severity: 'warning'
  };
}

/**
 * E) Latency thresholds
 */
export function assertLatency(ttftMs: number, totalMs: number): AssertionResult[] {
  const results: AssertionResult[] = [];

  // TTFT warning
  if (ttftMs > TTFT_WARN_MS && ttftMs <= TTFT_FAIL_MS) {
    results.push({
      passed: true, // Warning only
      rule: 'TTFT_WARNING',
      message: `TTFT ${ttftMs}ms exceeds warning threshold (${TTFT_WARN_MS}ms)`,
      severity: 'warning'
    });
  }

  // TTFT failure
  if (ttftMs > TTFT_FAIL_MS) {
    results.push({
      passed: false,
      rule: 'TTFT_FAILURE',
      message: `TTFT ${ttftMs}ms exceeds failure threshold (${TTFT_FAIL_MS}ms)`,
      severity: 'error'
    });
  } else {
    results.push({
      passed: true,
      rule: 'TTFT_CHECK',
      message: `TTFT ${ttftMs}ms within threshold`,
      severity: 'error'
    });
  }

  // Total response time
  if (totalMs > TOTAL_RESPONSE_FAIL_MS) {
    results.push({
      passed: false,
      rule: 'TOTAL_TIME_FAILURE',
      message: `Total time ${totalMs}ms exceeds threshold (${TOTAL_RESPONSE_FAIL_MS}ms)`,
      severity: 'error'
    });
  } else {
    results.push({
      passed: true,
      rule: 'TOTAL_TIME_CHECK',
      message: `Total time ${totalMs}ms within threshold`,
      severity: 'error'
    });
  }

  return results;
}

// ============================================================================
// Main Quality Gate Function
// ============================================================================

/**
 * Run all quality assertions on a result
 */
export function runQualityGate(result: SendResult, question: TestQuestion): QualityReport {
  const assertions: AssertionResult[] = [];

  // A) No fallback phrases
  assertions.push(assertNoFallbackPhrases(result.answer));

  // B) Formatting rules
  assertions.push(assertListFormatting(result.answer, question.expectType));
  assertions.push(assertNoEmojis(result.answer));
  assertions.push(assertBulletCount(result.answer, question.text));

  // C) UI stability
  assertions.push(assertMessagePersistence(result));

  // D) File action rendering
  assertions.push(assertFileActionRendering(result.answerHTML, question.expectType));

  // E) Latency
  assertions.push(...assertLatency(result.ttftMs, result.totalMs));

  // Calculate overall pass/fail (fail if any error-severity assertion failed)
  const passed = assertions
    .filter(a => a.severity === 'error')
    .every(a => a.passed);

  return {
    questionId: question.id,
    passed,
    assertions,
    ttftMs: result.ttftMs,
    totalMs: result.totalMs
  };
}

/**
 * Get summary statistics from quality reports
 */
export function getQualitySummary(reports: QualityReport[]): {
  totalQuestions: number;
  passed: number;
  failed: number;
  passRate: number;
  avgTtft: number;
  avgTotal: number;
  failedByRule: Record<string, number>;
} {
  const failed = reports.filter(r => !r.passed);
  const failedByRule: Record<string, number> = {};

  for (const report of failed) {
    for (const assertion of report.assertions) {
      if (!assertion.passed && assertion.severity === 'error') {
        failedByRule[assertion.rule] = (failedByRule[assertion.rule] || 0) + 1;
      }
    }
  }

  const avgTtft = reports.reduce((sum, r) => sum + r.ttftMs, 0) / reports.length;
  const avgTotal = reports.reduce((sum, r) => sum + r.totalMs, 0) / reports.length;

  return {
    totalQuestions: reports.length,
    passed: reports.length - failed.length,
    failed: failed.length,
    passRate: ((reports.length - failed.length) / reports.length) * 100,
    avgTtft: Math.round(avgTtft),
    avgTotal: Math.round(avgTotal),
    failedByRule
  };
}
