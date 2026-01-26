/**
 * Markdown Validator
 * Validates markdown formatting in responses
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateMarkdown(text: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check for unclosed bold markers
  const boldCount = (text.match(/\*\*/g) || []).length;
  if (boldCount % 2 !== 0) {
    errors.push('Unclosed bold markers (**) detected');
  }
  
  // Check for unclosed code blocks
  const codeBlockCount = (text.match(/```/g) || []).length;
  if (codeBlockCount % 2 !== 0) {
    errors.push('Unclosed code block detected');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
