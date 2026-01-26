/**
 * Completion Gate Service - Pre-Done Validator
 *
 * Single point of validation before done events are emitted.
 * Catches truncation, dangling markers, constraint violations, and ensures
 * complete responses are sent to the frontend.
 */

import { TruncationDetectorService } from '../utils/truncationDetector.service';

export interface CompletionValidation {
  valid: boolean;
  issues: CompletionIssue[];
  repairs: RepairAction[];
  repairedText?: string;
}

export interface CompletionIssue {
  type: 'TRUNCATION' | 'DANGLING_MARKER' | 'EMPTY_CONTENT' | 'HEADER_ONLY' | 'MISSING_BUTTONS' | 'CONSTRAINT_VIOLATION' | 'BULLET_COUNT' | 'SENTENCE_COUNT';
  severity: 'error' | 'warning';
  description: string;
  location?: string;
}

export interface FormatConstraints {
  bulletCount?: number;
  maxSentences?: number;
  minSentences?: number;
  format?: 'bullets' | 'numbered' | 'paragraph' | 'table';
  maxLength?: number;
}

export interface RepairAction {
  type: string;
  description: string;
  applied: boolean;
}

export interface DoneEventPayload {
  fullAnswer: string;
  formatted?: string;
  intent: string;
  confidence?: number;
  sourceButtons?: { buttons?: Array<{ documentId: string }> } | null;
  constraints?: { buttonsOnly?: boolean; maxItems?: number };
  attachments?: Array<{ id: string; filename: string }>;
  fileList?: { items?: Array<{ documentId: string }> };
  formatConstraints?: FormatConstraints;
}

export class CompletionGateService {
  private readonly truncationDetector: TruncationDetectorService;
  private readonly logger: Console;

  constructor(deps?: { truncationDetector?: TruncationDetectorService; logger?: Console }) {
    this.truncationDetector = deps?.truncationDetector || new TruncationDetectorService();
    this.logger = deps?.logger || console;
  }

  /**
   * Main validation entry point - call before emitting done event
   */
  validateBeforeEmit(payload: DoneEventPayload): CompletionValidation {
    const issues: CompletionIssue[] = [];
    const repairs: RepairAction[] = [];
    let repairedText = payload.fullAnswer;

    // ═══════════════════════════════════════════════════════════════════════════
    // CHECK 1: Truncation Detection (trailing ..., incomplete markers)
    // ═══════════════════════════════════════════════════════════════════════════
    const truncationResult = this.truncationDetector.detectTruncation(repairedText);
    if (truncationResult.isTruncated) {
      issues.push({
        type: 'TRUNCATION',
        severity: truncationResult.confidence === 'high' ? 'error' : 'warning',
        description: truncationResult.reasons.join(', '),
      });

      // Attempt repair
      const repairResult = this.truncationDetector.repairTruncation(repairedText);
      if (repairResult.wasRepaired) {
        repairedText = repairResult.repaired;
        repairs.push({
          type: 'TRUNCATION_REPAIR',
          description: repairResult.repairs.join(', '),
          applied: true,
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CHECK 2: Dangling Markdown Markers
    // ═══════════════════════════════════════════════════════════════════════════
    const markdownIssues = this.checkDanglingMarkers(repairedText);
    if (markdownIssues.issues.length > 0) {
      issues.push(...markdownIssues.issues);
      repairedText = markdownIssues.repaired;
      repairs.push(...markdownIssues.repairs);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CHECK 3: Empty or Header-Only Content
    // ═══════════════════════════════════════════════════════════════════════════
    const headerOnlyCheck = this.checkHeaderOnly(repairedText, payload);
    if (headerOnlyCheck.issue) {
      issues.push(headerOnlyCheck.issue);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CHECK 4: Button-Only Constraint Validation
    // ═══════════════════════════════════════════════════════════════════════════
    if (payload.constraints?.buttonsOnly) {
      const hasButtons = payload.sourceButtons?.buttons && payload.sourceButtons.buttons.length > 0;
      const hasFileList = payload.fileList?.items && payload.fileList.items.length > 0;
      const hasAttachments = payload.attachments && payload.attachments.length > 0;

      if (!hasButtons && !hasFileList && !hasAttachments) {
        issues.push({
          type: 'MISSING_BUTTONS',
          severity: 'error',
          description: 'Button-only response has no buttons, fileList, or attachments',
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CHECK 5: Dangling DOC Markers
    // ═══════════════════════════════════════════════════════════════════════════
    const docMarkerCheck = this.checkDanglingDocMarkers(repairedText);
    if (docMarkerCheck.issues.length > 0) {
      issues.push(...docMarkerCheck.issues);
      repairedText = docMarkerCheck.repaired;
      repairs.push(...docMarkerCheck.repairs);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CHECK 6: CHATGPT-LIKE Preamble Suppression
    // Strips "Here are / I found / Below are" from document answers (not help/clarify)
    // ═══════════════════════════════════════════════════════════════════════════
    if (payload.intent !== 'help' && payload.intent !== 'error') {
      const preambleResult = this.stripPreamble(repairedText);
      if (preambleResult.wasStripped) {
        repairedText = preambleResult.text;
        repairs.push({
          type: 'PREAMBLE_STRIPPED',
          description: `Removed preamble: "${preambleResult.stripped}"`,
          applied: true,
        });
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CHECK 7: Format Constraint Enforcement
    // Validates and enforces bullet counts, sentence limits, etc.
    // ═══════════════════════════════════════════════════════════════════════════
    if (payload.formatConstraints) {
      const constraintResult = this.enforceFormatConstraints(repairedText, payload.formatConstraints);
      if (constraintResult.issues.length > 0) {
        issues.push(...constraintResult.issues);
      }
      if (constraintResult.repaired !== repairedText) {
        repairedText = constraintResult.repaired;
        repairs.push(...constraintResult.repairs);
      }
    }

    // Log issues for debugging
    if (issues.length > 0) {
      this.logger.warn('[CompletionGate] Issues detected:', {
        issueCount: issues.length,
        types: issues.map(i => i.type),
        repairCount: repairs.length,
      });
    }

    return {
      valid: !issues.some(i => i.severity === 'error'),
      issues,
      repairs,
      repairedText: repairedText !== payload.fullAnswer ? repairedText : undefined,
    };
  }

  /**
   * Check for dangling markdown markers and repair them
   */
  private checkDanglingMarkers(text: string): { issues: CompletionIssue[]; repaired: string; repairs: RepairAction[] } {
    const issues: CompletionIssue[] = [];
    const repairs: RepairAction[] = [];
    let repaired = text;

    // Check bold markers (**)
    const boldCount = (repaired.match(/\*\*/g) || []).length;
    if (boldCount % 2 !== 0) {
      issues.push({
        type: 'DANGLING_MARKER',
        severity: 'warning',
        description: 'Unclosed bold marker (**)',
      });
      repaired = repaired + '**';
      repairs.push({ type: 'CLOSE_BOLD', description: 'Added closing **', applied: true });
    }

    // Check code fences (```)
    const fenceCount = (repaired.match(/```/g) || []).length;
    if (fenceCount % 2 !== 0) {
      issues.push({
        type: 'DANGLING_MARKER',
        severity: 'warning',
        description: 'Unclosed code fence (```)',
      });
      repaired = repaired + '\n```';
      repairs.push({ type: 'CLOSE_CODE_FENCE', description: 'Added closing ```', applied: true });
    }

    // Check inline code (`)
    const backtickCount = (repaired.match(/(?<!`)`(?!`)/g) || []).length;
    if (backtickCount % 2 !== 0) {
      issues.push({
        type: 'DANGLING_MARKER',
        severity: 'warning',
        description: 'Unclosed inline code (`)',
      });
      repaired = repaired + '`';
      repairs.push({ type: 'CLOSE_BACKTICK', description: 'Added closing `', applied: true });
    }

    // Check unclosed table rows
    const lines = repaired.split('\n');
    const lastLine = lines[lines.length - 1];
    if (lastLine.includes('|') && !lastLine.trim().endsWith('|')) {
      issues.push({
        type: 'DANGLING_MARKER',
        severity: 'warning',
        description: 'Incomplete table row',
      });
      lines[lines.length - 1] = lastLine + ' |';
      repaired = lines.join('\n');
      repairs.push({ type: 'CLOSE_TABLE_ROW', description: 'Added closing |', applied: true });
    }

    return { issues, repaired, repairs };
  }

  /**
   * Check for header-only responses (e.g., "You have 30 files:" without listing them)
   */
  private checkHeaderOnly(text: string, payload: DoneEventPayload): { issue?: CompletionIssue } {
    const trimmed = text.trim();

    // Pattern: "You have X file(s):" without any file content after
    const headerPattern = /^(You have|Você tem|Tienes)\s+\d+\s+(file|arquivo|archivo)/i;
    if (headerPattern.test(trimmed) && !trimmed.includes('\n')) {
      // Header-only without line breaks means no content
      const hasButtons = payload.sourceButtons?.buttons && payload.sourceButtons.buttons.length > 0;
      const hasFileList = payload.fileList?.items && payload.fileList.items.length > 0;
      const hasAttachments = payload.attachments && payload.attachments.length > 0;

      if (!hasButtons && !hasFileList && !hasAttachments) {
        return {
          issue: {
            type: 'HEADER_ONLY',
            severity: 'error',
            description: 'Inventory header without file list content',
          },
        };
      }
    }

    // Check for empty content
    if (!trimmed || trimmed.length < 5) {
      const hasButtons = payload.sourceButtons?.buttons && payload.sourceButtons.buttons.length > 0;
      if (!hasButtons && !payload.attachments?.length) {
        return {
          issue: {
            type: 'EMPTY_CONTENT',
            severity: 'error',
            description: 'Response has no meaningful content',
          },
        };
      }
    }

    return {};
  }

  /**
   * Check for dangling DOC markers ({{DOC:: without closing }})
   */
  private checkDanglingDocMarkers(text: string): { issues: CompletionIssue[]; repaired: string; repairs: RepairAction[] } {
    const issues: CompletionIssue[] = [];
    const repairs: RepairAction[] = [];
    let repaired = text;

    // Pattern: {{DOC::id::name without closing }}
    const danglingDocPattern = /\{\{DOC::[^}]*$/gm;
    const matches = repaired.match(danglingDocPattern);

    if (matches && matches.length > 0) {
      issues.push({
        type: 'DANGLING_MARKER',
        severity: 'warning',
        description: `${matches.length} unclosed DOC marker(s)`,
      });

      // Remove dangling DOC markers (they can't be fixed reliably)
      repaired = repaired.replace(danglingDocPattern, '');
      repairs.push({
        type: 'REMOVE_DANGLING_DOC',
        description: `Removed ${matches.length} incomplete DOC marker(s)`,
        applied: true,
      });
    }

    return { issues, repaired, repairs };
  }

  /**
   * CHATGPT-LIKE: Strip preambles that make responses feel robotic
   * Patterns: "Here are / I found / Below are / I've found / I have found"
   * Preserves the actual content after the preamble
   */
  private stripPreamble(text: string): { text: string; wasStripped: boolean; stripped?: string } {
    // Common preamble patterns in EN/PT/ES
    // IMPORTANT: Only strip if what remains starts with a bullet/number or is meaningful
    // OPT_BULLET: Optional leading bullet marker (-, •, *)
    const OPT_BULLET = '(?:[-•*]\\s+)?';

    const preamblePatterns = [
      // English - summary/overview style (must strip entire "Here is a summary of X:" phrase)
      new RegExp(`^${OPT_BULLET}(Here is|Here's)\\s+(a\\s+)?(summary|overview|breakdown|list)\\s+(of\\s+)?[^:\\n]+:\\s*`, 'i'),
      // English - file listing style
      new RegExp(`^${OPT_BULLET}(Here are|Here is|I found|I've found|I have found|Below are|Below is|The following are|Following are)\\s+(your\\s+)?(files|documents|results|items|the\\s+)?\\s*:?\\s*`, 'i'),
      new RegExp(`^${OPT_BULLET}(I found mentions? of\\s+"[^"]+"\\s+in\\s+)`, 'i'),
      // Portuguese - summary style
      new RegExp(`^${OPT_BULLET}(Aqui está|Segue)\\s+(um\\s+)?(resumo|sumário|visão geral)\\s+(d[oa]\\s+)?[^:\\n]+:\\s*`, 'i'),
      // Portuguese - file listing
      new RegExp(`^${OPT_BULLET}(Aqui estão|Aqui está|Encontrei|Abaixo estão|Os seguintes são)\\s*(seus?\\s+)?(arquivos|documentos|resultados|itens)?\\s*:?\\s*`, 'i'),
      new RegExp(`^${OPT_BULLET}(Encontrei menções?\\s+de?\\s+"[^"]+"\\s+(no|na|nos|nas)\\s+)`, 'i'),
      // Spanish - summary style
      new RegExp(`^${OPT_BULLET}(Aquí está|Aquí tienes)\\s+(un\\s+)?(resumen|visión general)\\s+(de\\s+)?[^:\\n]+:\\s*`, 'i'),
      // Spanish - file listing
      new RegExp(`^${OPT_BULLET}(Aquí están|Aquí está|Encontré|Abajo están|Los siguientes son)\\s*(tus?\\s+)?(archivos|documentos|resultados|elementos)?\\s*:?\\s*`, 'i'),
    ];

    for (const pattern of preamblePatterns) {
      const match = text.match(pattern);
      if (match) {
        const stripped = match[0].trim();
        const remaining = text.slice(match[0].length).trim();

        // Don't strip if it leaves nothing meaningful
        if (remaining.length < 10) continue;

        // CRITICAL: Only strip if what remains is grammatically valid:
        // - Starts with a bullet (-/•/*)
        // - Starts with a number (1., 2., etc.)
        // - Starts with a capital letter (new sentence)
        // - Starts with bold/italic marker (**word or *word)
        const startsValidly = /^[-•*\d]|^[A-Z]|^\*{1,2}[A-Za-z]/.test(remaining);
        if (!startsValidly) {
          // What remains doesn't look like a valid start - skip this pattern
          continue;
        }

        return {
          text: remaining,
          wasStripped: true,
          stripped,
        };
      }
    }

    return { text, wasStripped: false };
  }

  /**
   * Enforce format constraints (bullet count, sentence limits, etc.)
   */
  private enforceFormatConstraints(
    text: string,
    constraints: FormatConstraints
  ): { issues: CompletionIssue[]; repaired: string; repairs: RepairAction[] } {
    const issues: CompletionIssue[] = [];
    const repairs: RepairAction[] = [];
    let repaired = text;

    // Bullet count enforcement
    if (constraints.bulletCount !== undefined) {
      const bulletLines = repaired.split('\n').filter(line => {
        const trimmed = line.trim();
        return trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*') || /^\d+\./.test(trimmed);
      });

      const currentCount = bulletLines.length;

      if (currentCount > constraints.bulletCount) {
        // Too many bullets - truncate
        issues.push({
          type: 'BULLET_COUNT',
          severity: 'warning',
          description: `Too many bullets: ${currentCount} > ${constraints.bulletCount}`,
        });

        // Keep only the requested number of bullets
        const lines = repaired.split('\n');
        let bulletsSeen = 0;
        const newLines: string[] = [];

        for (const line of lines) {
          const trimmed = line.trim();
          const isBullet = trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*') || /^\d+\./.test(trimmed);

          if (isBullet) {
            if (bulletsSeen < constraints.bulletCount) {
              newLines.push(line);
              bulletsSeen++;
            }
          } else {
            newLines.push(line);
          }
        }

        repaired = newLines.join('\n').trim();
        repairs.push({
          type: 'TRUNCATE_BULLETS',
          description: `Truncated from ${currentCount} to ${constraints.bulletCount} bullets`,
          applied: true,
        });
      } else if (currentCount < constraints.bulletCount) {
        // Too few bullets - just warn, can't generate more
        issues.push({
          type: 'BULLET_COUNT',
          severity: 'warning',
          description: `Too few bullets: ${currentCount} < ${constraints.bulletCount}`,
        });
      }
    }

    // Sentence count enforcement
    if (constraints.maxSentences !== undefined) {
      const sentences = repaired.match(/[^.!?]+[.!?]+/g) || [];
      const currentCount = sentences.length;

      if (currentCount > constraints.maxSentences) {
        issues.push({
          type: 'SENTENCE_COUNT',
          severity: 'warning',
          description: `Too many sentences: ${currentCount} > ${constraints.maxSentences}`,
        });

        // Truncate to max sentences
        repaired = sentences.slice(0, constraints.maxSentences).join(' ').trim();
        repairs.push({
          type: 'TRUNCATE_SENTENCES',
          description: `Truncated from ${currentCount} to ${constraints.maxSentences} sentences`,
          applied: true,
        });
      }
    }

    if (constraints.minSentences !== undefined) {
      const sentences = repaired.match(/[^.!?]+[.!?]+/g) || [];
      if (sentences.length < constraints.minSentences) {
        issues.push({
          type: 'SENTENCE_COUNT',
          severity: 'warning',
          description: `Too few sentences: ${sentences.length} < ${constraints.minSentences}`,
        });
      }
    }

    // Max length enforcement
    if (constraints.maxLength !== undefined && repaired.length > constraints.maxLength) {
      issues.push({
        type: 'CONSTRAINT_VIOLATION',
        severity: 'warning',
        description: `Response too long: ${repaired.length} > ${constraints.maxLength}`,
      });

      // Truncate at sentence boundary if possible
      const truncated = repaired.slice(0, constraints.maxLength);
      const lastSentenceEnd = Math.max(
        truncated.lastIndexOf('.'),
        truncated.lastIndexOf('!'),
        truncated.lastIndexOf('?')
      );

      if (lastSentenceEnd > constraints.maxLength * 0.7) {
        repaired = truncated.slice(0, lastSentenceEnd + 1);
      } else {
        repaired = truncated.trim() + '...';
      }

      repairs.push({
        type: 'TRUNCATE_LENGTH',
        description: `Truncated to ${repaired.length} characters`,
        applied: true,
      });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TABLE FORMAT ENFORCEMENT - HARD GATE
    // When user requests table format, the output MUST contain a markdown table.
    // If not, try to convert bullet/list content to a basic table.
    // ═══════════════════════════════════════════════════════════════════════════
    if (constraints.format === 'table') {
      // Check for markdown table signature: | header | header |
      const hasMarkdownTable = /\|.*\|.*\|/.test(repaired) && /\|[\s-]+\|/.test(repaired);

      if (!hasMarkdownTable) {
        issues.push({
          type: 'CONSTRAINT_VIOLATION',
          severity: 'error',
          description: 'Table format required but no markdown table found in response',
        });

        // Attempt to convert bullet list to simple table
        const bulletLines = repaired.split('\n').filter(line => {
          const trimmed = line.trim();
          return trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*');
        });

        if (bulletLines.length >= 2) {
          // Convert bullets to a simple two-column table (Item | Value)
          const tableRows = bulletLines.map(line => {
            const content = line.replace(/^[\s•\-*]+/, '').trim();
            // Try to split on ":" or "-" for key-value pairs
            const colonSplit = content.split(/:\s*/);
            if (colonSplit.length === 2) {
              return `| ${colonSplit[0].trim()} | ${colonSplit[1].trim()} |`;
            }
            return `| ${content} | |`;
          });

          const tableHeader = '| Item | Value |';
          const tableSeparator = '| --- | --- |';
          const tableContent = [tableHeader, tableSeparator, ...tableRows].join('\n');

          repaired = tableContent;
          repairs.push({
            type: 'CONVERT_TO_TABLE',
            description: `Converted ${bulletLines.length} bullets to table format`,
            applied: true,
          });
        }
      }
    }

    return { issues, repaired, repairs };
  }

  /**
   * Apply repairs and return cleaned text
   */
  applyRepairs(validation: CompletionValidation, originalText: string): string {
    return validation.repairedText || originalText;
  }
}

// Singleton instance for use in orchestrator
let instance: CompletionGateService | null = null;

export function getCompletionGateService(): CompletionGateService {
  if (!instance) {
    instance = new CompletionGateService();
  }
  return instance;
}

export default CompletionGateService;
