/**
 * Template Governance Service
 *
 * Controls which templates can be used for which operators.
 * Ensures consistent output formatting across all responses.
 *
 * Usage:
 * ```typescript
 * const gov = getTemplateGovernance();
 * const template = gov.getTemplate('summarize', { bullets_requested: true });
 * const validated = gov.validateOutput('summarize', output);
 * ```
 */

import * as fs from 'fs';
import * as path from 'path';
import type { OperatorType } from './operatorResolver.service';

// ============================================================================
// Types
// ============================================================================

export type TemplateId =
  | 'list_inventory' | 'list_filtered'
  | 'summary_bullets' | 'summary_paragraph'
  | 'extract_value' | 'extract_table'
  | 'locate_content_page' | 'locate_content_cell'
  | 'locate_file_path'
  | 'compare_table' | 'compare_prose'
  | 'compute_result'
  | 'explain_reasoning'
  | 'clarify_question' | 'disambiguate_files'
  | 'open_file'
  | 'error_not_found' | 'error_no_data'
  | string;

export interface TemplateDefinition {
  description: string;
  format: string;
  requires?: string[];
  optional?: string[];
  min_bullets?: number;
  max_bullets?: number;
  max_sentences?: number;
  example_en?: string;
  example_pt?: string;
  text?: string;
}

export interface OperatorGovernance {
  allowed_templates: TemplateId[];
  default_template: TemplateId | null;
  preamble_allowed: boolean;
  followup_allowed: boolean;
  button_only?: boolean;
  free_form?: boolean;
  constraint_overrides?: Record<string, TemplateId>;
}

interface TemplatePolicy {
  template_catalog: Record<TemplateId, TemplateDefinition>;
  operator_governance: Record<string, OperatorGovernance>;
  format_constraints: Record<string, Record<string, any>>;
  error_templates: Record<string, Record<string, string>>;
}

export interface TemplateContext {
  bullets_requested?: boolean;
  paragraph_requested?: boolean;
  table_requested?: boolean;
  prose_requested?: boolean;
  multiple_values?: boolean;
  single_value?: boolean;
  spreadsheet?: boolean;
  document?: boolean;
}

// ============================================================================
// Service
// ============================================================================

export class TemplateGovernanceService {
  private policy: TemplatePolicy | null = null;

  constructor() {
    this.loadPolicy();
  }

  private loadPolicy(): void {
    try {
      const policyPath = path.join(
        __dirname,
        '../../data_banks/formatting/operator_templates.json'
      );

      if (fs.existsSync(policyPath)) {
        this.policy = JSON.parse(fs.readFileSync(policyPath, 'utf-8'));
        console.log('✅ [TemplateGovernance] Policy loaded');
      } else {
        console.warn('⚠️ [TemplateGovernance] Policy not found');
      }
    } catch (error: any) {
      console.error('❌ [TemplateGovernance] Load failed:', error.message);
    }
  }

  /**
   * Get governance rules for an operator
   */
  public getGovernance(operator: OperatorType): OperatorGovernance | null {
    return this.policy?.operator_governance[operator] || null;
  }

  /**
   * Get the appropriate template for an operator
   */
  public getTemplate(
    operator: OperatorType,
    context?: TemplateContext
  ): TemplateId | null {
    const governance = this.getGovernance(operator);
    if (!governance) return null;

    // Check for constraint overrides
    if (context && governance.constraint_overrides) {
      for (const [key, templateId] of Object.entries(governance.constraint_overrides)) {
        if (context[key as keyof TemplateContext]) {
          return templateId;
        }
      }
    }

    return governance.default_template;
  }

  /**
   * Get template definition
   */
  public getTemplateDefinition(templateId: TemplateId): TemplateDefinition | null {
    return this.policy?.template_catalog[templateId] || null;
  }

  /**
   * Check if operator allows preamble
   */
  public allowsPreamble(operator: OperatorType): boolean {
    const governance = this.getGovernance(operator);
    return governance?.preamble_allowed ?? false;
  }

  /**
   * Check if operator allows follow-up suggestions
   */
  public allowsFollowup(operator: OperatorType): boolean {
    const governance = this.getGovernance(operator);
    return governance?.followup_allowed ?? true;
  }

  /**
   * Check if operator is button-only (no text response)
   */
  public isButtonOnly(operator: OperatorType): boolean {
    const governance = this.getGovernance(operator);
    return governance?.button_only ?? false;
  }

  /**
   * Check if operator allows free-form output
   */
  public isFreeForm(operator: OperatorType): boolean {
    const governance = this.getGovernance(operator);
    return governance?.free_form ?? false;
  }

  /**
   * Check if template is allowed for operator
   */
  public isTemplateAllowed(operator: OperatorType, templateId: TemplateId): boolean {
    const governance = this.getGovernance(operator);
    if (!governance) return false;
    return governance.allowed_templates.includes(templateId);
  }

  /**
   * Get format constraints
   */
  public getFormatConstraints(format: string): Record<string, any> | null {
    return this.policy?.format_constraints[format] || null;
  }

  /**
   * Get error template
   */
  public getErrorTemplate(
    errorType: 'not_found' | 'no_data' | 'ambiguous' | 'partial',
    language: 'en' | 'pt' = 'en',
    replacements?: Record<string, string>
  ): string {
    let template = this.policy?.error_templates[language]?.[errorType] || '';

    if (replacements) {
      for (const [key, value] of Object.entries(replacements)) {
        template = template.replace(`{${key}}`, value);
      }
    }

    return template;
  }

  /**
   * Validate output matches template requirements
   */
  public validateOutput(
    operator: OperatorType,
    output: string,
    templateId?: TemplateId
  ): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    const governance = this.getGovernance(operator);
    if (!governance) {
      return { valid: true, issues: [] };
    }

    // Check preamble
    if (!governance.preamble_allowed) {
      const preamblePatterns = [
        /^here (is|are)/i,
        /^i found/i,
        /^based on/i,
        /^sure,?/i,
        /^let me/i,
      ];

      for (const pattern of preamblePatterns) {
        if (pattern.test(output.trim())) {
          issues.push(`Preamble detected for ${operator} operator`);
          break;
        }
      }
    }

    // Check template constraints
    const template = templateId || governance.default_template;
    if (template) {
      const def = this.getTemplateDefinition(template);
      if (def) {
        // Check bullet count for bullet templates
        if (def.format === 'bullets') {
          const bulletCount = (output.match(/^[•\-\*]\s/gm) || []).length;
          if (def.min_bullets && bulletCount < def.min_bullets) {
            issues.push(`Too few bullets: ${bulletCount} < ${def.min_bullets}`);
          }
          if (def.max_bullets && bulletCount > def.max_bullets) {
            issues.push(`Too many bullets: ${bulletCount} > ${def.max_bullets}`);
          }
        }

        // Check sentence count for paragraph templates
        if (def.format === 'paragraph') {
          const sentenceCount = (output.match(/[.!?]+/g) || []).length;
          if (def.max_sentences && sentenceCount > def.max_sentences) {
            issues.push(`Too many sentences: ${sentenceCount} > ${def.max_sentences}`);
          }
        }
      }
    }

    return { valid: issues.length === 0, issues };
  }

  /**
   * Get example output for template
   */
  public getExample(templateId: TemplateId, language: 'en' | 'pt' = 'en'): string | null {
    const def = this.getTemplateDefinition(templateId);
    if (!def) return null;

    return language === 'pt' && def.example_pt ? def.example_pt : def.example_en || null;
  }

  /**
   * Get all templates for an operator
   */
  public getAllowedTemplates(operator: OperatorType): TemplateId[] {
    const governance = this.getGovernance(operator);
    return governance?.allowed_templates || [];
  }

  /**
   * Get service stats
   */
  public getStats(): {
    templateCount: number;
    operatorCount: number;
  } {
    return {
      templateCount: Object.keys(this.policy?.template_catalog || {}).length,
      operatorCount: Object.keys(this.policy?.operator_governance || {}).length,
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let instance: TemplateGovernanceService | null = null;

export function getTemplateGovernance(): TemplateGovernanceService {
  if (!instance) {
    instance = new TemplateGovernanceService();
  }
  return instance;
}

export default TemplateGovernanceService;
