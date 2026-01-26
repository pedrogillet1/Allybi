/**
 * Numeric Validator
 * Validates numeric values in responses
 */

export interface NumericValidationResult {
  valid: boolean;
  issues: string[];
}

export function validateNumericConsistency(
  text: string, 
  sourceNumbers: number[]
): NumericValidationResult {
  const issues: string[] = [];
  
  // Extract numbers from text
  const extractedNumbers = text.match(/\d+(?:\.\d+)?/g)?.map(Number) || [];
  
  // Check if extracted numbers appear in source
  for (const num of extractedNumbers) {
    if (!sourceNumbers.some(s => Math.abs(s - num) < 0.001)) {
      issues.push(`Number ${num} not found in source data`);
    }
  }
  
  return {
    valid: issues.length === 0,
    issues,
  };
}
