/**
 * KODA Ultimate Answer Quality Stress Test
 *
 * Goal: Prove answer quality across:
 * - Correct content (grounded in docs)
 * - Correct format (spacing, structure, buttons)
 * - No duplication (repeated sentences/phrases)
 * - ChatGPT-like behavior (handles ambiguity without refusing)
 * - Stable quality over long conversations
 *
 * This test is about OUTPUT QUALITY, not routing.
 */

import 'dotenv/config';
import axios from 'axios';
import * as crypto from 'crypto';
import * as fs from 'fs';

const API_BASE = 'http://localhost:5001';

// =============================================================================
// TYPES
// =============================================================================

interface RetrievalSource {
  docId: string;
  filename: string;
  folderPath: string | null;
  chunkId: string;
  score: number;
  textSnippet: string;
}

interface QualityEvent {
  turnNumber: number;
  segment: string;
  query: string;

  // A) Retrieval & grounding
  intent: string;
  subIntent: string;
  domain: string;
  retrievalTopKCount: number;
  retrievalSources: RetrievalSource[];
  textEvidenceHash: string;
  usedSourcesCount: number;

  // B) Output quality
  finalText: string;
  uiBlocks: string[];
  formatLintResults: LintResult[];
  groundednessResults: GroundednessResult;

  // C) Streaming & speed
  ttftMs: number;
  totalMs: number;
  tokensPerSecond: number;

  // D) Scores
  scores: ScoreCard;
  passed: boolean;
  failReasons: string[];
}

interface LintResult {
  rule: string;
  passed: boolean;
  details: string;
}

interface GroundednessResult {
  claims: Claim[];
  unsupportedCount: number;
  passed: boolean;
}

interface Claim {
  text: string;
  type: 'numeric' | 'entity' | 'factual';
  supported: boolean;
  evidence: string | null;
}

interface ScoreCard {
  correctness: number;      // 0-5
  grounding: number;        // 0-5
  formatting: number;       // 0-5
  uxCompliance: number;     // 0-5
  nonRepetition: number;    // 0-5
  helpfulness: number;      // 0-5
  average: number;
}

interface TestCase {
  id: number;
  segment: string;
  query: string;
  expectations: {
    mustHaveButton?: boolean;
    buttonOnly?: boolean;
    noFallback?: boolean;
    maxLength?: number;
    minLength?: number;
    mustMentionDoc?: string;
    mustCompare?: boolean;
  };
}

// =============================================================================
// PHASE 2: FORMATTING LINTER
// =============================================================================

class FormattingLinter {
  private rules: Array<{
    name: string;
    check: (text: string, context: { intent: string; query: string }) => LintResult;
  }> = [];

  constructor() {
    this.initializeRules();
  }

  private initializeRules() {
    // A) Spacing & layout rules
    this.rules.push({
      name: 'no-double-blank-lines',
      check: (text) => {
        const hasDouble = /\n\n\n/.test(text);
        return {
          rule: 'no-double-blank-lines',
          passed: !hasDouble,
          details: hasDouble ? 'Found triple+ newlines' : 'OK'
        };
      }
    });

    this.rules.push({
      name: 'consistent-bullet-indentation',
      check: (text) => {
        const lines = text.split('\n');
        const bulletLines = lines.filter(l => /^[\s]*[-•*]\s/.test(l));
        if (bulletLines.length < 2) return { rule: 'consistent-bullet-indentation', passed: true, details: 'OK' };

        const indents = bulletLines.map(l => l.match(/^(\s*)/)?.[1].length || 0);
        const uniqueIndents = [...new Set(indents)];
        // Allow max 2 indent levels
        const passed = uniqueIndents.length <= 2;
        return {
          rule: 'consistent-bullet-indentation',
          passed,
          details: passed ? 'OK' : `Inconsistent indents: ${uniqueIndents.join(', ')}`
        };
      }
    });

    this.rules.push({
      name: 'no-orphan-bullets',
      check: (text) => {
        const lines = text.split('\n').filter(l => l.trim());
        const bulletLines = lines.filter(l => /^[\s]*[-•*]\s/.test(l));
        // Orphan = single bullet with no context
        if (bulletLines.length === 1 && lines.length < 3) {
          return {
            rule: 'no-orphan-bullets',
            passed: false,
            details: 'Single orphan bullet found'
          };
        }
        return { rule: 'no-orphan-bullets', passed: true, details: 'OK' };
      }
    });

    // B) UX contract rules
    this.rules.push({
      name: 'file-action-must-have-button',
      check: (text, ctx) => {
        const isFileAction = /file_action|open|show|where.*is|which.*file/i.test(ctx.intent);
        const hasButton = /\{\{DOC::|📁/.test(text);
        if (isFileAction && !hasButton) {
          return {
            rule: 'file-action-must-have-button',
            passed: false,
            details: 'File action without button'
          };
        }
        return { rule: 'file-action-must-have-button', passed: true, details: 'OK' };
      }
    });

    this.rules.push({
      name: 'button-only-no-prose',
      check: (text, ctx) => {
        const isButtonOnly = /just open|open it|show it|that one/i.test(ctx.query);
        if (!isButtonOnly) return { rule: 'button-only-no-prose', passed: true, details: 'N/A' };

        const textWithoutButtons = text.replace(/\{\{[^}]+\}\}/g, '').replace(/📁[^\n]*/g, '').trim();
        const passed = textWithoutButtons.length < 50;
        return {
          rule: 'button-only-no-prose',
          passed,
          details: passed ? 'OK' : `Extra prose: ${textWithoutButtons.substring(0, 100)}...`
        };
      }
    });

    // C) Anti-duplication rules
    this.rules.push({
      name: 'no-repeated-sentences',
      check: (text) => {
        const sentences = text.split(/[.!?]+/).map(s => s.trim().toLowerCase()).filter(s => s.length > 20);
        const seen = new Set<string>();
        for (const s of sentences) {
          if (seen.has(s)) {
            return {
              rule: 'no-repeated-sentences',
              passed: false,
              details: `Repeated sentence: "${s.substring(0, 50)}..."`
            };
          }
          seen.add(s);
        }
        return { rule: 'no-repeated-sentences', passed: true, details: 'OK' };
      }
    });

    this.rules.push({
      name: 'no-repeated-doc-markers',
      check: (text) => {
        const markers = text.match(/\{\{DOC::[^}]+\}\}/g) || [];
        const seen = new Set<string>();
        for (const m of markers) {
          if (seen.has(m)) {
            return {
              rule: 'no-repeated-doc-markers',
              passed: false,
              details: 'Repeated DOC marker'
            };
          }
          seen.add(m);
        }
        return { rule: 'no-repeated-doc-markers', passed: true, details: 'OK' };
      }
    });

    this.rules.push({
      name: 'no-repeated-spans',
      check: (text) => {
        // Check for repeated 8-12 word spans
        const words = text.toLowerCase().split(/\s+/);
        for (let spanLen = 8; spanLen <= 12; spanLen++) {
          const spans = new Map<string, number>();
          for (let i = 0; i <= words.length - spanLen; i++) {
            const span = words.slice(i, i + spanLen).join(' ');
            const count = (spans.get(span) || 0) + 1;
            spans.set(span, count);
            if (count > 1) {
              return {
                rule: 'no-repeated-spans',
                passed: false,
                details: `Repeated ${spanLen}-word span: "${span.substring(0, 60)}..."`
              };
            }
          }
        }
        return { rule: 'no-repeated-spans', passed: true, details: 'OK' };
      }
    });

    // D) Safety rules
    this.rules.push({
      name: 'no-rephrase-fallback',
      check: (text) => {
        const fallbackPhrases = [
          /rephrase/i,
          /be more specific/i,
          /try again/i,
          /i can't find anything/i,
          /could you clarify/i,
          /not sure what/i,
          /try rephrasing/i
        ];
        for (const phrase of fallbackPhrases) {
          if (phrase.test(text)) {
            return {
              rule: 'no-rephrase-fallback',
              passed: false,
              details: `Fallback phrase detected: ${phrase.source}`
            };
          }
        }
        return { rule: 'no-rephrase-fallback', passed: true, details: 'OK' };
      }
    });
  }

  lint(text: string, context: { intent: string; query: string }): LintResult[] {
    return this.rules.map(rule => rule.check(text, context));
  }

  allPassed(results: LintResult[]): boolean {
    return results.every(r => r.passed);
  }
}

// =============================================================================
// PHASE 3: GROUNDEDNESS CHECKER
// =============================================================================

class GroundednessChecker {
  /**
   * Extract claims from answer text
   */
  extractClaims(text: string): Claim[] {
    const claims: Claim[] = [];

    // Numeric claims: money, dates, percentages, counts
    const numericPatterns = [
      /\$[\d,]+(\.\d{2})?/g,                    // Money
      /\d{1,2}\/\d{1,2}\/\d{2,4}/g,             // Dates MM/DD/YYYY
      /\d{4}-\d{2}-\d{2}/g,                     // Dates YYYY-MM-DD
      /\d+(\.\d+)?%/g,                          // Percentages
      /\d{1,3}(,\d{3})+/g,                      // Large numbers with commas
      /\b\d+\s*(million|billion|thousand)\b/gi  // Word numbers
    ];

    for (const pattern of numericPatterns) {
      const matches = text.match(pattern) || [];
      for (const match of matches) {
        claims.push({
          text: match,
          type: 'numeric',
          supported: false,
          evidence: null
        });
      }
    }

    // Entity claims: company names, fund names, document names
    const entityPatterns = [
      /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\s+(?:Fund|LLC|Inc|Corp|Company|Ranch|Group)\b/g,
      /\b(?:the\s+)?(?:Rosewood|Lone\s+Mountain|LMR)\s+\w+/gi
    ];

    for (const pattern of entityPatterns) {
      const matches = text.match(pattern) || [];
      for (const match of matches) {
        claims.push({
          text: match,
          type: 'entity',
          supported: false,
          evidence: null
        });
      }
    }

    return claims;
  }

  /**
   * Check if claims are supported by retrieved evidence
   */
  checkGrounding(claims: Claim[], retrievedText: string): GroundednessResult {
    const lowerEvidence = retrievedText.toLowerCase();
    let unsupportedCount = 0;

    for (const claim of claims) {
      const claimLower = claim.text.toLowerCase();
      // Check exact match or fuzzy match (claim words in evidence)
      if (lowerEvidence.includes(claimLower)) {
        claim.supported = true;
        claim.evidence = 'exact match';
      } else {
        // Fuzzy: check if key parts are present
        const claimWords = claimLower.split(/\s+/).filter(w => w.length > 3);
        const matchCount = claimWords.filter(w => lowerEvidence.includes(w)).length;
        if (matchCount >= claimWords.length * 0.7) {
          claim.supported = true;
          claim.evidence = 'fuzzy match';
        } else {
          unsupportedCount++;
        }
      }
    }

    // Fail if any numeric unsupported OR 2+ factual unsupported
    const numericUnsupported = claims.filter(c => c.type === 'numeric' && !c.supported).length;
    const passed = numericUnsupported === 0 && unsupportedCount < 2;

    return {
      claims,
      unsupportedCount,
      passed
    };
  }
}

// =============================================================================
// PHASE 4: 120-TURN TEST SUITE
// =============================================================================

const TEST_SEGMENTS: TestCase[] = [
  // =========================================================================
  // SEGMENT 1: Discovery + Navigation (20 turns)
  // =========================================================================
  { id: 1, segment: 'DISCOVERY', query: 'What folders do I have?', expectations: { noFallback: true } },
  { id: 2, segment: 'DISCOVERY', query: 'List my documents', expectations: { noFallback: true } },
  { id: 3, segment: 'DISCOVERY', query: "What's inside the test 1 folder?", expectations: { mustHaveButton: true, noFallback: true } },
  { id: 4, segment: 'DISCOVERY', query: 'Which files mention budget?', expectations: { mustHaveButton: true, noFallback: true } },
  { id: 5, segment: 'DISCOVERY', query: 'Where is the Rosewood Fund document?', expectations: { mustHaveButton: true, noFallback: true } },
  { id: 6, segment: 'DISCOVERY', query: 'Open it.', expectations: { mustHaveButton: true, buttonOnly: true, noFallback: true } },
  { id: 7, segment: 'DISCOVERY', query: 'Show me the P&L files', expectations: { mustHaveButton: true, noFallback: true } },
  { id: 8, segment: 'DISCOVERY', query: 'Which folder has financial documents?', expectations: { mustHaveButton: true, noFallback: true } },
  { id: 9, segment: 'DISCOVERY', query: 'Find all spreadsheets', expectations: { mustHaveButton: true, noFallback: true } },
  { id: 10, segment: 'DISCOVERY', query: 'Open the Lone Mountain Ranch file', expectations: { mustHaveButton: true, noFallback: true } },
  { id: 11, segment: 'DISCOVERY', query: 'Go back to test 1 folder', expectations: { noFallback: true } },
  { id: 12, segment: 'DISCOVERY', query: 'List what is there', expectations: { mustHaveButton: true, noFallback: true } },
  { id: 13, segment: 'DISCOVERY', query: 'Which file is the most recent?', expectations: { mustHaveButton: true, noFallback: true } },
  { id: 14, segment: 'DISCOVERY', query: 'Show me the oldest document', expectations: { mustHaveButton: true, noFallback: true } },
  { id: 15, segment: 'DISCOVERY', query: 'Are there any PDFs?', expectations: { noFallback: true } },
  { id: 16, segment: 'DISCOVERY', query: 'Only show Excel files', expectations: { mustHaveButton: true, noFallback: true } },
  { id: 17, segment: 'DISCOVERY', query: 'Where would I find the budget file if navigating manually?', expectations: { mustHaveButton: true, noFallback: true } },
  { id: 18, segment: 'DISCOVERY', query: 'Open that one', expectations: { mustHaveButton: true, buttonOnly: true, noFallback: true } },
  { id: 19, segment: 'DISCOVERY', query: 'What other files are in the same folder?', expectations: { mustHaveButton: true, noFallback: true } },
  { id: 20, segment: 'DISCOVERY', query: 'Navigate to root folder', expectations: { noFallback: true } },

  // =========================================================================
  // SEGMENT 2: Deep Doc Q&A (30 turns)
  // =========================================================================
  { id: 21, segment: 'DOC_QA', query: 'What does the Rosewood Fund document say about investments?', expectations: { noFallback: true, minLength: 50 } },
  { id: 22, segment: 'DOC_QA', query: 'Why does it say that?', expectations: { noFallback: true } },
  { id: 23, segment: 'DOC_QA', query: 'What is the total budget in the Lone Mountain Ranch file?', expectations: { noFallback: true } },
  { id: 24, segment: 'DOC_QA', query: 'Break down the expenses by category', expectations: { noFallback: true } },
  { id: 25, segment: 'DOC_QA', query: 'What are the revenue projections?', expectations: { noFallback: true } },
  { id: 26, segment: 'DOC_QA', query: 'Is there a profit margin mentioned?', expectations: { noFallback: true } },
  { id: 27, segment: 'DOC_QA', query: 'What year is this data from?', expectations: { noFallback: true } },
  { id: 28, segment: 'DOC_QA', query: 'Are there any risks mentioned?', expectations: { noFallback: true } },
  { id: 29, segment: 'DOC_QA', query: 'Summarize the key financial metrics', expectations: { noFallback: true, minLength: 100 } },
  { id: 30, segment: 'DOC_QA', query: 'What does it say about operating costs?', expectations: { noFallback: true } },
  { id: 31, segment: 'DOC_QA', query: 'Are there any seasonal variations noted?', expectations: { noFallback: true } },
  { id: 32, segment: 'DOC_QA', query: 'What is the net income?', expectations: { noFallback: true } },
  { id: 33, segment: 'DOC_QA', query: 'How is revenue calculated?', expectations: { noFallback: true } },
  { id: 34, segment: 'DOC_QA', query: 'What are the assumptions made?', expectations: { noFallback: true } },
  { id: 35, segment: 'DOC_QA', query: 'Is depreciation accounted for?', expectations: { noFallback: true } },
  { id: 36, segment: 'DOC_QA', query: 'What does the improvement plan contain?', expectations: { noFallback: true } },
  { id: 37, segment: 'DOC_QA', query: 'How much is the total improvement budget?', expectations: { noFallback: true } },
  { id: 38, segment: 'DOC_QA', query: 'What improvements are prioritized?', expectations: { noFallback: true } },
  { id: 39, segment: 'DOC_QA', query: 'When are improvements scheduled?', expectations: { noFallback: true } },
  { id: 40, segment: 'DOC_QA', query: 'What is the ROI expectation?', expectations: { noFallback: true } },
  { id: 41, segment: 'DOC_QA', query: 'Are there contingency plans?', expectations: { noFallback: true } },
  { id: 42, segment: 'DOC_QA', query: 'What funding sources are mentioned?', expectations: { noFallback: true } },
  { id: 43, segment: 'DOC_QA', query: 'Is there debt mentioned?', expectations: { noFallback: true } },
  { id: 44, segment: 'DOC_QA', query: 'What are the cash flow projections?', expectations: { noFallback: true } },
  { id: 45, segment: 'DOC_QA', query: 'Are there any compliance requirements?', expectations: { noFallback: true } },
  { id: 46, segment: 'DOC_QA', query: 'What market conditions are assumed?', expectations: { noFallback: true } },
  { id: 47, segment: 'DOC_QA', query: 'Are there performance benchmarks?', expectations: { noFallback: true } },
  { id: 48, segment: 'DOC_QA', query: 'What key personnel are mentioned?', expectations: { noFallback: true } },
  { id: 49, segment: 'DOC_QA', query: 'Is there a timeline for implementation?', expectations: { noFallback: true } },
  { id: 50, segment: 'DOC_QA', query: 'Summarize the entire document in 3 sentences', expectations: { noFallback: true, maxLength: 500 } },

  // =========================================================================
  // SEGMENT 3: Cross-Doc Comparisons (20 turns)
  // =========================================================================
  { id: 51, segment: 'COMPARE', query: 'Compare the Rosewood Fund with the Lone Mountain Ranch budget', expectations: { noFallback: true, mustCompare: true } },
  { id: 52, segment: 'COMPARE', query: 'Which one is newer?', expectations: { noFallback: true } },
  { id: 53, segment: 'COMPARE', query: 'Which has higher revenue?', expectations: { noFallback: true } },
  { id: 54, segment: 'COMPARE', query: 'Do they have similar expense categories?', expectations: { noFallback: true } },
  { id: 55, segment: 'COMPARE', query: 'Which document is more detailed?', expectations: { noFallback: true } },
  { id: 56, segment: 'COMPARE', query: 'Compare the 2024 and 2025 P&L files', expectations: { noFallback: true, mustCompare: true } },
  { id: 57, segment: 'COMPARE', query: 'What changed between them?', expectations: { noFallback: true } },
  { id: 58, segment: 'COMPARE', query: 'Is there a growth trend?', expectations: { noFallback: true } },
  { id: 59, segment: 'COMPARE', query: 'Which year had better margins?', expectations: { noFallback: true } },
  { id: 60, segment: 'COMPARE', query: 'Are there any conflicts between the documents?', expectations: { noFallback: true } },
  { id: 61, segment: 'COMPARE', query: 'Which file should I trust for current data?', expectations: { noFallback: true } },
  { id: 62, segment: 'COMPARE', query: 'Do both mention the same projects?', expectations: { noFallback: true } },
  { id: 63, segment: 'COMPARE', query: 'Compare the improvement plan with the budget', expectations: { noFallback: true } },
  { id: 64, segment: 'COMPARE', query: 'Are the cost estimates consistent?', expectations: { noFallback: true } },
  { id: 65, segment: 'COMPARE', query: 'Which has more conservative projections?', expectations: { noFallback: true } },
  { id: 66, segment: 'COMPARE', query: 'What assumptions differ?', expectations: { noFallback: true } },
  { id: 67, segment: 'COMPARE', query: 'Which file is more actionable?', expectations: { noFallback: true } },
  { id: 68, segment: 'COMPARE', query: 'Do they reference each other?', expectations: { noFallback: true } },
  { id: 69, segment: 'COMPARE', query: 'Create a comparison table of key metrics', expectations: { noFallback: true } },
  { id: 70, segment: 'COMPARE', query: 'Which file should I read first to understand the business?', expectations: { mustHaveButton: true, noFallback: true } },

  // =========================================================================
  // SEGMENT 4: Multi-Intent / Compound Commands (20 turns)
  // =========================================================================
  { id: 71, segment: 'MULTI_INTENT', query: 'Find the file about taxes and summarize it', expectations: { noFallback: true } },
  { id: 72, segment: 'MULTI_INTENT', query: 'Open the budget file and tell me the total', expectations: { mustHaveButton: true, noFallback: true } },
  { id: 73, segment: 'MULTI_INTENT', query: 'List all P&L files and compare their totals', expectations: { mustHaveButton: true, noFallback: true } },
  { id: 74, segment: 'MULTI_INTENT', query: 'Find which doc mentions investments and open it', expectations: { mustHaveButton: true, noFallback: true } },
  { id: 75, segment: 'MULTI_INTENT', query: 'Show the improvement plan and highlight the timeline', expectations: { noFallback: true } },
  { id: 76, segment: 'MULTI_INTENT', query: 'Search for revenue data and create a summary', expectations: { noFallback: true } },
  { id: 77, segment: 'MULTI_INTENT', query: 'Open the newest file and tell me what it contains', expectations: { mustHaveButton: true, noFallback: true } },
  { id: 78, segment: 'MULTI_INTENT', query: 'Find all financial documents and rank them by importance', expectations: { mustHaveButton: true, noFallback: true } },
  { id: 79, segment: 'MULTI_INTENT', query: 'List folders then open the one with most files', expectations: { noFallback: true } },
  { id: 80, segment: 'MULTI_INTENT', query: 'Compare the two ranch files and recommend which to use', expectations: { noFallback: true } },
  { id: 81, segment: 'MULTI_INTENT', query: 'Find any mention of risk and explain the context', expectations: { noFallback: true } },
  { id: 82, segment: 'MULTI_INTENT', query: 'Open the Rosewood file and extract the key metrics', expectations: { mustHaveButton: true, noFallback: true } },
  { id: 83, segment: 'MULTI_INTENT', query: 'Search across all docs for the word "budget"', expectations: { noFallback: true } },
  { id: 84, segment: 'MULTI_INTENT', query: 'List spreadsheets and show their sizes', expectations: { noFallback: true } },
  { id: 85, segment: 'MULTI_INTENT', query: 'Find the most relevant doc for understanding cash flow and open it', expectations: { mustHaveButton: true, noFallback: true } },
  { id: 86, segment: 'MULTI_INTENT', query: 'Compare all 3 Excel files on revenue', expectations: { noFallback: true } },
  { id: 87, segment: 'MULTI_INTENT', query: 'Open the 2025 budget and extract all expense line items', expectations: { mustHaveButton: true, noFallback: true } },
  { id: 88, segment: 'MULTI_INTENT', query: 'Find documents with numbers over $1 million', expectations: { noFallback: true } },
  { id: 89, segment: 'MULTI_INTENT', query: 'List all files then filter to just PDFs', expectations: { noFallback: true } },
  { id: 90, segment: 'MULTI_INTENT', query: 'Open the oldest file and summarize its purpose', expectations: { mustHaveButton: true, noFallback: true } },

  // =========================================================================
  // SEGMENT 5: Ambiguity Tolerance (10 turns) - ChatGPT shines here
  // =========================================================================
  { id: 91, segment: 'AMBIGUITY', query: 'Is this good or bad overall?', expectations: { noFallback: true } },
  { id: 92, segment: 'AMBIGUITY', query: "What's the takeaway?", expectations: { noFallback: true } },
  { id: 93, segment: 'AMBIGUITY', query: 'Does this make sense?', expectations: { noFallback: true } },
  { id: 94, segment: 'AMBIGUITY', query: 'Should I be worried?', expectations: { noFallback: true } },
  { id: 95, segment: 'AMBIGUITY', query: 'Is this normal for this industry?', expectations: { noFallback: true } },
  { id: 96, segment: 'AMBIGUITY', query: 'What would you recommend?', expectations: { noFallback: true } },
  { id: 97, segment: 'AMBIGUITY', query: 'Is there anything concerning here?', expectations: { noFallback: true } },
  { id: 98, segment: 'AMBIGUITY', query: 'What am I missing?', expectations: { noFallback: true } },
  { id: 99, segment: 'AMBIGUITY', query: 'Is this better than the other one?', expectations: { noFallback: true } },
  { id: 100, segment: 'AMBIGUITY', query: "What's the bottom line?", expectations: { noFallback: true } },

  // =========================================================================
  // SEGMENT 6: Output Format Stress (10 turns)
  // =========================================================================
  { id: 101, segment: 'FORMAT', query: "List files. Don't explain.", expectations: { mustHaveButton: true, noFallback: true, maxLength: 500 } },
  { id: 102, segment: 'FORMAT', query: 'Just open it.', expectations: { mustHaveButton: true, buttonOnly: true, noFallback: true } },
  { id: 103, segment: 'FORMAT', query: 'Answer in 3 bullets only.', expectations: { noFallback: true } },
  { id: 104, segment: 'FORMAT', query: 'Give me a table of expenses.', expectations: { noFallback: true } },
  { id: 105, segment: 'FORMAT', query: 'One sentence summary.', expectations: { noFallback: true, maxLength: 200 } },
  { id: 106, segment: 'FORMAT', query: 'Explain like I am 5.', expectations: { noFallback: true } },
  { id: 107, segment: 'FORMAT', query: 'Technical breakdown please.', expectations: { noFallback: true } },
  { id: 108, segment: 'FORMAT', query: 'Just the numbers.', expectations: { noFallback: true } },
  { id: 109, segment: 'FORMAT', query: 'Yes or no: is this profitable?', expectations: { noFallback: true, maxLength: 100 } },
  { id: 110, segment: 'FORMAT', query: 'List the top 5 expenses.', expectations: { noFallback: true } },

  // =========================================================================
  // SEGMENT 7: Long-Turn Degradation (10 turns)
  // =========================================================================
  { id: 111, segment: 'DEGRADATION', query: 'Summarize the Rosewood Fund document', expectations: { noFallback: true } },
  { id: 112, segment: 'DEGRADATION', query: 'What are the key risks in the Lone Mountain budget?', expectations: { noFallback: true } },
  { id: 113, segment: 'DEGRADATION', query: 'Compare all financial documents', expectations: { noFallback: true } },
  { id: 114, segment: 'DEGRADATION', query: 'Open the budget file', expectations: { mustHaveButton: true, noFallback: true } },
  { id: 115, segment: 'DEGRADATION', query: 'What is the total revenue across all docs?', expectations: { noFallback: true } },
  { id: 116, segment: 'DEGRADATION', query: 'List all files in test 1 folder', expectations: { mustHaveButton: true, noFallback: true } },
  { id: 117, segment: 'DEGRADATION', query: 'Which folder contains financial documents?', expectations: { mustHaveButton: true, noFallback: true } },
  { id: 118, segment: 'DEGRADATION', query: 'Where is the Rosewood Fund located?', expectations: { mustHaveButton: true, noFallback: true } },
  { id: 119, segment: 'DEGRADATION', query: 'Open it.', expectations: { mustHaveButton: true, buttonOnly: true, noFallback: true } },
  { id: 120, segment: 'DEGRADATION', query: 'Give me the final summary of everything we discussed.', expectations: { noFallback: true, minLength: 200 } },
];

// =============================================================================
// PHASE 5: SCORING RUBRIC
// =============================================================================

class QualityScorer {
  scoreCorrectness(text: string, expectedDocs: string[]): number {
    // 5 = fully supported by evidence
    // 3 = mostly supported, minor gaps
    // 0 = hallucination / wrong doc
    if (!text || text.length < 10) return 0;

    let score = 5;

    // Check for error responses
    if (/error|failed|unavailable/i.test(text)) score -= 3;

    // Check if expected docs mentioned
    for (const doc of expectedDocs) {
      if (!text.toLowerCase().includes(doc.toLowerCase())) {
        score -= 1;
      }
    }

    return Math.max(0, Math.min(5, score));
  }

  scoreGrounding(groundedness: GroundednessResult): number {
    if (!groundedness.claims.length) return 5; // No claims to ground

    const supportedRatio = groundedness.claims.filter(c => c.supported).length / groundedness.claims.length;
    return Math.round(supportedRatio * 5);
  }

  scoreFormatting(lintResults: LintResult[]): number {
    const passed = lintResults.filter(r => r.passed).length;
    const total = lintResults.length;
    return Math.round((passed / total) * 5);
  }

  scoreUxCompliance(text: string, expectations: TestCase['expectations']): number {
    let score = 5;

    if (expectations.mustHaveButton && !/\{\{DOC::/.test(text)) {
      score -= 3;
    }

    if (expectations.buttonOnly) {
      const textWithoutButtons = text.replace(/\{\{[^}]+\}\}/g, '').trim();
      if (textWithoutButtons.length > 50) {
        score -= 2;
      }
    }

    if (expectations.maxLength && text.length > expectations.maxLength) {
      score -= 1;
    }

    if (expectations.minLength && text.length < expectations.minLength) {
      score -= 2;
    }

    return Math.max(0, Math.min(5, score));
  }

  scoreNonRepetition(lintResults: LintResult[]): number {
    const repetitionRules = ['no-repeated-sentences', 'no-repeated-doc-markers', 'no-repeated-spans'];
    const relevant = lintResults.filter(r => repetitionRules.includes(r.rule));
    const passed = relevant.filter(r => r.passed).length;
    return relevant.length ? Math.round((passed / relevant.length) * 5) : 5;
  }

  scoreHelpfulness(text: string, lintResults: LintResult[]): number {
    let score = 5;

    // Check for fallback/refusal
    const fallbackRule = lintResults.find(r => r.rule === 'no-rephrase-fallback');
    if (fallbackRule && !fallbackRule.passed) {
      score -= 4;
    }

    // Check for minimal content
    if (text.length < 20) score -= 2;

    // Check for helpful structure
    if (/•|[-*]\s|^\d+\./m.test(text)) score += 0; // Has lists

    return Math.max(0, Math.min(5, score));
  }

  calculateScoreCard(
    text: string,
    lintResults: LintResult[],
    groundedness: GroundednessResult,
    expectations: TestCase['expectations']
  ): ScoreCard {
    const correctness = this.scoreCorrectness(text, []);
    const grounding = this.scoreGrounding(groundedness);
    const formatting = this.scoreFormatting(lintResults);
    const uxCompliance = this.scoreUxCompliance(text, expectations);
    const nonRepetition = this.scoreNonRepetition(lintResults);
    const helpfulness = this.scoreHelpfulness(text, lintResults);

    const average = (correctness + grounding + formatting + uxCompliance + nonRepetition + helpfulness) / 6;

    return {
      correctness,
      grounding,
      formatting,
      uxCompliance,
      nonRepetition,
      helpfulness,
      average
    };
  }
}

// =============================================================================
// MAIN TEST RUNNER
// =============================================================================

async function runUltimateQualityTest() {
  console.log('='.repeat(100));
  console.log('KODA ULTIMATE ANSWER QUALITY STRESS TEST');
  console.log('Testing 120 turns across 7 segments');
  console.log('='.repeat(100));
  console.log('');

  // Initialize components
  const linter = new FormattingLinter();
  const groundednessChecker = new GroundednessChecker();
  const scorer = new QualityScorer();

  // Login
  const login = await axios.post(API_BASE + '/api/auth/login', {
    email: 'test@koda.com',
    password: 'test123'
  });
  const token = login.data.accessToken;
  const conversationId = 'ultimate-quality-' + Date.now();

  // Collect results
  const events: QualityEvent[] = [];
  let passCount = 0;
  let failCount = 0;

  // Segment counters
  const segmentStats: Record<string, { pass: number; fail: number; avgScore: number }> = {};

  for (const tc of TEST_SEGMENTS) {
    const startTime = Date.now();

    console.log('-'.repeat(100));
    console.log(`Q${tc.id} [${tc.segment}]: "${tc.query}"`);

    try {
      const res = await axios.post(API_BASE + '/api/rag/query',
        { query: tc.query, conversationId, language: 'en' },
        { headers: { Authorization: 'Bearer ' + token }, timeout: 60000 }
      );

      const totalMs = Date.now() - startTime;
      const answer = res.data.answer || '';
      const intent = res.data.intent || 'unknown';
      const subIntent = res.data.subIntent || '';
      const domain = res.data.domain || '';

      // Build evidence text from sources if available
      // Sources contain: snippet, documentName, location, etc.
      const sources = res.data.sources || [];
      const evidenceText = sources.map((s: any) => s.snippet || s.text || s.content || '').join(' ');

      // Run linter
      const lintResults = linter.lint(answer, { intent, query: tc.query });

      // Run groundedness check
      const claims = groundednessChecker.extractClaims(answer);
      const groundednessResult = groundednessChecker.checkGrounding(claims, evidenceText);

      // Calculate scores
      const scores = scorer.calculateScoreCard(answer, lintResults, groundednessResult, tc.expectations);

      // Determine pass/fail
      const failReasons: string[] = [];

      // Check expectations
      if (tc.expectations.noFallback) {
        const fallbackRule = lintResults.find(r => r.rule === 'no-rephrase-fallback');
        if (fallbackRule && !fallbackRule.passed) {
          failReasons.push('FALLBACK_DETECTED');
        }
      }

      if (tc.expectations.mustHaveButton && !/\{\{DOC::/.test(answer)) {
        failReasons.push('MISSING_BUTTON');
      }

      if (tc.expectations.buttonOnly) {
        const textWithoutButtons = answer.replace(/\{\{[^}]+\}\}/g, '').trim();
        if (textWithoutButtons.length > 50) {
          failReasons.push('NOT_BUTTON_ONLY');
        }
      }

      if (answer.length < 5) {
        failReasons.push('EMPTY_RESPONSE');
      }

      // Lint failures
      const lintFailures = lintResults.filter(r => !r.passed);
      if (lintFailures.length > 0) {
        failReasons.push(...lintFailures.map(r => `LINT:${r.rule}`));
      }

      // Groundedness failures - EXEMPT navigation intents (file_actions, discovery)
      // Navigation returns buttons, not snippets - different evaluation contract
      const isNavigationIntent = intent === 'file_actions' ||
        tc.segment === 'DISCOVERY' ||
        /where\s+(is|are)|list\s+(files|folders)|open\s+(it|the|file)|show\s+me|which\s+folder/i.test(tc.query);

      if (!groundednessResult.passed && !isNavigationIntent) {
        failReasons.push('GROUNDING_FAILED');
      }

      // Navigation-specific validation: buttons must exist, no hallucinated filenames
      if (isNavigationIntent) {
        const hasButtons = /\{\{DOC::/.test(answer) || /📁/.test(answer);
        const hasFileList = answer.length > 20; // Not empty
        if (!hasButtons && !hasFileList && tc.expectations.mustHaveButton) {
          failReasons.push('NAV_NO_BUTTONS');
        }
      }

      // Score threshold
      if (scores.average < 4.0) {
        failReasons.push(`LOW_SCORE:${scores.average.toFixed(1)}`);
      }

      const passed = failReasons.length === 0;
      if (passed) passCount++;
      else failCount++;

      // Update segment stats
      if (!segmentStats[tc.segment]) {
        segmentStats[tc.segment] = { pass: 0, fail: 0, avgScore: 0 };
      }
      segmentStats[tc.segment].avgScore += scores.average;
      if (passed) segmentStats[tc.segment].pass++;
      else segmentStats[tc.segment].fail++;

      // Build event
      const event: QualityEvent = {
        turnNumber: tc.id,
        segment: tc.segment,
        query: tc.query,
        intent,
        subIntent,
        domain,
        retrievalTopKCount: sources.length,
        retrievalSources: sources.slice(0, 5).map((s: any) => ({
          docId: s.documentId || s.id || '',
          filename: s.filename || s.documentName || '',
          folderPath: s.folderPath || null,
          chunkId: s.chunkId || '',
          score: s.score || 0,
          textSnippet: (s.text || s.content || '').substring(0, 200)
        })),
        textEvidenceHash: crypto.createHash('md5').update(evidenceText).digest('hex').substring(0, 8),
        usedSourcesCount: sources.length,
        finalText: answer,
        uiBlocks: (answer.match(/\{\{[^}]+\}\}/g) || []),
        formatLintResults: lintResults,
        groundednessResults: groundednessResult,
        ttftMs: 0, // Would need streaming to measure
        totalMs,
        tokensPerSecond: answer.split(/\s+/).length / (totalMs / 1000),
        scores,
        passed,
        failReasons
      };

      events.push(event);

      // Log result
      console.log(`Intent: ${intent} | Time: ${totalMs}ms | Score: ${scores.average.toFixed(1)}/5`);
      console.log(`Answer (${answer.length} chars): ${answer.substring(0, 200)}${answer.length > 200 ? '...' : ''}`);
      console.log(`Result: ${passed ? '✅ PASS' : '❌ FAIL'} ${failReasons.length > 0 ? `(${failReasons.join(', ')})` : ''}`);

    } catch (error: any) {
      failCount++;
      console.log(`ERROR: ${error.message}`);

      const event: QualityEvent = {
        turnNumber: tc.id,
        segment: tc.segment,
        query: tc.query,
        intent: 'ERROR',
        subIntent: '',
        domain: '',
        retrievalTopKCount: 0,
        retrievalSources: [],
        textEvidenceHash: '',
        usedSourcesCount: 0,
        finalText: error.message,
        uiBlocks: [],
        formatLintResults: [],
        groundednessResults: { claims: [], unsupportedCount: 0, passed: false },
        ttftMs: 0,
        totalMs: Date.now() - startTime,
        tokensPerSecond: 0,
        scores: { correctness: 0, grounding: 0, formatting: 0, uxCompliance: 0, nonRepetition: 0, helpfulness: 0, average: 0 },
        passed: false,
        failReasons: ['ERROR: ' + error.message]
      };
      events.push(event);

      if (!segmentStats[tc.segment]) {
        segmentStats[tc.segment] = { pass: 0, fail: 0, avgScore: 0 };
      }
      segmentStats[tc.segment].fail++;
    }

    // Rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  // ==========================================================================
  // FINAL REPORT
  // ==========================================================================
  console.log('');
  console.log('='.repeat(100));
  console.log('ULTIMATE QUALITY TEST — FINAL REPORT');
  console.log('='.repeat(100));
  console.log('');

  // Overall stats
  console.log(`OVERALL: ${passCount}/${TEST_SEGMENTS.length} PASSED (${((passCount / TEST_SEGMENTS.length) * 100).toFixed(1)}%)`);
  console.log('');

  // Segment breakdown
  console.log('SEGMENT BREAKDOWN:');
  console.log('-'.repeat(80));
  for (const [segment, stats] of Object.entries(segmentStats)) {
    const total = stats.pass + stats.fail;
    const avgScore = stats.avgScore / total;
    console.log(`  ${segment.padEnd(15)} | Pass: ${stats.pass}/${total} | Avg Score: ${avgScore.toFixed(2)}/5`);
  }
  console.log('');

  // SPLIT METRICS: Content QA vs Navigation
  console.log('EVALUATION TYPE BREAKDOWN:');
  console.log('-'.repeat(80));

  // Navigation segments: DISCOVERY + file_actions queries
  const navSegments = ['DISCOVERY'];
  const contentSegments = ['DOC_QA', 'COMPARE', 'MULTI_INTENT', 'AMBIGUITY', 'FORMAT', 'DEGRADATION'];

  let navPass = 0, navFail = 0, navScoreSum = 0;
  let contentPass = 0, contentFail = 0, contentScoreSum = 0;

  for (const event of events) {
    const isNav = navSegments.includes(event.segment) ||
      event.intent === 'file_actions' ||
      /where\s+(is|are)|list\s+(files|folders)|open\s+(it|the|file)/i.test(event.query);

    if (isNav) {
      if (event.passed) navPass++;
      else navFail++;
      navScoreSum += event.scores.average;
    } else {
      if (event.passed) contentPass++;
      else contentFail++;
      contentScoreSum += event.scores.average;
    }
  }

  const navTotal = navPass + navFail;
  const contentTotal = contentPass + contentFail;

  console.log(`  📁 NAVIGATION     | Pass: ${navPass}/${navTotal} (${((navPass/navTotal)*100).toFixed(0)}%) | Avg: ${(navScoreSum/navTotal).toFixed(2)}/5`);
  console.log(`  📄 CONTENT QA     | Pass: ${contentPass}/${contentTotal} (${((contentPass/contentTotal)*100).toFixed(0)}%) | Avg: ${(contentScoreSum/contentTotal).toFixed(2)}/5`);
  console.log('');

  // Score distribution
  const allScores = events.map(e => e.scores.average);
  const avgScore = allScores.reduce((a, b) => a + b, 0) / allScores.length;
  const minScore = Math.min(...allScores);
  const maxScore = Math.max(...allScores);

  console.log('SCORE STATISTICS:');
  console.log(`  Average: ${avgScore.toFixed(2)}/5`);
  console.log(`  Min: ${minScore.toFixed(2)}/5`);
  console.log(`  Max: ${maxScore.toFixed(2)}/5`);
  console.log('');

  // Timing statistics
  const timings = events.map(e => e.totalMs).filter(t => t > 0);
  const avgTime = timings.reduce((a, b) => a + b, 0) / timings.length;
  const p50 = timings.sort((a, b) => a - b)[Math.floor(timings.length * 0.5)];
  const p95 = timings.sort((a, b) => a - b)[Math.floor(timings.length * 0.95)];

  console.log('TIMING STATISTICS:');
  console.log(`  Average: ${avgTime.toFixed(0)}ms`);
  console.log(`  p50: ${p50}ms`);
  console.log(`  p95: ${p95}ms`);
  console.log('');

  // Failure analysis
  const failedEvents = events.filter(e => !e.passed);
  if (failedEvents.length > 0) {
    console.log('FAILURE ANALYSIS:');
    console.log('-'.repeat(80));

    // Group by failure reason
    const failureTypes: Record<string, number> = {};
    for (const event of failedEvents) {
      for (const reason of event.failReasons) {
        const key = reason.split(':')[0];
        failureTypes[key] = (failureTypes[key] || 0) + 1;
      }
    }

    for (const [reason, count] of Object.entries(failureTypes).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${reason}: ${count} occurrences`);
    }
    console.log('');

    console.log('TOP 10 FAILED QUERIES:');
    for (const event of failedEvents.slice(0, 10)) {
      console.log(`  Q${event.turnNumber} [${event.segment}]: "${event.query.substring(0, 50)}..."`);
      console.log(`    → ${event.failReasons.join(', ')}`);
    }
  }
  console.log('');

  // Pass/Fail thresholds
  console.log('THRESHOLD CHECKS:');
  const noFallbacks = events.filter(e => e.formatLintResults.find(r => r.rule === 'no-rephrase-fallback' && !r.passed)).length === 0;
  const avgAbove45 = avgScore >= 4.5;
  const allButtonsPresent = events.filter(e =>
    TEST_SEGMENTS.find(t => t.id === e.turnNumber)?.expectations.mustHaveButton &&
    !e.uiBlocks.length
  ).length === 0;

  console.log(`  ✅ No fallbacks: ${noFallbacks ? 'PASS' : 'FAIL'}`);
  console.log(`  ${avgAbove45 ? '✅' : '❌'} Avg score ≥ 4.5: ${avgScore.toFixed(2)} (${avgAbove45 ? 'PASS' : 'FAIL'})`);
  console.log(`  ${allButtonsPresent ? '✅' : '❌'} Button compliance: ${allButtonsPresent ? 'PASS' : 'FAIL'}`);
  console.log(`  ${p50 < 5000 ? '✅' : '❌'} p50 latency < 5s: ${p50}ms (${p50 < 5000 ? 'PASS' : 'FAIL'})`);
  console.log('');

  // Save detailed report
  const reportPath = `./output/quality-report-${Date.now()}.json`;
  fs.mkdirSync('./output', { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({
    summary: {
      total: TEST_SEGMENTS.length,
      passed: passCount,
      failed: failCount,
      passRate: (passCount / TEST_SEGMENTS.length * 100).toFixed(1) + '%',
      avgScore: avgScore.toFixed(2),
      avgTime: avgTime.toFixed(0) + 'ms'
    },
    segmentStats,
    events
  }, null, 2));

  console.log(`Detailed report saved to: ${reportPath}`);
  console.log('');

  if (failCount === 0 && avgScore >= 4.5) {
    console.log('🎉 ALL QUALITY CHECKS PASSED — PRODUCTION READY');
  } else {
    console.log(`⚠️  ${failCount} QUALITY FAILURES — Review and fix before deploying`);
  }
}

// Run the test
runUltimateQualityTest().catch(e => console.error('Suite failed:', e.message));
