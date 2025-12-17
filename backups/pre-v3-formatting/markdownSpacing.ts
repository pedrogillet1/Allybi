/**
 * Markdown Spacing Utilities
 *
 * Process spacing tokens in markdown responses:
 * - {{BREAK:sm}} → single newline
 * - {{BREAK:md}} → double newline
 * - {{BREAK:lg}} → triple newline
 * - {{SPACE:N}} → newlines based on pixel height
 */

/**
 * Process all spacing tokens in text
 * Converts tokens to actual newlines and cleans up excessive spacing
 */
export function smartProcessSpacing(text: string): string {
  if (!text) return text;

  let processed = text;

  // Process {{BREAK:size}} tokens
  processed = processed.replace(/\{\{BREAK:sm\}\}/g, '\n');
  processed = processed.replace(/\{\{BREAK:md\}\}/g, '\n\n');
  processed = processed.replace(/\{\{BREAK:lg\}\}/g, '\n\n\n');

  // Process {{SPACE:N}} tokens (N = pixel height, convert to newlines)
  // 0-10px = 1 newline, 11-20px = 2 newlines, 21+ = 3 newlines
  processed = processed.replace(/\{\{SPACE:(\d+)\}\}/g, (match, pixels) => {
    const num = parseInt(pixels, 10);
    if (num <= 10) return '\n';
    if (num <= 20) return '\n\n';
    return '\n\n\n';
  });

  // Clean up excessive newlines (max 3 in a row)
  processed = processed.replace(/\n{4,}/g, '\n\n\n');

  // ✅ FIX: Merge numbered list items that are split across lines
  // Pattern: "1.\n" or "1.\n\n" followed by text/link should become "1. text"
  // Handle: markdown links, bold text, plain text
  processed = processed.replace(/^(\d+)\.\s*[\n\r]+\s*(\[)/gm, '$1. $2');  // Links [text](url)
  processed = processed.replace(/^(\d+)\.\s*[\n\r]+\s*(\*\*)/gm, '$1. $2'); // Bold **text**
  processed = processed.replace(/^(\d+)\.\s*[\n\r]+\s*([A-Za-z\"\'\(])/gm, '$1. $2'); // Plain text

  return processed;
}

/**
 * Remove all spacing tokens without processing
 * Used for cleanup when tokens should be stripped entirely
 */
export function removeSpacingTokens(text: string): string {
  return text
    .replace(/\{\{BREAK:(sm|md|lg)\}\}/g, '')
    .replace(/\{\{SPACE:\d+\}\}/g, '');
}
