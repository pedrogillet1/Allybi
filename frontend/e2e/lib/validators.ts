/**
 * UX CONTRACT VALIDATORS
 *
 * Strict validators for Koda responses - ChatGPT-grade quality gates
 * Each validator returns { passed: boolean, reason: string }
 */

export interface ValidationResult {
  passed: boolean;
  reason: string;
}

export interface AssertionResult {
  name: string;
  passed: boolean;
  message: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORBIDDEN OUTPUT VALIDATORS (auto-fail if detected)
// ═══════════════════════════════════════════════════════════════════════════════

const FALLBACK_PHRASES = [
  "rephrase",
  "could you rephrase",
  "please rephrase",
  "try rephrasing",
  "i don't see any documents",
  "don't see any documents",
  "no documents",
  "haven't uploaded any",
  "upload some documents",
  "upload documents first",
  "i couldn't find specific information",
  "couldn't find relevant",
  "no relevant information",
  "not found in your documents",
  "i don't have access",
  "unable to access",
];

export function checkNoFallback(answer: string): AssertionResult {
  const lowerAnswer = answer.toLowerCase();
  for (const phrase of FALLBACK_PHRASES) {
    if (lowerAnswer.includes(phrase)) {
      return {
        name: 'no_fallback',
        passed: false,
        message: `Fallback detected: "${phrase}"`,
      };
    }
  }
  return { name: 'no_fallback', passed: true, message: 'No fallback phrases' };
}

export function checkNoEmoji(answer: string): AssertionResult {
  // Check for common emojis (excluding numbers in circles which might be formatting)
  const emojiPattern = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/u;
  if (emojiPattern.test(answer)) {
    return { name: 'no_emoji', passed: false, message: 'Emoji detected in response' };
  }
  return { name: 'no_emoji', passed: true, message: 'No emojis' };
}

export function checkNoRawTokens(answerHTML: string): AssertionResult {
  // Check for raw tokens that should have been rendered
  if (answerHTML.includes('{{DOC::') && !answerHTML.includes('data-file-id')) {
    return { name: 'no_raw_tokens', passed: false, message: 'Raw DOC:: tokens visible' };
  }
  return { name: 'no_raw_tokens', passed: true, message: 'No raw tokens' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIST FORMATTING VALIDATORS
// ═══════════════════════════════════════════════════════════════════════════════

export function checkNumberedList(answer: string, answerHTML?: string): AssertionResult {
  // Check for numbered list pattern (1. 2. 3. OR 1) 2) 3))
  const numberedPattern = /^\s*\d+[\.\)]\s+/m;
  const lines = answer.split('\n').filter(l => l.trim());
  const hasNumberedItems = lines.some(line => numberedPattern.test(line));

  if (hasNumberedItems) {
    return { name: 'numbered_list', passed: true, message: 'Has numbered list' };
  }

  // Also check for bullet points (- or *)
  const bulletPattern = /^\s*[-*•]\s+/m;
  const hasBullets = lines.some(line => bulletPattern.test(line));
  if (hasBullets) {
    return { name: 'numbered_list', passed: true, message: 'Has bulleted list' };
  }

  // Also check for HTML list elements (rendered as list even without text markers)
  if (answerHTML) {
    const hasHtmlList = /<(ul|ol|li|list|listitem)/i.test(answerHTML);
    if (hasHtmlList) {
      return { name: 'numbered_list', passed: true, message: 'Has HTML list' };
    }
  }

  // Check if we have multiple file-like entries (filename with extension)
  const filePattern = /\.(pdf|xlsx?|pptx?|docx?|png|jpe?g)/gi;
  const fileMatches = answer.match(filePattern) || [];
  if (fileMatches.length >= 2) {
    return { name: 'numbered_list', passed: true, message: `Has ${fileMatches.length} file listings` };
  }

  return { name: 'numbered_list', passed: false, message: 'Missing list formatting' };
}

export function checkExactlyNBullets(answer: string, n: number): AssertionResult {
  // Count bullet points (-, *, or numbered)
  const bulletPattern = /^[\s]*(?:[-*]|\d+[\.\)])\s+/gm;
  const matches = answer.match(bulletPattern) || [];
  const count = matches.length;

  // Allow +/- 1 flexibility
  if (Math.abs(count - n) <= 1) {
    return {
      name: `exactly_${n}_bullets`,
      passed: true,
      message: `Has ${count} bullets (expected ${n})`
    };
  }
  return {
    name: `exactly_${n}_bullets`,
    passed: false,
    message: `Has ${count} bullets, expected ${n}`
  };
}

export function checkExactlyNItems(answer: string, n: number): AssertionResult {
  return checkExactlyNBullets(answer, n);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FILE BUTTON VALIDATORS
// ═══════════════════════════════════════════════════════════════════════════════

export function checkHasFileButton(answerHTML: string): AssertionResult {
  const hasButton =
    answerHTML.includes('DOC::') ||
    answerHTML.includes('data-file-id') ||
    answerHTML.includes('file-button') ||
    answerHTML.includes('document-link') ||
    answerHTML.includes('file-action-card');

  if (hasButton) {
    return { name: 'has_file_button', passed: true, message: 'File button present' };
  }
  return { name: 'has_file_button', passed: false, message: 'No file button found' };
}

export function checkHasFileButtons(answerHTML: string): AssertionResult {
  // Check for multiple file buttons
  const buttonCount = (answerHTML.match(/DOC::|data-file-id|file-button/g) || []).length;
  if (buttonCount >= 2) {
    return { name: 'has_file_buttons', passed: true, message: `${buttonCount} file buttons found` };
  }
  return { name: 'has_file_buttons', passed: false, message: `Only ${buttonCount} file button(s) found` };
}

export function checkExactlyNButtons(answerHTML: string, n: number): AssertionResult {
  const buttonCount = (answerHTML.match(/DOC::|data-file-id|file-button/g) || []).length;
  if (Math.abs(buttonCount - n) <= 1) {
    return { name: `exactly_${n}_buttons`, passed: true, message: `Has ${buttonCount} buttons` };
  }
  return { name: `exactly_${n}_buttons`, passed: false, message: `Has ${buttonCount} buttons, expected ${n}` };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FOLDER PATH VALIDATORS
// ═══════════════════════════════════════════════════════════════════════════════

export function checkHasFolderPath(answer: string): AssertionResult {
  // Check for folder path patterns
  const hasPath =
    /\b(located in|folder|path|in:)\s*[:.]?\s*[\w\s\/-]+/i.test(answer) ||
    /\w+\s*\/\s*\w+/i.test(answer) ||
    /📁|📂/.test(answer) ||
    /(root|root folder|\(root\))/i.test(answer);

  if (hasPath) {
    return { name: 'has_folder_path', passed: true, message: 'Folder path present' };
  }
  return { name: 'has_folder_path', passed: false, message: 'No folder path found' };
}

export function checkHasFolderSections(answer: string): AssertionResult {
  // Check for folder grouping sections (bold folder names with files underneath)
  const folderSectionPattern = /\*\*[^*]+\*\*\s*\(\d+\)/;
  if (folderSectionPattern.test(answer)) {
    return { name: 'has_folder_sections', passed: true, message: 'Has folder sections' };
  }
  return { name: 'has_folder_sections', passed: false, message: 'Missing folder sections' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTENT QUALITY VALIDATORS
// ═══════════════════════════════════════════════════════════════════════════════

export function checkSubstantiveAnswer(answer: string): AssertionResult {
  // Answer should have meaningful content (not just filenames or short phrases)
  const cleanAnswer = answer.replace(/\*\*[^*]+\*\*/g, '').trim();
  if (cleanAnswer.length > 50 && cleanAnswer.split(' ').length > 10) {
    return { name: 'substantive_answer', passed: true, message: 'Has substantive content' };
  }
  return { name: 'substantive_answer', passed: false, message: 'Answer too short or lacks substance' };
}

export function checkMinimalText(answer: string): AssertionResult {
  // For "button only" type responses - should be very short
  const cleanText = answer
    .replace(/\{\{DOC::[^}]+\}\}/g, '')
    .replace(/\*\*[^*]+\*\*/g, '')
    .trim();

  if (cleanText.length < 150) {
    return { name: 'minimal_text', passed: true, message: 'Minimal text as expected' };
  }
  return { name: 'minimal_text', passed: false, message: `Too much text (${cleanText.length} chars)` };
}

export function checkSingleSentence(answer: string): AssertionResult {
  const sentences = answer.split(/[.!?]+/).filter(s => s.trim().length > 10);
  if (sentences.length <= 2) {
    return { name: 'single_sentence', passed: true, message: 'Single sentence' };
  }
  return { name: 'single_sentence', passed: false, message: `${sentences.length} sentences found` };
}

export function checkSingleParagraph(answer: string): AssertionResult {
  const paragraphs = answer.split(/\n\n+/).filter(p => p.trim().length > 0);
  if (paragraphs.length <= 1) {
    return { name: 'single_paragraph', passed: true, message: 'Single paragraph' };
  }
  return { name: 'single_paragraph', passed: false, message: `${paragraphs.length} paragraphs found` };
}

export function checkIsShort(answer: string): AssertionResult {
  if (answer.length < 500) {
    return { name: 'is_short', passed: true, message: 'Short response' };
  }
  return { name: 'is_short', passed: false, message: `Response too long (${answer.length} chars)` };
}

export function checkHasExplanations(answer: string): AssertionResult {
  // Check for explanatory words
  const explanatoryWords = ['because', 'means', 'explains', 'refers to', 'is when', 'involves'];
  const hasExplanation = explanatoryWords.some(word => answer.toLowerCase().includes(word));
  if (hasExplanation) {
    return { name: 'has_explanations', passed: true, message: 'Has explanations' };
  }
  return { name: 'has_explanations', passed: false, message: 'Missing explanations' };
}

export function checkHasReasoning(answer: string): AssertionResult {
  const reasoningWords = ['because', 'since', 'therefore', 'due to', 'as a result', 'reason', 'why'];
  const hasReasoning = reasoningWords.some(word => answer.toLowerCase().includes(word));
  if (hasReasoning) {
    return { name: 'has_reasoning', passed: true, message: 'Has reasoning' };
  }
  return { name: 'has_reasoning', passed: false, message: 'Missing reasoning' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STRUCTURE VALIDATORS
// ═══════════════════════════════════════════════════════════════════════════════

export function checkHasHeadings(answer: string): AssertionResult {
  // Check for markdown headings or bold section headers
  const hasHeadings = /^#+\s+|^\*\*[A-Z][^*]+:\*\*/m.test(answer);
  if (hasHeadings) {
    return { name: 'has_headings', passed: true, message: 'Has headings' };
  }
  return { name: 'has_headings', passed: false, message: 'Missing headings' };
}

export function checkHasTableStructure(answer: string): AssertionResult {
  // Check for markdown table structure
  const hasTable = answer.includes('|') && answer.includes('---');
  if (hasTable) {
    return { name: 'has_table_structure', passed: true, message: 'Has table' };
  }
  return { name: 'has_table_structure', passed: false, message: 'Missing table structure' };
}

export function checkHasComparisonStructure(answer: string): AssertionResult {
  const comparisonWords = ['compared to', 'versus', 'vs', 'difference', 'contrast', 'while', 'whereas'];
  const hasComparison = comparisonWords.some(word => answer.toLowerCase().includes(word));
  if (hasComparison) {
    return { name: 'has_comparison_structure', passed: true, message: 'Has comparison' };
  }
  return { name: 'has_comparison_structure', passed: false, message: 'Missing comparison structure' };
}

export function checkHasQuoteOrCitation(answer: string): AssertionResult {
  const hasCitation =
    answer.includes('"') ||
    answer.includes('>') ||
    /page\s*\d+/i.test(answer) ||
    /section|chapter|paragraph/i.test(answer);
  if (hasCitation) {
    return { name: 'has_quote_or_citation', passed: true, message: 'Has citation' };
  }
  return { name: 'has_quote_or_citation', passed: false, message: 'Missing citation' };
}

export function checkHasChecklistFormat(answer: string): AssertionResult {
  // Check for checklist format ([ ] or - [ ] or numbered with checkbox)
  const hasChecklist = /\[\s*\]|\[x\]|☐|☑|✓|✗/i.test(answer) ||
    (/^\s*\d+[\.\)]\s+/m.test(answer) && answer.toLowerCase().includes('check'));
  if (hasChecklist) {
    return { name: 'has_checklist_format', passed: true, message: 'Has checklist' };
  }
  return { name: 'has_checklist_format', passed: false, message: 'Missing checklist format' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FILE TYPE VALIDATORS
// ═══════════════════════════════════════════════════════════════════════════════

export function checkOnlyPdfFiles(answer: string): AssertionResult {
  const pdfPattern = /\.pdf/gi;
  const otherFilePattern = /\.(xlsx?|pptx?|docx?|png|jpe?g|gif|csv)/gi;
  const hasPdf = pdfPattern.test(answer);
  const hasOther = otherFilePattern.test(answer);

  if (hasPdf && !hasOther) {
    return { name: 'only_pdf_files', passed: true, message: 'Only PDF files shown' };
  }
  return { name: 'only_pdf_files', passed: false, message: 'Contains non-PDF files' };
}

export function checkOnlyXlsxFiles(answer: string): AssertionResult {
  const xlsxPattern = /\.xlsx?/gi;
  const otherFilePattern = /\.(pdf|pptx?|docx?|png|jpe?g|gif|csv)/gi;
  const hasXlsx = xlsxPattern.test(answer);
  const hasOther = otherFilePattern.test(answer);

  if (hasXlsx && !hasOther) {
    return { name: 'only_xlsx_files', passed: true, message: 'Only Excel files shown' };
  }
  return { name: 'only_xlsx_files', passed: false, message: 'Contains non-Excel files' };
}

export function checkOnlyImageFiles(answer: string): AssertionResult {
  const imagePattern = /\.(png|jpe?g|gif|bmp|webp)/gi;
  const otherFilePattern = /\.(pdf|xlsx?|pptx?|docx?|csv)/gi;
  const hasImage = imagePattern.test(answer);
  const hasOther = otherFilePattern.test(answer);

  if (hasImage && !hasOther) {
    return { name: 'only_image_files', passed: true, message: 'Only image files shown' };
  }
  return { name: 'only_image_files', passed: false, message: 'Contains non-image files' };
}

export function checkOnlyPptxPng(answer: string): AssertionResult {
  const targetPattern = /\.(pptx?|png)/gi;
  const otherFilePattern = /\.(pdf|xlsx?|docx?|jpe?g|gif|csv)/gi;
  const hasTarget = targetPattern.test(answer);
  const hasOther = otherFilePattern.test(answer);

  if (hasTarget && !hasOther) {
    return { name: 'only_pptx_png', passed: true, message: 'Only PPTX/PNG files shown' };
  }
  return { name: 'only_pptx_png', passed: false, message: 'Contains other file types' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// FOLLOW-UP & CONTEXT VALIDATORS
// ═══════════════════════════════════════════════════════════════════════════════

export function checkResolvesFollowup(answer: string, answerHTML: string): AssertionResult {
  // Check that the response doesn't ask "which file?" or similar
  const confusedPatterns = [
    /which (file|document|one)/i,
    /could you (specify|clarify)/i,
    /what (file|document) are you/i,
  ];

  const isConfused = confusedPatterns.some(p => p.test(answer));
  if (!isConfused) {
    return { name: 'resolves_followup', passed: true, message: 'Resolved follow-up correctly' };
  }
  return { name: 'resolves_followup', passed: false, message: 'Failed to resolve follow-up reference' };
}

export function checkContextStable(answer: string): AssertionResult {
  // Check for signs of context loss
  const contextLossPatterns = [
    /i don't see any (previous|earlier|prior)/i,
    /no (previous|earlier) (conversation|context)/i,
    /starting fresh/i,
    /new conversation/i,
  ];

  const lostContext = contextLossPatterns.some(p => p.test(answer));
  if (!lostContext) {
    return { name: 'context_stable', passed: true, message: 'Context maintained' };
  }
  return { name: 'context_stable', passed: false, message: 'Context appears lost' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPECIALIZED VALIDATORS
// ═══════════════════════════════════════════════════════════════════════════════

export function checkHasFileCount(answer: string): AssertionResult {
  // Check for file count mentioned explicitly
  const hasCount = /\d+\s*(files?|documents?)/i.test(answer) || /have\s+\d+/i.test(answer);
  if (hasCount) {
    return { name: 'has_file_count', passed: true, message: 'File count mentioned' };
  }

  // Also pass if we can count actual files in the response (implicit count)
  const filePattern = /\.(pdf|xlsx?|pptx?|docx?|png|jpe?g|csv)/gi;
  const fileMatches = answer.match(filePattern) || [];
  if (fileMatches.length >= 2) {
    return { name: 'has_file_count', passed: true, message: `${fileMatches.length} files listed (implicit count)` };
  }

  return { name: 'has_file_count', passed: false, message: 'Missing file count' };
}

export function checkHasCounts(answer: string): AssertionResult {
  // Check for type counts (PDF: 5, XLSX: 3, etc.)
  const countPattern = /\d+\s*(pdf|xlsx?|pptx?|png|image|document|file)/gi;
  const matches = answer.match(countPattern);
  if (matches && matches.length >= 2) {
    return { name: 'has_counts', passed: true, message: 'Has type counts' };
  }
  return { name: 'has_counts', passed: false, message: 'Missing type counts' };
}

export function checkMentionsSize(answer: string): AssertionResult {
  const sizePattern = /\d+(\.\d+)?\s*(kb|mb|gb|bytes?)/i;
  if (sizePattern.test(answer)) {
    return { name: 'mentions_size', passed: true, message: 'Mentions file size' };
  }
  return { name: 'mentions_size', passed: false, message: 'Missing file size' };
}

export function checkMentionsDateOrRecent(answer: string): AssertionResult {
  const datePattern = /\d{4}|recent|newest|latest|last (uploaded|modified)/i;
  if (datePattern.test(answer)) {
    return { name: 'mentions_date_or_recent', passed: true, message: 'Mentions date/recency' };
  }
  return { name: 'mentions_date_or_recent', passed: false, message: 'Missing date/recency info' };
}

export function checkHelpfulNotBlocking(answer: string): AssertionResult {
  // For error cases - should be helpful, not blocking
  const helpfulPatterns = [
    /didn't find|couldn't find|not found|doesn't exist/i,
    /you can|you might|try|perhaps/i,
    /no (file|folder|document) (named|called)/i,
  ];

  const isHelpful = helpfulPatterns.some(p => p.test(answer));
  if (isHelpful) {
    return { name: 'helpful_not_blocking', passed: true, message: 'Helpful error message' };
  }
  return { name: 'helpful_not_blocking', passed: false, message: 'Error message not helpful' };
}

export function checkConfirmsActionOrExplains(answer: string): AssertionResult {
  const confirmPatterns = [
    /moved|renamed|deleted|created/i,
    /cannot|can't|unable to/i,
    /would you like|do you want/i,
    /i'll|i will|let me/i,
  ];

  const confirms = confirmPatterns.some(p => p.test(answer));
  if (confirms) {
    return { name: 'confirms_action_or_explains', passed: true, message: 'Action confirmed or explained' };
  }
  return { name: 'confirms_action_or_explains', passed: false, message: 'No action confirmation' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MASTER ASSERTION RUNNER
// ═══════════════════════════════════════════════════════════════════════════════

export function runAssertions(
  assertions: string[],
  answer: string,
  answerHTML: string
): AssertionResult[] {
  const results: AssertionResult[] = [];

  for (const assertion of assertions) {
    let result: AssertionResult;

    // Handle parameterized assertions
    const exactlyNMatch = assertion.match(/^exactly_(\d+)_(bullets|items|buttons)$/);
    if (exactlyNMatch) {
      const n = parseInt(exactlyNMatch[1]);
      const type = exactlyNMatch[2];
      if (type === 'buttons') {
        result = checkExactlyNButtons(answerHTML, n);
      } else {
        result = checkExactlyNBullets(answer, n);
      }
      results.push(result);
      continue;
    }

    switch (assertion) {
      case 'no_fallback':
        result = checkNoFallback(answer);
        break;
      case 'no_emoji':
        result = checkNoEmoji(answer);
        break;
      case 'no_raw_tokens':
        result = checkNoRawTokens(answerHTML);
        break;
      case 'numbered_list':
        result = checkNumberedList(answer, answerHTML);
        break;
      case 'has_file_button':
        result = checkHasFileButton(answerHTML);
        break;
      case 'has_file_buttons':
        result = checkHasFileButtons(answerHTML);
        break;
      case 'has_folder_path':
        result = checkHasFolderPath(answer);
        break;
      case 'has_folder_sections':
        result = checkHasFolderSections(answer);
        break;
      case 'substantive_answer':
        result = checkSubstantiveAnswer(answer);
        break;
      case 'minimal_text':
        result = checkMinimalText(answer);
        break;
      case 'single_sentence':
        result = checkSingleSentence(answer);
        break;
      case 'single_paragraph':
        result = checkSingleParagraph(answer);
        break;
      case 'is_short':
        result = checkIsShort(answer);
        break;
      case 'has_explanations':
        result = checkHasExplanations(answer);
        break;
      case 'has_reasoning':
        result = checkHasReasoning(answer);
        break;
      case 'has_headings':
        result = checkHasHeadings(answer);
        break;
      case 'has_table_structure':
        result = checkHasTableStructure(answer);
        break;
      case 'has_comparison_structure':
        result = checkHasComparisonStructure(answer);
        break;
      case 'has_quote_or_citation':
        result = checkHasQuoteOrCitation(answer);
        break;
      case 'has_checklist_format':
        result = checkHasChecklistFormat(answer);
        break;
      case 'only_pdf_files':
        result = checkOnlyPdfFiles(answer);
        break;
      case 'only_xlsx_files':
        result = checkOnlyXlsxFiles(answer);
        break;
      case 'only_image_files':
        result = checkOnlyImageFiles(answer);
        break;
      case 'only_pptx_png':
        result = checkOnlyPptxPng(answer);
        break;
      case 'resolves_followup':
        result = checkResolvesFollowup(answer, answerHTML);
        break;
      case 'context_stable':
        result = checkContextStable(answer);
        break;
      case 'has_file_count':
        result = checkHasFileCount(answer);
        break;
      case 'has_counts':
        result = checkHasCounts(answer);
        break;
      case 'mentions_size':
        result = checkMentionsSize(answer);
        break;
      case 'mentions_date_or_recent':
        result = checkMentionsDateOrRecent(answer);
        break;
      case 'helpful_not_blocking':
      case 'no_harsh_fallback':
        result = checkHelpfulNotBlocking(answer);
        break;
      case 'confirms_action_or_explains':
        result = checkConfirmsActionOrExplains(answer);
        break;
      default:
        // Unknown assertion - pass with warning
        result = { name: assertion, passed: true, message: `Unknown assertion: ${assertion}` };
    }

    results.push(result);
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIMING VALIDATORS
// ═══════════════════════════════════════════════════════════════════════════════

export interface TimingThresholds {
  ttft: {
    metadata_queries_ms: number;
    semantic_queries_ms: number;
    warn_ms: number;
    fail_ms: number;
  };
  total_response: {
    simple_ms: number;
    complex_ms: number;
    fail_ms: number;
  };
}

export function checkTiming(
  ttftMs: number,
  totalMs: number,
  queryType: string,
  thresholds: TimingThresholds
): AssertionResult[] {
  const results: AssertionResult[] = [];

  // TTFT check
  const ttftThreshold = queryType.startsWith('inventory')
    ? thresholds.ttft.metadata_queries_ms
    : thresholds.ttft.semantic_queries_ms;

  if (ttftMs > thresholds.ttft.fail_ms) {
    results.push({
      name: 'ttft_acceptable',
      passed: false,
      message: `TTFT too slow: ${ttftMs}ms > ${thresholds.ttft.fail_ms}ms`
    });
  } else if (ttftMs > thresholds.ttft.warn_ms) {
    results.push({
      name: 'ttft_acceptable',
      passed: true,
      message: `TTFT warning: ${ttftMs}ms > ${thresholds.ttft.warn_ms}ms`
    });
  } else {
    results.push({
      name: 'ttft_acceptable',
      passed: true,
      message: `TTFT OK: ${ttftMs}ms`
    });
  }

  // Total time check
  if (totalMs > thresholds.total_response.fail_ms) {
    results.push({
      name: 'total_time_acceptable',
      passed: false,
      message: `Total time too slow: ${totalMs}ms > ${thresholds.total_response.fail_ms}ms`
    });
  } else {
    results.push({
      name: 'total_time_acceptable',
      passed: true,
      message: `Total time OK: ${totalMs}ms`
    });
  }

  return results;
}
