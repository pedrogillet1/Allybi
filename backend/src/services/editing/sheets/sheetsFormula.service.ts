import {
  SheetsClientError,
  SheetsClientService,
  type SheetsRequestContext,
} from './sheetsClient.service';
import { SheetsValidatorsService } from './sheetsValidators.service';

const ALLOWED_FORMULA_CHARS = /^[A-Z0-9_\s()+\-*/^&=,:.$!<>"'%;]+$/i;
const REFERENCE_REGEX = /(?:'[^']+'|[A-Za-z0-9_\- ]+)!\$?[A-Z]+\$?\d+(?::\$?[A-Z]+\$?\d+)?|\$?[A-Z]+\$?\d+(?::\$?[A-Z]+\$?\d+)?/g;
const FORBIDDEN_EXTERNAL_FUNCTIONS = ['IMPORTDATA', 'IMPORTXML', 'IMPORTHTML', 'IMPORTRANGE', 'GOOGLEFINANCE'];

export interface FormulaValidationResult {
  valid: boolean;
  reasons: string[];
  references: string[];
}

export interface FormulaReferenceValidationResult {
  valid: boolean;
  missingRanges: string[];
  resolvedRanges: string[];
}

/**
 * Formula safety/validation and write service.
 */
export class SheetsFormulaService {
  private readonly validators: SheetsValidatorsService;

  constructor(private readonly sheetsClient: SheetsClientService = new SheetsClientService()) {
    this.validators = new SheetsValidatorsService(this.sheetsClient);
  }

  validateFormula(formula: string): FormulaValidationResult {
    const reasons: string[] = [];
    const normalized = formula.trim();

    if (!normalized.startsWith('=')) {
      reasons.push('Formula must start with =.');
      return { valid: false, reasons, references: [] };
    }

    if (!ALLOWED_FORMULA_CHARS.test(normalized)) {
      reasons.push('Formula contains unsupported characters.');
    }

    if (!this.hasBalancedParentheses(normalized)) {
      reasons.push('Formula has unbalanced parentheses.');
    }

    const upper = normalized.toUpperCase();
    for (const fn of FORBIDDEN_EXTERNAL_FUNCTIONS) {
      if (upper.includes(`${fn}(`)) {
        reasons.push(`Function ${fn} is blocked by policy.`);
      }
    }

    const references = this.extractReferences(normalized);

    return {
      valid: reasons.length === 0,
      reasons,
      references,
    };
  }

  async setFormula(
    spreadsheetId: string,
    a1: string,
    formula: string,
    ctx?: SheetsRequestContext,
  ): Promise<void> {
    const formulaValidation = this.validateFormula(formula);
    if (!formulaValidation.valid) {
      throw new SheetsClientError(formulaValidation.reasons.join(' '), {
        code: 'INVALID_FORMULA',
        retryable: false,
      });
    }

    const refsValidation = await this.validateReferences(spreadsheetId, formulaValidation.references, ctx);
    if (!refsValidation.valid) {
      throw new SheetsClientError(`Formula references missing ranges: ${refsValidation.missingRanges.join(', ')}`, {
        code: 'MISSING_FORMULA_REFERENCES',
        retryable: false,
      });
    }

    await this.sheetsClient.setValues(spreadsheetId, a1, [[formula]], ctx);
  }

  async validateReferences(
    spreadsheetId: string,
    referencesOrFormula: string[] | string,
    ctx?: SheetsRequestContext,
  ): Promise<FormulaReferenceValidationResult> {
    const references = Array.isArray(referencesOrFormula)
      ? Array.from(new Set(referencesOrFormula.map((entry) => entry.trim()).filter(Boolean)))
      : this.extractReferences(referencesOrFormula);

    if (references.length === 0) {
      return { valid: true, missingRanges: [], resolvedRanges: [] };
    }

    const missingRanges: string[] = [];
    const resolvedRanges: string[] = [];

    for (const reference of references) {
      const isValid = await this.validateSingleReference(spreadsheetId, reference, ctx);
      if (isValid) {
        resolvedRanges.push(reference);
      } else {
        missingRanges.push(reference);
      }
    }

    return {
      valid: missingRanges.length === 0,
      missingRanges,
      resolvedRanges,
    };
  }

  private async validateSingleReference(
    spreadsheetId: string,
    reference: string,
    ctx?: SheetsRequestContext,
  ): Promise<boolean> {
    const normalized = reference.replace(/\$/g, '');
    const withSheet = normalized.includes('!');

    if (withSheet) {
      const bounds = await this.validators.validateRangeWithinBounds(spreadsheetId, normalized, ctx);
      return bounds.valid;
    }

    const spreadsheet = await this.sheetsClient.getSpreadsheet(spreadsheetId, ctx);
    const sheets = spreadsheet.sheets ?? [];

    for (const sheet of sheets) {
      const name = sheet.properties?.title;
      if (!name) continue;
      const bounds = await this.validators.validateRangeWithinBounds(spreadsheetId, `${name}!${normalized}`, ctx);
      if (bounds.valid) return true;
    }

    return false;
  }

  private extractReferences(formula: string): string[] {
    const clean = formula.trim();
    const matches = clean.match(REFERENCE_REGEX) || [];
    return Array.from(new Set(matches));
  }

  private hasBalancedParentheses(formula: string): boolean {
    let depth = 0;
    let inString = false;

    for (let i = 0; i < formula.length; i += 1) {
      const char = formula[i];
      if (char === '"') inString = !inString;
      if (inString) continue;

      if (char === '(') depth += 1;
      if (char === ')') {
        depth -= 1;
        if (depth < 0) return false;
      }
    }

    return depth === 0;
  }
}

export default SheetsFormulaService;
