/**
 * markdownValidator.ts
 *
 * Utility for validating markdown strings against common formatting issues.
 *
 * This validator checks for:
 * - Unbalanced backticks (inline code and fenced code blocks)
 * - Unclosed brackets in markdown links/images
 * - Table formatting issues (missing header separator, unbalanced pipes)
 * - Heading syntax correctness (no raw HTML headings, no invalid heading levels)
 *
 * It returns a list of issues with severity levels and optional auto-fix suggestions.
 * The validator is non-throwing and safe to run on any markdown input.
 */

export type MarkdownIssueSeverity = 'error' | 'warning';

export interface MarkdownIssue {
  message: string;
  line: number | null;
  severity: MarkdownIssueSeverity;
  type?: string;
  fixSuggestion?: string;
}

export class MarkdownValidator {
  /**
   * Validate the given markdown string for common formatting issues.
   */
  public static validate(markdown: string): MarkdownIssue[] {
    if (typeof markdown !== 'string') {
      console.warn('[MarkdownValidator] input is not a string');
      return [{
        message: 'Input is not a valid markdown string',
        line: null,
        severity: 'error',
        type: 'invalid_input',
      }];
    }

    const issues: MarkdownIssue[] = [];
    const lines = markdown.split(/\r?\n/);

    issues.push(...this.checkUnbalancedBackticks(lines));
    issues.push(...this.checkUnclosedBrackets(lines));
    issues.push(...this.checkTableFormatting(lines));
    issues.push(...this.checkHeadingSyntax(lines));

    return issues;
  }

  private static checkUnbalancedBackticks(lines: string[]): MarkdownIssue[] {
    const issues: MarkdownIssue[] = [];
    let inFencedCodeBlock = false;
    let fenceChar = '';
    let fenceLength = 0;
    let fenceStartLine = 0;

    const fencedCodeRegex = /^([`~]{3,})(.*)$/;

    lines.forEach((line, idx) => {
      const lineNumber = idx + 1;
      const fenceMatch = line.match(fencedCodeRegex);

      if (fenceMatch) {
        const currentFenceChar = fenceMatch[1][0];
        const currentFenceLength = fenceMatch[1].length;

        if (!inFencedCodeBlock) {
          inFencedCodeBlock = true;
          fenceChar = currentFenceChar;
          fenceLength = currentFenceLength;
          fenceStartLine = lineNumber;
        } else if (inFencedCodeBlock && currentFenceChar === fenceChar && currentFenceLength >= fenceLength) {
          inFencedCodeBlock = false;
          fenceChar = '';
          fenceLength = 0;
          fenceStartLine = 0;
        }
        return;
      }

      if (!inFencedCodeBlock) {
        const backtickRuns = line.match(/`+/g) || [];
        if (backtickRuns.length % 2 !== 0) {
          issues.push({
            message: 'Unbalanced inline code backticks detected',
            line: lineNumber,
            severity: 'error',
            type: 'unbalanced_backticks',
            fixSuggestion: 'Check inline code spans for missing backticks',
          });
        }
      }
    });

    if (inFencedCodeBlock) {
      issues.push({
        message: `Unclosed fenced code block starting at line ${fenceStartLine}`,
        line: fenceStartLine,
        severity: 'error',
        type: 'unclosed_code_block',
        fixSuggestion: 'Add closing fenced code block with matching backticks or tildes',
      });
    }

    return issues;
  }

  private static checkUnclosedBrackets(lines: string[]): MarkdownIssue[] {
    const issues: MarkdownIssue[] = [];

    lines.forEach((line, idx) => {
      const lineNumber = idx + 1;
      const squareStack: number[] = [];
      const parenStack: number[] = [];

      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '[') {
          squareStack.push(i);
        } else if (ch === ']') {
          if (squareStack.length === 0) {
            issues.push({
              message: 'Unmatched closing square bracket "]"',
              line: lineNumber,
              severity: 'error',
              type: 'unmatched_bracket',
              fixSuggestion: 'Remove or add matching opening "["',
            });
          } else {
            squareStack.pop();
          }
        } else if (ch === '(') {
          parenStack.push(i);
        } else if (ch === ')') {
          if (parenStack.length === 0) {
            issues.push({
              message: 'Unmatched closing parenthesis ")"',
              line: lineNumber,
              severity: 'error',
              type: 'unmatched_paren',
              fixSuggestion: 'Remove or add matching opening "("',
            });
          } else {
            parenStack.pop();
          }
        }
      }

      if (squareStack.length > 0) {
        issues.push({
          message: `Unclosed square bracket "[" at position ${squareStack[0] + 1}`,
          line: lineNumber,
          severity: 'error',
          type: 'unclosed_bracket',
          fixSuggestion: 'Add matching closing "]"',
        });
      }
      if (parenStack.length > 0) {
        issues.push({
          message: `Unclosed parenthesis "(" at position ${parenStack[0] + 1}`,
          line: lineNumber,
          severity: 'error',
          type: 'unclosed_paren',
          fixSuggestion: 'Add matching closing ")"',
        });
      }
    });

    return issues;
  }

  private static checkTableFormatting(lines: string[]): MarkdownIssue[] {
    const issues: MarkdownIssue[] = [];
    const headerSepRegex = /^\s*\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = i + 1 < lines.length ? lines[i + 1] : '';

      if (line.includes('|')) {
        if (headerSepRegex.test(nextLine)) {
          const headerPipeCount = this.countPipes(line);
          const separatorPipeCount = this.countPipes(nextLine);

          if (headerPipeCount !== separatorPipeCount) {
            issues.push({
              message: `Table header and separator pipe count mismatch at lines ${i + 1} and ${i + 2}`,
              line: i + 2,
              severity: 'error',
              type: 'table_mismatch',
              fixSuggestion: 'Ensure header and separator lines have matching columns',
            });
          }

          let j = i + 2;
          while (j < lines.length && lines[j].includes('|') && lines[j].trim() !== '') {
            const rowPipeCount = this.countPipes(lines[j]);
            if (rowPipeCount !== headerPipeCount) {
              issues.push({
                message: `Table row pipe count mismatch at line ${j + 1}`,
                line: j + 1,
                severity: 'error',
                type: 'table_row_mismatch',
                fixSuggestion: 'Ensure all table rows have matching columns',
              });
            }
            j++;
          }
          i = j - 1;
        } else if (line.trim().startsWith('|') && !headerSepRegex.test(nextLine)) {
          issues.push({
            message: `Table row without header separator line at line ${i + 1}`,
            line: i + 1,
            severity: 'error',
            type: 'unclosed_table',
            fixSuggestion: 'Add a header separator line (e.g. |---|---|) after the header row',
          });
        }
      }
    }

    return issues;
  }

  private static countPipes(line: string): number {
    let count = 0;
    let escaped = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '\\' && !escaped) {
        escaped = true;
        continue;
      }
      if (ch === '|' && !escaped) {
        count++;
      }
      escaped = false;
    }
    return count;
  }

  private static checkHeadingSyntax(lines: string[]): MarkdownIssue[] {
    const issues: MarkdownIssue[] = [];
    const seenHeadings = new Set<string>();
    const headingRegex = /^(#{1,6})\s+(.*)$/;
    const rawHtmlHeadingRegex = /^<h[1-6][\s>]/i;

    lines.forEach((line, idx) => {
      const lineNumber = idx + 1;

      if (rawHtmlHeadingRegex.test(line.trim())) {
        issues.push({
          message: 'Raw HTML heading detected; use markdown heading syntax instead',
          line: lineNumber,
          severity: 'warning',
          type: 'raw_html_heading',
          fixSuggestion: 'Replace raw HTML heading with markdown heading (e.g. ## Heading)',
        });
      }

      const headingMatch = line.match(headingRegex);
      if (headingMatch) {
        const hashes = headingMatch[1];
        const headingText = headingMatch[2].trim();

        if (hashes.length > 3) {
          issues.push({
            message: `Heading level too deep (${hashes.length} #'s); max allowed is 3`,
            line: lineNumber,
            severity: 'warning',
            type: 'heading_too_deep',
            fixSuggestion: 'Reduce heading level to ## or ###',
          });
        }

        const normalized = headingText.toLowerCase();
        if (seenHeadings.has(normalized)) {
          issues.push({
            message: `Duplicated heading title "${headingText}"`,
            line: lineNumber,
            severity: 'warning',
            type: 'duplicate_heading',
            fixSuggestion: 'Rename or remove duplicated heading',
          });
        } else {
          seenHeadings.add(normalized);
        }

        if (!/^#{1,6}\s/.test(line)) {
          issues.push({
            message: 'Invalid heading syntax: missing space after # characters',
            line: lineNumber,
            severity: 'error',
            type: 'invalid_heading',
            fixSuggestion: 'Add a space after the # characters in heading',
          });
        }
      }
    });

    return issues;
  }
}

export const markdownValidator = {
  validate: (markdown: string) => MarkdownValidator.validate(markdown),
};

export default MarkdownValidator;
