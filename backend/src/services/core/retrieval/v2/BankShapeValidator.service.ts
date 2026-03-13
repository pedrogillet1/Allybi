/**
 * BankShapeValidator — validates critical bank shapes at load time.
 *
 * Each critical bank has a required shape spec. If validation fails
 * in fail-closed mode the pipeline returns an empty pack; in fail-open
 * mode it logs a warning and continues.
 */

import { logger } from "../../../../utils/logger";
import { BANK_IDS } from "./retrieval.config";

// ── Shape Specs ──────────────────────────────────────────────────────

interface ShapeSpec {
  /** Human-readable label for error messages. */
  label: string;
  /** Validation predicate: returns list of error strings (empty = valid). */
  validate: (bank: unknown) => string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasNestedPath(obj: unknown, path: string[]): boolean {
  let current: unknown = obj;
  for (const key of path) {
    if (!isObject(current)) return false;
    current = (current as Record<string, unknown>)[key];
  }
  return current !== undefined && current !== null;
}

const SHAPE_SPECS: Record<string, ShapeSpec> = {
  [BANK_IDS.semanticSearchConfig]: {
    label: "semantic_search_config",
    validate(bank: unknown): string[] {
      const errors: string[] = [];
      if (!isObject(bank)) {
        errors.push("Bank must be an object");
        return errors;
      }
      const config = (bank as Record<string, unknown>).config;
      if (!isObject(config)) {
        errors.push("Missing 'config' object");
        return errors;
      }
      const hybridPhases = (config as Record<string, unknown>).hybridPhases;
      if (!Array.isArray(hybridPhases)) {
        errors.push("Missing 'config.hybridPhases' array");
      }
      return errors;
    },
  },

  [BANK_IDS.retrievalRankerConfig]: {
    label: "retrieval_ranker_config",
    validate(bank: unknown): string[] {
      const errors: string[] = [];
      if (!isObject(bank)) {
        errors.push("Bank must be an object");
        return errors;
      }
      const config = (bank as Record<string, unknown>).config;
      if (!isObject(config)) {
        errors.push("Missing 'config' object");
        return errors;
      }
      const weights = (config as Record<string, unknown>).weights;
      if (!isObject(weights)) {
        errors.push("Missing 'config.weights' object");
        return errors;
      }
      if (!("semantic" in (weights as Record<string, unknown>))) {
        errors.push("Missing 'config.weights.semantic' key");
      }
      return errors;
    },
  },

  [BANK_IDS.retrievalNegatives]: {
    label: "retrieval_negatives",
    validate(bank: unknown): string[] {
      const errors: string[] = [];
      if (!isObject(bank)) {
        errors.push("Bank must be an object");
        return errors;
      }
      const config = (bank as Record<string, unknown>).config;
      if (!isObject(config)) {
        errors.push("Missing 'config' object");
        return errors;
      }
      return errors;
    },
  },

  [BANK_IDS.evidencePackaging]: {
    label: "evidence_packaging",
    validate(bank: unknown): string[] {
      const errors: string[] = [];
      if (!isObject(bank)) {
        errors.push("Bank must be an object");
        return errors;
      }
      if (!hasNestedPath(bank, ["config", "actionsContract", "thresholds"])) {
        errors.push("Missing 'config.actionsContract.thresholds' object");
        return errors;
      }
      const thresholds = (
        (
          (bank as Record<string, unknown>).config as Record<string, unknown>
        ).actionsContract as Record<string, unknown>
      ).thresholds;
      if (!isObject(thresholds)) {
        errors.push("'config.actionsContract.thresholds' must be an object");
      }
      return errors;
    },
  },

  [BANK_IDS.diversificationRules]: {
    label: "diversification_rules",
    validate(bank: unknown): string[] {
      const errors: string[] = [];
      if (!isObject(bank)) {
        errors.push("Bank must be an object");
        return errors;
      }
      const config = (bank as Record<string, unknown>).config;
      if (!isObject(config)) {
        errors.push("Missing 'config' object");
        return errors;
      }
      return errors;
    },
  },
};

// ── Public API ───────────────────────────────────────────────────────

export interface BankValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate the shape of a single bank against its expected spec.
 * Banks without a registered spec are considered valid.
 */
export function validateBankShape(
  bankId: string,
  bank: unknown,
): BankValidationResult {
  const spec = SHAPE_SPECS[bankId];
  if (!spec) return { valid: true, errors: [] };

  const errors = spec.validate(bank);
  if (errors.length > 0) {
    logger.warn("[retrieval] Bank shape validation failed", {
      bankId,
      label: spec.label,
      errors,
    });
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Validate all critical banks in a loaded bank map.
 * Returns aggregated validation results.
 */
export function validateAllCriticalBanks(
  banks: Record<string, unknown>,
): { allValid: boolean; failures: Array<{ bankId: string; errors: string[] }> } {
  const failures: Array<{ bankId: string; errors: string[] }> = [];

  for (const bankId of Object.keys(SHAPE_SPECS)) {
    const bank = banks[bankId];
    if (bank === undefined || bank === null) {
      failures.push({ bankId, errors: [`Bank '${bankId}' not loaded`] });
      continue;
    }
    const result = validateBankShape(bankId, bank);
    if (!result.valid) {
      failures.push({ bankId, errors: result.errors });
    }
  }

  return { allValid: failures.length === 0, failures };
}
