/**
 * Output Generator for Answer Quality Gate Testing
 *
 * Generates simulated model outputs with various defects:
 * - Truncated outputs
 * - Dangling bullets
 * - Invalid tables
 * - Vague boilerplate
 * - Language drift
 * - Orphan markers
 * - Banned phrases
 *
 * Used to test that quality gates catch these issues.
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type OutputDefect =
  | 'truncated'
  | 'dangling_bullet'
  | 'invalid_table'
  | 'vague_boilerplate'
  | 'language_drift'
  | 'orphan_marker'
  | 'banned_phrase'
  | 'unbalanced_markdown'
  | 'excessive_newlines'
  | 'broken_list'
  | 'empty_sections'
  | 'none';

export interface GeneratedOutput {
  id: string;
  content: string;
  defects: OutputDefect[];
  expectedToPass: boolean;
  language: 'en' | 'pt';
  format: 'prose' | 'bullets' | 'table' | 'mixed';
}

// ═══════════════════════════════════════════════════════════════════════════
// GOOD OUTPUT TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

const GOOD_PROSE_OUTPUTS = [
  `The document shows a total revenue of $2.5M for Q3 2024, representing a 15% increase from the previous quarter. Operating expenses decreased by 8% due to cost optimization initiatives, resulting in an improved profit margin of 22%.`,

  `Based on the analysis, the project is currently 75% complete with an estimated delivery date of March 15, 2024. Key milestones achieved include: requirements gathering, design phase, and initial development. Remaining tasks include testing and deployment.`,

  `The annual report indicates strong financial performance across all business units. Revenue growth was driven primarily by the technology division, which saw a 25% year-over-year increase. The company maintains a healthy cash position of $50M.`,

  `According to the contract terms, the service agreement will be effective for 24 months starting from the execution date. Payment terms are net 30 days, with a 2% early payment discount available for payments within 10 days.`,
];

const GOOD_BULLET_OUTPUTS = [
  `Key findings from the report:
- Total revenue: $2.5M
- Net profit: $450K
- Operating margin: 18%
- Employee count: 125
- Customer satisfaction: 92%`,

  `The document covers the following topics:
- Executive summary
- Financial highlights
- Risk factors
- Market analysis
- Future outlook`,

  `Action items from the meeting:
- Complete budget review by Friday
- Schedule follow-up with stakeholders
- Prepare presentation for board meeting
- Update project timeline`,
];

const GOOD_TABLE_OUTPUTS = [
  `| Metric | Q1 2024 | Q2 2024 | Q3 2024 |
|--------|---------|---------|---------|
| Revenue | $1.8M | $2.1M | $2.5M |
| Expenses | $1.2M | $1.3M | $1.4M |
| Profit | $600K | $800K | $1.1M |`,

  `| Document | Type | Pages | Last Modified |
|----------|------|-------|---------------|
| Annual Report | PDF | 45 | 2024-01-15 |
| Budget 2024 | XLSX | 12 | 2024-01-20 |
| Project Plan | DOCX | 28 | 2024-01-18 |`,
];

const GOOD_MIXED_OUTPUTS = [
  `The financial summary shows the following metrics:

| Category | Amount |
|----------|--------|
| Revenue | $2.5M |
| Expenses | $1.8M |
| Net Profit | $700K |

Key observations:
- Revenue increased by 15%
- Expenses remained stable
- Profit margin improved to 28%`,
];

// ═══════════════════════════════════════════════════════════════════════════
// DEFECT TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

const TRUNCATED_OUTPUTS = [
  `The document shows a total revenue of $2.5M for Q3 2024, representing a 15% increase from the previous quarter. Operating expenses decreas`,
  `Based on the analysis, the key findings are:
- Revenue increased by 15%
- Expenses decreased by 8%
- Profit margin improved to`,
  `| Metric | Q1 | Q2 |
|--------|----|----|
| Revenue | $1.8M | $2`,
  `The annual report indicates that the company achieved significant growth in`,
  `According to the contract, payment terms are net 30 days with a`,
  `The budget allocation for Q4 shows:
- Marketing: $500K
- R&D: $`,
  `The key performance indicators include revenue of`,
  `Summary of findings: The data shows a clear trend toward`,
  `Based on the financial statements, total assets are`,
  `The project timeline indicates completion by March 15, 2024, with remaining tasks including testing and`,
];

const DANGLING_BULLET_OUTPUTS = [
  `Key findings:
- Revenue: $2.5M
- Expenses: $1.8M
- `,
  `The report covers:
- Executive summary
- Financial highlights
-`,
  `Action items:
1. Complete review
2. Schedule meeting
3.`,
];

const INVALID_TABLE_OUTPUTS = [
  `| Metric | Value |
| Revenue | $2.5M |
| Expenses | $1.8M`,
  `| Col1 | Col2 | Col3
|------|------|------
| A | B | C |`,
  `Metric | Value
Revenue | $2.5M
Expenses | $1.8M`,
];

const VAGUE_BOILERPLATE_OUTPUTS = [
  `I don't have enough information to provide a complete answer to your question. Could you please provide more context?`,
  `As an AI assistant, I'm unable to access external documents directly. However, I can help you understand general concepts related to your query.`,
  `I apologize, but I cannot determine the specific information you're looking for without more details. Please clarify your question.`,
  `I'm not able to provide that information. It depends on many factors that would need to be considered.`,
  `I would need more context to answer this question properly. The answer could vary depending on the specific circumstances.`,
  `Unfortunately, I cannot help with that request. The information you're asking about isn't available to me.`,
  `I'm sorry, but I don't have access to real-time data. Without more details, I can't provide a specific answer.`,
  `As a language model, I'm unable to access external systems or databases directly.`,
  `I can't access that information. Could you please clarify what specific details you need?`,
  `Without additional context about your requirements, it's difficult to give you a precise answer.`,
  `I must inform you that I don't have the ability to access live data or external documents.`,
  `Please specify what you're looking for. I need more information to help you effectively.`,
];

const LANGUAGE_DRIFT_OUTPUTS_EN_TO_PT = [
  `The revenue shows a 15% increase. Isso representa um crescimento significativo em relação ao período anterior.`,
  `Based on the document, the key metrics are: receita total de $2.5M e despesas de $1.8M.`,
  `The report indicates strong performance. Os principais pontos são: crescimento, eficiência e rentabilidade.`,
];

const ORPHAN_MARKER_OUTPUTS = [
  `The revenue is $2.5M [[DOC_1]] and expenses are $1.8M. The profit margin is 28% [[DOC_`,
  `Based on [[DOC_1_P3]] the total is $500K. See also [[DOC_2_P for more details.`,
  `Key findings from DOC_1]]: Revenue increased by 15%.`,
  `According to the document [[DOC_3_P the figures are correct.`,
  `The data shows DOC_2]] a clear increase in revenue.`,
  `See [[DOC_ for more information on this topic.`,
  `The summary indicates [[DOC_1]] good performance but [[DOC_`,
  `Reference: DOC_5]] contains the full details.`,
  `As mentioned in [[DOC_2_P15 the timeline is adjusted.`,
  `The contract DOC_4]] specifies payment terms of net 30.`,
];

const BANNED_PHRASE_OUTPUTS = [
  `As a large language model, I can tell you that the revenue is $2.5M.`,
  `I'm sorry, but I cannot help with that request. However, the document shows...`,
  `Unfortunately, I don't have the ability to access real-time data, but based on the document...`,
  `I must inform you that as an AI, I have limitations, but the report indicates...`,
];

const UNBALANCED_MARKDOWN_OUTPUTS = [
  `The **revenue is $2.5M and the expenses are $1.8M. The profit margin is 28%.`,
  `Key findings:
- Revenue: **$2.5M
- Expenses: $1.8M**`,
  `The document shows *strong performance with 15% growth.`,
];

const EXCESSIVE_NEWLINES_OUTPUTS = [
  `The revenue is $2.5M.



The expenses are $1.8M.




The profit margin is 28%.`,
  `Key findings:


- Revenue: $2.5M


- Expenses: $1.8M`,
];

const BROKEN_LIST_OUTPUTS = [
  `The key points are:
-Revenue: $2.5M
- Expenses: $1.8M
-Profit: $700K`,
  `Action items:
1.Complete review
2. Schedule meeting
3.Prepare presentation`,
];

const EMPTY_SECTION_OUTPUTS = [
  `## Summary

## Key Findings
- Revenue: $2.5M

## Conclusion
`,
  `The report covers:

**Section 1:**

**Section 2:**
- Item A
- Item B

**Section 3:**
`,
];

// ═══════════════════════════════════════════════════════════════════════════
// GENERATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateGoodOutput(): GeneratedOutput {
  const formats = ['prose', 'bullets', 'table', 'mixed'] as const;
  const format = pickRandom(formats);

  let content: string;
  switch (format) {
    case 'prose':
      content = pickRandom(GOOD_PROSE_OUTPUTS);
      break;
    case 'bullets':
      content = pickRandom(GOOD_BULLET_OUTPUTS);
      break;
    case 'table':
      content = pickRandom(GOOD_TABLE_OUTPUTS);
      break;
    case 'mixed':
      content = pickRandom(GOOD_MIXED_OUTPUTS);
      break;
  }

  return {
    id: `good-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    content,
    defects: ['none'],
    expectedToPass: true,
    language: 'en',
    format,
  };
}

function generateDefectiveOutput(defect: OutputDefect): GeneratedOutput {
  let content: string;
  let format: 'prose' | 'bullets' | 'table' | 'mixed' = 'prose';

  switch (defect) {
    case 'truncated':
      content = pickRandom(TRUNCATED_OUTPUTS);
      format = content.includes('|') ? 'table' : content.includes('-') ? 'bullets' : 'prose';
      break;
    case 'dangling_bullet':
      content = pickRandom(DANGLING_BULLET_OUTPUTS);
      format = 'bullets';
      break;
    case 'invalid_table':
      content = pickRandom(INVALID_TABLE_OUTPUTS);
      format = 'table';
      break;
    case 'vague_boilerplate':
      content = pickRandom(VAGUE_BOILERPLATE_OUTPUTS);
      format = 'prose';
      break;
    case 'language_drift':
      content = pickRandom(LANGUAGE_DRIFT_OUTPUTS_EN_TO_PT);
      format = 'prose';
      break;
    case 'orphan_marker':
      content = pickRandom(ORPHAN_MARKER_OUTPUTS);
      format = 'prose';
      break;
    case 'banned_phrase':
      content = pickRandom(BANNED_PHRASE_OUTPUTS);
      format = 'prose';
      break;
    case 'unbalanced_markdown':
      content = pickRandom(UNBALANCED_MARKDOWN_OUTPUTS);
      format = content.includes('-') ? 'bullets' : 'prose';
      break;
    case 'excessive_newlines':
      content = pickRandom(EXCESSIVE_NEWLINES_OUTPUTS);
      format = content.includes('-') ? 'bullets' : 'prose';
      break;
    case 'broken_list':
      content = pickRandom(BROKEN_LIST_OUTPUTS);
      format = 'bullets';
      break;
    case 'empty_sections':
      content = pickRandom(EMPTY_SECTION_OUTPUTS);
      format = 'mixed';
      break;
    default:
      return generateGoodOutput();
  }

  return {
    id: `defect-${defect}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    content,
    defects: [defect],
    expectedToPass: false,
    language: defect === 'language_drift' ? 'pt' : 'en',
    format,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// BATCH GENERATION
// ═══════════════════════════════════════════════════════════════════════════

export interface OutputGenerationConfig {
  count: number;
  /** Distribution of defect types (0-1 for each) */
  defectDistribution: {
    good: number;
    truncated: number;
    dangling_bullet: number;
    invalid_table: number;
    vague_boilerplate: number;
    language_drift: number;
    orphan_marker: number;
    banned_phrase: number;
    unbalanced_markdown: number;
    excessive_newlines: number;
    broken_list: number;
    empty_sections: number;
  };
}

const DEFAULT_OUTPUT_CONFIG: OutputGenerationConfig = {
  count: 20000,
  defectDistribution: {
    good: 0.50,              // 50% good outputs
    truncated: 0.05,         // 5% truncated
    dangling_bullet: 0.05,   // 5% dangling bullets
    invalid_table: 0.04,     // 4% invalid tables
    vague_boilerplate: 0.08, // 8% vague/boilerplate
    language_drift: 0.04,    // 4% language drift
    orphan_marker: 0.04,     // 4% orphan markers
    banned_phrase: 0.06,     // 6% banned phrases
    unbalanced_markdown: 0.04, // 4% unbalanced markdown
    excessive_newlines: 0.04,  // 4% excessive newlines
    broken_list: 0.03,       // 3% broken lists
    empty_sections: 0.03,    // 3% empty sections
  },
};

export function generateOutputBatch(
  config: Partial<OutputGenerationConfig> = {}
): GeneratedOutput[] {
  const fullConfig = { ...DEFAULT_OUTPUT_CONFIG, ...config };
  const outputs: GeneratedOutput[] = [];
  const dist = fullConfig.defectDistribution;

  const defectTypes: { type: OutputDefect | 'good'; weight: number }[] = [
    { type: 'good', weight: dist.good },
    { type: 'truncated', weight: dist.truncated },
    { type: 'dangling_bullet', weight: dist.dangling_bullet },
    { type: 'invalid_table', weight: dist.invalid_table },
    { type: 'vague_boilerplate', weight: dist.vague_boilerplate },
    { type: 'language_drift', weight: dist.language_drift },
    { type: 'orphan_marker', weight: dist.orphan_marker },
    { type: 'banned_phrase', weight: dist.banned_phrase },
    { type: 'unbalanced_markdown', weight: dist.unbalanced_markdown },
    { type: 'excessive_newlines', weight: dist.excessive_newlines },
    { type: 'broken_list', weight: dist.broken_list },
    { type: 'empty_sections', weight: dist.empty_sections },
  ];

  for (let i = 0; i < fullConfig.count; i++) {
    const rand = Math.random();
    let cumulative = 0;
    let selectedType: OutputDefect | 'good' = 'good';

    for (const { type, weight } of defectTypes) {
      cumulative += weight;
      if (rand < cumulative) {
        selectedType = type;
        break;
      }
    }

    if (selectedType === 'good') {
      outputs.push(generateGoodOutput());
    } else {
      outputs.push(generateDefectiveOutput(selectedType));
    }
  }

  return outputs;
}

// ═══════════════════════════════════════════════════════════════════════════
// STATISTICS
// ═══════════════════════════════════════════════════════════════════════════

export function getOutputStats(outputs: GeneratedOutput[]): {
  total: number;
  good: number;
  defective: number;
  byDefect: Record<string, number>;
  byFormat: Record<string, number>;
} {
  const stats = {
    total: outputs.length,
    good: 0,
    defective: 0,
    byDefect: {} as Record<string, number>,
    byFormat: {} as Record<string, number>,
  };

  for (const output of outputs) {
    if (output.expectedToPass) {
      stats.good++;
    } else {
      stats.defective++;
    }

    for (const defect of output.defects) {
      stats.byDefect[defect] = (stats.byDefect[defect] || 0) + 1;
    }

    stats.byFormat[output.format] = (stats.byFormat[output.format] || 0) + 1;
  }

  return stats;
}

// ═══════════════════════════════════════════════════════════════════════════
// QUALITY GATE VALIDATORS
// ═══════════════════════════════════════════════════════════════════════════

export interface ValidationResult {
  passed: boolean;
  failures: string[];
}

export function validateOutput(output: GeneratedOutput): ValidationResult {
  const failures: string[] = [];

  // Check for truncation
  if (isTruncated(output.content)) {
    failures.push('TRUNCATED');
  }

  // Check for dangling bullets
  if (hasDanglingBullet(output.content)) {
    failures.push('DANGLING_BULLET');
  }

  // Check for invalid tables
  if (hasInvalidTable(output.content)) {
    failures.push('INVALID_TABLE');
  }

  // Check for vague boilerplate
  if (hasVagueBoilerplate(output.content)) {
    failures.push('VAGUE_BOILERPLATE');
  }

  // Check for orphan markers
  if (hasOrphanMarker(output.content)) {
    failures.push('ORPHAN_MARKER');
  }

  // Check for banned phrases
  if (hasBannedPhrase(output.content)) {
    failures.push('BANNED_PHRASE');
  }

  // Check for language drift
  if (hasLanguageDrift(output.content)) {
    failures.push('LANGUAGE_DRIFT');
  }

  // Check for unbalanced markdown
  if (hasUnbalancedMarkdown(output.content)) {
    failures.push('UNBALANCED_MARKDOWN');
  }

  // Check for excessive newlines
  if (hasExcessiveNewlines(output.content)) {
    failures.push('EXCESSIVE_NEWLINES');
  }

  // Check for broken lists
  if (hasBrokenList(output.content)) {
    failures.push('BROKEN_LIST');
  }

  // Check for empty sections
  if (hasEmptySections(output.content)) {
    failures.push('EMPTY_SECTIONS');
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

// Individual validators
function isTruncated(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length === 0) return true;

  // Get the last line for analysis
  const lines = trimmed.split('\n');
  const lastLine = lines[lines.length - 1].trim();

  // ═══════════════════════════════════════════════════════════════════════════
  // VALID ENDINGS - These are NOT truncated
  // ═══════════════════════════════════════════════════════════════════════════

  // Valid sentence/phrase endings
  if (/[.!?]$/.test(trimmed)) return false;

  // Closing brackets/quotes
  if (/[)\]}"']$/.test(trimmed)) return false;

  // Percentage
  if (/\d+%$/.test(trimmed)) return false;

  // Currency with unit (e.g., $2.5M, $450K)
  if (/\$[\d,.]+[MKBk]$/.test(trimmed)) return false;

  // Date format (YYYY-MM-DD or MM/DD/YYYY)
  if (/\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;
  if (/\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) return false;

  // Table row ending with pipe
  if (/\|$/.test(lastLine)) return false;

  // Bullet list item with complete content (ends with word, not preposition or incomplete value)
  if (/^[-*•]\s+\S+.*\S$/.test(lastLine)) {
    // Check last word isn't a preposition/article or incomplete
    const lastWord = lastLine.split(/\s+/).pop() || '';
    const incompleteWords = ['to', 'the', 'a', 'an', 'of', 'in', 'for', 'with', 'and', 'or', 'but', 'is', 'was', 'are', 'were', 'be'];
    const incompleteEndings = ['$', ':', '(', '[', '{', '-'];
    if (incompleteWords.includes(lastWord.toLowerCase()) || incompleteEndings.includes(lastWord)) {
      // This is NOT a valid ending - continue to truncation checks
    } else {
      return false;
    }
  }

  // Numbered list item with complete content
  if (/^\d+[.)]\s+\S+.*\S$/.test(lastLine)) {
    const lastWord = lastLine.split(/\s+/).pop() || '';
    const incompleteWords = ['to', 'the', 'a', 'an', 'of', 'in', 'for', 'with', 'and', 'or', 'but', 'is', 'was', 'are', 'were', 'be'];
    const incompleteEndings = ['$', ':', '(', '[', '{', '-'];
    if (incompleteWords.includes(lastWord.toLowerCase()) || incompleteEndings.includes(lastWord)) {
      // This is NOT a valid ending - continue to truncation checks
    } else {
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRUNCATION PATTERNS - These ARE truncated
  // ═══════════════════════════════════════════════════════════════════════════

  // Ends with common prepositions/articles (clearly mid-sentence)
  if (/\s(to|the|a|an|of|in|for|is|was|are|were|be|been|being|with|and|or|but)$/i.test(trimmed)) {
    return true;
  }

  // Ends with incomplete currency ($ followed by number without unit, or just $)
  if (/\$\d*$/.test(trimmed) && !/\$[\d,.]+[MKBk]$/.test(trimmed)) {
    return true;
  }

  // Ends with "toward" or similar prepositions that indicate incomplete sentence
  if (/\b(toward|towards|into|onto|upon|about|through|during|within|without|between|among|against|across|behind|beyond)$/i.test(trimmed)) {
    return true;
  }

  // Ends with incomplete value indicators (like "R&D: $")
  if (/[:]\s*\$\s*$/.test(trimmed)) {
    return true;
  }

  // Ends with just a colon (label without value)
  if (/:\s*$/.test(trimmed)) {
    return true;
  }

  // Ends with comma (mid-list or mid-sentence)
  if (/,$/.test(trimmed)) {
    return true;
  }

  // Table with incomplete row
  if (trimmed.includes('|')) {
    // Check if last table row has fewer pipes than header
    const tableLines = lines.filter(l => l.includes('|'));
    if (tableLines.length >= 2) {
      const headerPipes = (tableLines[0].match(/\|/g) || []).length;
      const lastRowPipes = (tableLines[tableLines.length - 1].match(/\|/g) || []).length;
      if (lastRowPipes < headerPipes && !tableLines[tableLines.length - 1].trim().endsWith('|')) {
        return true;
      }
    }
  }

  // Ends mid-word pattern: partial word after recognizable text
  // Only trigger on clear partial words like "decreas" (no valid English word ends this way)
  const partialWordPatterns = [
    /\s[a-z]{2,6}s$/,  // Words ending in 's' that are likely partial (e.g., "decreas")
    /\s[a-z]{2,6}t$/,  // Words ending in 't' that are likely partial
    /\s[a-z]{2,6}n$/,  // Words ending in 'n' that are likely partial
  ];

  // Be conservative - only flag obvious mid-word truncation
  for (const pattern of partialWordPatterns) {
    if (pattern.test(trimmed)) {
      const lastWord = trimmed.split(/\s+/).pop() || '';
      // Common complete words ending in these letters - don't flag
      const completeWords = ['items', 'years', 'days', 'results', 'reports', 'highlights', 'factors',
        'analysis', 'findings', 'metrics', 'tasks', 'updates', 'meetings', 'stakeholders',
        'project', 'budget', 'client', 'account', 'payment', 'percent', 'different', 'important',
        'deployment', 'development', 'improvement', 'management', 'assessment', 'document',
        'timeline', 'outline', 'deadline', 'guideline', 'pipeline', 'baseline',
        'margin', 'origin', 'design', 'begin', 'certain', 'obtain', 'contain', 'maintain',
        'outlook', 'breakdown', 'overview', 'review', 'interview', 'preview'];
      if (!completeWords.includes(lastWord.toLowerCase())) {
        // Check if it looks like a real truncation
        if (lastWord.length < 8 && !/[aeiou]$/.test(lastWord)) {
          // Likely truncated - short word ending in consonant cluster
          return true;
        }
      }
    }
  }

  return false;
}

function hasDanglingBullet(content: string): boolean {
  // Bullet or number followed by nothing or just whitespace
  if (/^[\s]*[-*•]\s*$/m.test(content) || /^\d+[.)]\s*$/m.test(content)) {
    return true;
  }

  // Bullet at end of content with only whitespace after
  if (/[-*•]\s*$/.test(content.trim())) {
    return true;
  }

  // Numbered item at end with no content
  if (/\d+[.)]\s*$/.test(content.trim())) {
    return true;
  }

  // Line ending with just a bullet/dash and maybe whitespace
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^[-*•]$/.test(trimmed) || /^\d+[.)]$/.test(trimmed)) {
      return true;
    }
  }

  return false;
}

function hasInvalidTable(content: string): boolean {
  const lines = content.split('\n');
  const tableLines: string[] = [];

  for (const line of lines) {
    if (line.includes('|')) {
      tableLines.push(line.trim());
    }
  }

  if (tableLines.length === 0) return false;

  // Check for separator row (should be second line)
  if (tableLines.length >= 2) {
    const separatorLine = tableLines[1];
    if (!/^[\|]?[-:\s|]+[\|]?$/.test(separatorLine)) {
      // Second line is not a valid separator
      return true;
    }
  } else if (tableLines.length === 1) {
    // Single table row with no separator
    return true;
  }

  // Check for inconsistent pipe counts (including leading/trailing)
  const headerPipeCount = (tableLines[0].match(/\|/g) || []).length;
  const headerHasLeading = tableLines[0].startsWith('|');
  const headerHasTrailing = tableLines[0].endsWith('|');

  for (let i = 2; i < tableLines.length; i++) {
    const line = tableLines[i];
    const linePipeCount = (line.match(/\|/g) || []).length;
    const lineHasLeading = line.startsWith('|');
    const lineHasTrailing = line.endsWith('|');

    // Check for inconsistent structure
    if (lineHasLeading !== headerHasLeading || lineHasTrailing !== headerHasTrailing) {
      return true;
    }

    // Check for mismatched pipe counts
    if (linePipeCount !== headerPipeCount) {
      return true;
    }
  }

  // Check if table ends abruptly (incomplete row)
  const lastLine = tableLines[tableLines.length - 1];
  if (tableLines.length > 2) {
    // Compare last row with header for completeness
    const lastPipeCount = (lastLine.match(/\|/g) || []).length;
    if (lastPipeCount < headerPipeCount) {
      return true;
    }
  }

  return false;
}

function hasVagueBoilerplate(content: string): boolean {
  const patterns = [
    // Information requests
    /\bI don['']t have enough information\b/i,
    /\bwithout more (details|context|information)\b/i,
    /\bI would need more (context|details|information)\b/i,
    /\bcould you (please )?(clarify|provide|specify)\b/i,
    /\bplease (clarify|provide|specify)\b/i,
    /\bneed more (context|details|specifics)\b/i,

    // AI self-reference
    /\bas an AI\b/i,
    /\bas a (large )?language model\b/i,
    /\bI['']m (just )?an AI\b/i,

    // Inability statements
    /\bI['']m unable to\b/i,
    /\bI cannot (provide|determine|access|help)\b/i,
    /\bI['']m not able to\b/i,
    /\bI don['']t have (the )?ability\b/i,
    /\bI can['']t (access|provide|determine)\b/i,

    // Apologies and hedging
    /\bI apologize\b/i,
    /\bI['']m sorry,? but\b/i,
    /\bUnfortunately,? I\b/i,
    /\bI must inform you\b/i,

    // Generic hedging
    /\bit depends on many factors\b/i,
    /\bthe answer could vary\b/i,
    /\bdepending on the specific circumstances\b/i,
    /\bwithout (additional|more) (context|information)\b/i,

    // External access limitations
    /\bunable to access external\b/i,
    /\bcan['']t access (external|real-time)\b/i,
    /\bdon['']t have access to\b/i,
  ];

  return patterns.some(p => p.test(content));
}

function hasOrphanMarker(content: string): boolean {
  // Incomplete opening markers: [[DOC_ without closing ]]
  if (/\[\[DOC_\d*(?![^\[]*\]\])/.test(content)) {
    // Check for unclosed markers
    const openMarkers = content.match(/\[\[DOC_/g) || [];
    const closeMarkers = content.match(/\]\]/g) || [];
    if (openMarkers.length !== closeMarkers.length) {
      return true;
    }
  }

  // Incomplete markers at end of content or line
  if (/\[\[DOC_\d*[^_\]]*$/m.test(content)) {
    return true;
  }

  // Incomplete page reference: [[DOC_1_P without full number
  if (/\[\[DOC_\d+_P\d*(?!\d*\]\])/.test(content)) {
    return true;
  }

  // Orphan closing markers without opening: DOC_1]] without [[
  if (/(?<!\[\[)DOC_\d+\]\]/.test(content)) {
    return true;
  }

  // Malformed markers: DOC_ followed by ]]
  if (/DOC_\d*\]\]/.test(content) && !/\[\[DOC_\d*\]\]/.test(content)) {
    return true;
  }

  // Markers with missing parts
  if (/\[\[DOC_\]/.test(content) || /\[DOC_\d+\](?!\])/.test(content)) {
    return true;
  }

  return false;
}

function hasBannedPhrase(content: string): boolean {
  const bannedPhrases = [
    /\bas a (large )?language model\b/i,
    /\bI['']m sorry,? but I cannot\b/i,
    /\bI don['']t have the ability\b/i,
    /\bas an AI( assistant)?\b/i,
    /\bI must inform you\b/i,
    /\bUnfortunately,? I\b/i,
  ];

  return bannedPhrases.some(p => p.test(content));
}

function hasUnbalancedMarkdown(content: string): boolean {
  // Count bold markers
  const boldMarkers = (content.match(/\*\*/g) || []).length;
  if (boldMarkers % 2 !== 0) return true;

  // Count italic markers (excluding bold)
  const contentWithoutBold = content.replace(/\*\*/g, '');
  const italicMarkers = (contentWithoutBold.match(/\*/g) || []).length;
  if (italicMarkers % 2 !== 0) return true;

  return false;
}

function hasExcessiveNewlines(content: string): boolean {
  // More than 2 consecutive newlines (3+ blank lines)
  // Count sequences of newlines
  if (/\n{4,}/.test(content)) {
    return true;
  }
  // Also catch 3 newlines (2 blank lines) as excessive
  if (/\n{3,}/.test(content)) {
    return true;
  }
  // Check for multiple instances of double blank lines
  const doubleBlankCount = (content.match(/\n\n\n/g) || []).length;
  if (doubleBlankCount >= 2) {
    return true;
  }
  return false;
}

function hasLanguageDrift(content: string): boolean {
  // Detect mixed languages (English + Portuguese/Spanish)
  // Portuguese/Spanish indicators
  const nonEnglishPatterns = [
    /\b(são|está|isso|também|não|porque|através|além|após|então|quando|onde|como|mais|muito|já|ainda|aqui|agora)\b/i,
    /\b(crescimento|eficiência|rentabilidade|receita|despesas|principais|período|anterior|representa|significativo)\b/i,
    /\b(total|documento|dados|informações|resultados|análise|relatório)\s+de\b/i,
    /\bOs\s+principais\b/i,
    /\b(em|de|da|do|dos|das|para|pelo|pela|com)\s+[a-záéíóúâêôãõç]+/i,
    /[áéíóúâêôãõç]/,  // Portuguese/Spanish accented characters
  ];

  // Check if content has both English AND non-English patterns
  const hasEnglish = /\b(the|is|are|was|were|have|has|been|being|this|that|which|what|where|when|how|from|into|about|with)\b/i.test(content);
  const hasNonEnglish = nonEnglishPatterns.some(p => p.test(content));

  // If both present, it's a language drift
  return hasEnglish && hasNonEnglish;
}

function hasBrokenList(content: string): boolean {
  // Bullet/number directly attached to text without space
  return /^[-*•]\S/m.test(content) || /^\d+[.)]\S/m.test(content);
}

function hasEmptySections(content: string): boolean {
  // Header followed immediately by another header or end
  return /^#{1,3}\s+.+\n\s*\n#{1,3}\s+/m.test(content) ||
         /^\*\*.+\*\*:?\s*\n\s*\n\*\*/m.test(content) ||
         /^#{1,3}\s+.+\n\s*$/m.test(content);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export {
  generateGoodOutput,
  generateDefectiveOutput,
  isTruncated,
  hasDanglingBullet,
  hasInvalidTable,
  hasVagueBoilerplate,
  hasOrphanMarker,
  hasBannedPhrase,
  hasUnbalancedMarkdown,
  hasExcessiveNewlines,
  hasBrokenList,
  hasEmptySections,
  hasLanguageDrift,
};
