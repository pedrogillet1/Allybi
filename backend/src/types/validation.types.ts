/**
 * Validation System Type Definitions
 */

export type ValidationSeverity = 'critical' | 'fixable' | 'warning';
export type ValidationCategory = 'citations' | 'formatting' | 'structure' | 'content' | 'quality';
export type RecommendedAction = 'pass' | 'reformat' | 'regenerate' | 'fallback';

/**
 * Configuration for validation engine
 */
export interface ValidatorConfig {
  strictMode: boolean;          // Enforce all rules strictly
  autoFix: boolean;              // Automatically fix fixable issues
  logWarnings: boolean;          // Log warnings to console
  failOnCritical: boolean;       // Fail validation on critical errors
}

/**
 * Parsed answer components
 */
export interface AnswerComponents {
  title: string | null;
  headings: Array<{
    level: number;
    text: string;
    position: number;
  }>;
  paragraphs: string[];
  inlineCitations: Array<{
    text: string;
    position: number;
    fullMatch: string;
  }>;
  listCitations: Array<{
    text: string;
    position: number;
    fullMatch: string;
  }>;
  boldElements: Array<{
    text: string;
    position: number;
    fullMatch: string;
  }>;
  lists: Array<{
    text: string;
    position: number;
    fullMatch: string;
  }>;
  rawText: string;
  lineCount: number;
  characterCount: number;
}

/**
 * Result from a single validator
 */
export interface ValidationResult {
  ruleId: string;
  ruleName: string;
  category: ValidationCategory;
  severity: ValidationSeverity;
  passed: boolean;
  message: string;
  fixable: boolean;
  fix?: string;                  // Suggested fix
  location?: {                   // Where the issue is
    line?: number;
    position?: number;
    text?: string;
  };
  details?: any;                 // Additional details
}

/**
 * Complete validation report
 */
export interface ValidationReport {
  passed: boolean;
  qualityScore: number;          // 0-100
  errors: ValidationResult[];    // Critical errors
  fixable: ValidationResult[];   // Fixable issues
  warnings: ValidationResult[];  // Warnings
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  recommendedAction: RecommendedAction;
  validationTimeMs: number;
  components: AnswerComponents;
  summary: string;
}

/**
 * Validation rule definition
 */
export interface ValidationRule {
  id: string;
  name: string;
  category: ValidationCategory;
  severity: ValidationSeverity;
  validator: ValidatorFunction;
  enabled: boolean;
}

/**
 * Validator function signature
 */
export type ValidatorFunction = (
  components: AnswerComponents,
  metadata: any,
  config: ValidatorConfig
) => Promise<Omit<ValidationResult, 'ruleId' | 'ruleName' | 'category' | 'severity'>>;
