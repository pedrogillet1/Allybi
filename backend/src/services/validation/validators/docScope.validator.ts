/**
 * Document Scope Validator
 * Validates that responses stay within document scope
 */

export interface ScopeValidationResult {
  inScope: boolean;
  outOfScopeReferences: string[];
}

export function validateDocScope(
  response: string,
  allowedDocIds: string[],
  mentionedDocIds: string[]
): ScopeValidationResult {
  const outOfScope = mentionedDocIds.filter(id => !allowedDocIds.includes(id));
  
  return {
    inScope: outOfScope.length === 0,
    outOfScopeReferences: outOfScope,
  };
}
