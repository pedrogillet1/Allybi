/**
 * MARKDOWN NORMALIZER SERVICE
 *
 * ChatGPT-parity: Enforces safe, predictable markdown output.
 * Normalizes spacing, lists, tables, and removes unsafe content.
 *
 * Rules enforced:
 * - Paragraph spacing: max 2 consecutive newlines
 * - Bullets: must be "- item" format, no empty bullets
 * - Numbered lists: must be "1. item" format, no empty items
 * - Tables: header + separator required, uniform column count
 * - No raw HTML allowed
 * - No trailing whitespace
 */

// ============================================================================
// TYPES
// ============================================================================

export interface NormalizerResult {
  text: string;
  repairs: string[];
  warnings: string[];
}

export interface NormalizerOptions {
  maxConsecutiveNewlines?: number;
  allowTables?: boolean;
  allowCodeBlocks?: boolean;
  intent?: string;

  // ChatGPT-like readability limits
  maxSentencesPerParagraph?: number;
  maxCharsPerParagraph?: number;
  maxSentencesPerBullet?: number;
  maxCharsPerBullet?: number;
}

// ============================================================================
// PATTERNS
// ============================================================================

const PATTERNS = {
  // Spacing
  multipleBlankLines: /\n{3,}/g,
  trailingWhitespace: /[ \t]+$/gm,
  leadingBlankLines: /^\n+/,
  trailingBlankLines: /\n+$/,

  // Lists
  emptyBullet: /^[-*+]\s*$/gm,
  emptyNumbered: /^\d+\.\s*$/gm,
  starBullet: /^\*\s+/gm,
  plusBullet: /^\+\s+/gm,
  inconsistentNumbering: /^(\d+)\.\s/gm,

  // Tables
  tableRow: /^\|.+\|$/gm,
  tableSeparator: /^\|[\s:-]+\|$/,

  // Code
  codeFence: /```/g,
  inlineCode: /`[^`]+`/g,

  // Unsafe content
  rawHtml:
    /<(?:script|iframe|object|embed|form|input|button|select|textarea|style|link|meta|base)[^>]*>/gi,
  htmlTags: /<\/?[a-z][^>]*>/gi,

  // Bold/italic
  boldMarker: /\*\*/g,
  italicMarker: /(?<!\*)\*(?!\*)/g,
};

// ============================================================================
// MARKDOWN NORMALIZER
// ============================================================================

export class MarkdownNormalizerService {
  /**
   * Normalize markdown text according to ChatGPT-parity rules.
   */
  normalize(text: string, options: NormalizerOptions = {}): NormalizerResult {
    const {
      maxConsecutiveNewlines = 2,
      allowTables = true,
      allowCodeBlocks = true,
      maxSentencesPerParagraph = 2,
      maxCharsPerParagraph = 260,
      maxSentencesPerBullet = 3,
      maxCharsPerBullet = 240,
    } = options;

    const repairs: string[] = [];
    const warnings: string[] = [];
    let result = text;

    // Preserve code blocks during normalization
    const codeBlocks: string[] = [];
    if (allowCodeBlocks) {
      result = result.replace(/```[\s\S]*?```/g, (match) => {
        codeBlocks.push(match);
        return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
      });
    }

    // 1. Strip raw HTML (security)
    const beforeHtml = result;
    result = this.stripRawHtml(result);
    if (result !== beforeHtml) {
      repairs.push("STRIPPED_RAW_HTML");
    }

    // 2. Normalize paragraph spacing
    const beforeSpacing = result;
    result = this.normalizeSpacing(result, maxConsecutiveNewlines);
    if (result !== beforeSpacing) {
      repairs.push("NORMALIZED_SPACING");
    }

    // 3. Fix bullet format
    const beforeBullets = result;
    result = this.normalizeBullets(result);
    if (result !== beforeBullets) {
      repairs.push("NORMALIZED_BULLETS");
    }

    // 4. Fix numbered list format
    const beforeNumbered = result;
    result = this.normalizeNumberedLists(result);
    if (result !== beforeNumbered) {
      repairs.push("NORMALIZED_NUMBERED_LISTS");
    }

    // 5. Validate tables
    if (allowTables) {
      const tableResult = this.validateTables(result);
      result = tableResult.text;
      if (tableResult.repaired) {
        repairs.push("REPAIRED_TABLE");
      }
      if (tableResult.warning) {
        warnings.push(tableResult.warning);
      }
    }

    // 6. Sanitize excessive dashes (ChatGPT-parity fix)
    const beforeDashes = result;
    result = this.sanitizeExcessiveDashes(result);
    if (result !== beforeDashes) {
      repairs.push("SANITIZED_EXCESSIVE_DASHES");
    }

    // 7. Check for unbalanced markers
    const balanceResult = this.checkMarkerBalance(result);
    if (balanceResult.warning) {
      warnings.push(balanceResult.warning);
    }
    if (balanceResult.repaired) {
      result = balanceResult.text;
      repairs.push("FIXED_UNBALANCED_MARKERS");
    }

    // 8. CHATGPT-PARITY: Enforce short paragraphs
    const paraResult = this.enforceShortParagraphs(
      result,
      maxSentencesPerParagraph,
      maxCharsPerParagraph,
    );
    if (paraResult.repaired) {
      result = paraResult.text;
      repairs.push("SPLIT_LONG_PARAGRAPHS");
    }

    // 9. CHATGPT-PARITY: Enforce bullet limits (1-3 sentences per bullet)
    const bulletResult = this.enforceBulletLimits(
      result,
      maxSentencesPerBullet,
      maxCharsPerBullet,
    );
    if (bulletResult.repaired) {
      result = bulletResult.text;
      repairs.push("SPLIT_LONG_BULLETS");
    }

    // 10. PROSE-FIRST: Convert excessive bullet blocks (4+ consecutive) into paragraphs
    const proseResult = this.collapseBulletsToProse(result);
    if (proseResult.repaired) {
      result = proseResult.text;
      repairs.push("COLLAPSED_BULLETS_TO_PROSE");
    }

    // Restore code blocks
    codeBlocks.forEach((block, i) => {
      result = result.replace(`__CODE_BLOCK_${i}__`, block);
    });

    // Final trim
    result = result.trim();

    return { text: result, repairs, warnings };
  }

  /**
   * Strip dangerous HTML tags - REPAIR-ONLY
   * Converts <br> to newline (keeps natural layout)
   * Removes only dangerous tags, preserves content of harmless tags
   */
  private stripRawHtml(text: string): string {
    // Remove dangerous tags entirely (script, iframe, etc.)
    let result = text.replace(PATTERNS.rawHtml, "");

    // Convert <br> to newline (keeps natural layout)
    result = result.replace(/<br\s*\/?>/gi, "\n");

    // Remove remaining tags but keep inner text (except <br> which is already handled)
    result = result.replace(/<\/?(?!br\b)[a-z][^>]*>/gi, "");

    return result;
  }

  /**
   * Normalize paragraph spacing - REPAIR-ONLY, preserves natural layout
   * Only collapses excessive newlines, preserves table blocks intact
   */
  private normalizeSpacing(text: string, maxNewlines: number): string {
    // Remove trailing whitespace first
    const lines = text.replace(PATTERNS.trailingWhitespace, "").split("\n");

    const out: string[] = [];
    let blankRun = 0;
    let inTable = false;

    const isTableLine = (l: string) => {
      const t = l.trim();
      return t.startsWith("|") && t.endsWith("|");
    };

    for (const line of lines) {
      const trimmed = line.trim();

      // Track table blocks (keep their internal spacing intact)
      if (isTableLine(line)) inTable = true;
      else if (inTable && trimmed === "") {
        // Allow blank line after a table, but exit table state
        inTable = false;
      }

      if (trimmed === "") {
        blankRun++;

        // Inside tables, preserve exactly one blank line max (don't collapse structure)
        if (inTable) {
          if (blankRun <= 1) out.push("");
        } else {
          if (blankRun <= maxNewlines) out.push("");
        }
        continue;
      }

      blankRun = 0;
      out.push(line);
    }

    // Trim leading/trailing empty lines only
    while (out.length && out[0].trim() === "") out.shift();
    while (out.length && out[out.length - 1].trim() === "") out.pop();

    return out.join("\n");
  }

  /**
   * Normalize bullet lists to use "- item" format
   */
  private normalizeBullets(text: string): string {
    let result = text;

    // Convert * bullets to - bullets
    result = result.replace(PATTERNS.starBullet, "- ");

    // Convert + bullets to - bullets
    result = result.replace(PATTERNS.plusBullet, "- ");

    // Convert unicode bullet (•) to dash
    result = result.replace(/^•\s+/gm, "- ");
    result = result.replace(/^\s+•\s+/gm, "  - ");

    // FIX: Collapse nested/repeated bullet markers (• •, - -, * *, etc.)
    // This handles "• • item" -> "- item" and "- - item" -> "- item"
    result = result.replace(/^[-•*+]\s+[-•*+]\s+/gm, "- ");
    result = result.replace(/^\s+[-•*+]\s+[-•*+]\s+/gm, "  - ");

    // Also collapse triple or more nested markers
    result = result.replace(/^([-•*+]\s+){2,}/gm, "- ");

    // Remove empty bullets
    result = result.replace(PATTERNS.emptyBullet, "");

    // Clean up resulting double newlines
    result = result.replace(/\n{3,}/g, "\n\n");

    return result;
  }

  /**
   * Normalize numbered lists - REPAIR-ONLY
   * Only re-sequence if numbering is obviously inconsistent (e.g., 1, 1, 4)
   * Preserves intentional numbering (e.g., step labels)
   */
  private normalizeNumberedLists(text: string): string {
    // Remove empty numbered items
    let result = text.replace(PATTERNS.emptyNumbered, "");

    const lines = result.split("\n");

    let i = 0;
    while (i < lines.length) {
      // Detect a numbered list block
      if (!/^\s*\d+\.\s+/.test(lines[i])) {
        i++;
        continue;
      }

      // Collect contiguous numbered lines
      const start = i;
      const nums: number[] = [];
      const items: string[] = [];

      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const m = lines[i].match(/^\s*(\d+)\.\s+([\s\S]+)$/);
        if (m) {
          nums.push(parseInt(m[1], 10));
          items.push(m[2]);
        }
        i++;
      }

      // Decide whether to resequence (only if clearly inconsistent)
      // Strictly increasing = natural numbering, don't touch
      const isStrictInc = nums.every(
        (n, idx) => idx === 0 || n === nums[idx - 1] + 1,
      );
      const hasWeirdJumps = nums.length >= 2 && !isStrictInc;

      if (hasWeirdJumps) {
        for (let k = 0; k < items.length; k++) {
          lines[start + k] = `${k + 1}. ${items[k]}`;
        }
      }

      // Continue scanning (i is already advanced)
    }

    return lines.join("\n");
  }

  /**
   * Validate and repair markdown tables
   * - Fixes malformed separators (em-dashes, spaced dashes)
   * - Ensures proper GFM table format
   */
  private validateTables(text: string): {
    text: string;
    repaired: boolean;
    warning?: string;
  } {
    let lines = text.split("\n");
    let repaired = false;
    let warning: string | undefined;

    // FIX: First pass - convert malformed separator lines to proper GFM format
    // Catches: "— — —", "--- --- ---", "| — | — |", etc.
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Pattern 1: "— — —" or "--- --- ---" (spaced dashes without pipes)
      // This appears after a table header line
      const isMalformedSeparator =
        /^[-—–]+(\s+[-—–]+)+\s*$/.test(trimmed) ||
        /^[\s|]*[-—–]{2,}[\s|]*$/.test(trimmed);

      if (isMalformedSeparator && i > 0) {
        // Check if previous line looks like a table header
        const prevLine = lines[i - 1].trim();
        if (prevLine.startsWith("|") && prevLine.endsWith("|")) {
          // Count columns from header
          const colCount = (prevLine.match(/\|/g) || []).length - 1;
          // Replace with proper GFM separator
          lines[i] = "|" + " --- |".repeat(colCount);
          repaired = true;
        }
      }

      // Pattern 2: "| — | — |" (em-dashes inside pipes)
      // Convert em-dashes and en-dashes to regular dashes in separator rows
      if (
        trimmed.startsWith("|") &&
        trimmed.endsWith("|") &&
        /[—–]/.test(trimmed)
      ) {
        // Check if this looks like a separator (mostly dashes, colons, pipes, spaces)
        const withoutPipes = trimmed.slice(1, -1);
        if (/^[\s—–:-]+$/.test(withoutPipes)) {
          // Replace em/en dashes with regular dashes
          lines[i] = trimmed.replace(/[—–]/g, "-");
          repaired = true;
        }
      }
    }

    // Find table sections
    let inTable = false;
    let tableStart = -1;
    let headerColCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const isTableRow = line.startsWith("|") && line.endsWith("|");

      if (isTableRow && !inTable) {
        // Start of table
        inTable = true;
        tableStart = i;
        headerColCount = (line.match(/\|/g) || []).length - 1;
      } else if (inTable) {
        if (!isTableRow && line !== "") {
          // End of table (non-empty non-table line)
          inTable = false;
          tableStart = -1;
        } else if (isTableRow) {
          // Check column count consistency
          const colCount = (line.match(/\|/g) || []).length - 1;
          if (colCount !== headerColCount) {
            warning = "TABLE_COLUMN_COUNT_MISMATCH";
            // Try to fix by adjusting pipes
            const diff = headerColCount - colCount;
            if (diff > 0) {
              // Add missing pipes
              lines[i] = line.slice(0, -1) + " |".repeat(diff) + "|";
              repaired = true;
            }
          }

          // Check for separator row (should be second row)
          if (i === tableStart + 1) {
            if (!PATTERNS.tableSeparator.test(line)) {
              // Insert separator row
              const separator = "|" + " --- |".repeat(headerColCount);
              lines.splice(i, 0, separator);
              repaired = true;
              i++; // Skip the inserted line
            }
          }
        }
      }
    }

    return { text: lines.join("\n"), repaired, warning };
  }

  /**
   * Sanitize excessive dashes that break table rendering
   * ChatGPT-parity: Remove lines that are just long dash sequences (not part of tables)
   * - Collapses lines matching ^-{8,}$ (8+ dashes) to max 1 occurrence
   * - Removes >3 consecutive separator-like lines
   */
  private sanitizeExcessiveDashes(text: string): string {
    const lines = text.split("\n");
    const result: string[] = [];
    let dashRunCount = 0;
    let lastWasDashLine = false;

    // Pattern for excessive dash lines (8+ dashes, not a table separator)
    const excessiveDashPattern = /^-{8,}$/;
    // Pattern for table separator (| --- | format)
    const tableSeparatorPattern = /^\|[\s:-]+\|$/;

    for (const line of lines) {
      const trimmed = line.trim();

      // Check if this is an excessive dash line (NOT a table separator)
      const isExcessiveDash = excessiveDashPattern.test(trimmed);
      const isTableSeparator = tableSeparatorPattern.test(trimmed);

      if (isExcessiveDash && !isTableSeparator) {
        dashRunCount++;
        // Only allow 1 dash separator line in a row, skip the rest
        if (dashRunCount <= 1) {
          // Convert to a simple HR (3 dashes) for consistency
          result.push("---");
        }
        lastWasDashLine = true;
        continue;
      }

      // Check for consecutive table separators (shouldn't happen, but safety)
      if (isTableSeparator) {
        if (lastWasDashLine || dashRunCount > 0) {
          dashRunCount++;
          if (dashRunCount > 3) {
            // Skip excessive consecutive separators
            continue;
          }
        }
        lastWasDashLine = true;
      } else {
        // Reset counters on normal content
        dashRunCount = 0;
        lastWasDashLine = false;
      }

      result.push(line);
    }

    return result.join("\n");
  }

  /**
   * Check for unbalanced markdown markers - SOFT REPAIR
   * Only repairs trailing orphan markers, lets regen handle complex cases
   */
  private checkMarkerBalance(text: string): {
    text: string;
    repaired: boolean;
    warning?: string;
  } {
    let result = text;
    let repaired = false;
    let warning: string | undefined;

    // Check bold markers (**)
    const boldCount = (result.match(PATTERNS.boldMarker) || []).length;
    if (boldCount % 2 !== 0) {
      warning = "UNBALANCED_BOLD_MARKERS";
      // Soft repair: only remove if it ends with an orphan marker
      if (result.trim().endsWith("**")) {
        result = result.trim().slice(0, -2);
        repaired = true;
      }
      // Otherwise, let FinalAnswerGate handle regen - don't aggressively delete
    }

    // Check code fence balance (```)
    const fenceCount = (result.match(PATTERNS.codeFence) || []).length;
    if (fenceCount % 2 !== 0) {
      warning = warning
        ? `${warning}, UNBALANCED_CODE_FENCES`
        : "UNBALANCED_CODE_FENCES";
      // Append closing fence (this is safe repair)
      result = result + "\n```";
      repaired = true;
    }

    return { text: result, repaired, warning };
  }

  /**
   * Protect dots in decimals and abbreviations from sentence splitting
   */
  private protectDots(input: string): {
    text: string;
    restore: (s: string) => string;
  } {
    const placeholder = "__DOT__";

    // Protect decimals: 11.2, 900.000, 1.000.000,00 patterns
    let text = input.replace(/(\d)\.(\d)/g, `$1${placeholder}$2`);

    // Protect common abbreviations
    const abbrev = [
      "e.g.",
      "i.e.",
      "etc.",
      "vs.",
      "Sr.",
      "Sra.",
      "Dr.",
      "Dra.",
      "Art.",
      "Cap.",
      "Fig.",
      "Ex.",
      "p.",
      "pp.",
      "No.",
      "Inc.",
      "Ltd.",
      "R$",
      "U$",
      "US$",
    ];

    for (const a of abbrev) {
      const safe = a.replace(/\./g, placeholder);
      text = text.split(a).join(safe);
    }

    const restore = (s: string) => s.split(placeholder).join(".");
    return { text, restore };
  }

  /**
   * Split text into sentences, protecting decimals and abbreviations
   */
  private splitSentences(input: string): string[] {
    const { text, restore } = this.protectDots(input.trim());

    // Split on end punctuation followed by whitespace
    const parts = text
      .split(/(?<=[.!?])\s+/g)
      .map((p) => p.trim())
      .filter(Boolean);

    return parts.map(restore);
  }

  /**
   * CHATGPT-PARITY: Enforce bullet limits (1-3 sentences per bullet)
   * Splits long bullets into multiple bullets
   */
  enforceBulletLimits(
    text: string,
    maxSentencesPerBullet: number = 3,
    maxCharsPerBullet: number = 240,
  ): { text: string; repaired: boolean } {
    const lines = text.split("\n");
    const out: string[] = [];
    let repaired = false;

    // Matches "- item" and preserves indentation (nested bullets too)
    const bulletRe = /^(\s*)-\s+(.*)$/;

    // Helper: detect continuation lines (indented text after a bullet)
    const isContinuation = (line: string, indent: string) => {
      if (!line.trim()) return false;
      // Continuation line has more indent than bullet indent
      return line.startsWith(indent + "  ") && !bulletRe.test(line);
    };

    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(bulletRe);
      if (!m) {
        out.push(lines[i]);
        continue;
      }

      const indent = m[1];
      let content = m[2].trim();

      // Capture continuation lines belonging to this bullet
      while (i + 1 < lines.length && isContinuation(lines[i + 1], indent)) {
        content += " " + lines[i + 1].trim();
        i++;
      }

      // Check limits
      const sentences = this.splitSentences(content);
      const withinSentenceLimit = sentences.length <= maxSentencesPerBullet;
      const withinCharLimit = content.length <= maxCharsPerBullet;

      if (withinSentenceLimit && withinCharLimit) {
        out.push(`${indent}- ${content}`);
        continue;
      }

      repaired = true;

      // Split into multiple bullets: maxSentencesPerBullet sentences per bullet
      let idx = 0;
      while (idx < sentences.length) {
        const chunk = sentences
          .slice(idx, idx + maxSentencesPerBullet)
          .join(" ")
          .trim();

        // If chunk still too long by chars, hard-split by words
        if (chunk.length > maxCharsPerBullet) {
          const words = chunk.split(/\s+/);
          let current = "";
          for (const w of words) {
            if ((current + " " + w).trim().length > maxCharsPerBullet) {
              if (current.trim()) out.push(`${indent}- ${current.trim()}`);
              current = w;
            } else {
              current = (current + " " + w).trim();
            }
          }
          if (current.trim()) out.push(`${indent}- ${current.trim()}`);
        } else {
          out.push(`${indent}- ${chunk}`);
        }

        idx += maxSentencesPerBullet;
      }
    }

    return { text: out.join("\n"), repaired };
  }

  /**
   * CHATGPT-PARITY: Split long paragraphs into shorter ones
   * - Max 2-3 sentences per paragraph
   * - Max ~260-320 chars per paragraph
   * - Insert newlines before bullets glued to text
   * - Remove orphan colons (lead-in with no list)
   */
  enforceShortParagraphs(
    text: string,
    maxSentencesPerParagraph: number = 2,
    maxCharsPerParagraph: number = 260,
  ): { text: string; repaired: boolean } {
    let result = text;
    let repaired = false;

    // 1. Fix bullets glued to preceding text: "Here are the points:- First" → "Here are the points:\n- First"
    const beforeBullets = result;
    result = result.replace(
      /([.:!?])(\s*)(-\s+)/g,
      (_, punct, space, bullet) => {
        if (!space.includes("\n")) {
          return `${punct}\n${bullet}`;
        }
        return _;
      },
    );
    if (result !== beforeBullets) repaired = true;

    // 2. Split paragraphs by sentence boundaries
    // Skip code blocks, tables, lists
    const paragraphs = result.split(/\n{2,}/);
    const processedParagraphs: string[] = [];

    for (const para of paragraphs) {
      const trimmed = para.trim();

      // Skip special content (don't split these)
      const isCodeBlock = trimmed.startsWith("```");
      const isTableRow = trimmed.startsWith("|") && trimmed.endsWith("|");
      const isBulletList = /^[-*•]\s/.test(trimmed);
      const isNumberedList = /^\d+\.\s/.test(trimmed);
      const isHeading = /^#{1,6}\s/.test(trimmed);
      const isBlockquote = trimmed.startsWith(">");

      if (
        isCodeBlock ||
        isTableRow ||
        isBulletList ||
        isNumberedList ||
        isHeading ||
        isBlockquote
      ) {
        processedParagraphs.push(para);
        continue;
      }

      // Split long paragraphs by sentence (using protected splitting)
      const sentences = this.splitSentences(trimmed);

      // Check if already within limits
      if (
        sentences.length <= maxSentencesPerParagraph &&
        trimmed.length <= maxCharsPerParagraph
      ) {
        processedParagraphs.push(para);
        continue;
      }

      // Split into chunks of maxSentencesPerParagraph
      const chunks: string[] = [];
      for (let i = 0; i < sentences.length; i += maxSentencesPerParagraph) {
        const chunk = sentences
          .slice(i, i + maxSentencesPerParagraph)
          .join(" ")
          .trim();
        if (!chunk) continue;

        // If chunk still too long by chars, split by words
        if (chunk.length > maxCharsPerParagraph) {
          const words = chunk.split(/\s+/);
          let current = "";
          for (const w of words) {
            const next = (current + " " + w).trim();
            if (next.length > maxCharsPerParagraph) {
              if (current) chunks.push(current.trim());
              current = w;
            } else {
              current = next;
            }
          }
          if (current) chunks.push(current.trim());
        } else {
          chunks.push(chunk);
        }
      }

      if (chunks.length > 1) {
        repaired = true;
        processedParagraphs.push(...chunks);
      } else if (chunks.length === 1) {
        processedParagraphs.push(chunks[0]);
      } else {
        processedParagraphs.push(para);
      }
    }

    result = processedParagraphs.join("\n\n");

    // 3. Remove orphan colons (lead-in phrases with no list following)
    // Pattern: "Here are the points:" followed by paragraph text (not a list)
    const beforeColons = result;
    result = result.replace(
      /([Hh]ere are|[Tt]he following|[Tt]hese include|[Bb]elow are|[Pp]oints|[Ii]tems|[Ss]teps)[^:]*:\s*\n(?!\s*[-*•\d])/g,
      (match) => {
        // Remove the colon, keep the rest
        return match.replace(/:\s*\n/, ".\n");
      },
    );
    if (result !== beforeColons) repaired = true;

    return { text: result, repaired };
  }

  /**
   * PROSE-FIRST: Convert consecutive bullet blocks of 4+ items into flowing paragraphs.
   * Preserves bullets when they are short discrete items (e.g., names, roles).
   * Only collapses blocks where each bullet is a sentence/clause.
   */
  collapseBulletsToProse(text: string): { text: string; repaired: boolean } {
    const lines = text.split("\n");
    const out: string[] = [];
    let repaired = false;
    let i = 0;

    while (i < lines.length) {
      const bulletMatch = lines[i].match(/^(\s*)-\s+(.*)$/);

      if (!bulletMatch) {
        out.push(lines[i]);
        i++;
        continue;
      }

      // Collect consecutive bullet block at same indent level
      const indent = bulletMatch[1];
      const bulletItems: string[] = [];
      const startIdx = i;

      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)-\s+(.*)$/);
        if (!m || m[1] !== indent) break;
        bulletItems.push(m[2].trim());
        i++;
      }

      // Only collapse if 4+ bullets AND they look like sentences (avg > 40 chars)
      const avgLen =
        bulletItems.reduce((sum, b) => sum + b.length, 0) / bulletItems.length;
      const hasSentences = bulletItems.some((b) => /[.!?]$/.test(b));

      if (bulletItems.length >= 4 && (avgLen > 40 || hasSentences)) {
        // Collapse into prose paragraph(s)
        // Strip leading bold labels like "**Label:** rest" → "Label: rest" for inline flow
        const clauses = bulletItems.map((b) => {
          // Remove trailing period for joining (we'll add proper punctuation)
          let clause = b.replace(/\.\s*$/, "");
          return clause;
        });

        // Join clauses with periods into paragraphs (max 3 sentences per paragraph)
        const paragraphs: string[] = [];
        for (let j = 0; j < clauses.length; j += 3) {
          const group = clauses.slice(j, j + 3);
          paragraphs.push(group.join(". ") + ".");
        }

        out.push(paragraphs.join("\n\n"));
        repaired = true;
      } else {
        // Keep as bullets (short discrete items)
        for (let j = 0; j < bulletItems.length; j++) {
          out.push(`${indent}- ${bulletItems[j]}`);
        }
      }
    }

    return { text: out.join("\n"), repaired };
  }

  /**
   * Check if text has valid table structure
   */
  isValidTable(text: string): boolean {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return false;

    // Must have header row
    const header = lines[0].trim();
    if (!header.startsWith("|") || !header.endsWith("|")) return false;

    // Must have separator row
    const separator = lines[1].trim();
    if (!PATTERNS.tableSeparator.test(separator)) return false;

    // Column count must be consistent
    const headerCols = (header.match(/\|/g) || []).length - 1;
    for (let i = 2; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line === "") continue;
      if (!line.startsWith("|") || !line.endsWith("|")) return false;
      const cols = (line.match(/\|/g) || []).length - 1;
      if (cols !== headerCols) return false;
    }

    return true;
  }

  /**
   * Escape pipe characters inside table cells
   */
  escapeTablePipes(cellContent: string): string {
    return cellContent.replace(/\|/g, "\\|");
  }
}

// Singleton
let normalizerInstance: MarkdownNormalizerService | null = null;

export function getMarkdownNormalizer(): MarkdownNormalizerService {
  if (!normalizerInstance) {
    normalizerInstance = new MarkdownNormalizerService();
  }
  return normalizerInstance;
}

export default MarkdownNormalizerService;
