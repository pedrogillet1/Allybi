/**
 * Clarify Templates Service
 *
 * Provides short, contextual clarify templates for ChatGPT-like interactions.
 * Ensures all clarifications are concise and actionable.
 *
 * Usage:
 * ```typescript
 * const clarifier = getClarifyTemplates();
 * const msg = clarifier.getDisambiguation('multiple_files', 'en', { count: 3 });
 * const confirm = clarifier.getConfirmation('delete', 'en', { filename: 'doc.pdf' });
 * ```
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export type ClarifyCategory =
  | 'disambiguation'
  | 'missing_info'
  | 'confirmation'
  | 'not_found'
  | 'scope_clarify'
  | 'operation_clarify';

export type DisambiguationType =
  | 'multiple_files'
  | 'multiple_values'
  | 'ambiguous_term';

export type MissingInfoType =
  | 'no_document_specified'
  | 'no_field_specified'
  | 'no_period_specified';

export type ConfirmationType = 'delete' | 'action';

export type NotFoundType =
  | 'no_documents'
  | 'no_match'
  | 'data_not_in_doc';

export type ScopeClarifyType = 'all_vs_specific' | 'doc_type';

export type OperationClarifyType = 'summarize_vs_extract' | 'compare_what';

export interface ClarifyContext {
  count?: number;
  filename?: string;
  term?: string;
  query?: string;
  field?: string;
  action?: string;
  target?: string;
  options?: string[];
}

export interface ClarifyResult {
  message: string;
  category: ClarifyCategory;
  hasOptions: boolean;
  options?: string[];
}

interface ClarifyTemplatesData {
  disambiguation: Record<string, Record<string, Record<string, string>>>;
  missing_info: Record<string, Record<string, Record<string, string>>>;
  confirmation: Record<string, Record<string, Record<string, string>>>;
  not_found: Record<string, Record<string, Record<string, string>>>;
  scope_clarify: Record<string, Record<string, Record<string, string>>>;
  operation_clarify: Record<string, Record<string, Record<string, string>>>;
  format_options: Record<string, string>;
  response_styles: Record<string, { description: string; max_chars?: number; max_options?: number }>;
}

// ============================================================================
// Service
// ============================================================================

export class ClarifyTemplatesService {
  private templates: ClarifyTemplatesData | null = null;

  constructor() {
    this.loadTemplates();
  }

  private loadTemplates(): void {
    try {
      const templatePath = path.join(
        __dirname,
        '../../data_banks/templates/clarify_templates.json'
      );

      if (fs.existsSync(templatePath)) {
        this.templates = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
        console.log('✅ [ClarifyTemplates] Templates loaded');
      } else {
        console.warn('⚠️ [ClarifyTemplates] Templates not found');
      }
    } catch (error: any) {
      console.error('❌ [ClarifyTemplates] Load failed:', error.message);
    }
  }

  /**
   * Get disambiguation message
   */
  public getDisambiguation(
    type: DisambiguationType,
    language: 'en' | 'pt' = 'en',
    context?: ClarifyContext
  ): ClarifyResult {
    const templates = this.templates?.disambiguation[type]?.[language];
    if (!templates) {
      return this.getDefault('disambiguation', language, context);
    }

    let message: string;
    let hasOptions = false;
    let options: string[] | undefined;

    if (context?.options && context.options.length > 0) {
      message = this.fillTemplate(templates.with_options || templates.short, context);
      hasOptions = true;
      options = context.options;
    } else if (context?.count) {
      message = this.fillTemplate(templates.with_count || templates.short, context);
    } else {
      message = this.fillTemplate(templates.short, context);
    }

    return { message, category: 'disambiguation', hasOptions, options };
  }

  /**
   * Get missing info clarification
   */
  public getMissingInfo(
    type: MissingInfoType,
    language: 'en' | 'pt' = 'en',
    context?: ClarifyContext
  ): ClarifyResult {
    const templates = this.templates?.missing_info[type]?.[language];
    if (!templates) {
      return this.getDefault('missing_info', language, context);
    }

    let message: string;

    if (context?.count || context?.options) {
      message = this.fillTemplate(templates.with_suggestion || templates.with_examples || templates.short, context);
    } else {
      message = this.fillTemplate(templates.short, context);
    }

    return { message, category: 'missing_info', hasOptions: false };
  }

  /**
   * Get confirmation message
   */
  public getConfirmation(
    type: ConfirmationType,
    language: 'en' | 'pt' = 'en',
    context?: ClarifyContext,
    withWarning = false
  ): ClarifyResult {
    const templates = this.templates?.confirmation[type]?.[language];
    if (!templates) {
      return this.getDefault('confirmation', language, context);
    }

    const message = withWarning && templates.with_warning
      ? this.fillTemplate(templates.with_warning, context)
      : this.fillTemplate(templates.short, context);

    return { message, category: 'confirmation', hasOptions: false };
  }

  /**
   * Get not found message
   */
  public getNotFound(
    type: NotFoundType,
    language: 'en' | 'pt' = 'en',
    context?: ClarifyContext
  ): ClarifyResult {
    const templates = this.templates?.not_found[type]?.[language];
    if (!templates) {
      return this.getDefault('not_found', language, context);
    }

    let message: string;

    if (context?.query || context?.field || context?.filename) {
      message = this.fillTemplate(templates.with_suggestion || templates.with_detail || templates.short, context);
    } else {
      message = this.fillTemplate(templates.short, context);
    }

    return { message, category: 'not_found', hasOptions: false };
  }

  /**
   * Get scope clarification
   */
  public getScopeClarify(
    type: ScopeClarifyType,
    language: 'en' | 'pt' = 'en',
    context?: ClarifyContext
  ): ClarifyResult {
    const templates = this.templates?.scope_clarify[type]?.[language];
    if (!templates) {
      return this.getDefault('scope_clarify', language, context);
    }

    let message: string;

    if (context?.count) {
      message = this.fillTemplate(templates.with_context || templates.short, context);
    } else if (context?.options) {
      message = this.fillTemplate(templates.with_options || templates.short, context);
    } else {
      message = this.fillTemplate(templates.short, context);
    }

    return { message, category: 'scope_clarify', hasOptions: !!context?.options, options: context?.options };
  }

  /**
   * Get operation clarification
   */
  public getOperationClarify(
    type: OperationClarifyType,
    language: 'en' | 'pt' = 'en',
    context?: ClarifyContext
  ): ClarifyResult {
    const templates = this.templates?.operation_clarify[type]?.[language];
    if (!templates) {
      return this.getDefault('operation_clarify', language, context);
    }

    let message: string;

    if (context?.filename) {
      message = this.fillTemplate(templates.with_context || templates.short, context);
    } else if (context?.options) {
      message = this.fillTemplate(templates.with_options || templates.short, context);
    } else {
      message = this.fillTemplate(templates.short, context);
    }

    return { message, category: 'operation_clarify', hasOptions: !!context?.options, options: context?.options };
  }

  /**
   * Fill template with context values
   */
  private fillTemplate(template: string, context?: ClarifyContext): string {
    if (!context) return template;

    let result = template;

    // Replace placeholders
    if (context.count !== undefined) {
      result = result.replace(/{count}/g, String(context.count));
    }
    if (context.filename) {
      result = result.replace(/{filename}/g, context.filename);
    }
    if (context.term) {
      result = result.replace(/{term}/g, context.term);
    }
    if (context.query) {
      result = result.replace(/{query}/g, context.query);
    }
    if (context.field) {
      result = result.replace(/{field}/g, context.field);
    }
    if (context.action) {
      result = result.replace(/{action}/g, context.action);
    }
    if (context.target) {
      result = result.replace(/{target}/g, context.target);
    }

    // Replace options placeholder
    if (context.options && context.options.length > 0) {
      const formattedOptions = context.options
        .map((opt, i) => `${i + 1}. ${opt}`)
        .join('\n');
      result = result.replace(/{options}/g, formattedOptions);
    }

    return result;
  }

  /**
   * Get default message for category
   */
  private getDefault(
    category: ClarifyCategory,
    language: 'en' | 'pt',
    _context?: ClarifyContext
  ): ClarifyResult {
    const defaults: Record<string, Record<string, string>> = {
      en: {
        disambiguation: 'Which one?',
        missing_info: 'Could you specify?',
        confirmation: 'Proceed?',
        not_found: 'Not found.',
        scope_clarify: 'All or specific?',
        operation_clarify: 'What would you like?',
      },
      pt: {
        disambiguation: 'Qual deles?',
        missing_info: 'Pode especificar?',
        confirmation: 'Prosseguir?',
        not_found: 'Não encontrado.',
        scope_clarify: 'Todos ou específico?',
        operation_clarify: 'O que você gostaria?',
      },
    };

    return {
      message: defaults[language]?.[category] || defaults.en[category] || 'Please clarify.',
      category,
      hasOptions: false,
    };
  }

  /**
   * Format options for display
   */
  public formatOptions(options: string[], style: 'numbered' | 'bullet' | 'inline' = 'numbered'): string {
    if (style === 'numbered') {
      return options.map((opt, i) => `${i + 1}. ${opt}`).join('\n');
    } else if (style === 'bullet') {
      return options.map((opt) => `• ${opt}`).join('\n');
    } else {
      return options.join(', ');
    }
  }

  /**
   * Build complete clarification response
   */
  public buildClarification(
    category: ClarifyCategory,
    type: string,
    language: 'en' | 'pt' = 'en',
    context?: ClarifyContext
  ): ClarifyResult {
    switch (category) {
      case 'disambiguation':
        return this.getDisambiguation(type as DisambiguationType, language, context);
      case 'missing_info':
        return this.getMissingInfo(type as MissingInfoType, language, context);
      case 'confirmation':
        return this.getConfirmation(type as ConfirmationType, language, context);
      case 'not_found':
        return this.getNotFound(type as NotFoundType, language, context);
      case 'scope_clarify':
        return this.getScopeClarify(type as ScopeClarifyType, language, context);
      case 'operation_clarify':
        return this.getOperationClarify(type as OperationClarifyType, language, context);
      default:
        return this.getDefault(category, language, context);
    }
  }

  /**
   * Get short "which file" clarification with options
   */
  public whichFile(
    filenames: string[],
    language: 'en' | 'pt' = 'en'
  ): ClarifyResult {
    return this.getDisambiguation('multiple_files', language, {
      count: filenames.length,
      options: filenames.slice(0, 5), // Limit to 5 options
    });
  }

  /**
   * Get delete confirmation
   */
  public confirmDelete(
    filename: string,
    language: 'en' | 'pt' = 'en'
  ): ClarifyResult {
    return this.getConfirmation('delete', language, { filename }, true);
  }

  /**
   * Get "not found" message
   */
  public noMatch(
    query: string,
    language: 'en' | 'pt' = 'en'
  ): ClarifyResult {
    return this.getNotFound('no_match', language, { query });
  }

  /**
   * Get service stats
   */
  public getStats(): {
    categoryCount: number;
    templateCount: number;
  } {
    let templateCount = 0;

    const categories = [
      'disambiguation',
      'missing_info',
      'confirmation',
      'not_found',
      'scope_clarify',
      'operation_clarify',
    ] as const;

    for (const cat of categories) {
      const catData = this.templates?.[cat];
      if (catData) {
        for (const type of Object.values(catData)) {
          for (const lang of Object.values(type)) {
            templateCount += Object.keys(lang).length;
          }
        }
      }
    }

    return {
      categoryCount: categories.length,
      templateCount,
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let instance: ClarifyTemplatesService | null = null;

export function getClarifyTemplates(): ClarifyTemplatesService {
  if (!instance) {
    instance = new ClarifyTemplatesService();
  }
  return instance;
}

export default ClarifyTemplatesService;
