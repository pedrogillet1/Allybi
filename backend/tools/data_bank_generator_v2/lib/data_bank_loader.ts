/**
 * Data Bank Loader
 *
 * Loads and validates data banks from the file system.
 * Provides a singleton registry with caching.
 */

import * as fs from "fs";
import * as path from "path";
import {
  BankType,
  detectBankType,
  validateBank,
  ValidationResult,
} from "../schemas/bank_schemas";

// ============================================================================
// TYPES
// ============================================================================

export interface LoadedBank<T = any> {
  id: string;
  type: BankType;
  language: string | null;
  data: T[];
  count: number;
  filePath: string;
  loadedAt: Date;
  validation: ValidationResult;
}

export interface BankRegistry {
  banks: Map<string, LoadedBank>;
  loadedAt: Date;
  errors: string[];
}

// ============================================================================
// LOADER CLASS
// ============================================================================

export class DataBankLoader {
  private static instance: DataBankLoader | null = null;
  private registry: BankRegistry;
  private basePath: string;

  private constructor(basePath: string) {
    this.basePath = basePath;
    this.registry = {
      banks: new Map(),
      loadedAt: new Date(),
      errors: [],
    };
  }

  static getInstance(basePath?: string): DataBankLoader {
    if (!DataBankLoader.instance) {
      const defaultPath = path.join(__dirname, "../../../src/data_banks");
      DataBankLoader.instance = new DataBankLoader(basePath || defaultPath);
    }
    return DataBankLoader.instance;
  }

  static resetInstance(): void {
    DataBankLoader.instance = null;
  }

  /**
   * Load all banks from the data_banks directory
   */
  loadAll(): void {
    this.registry = {
      banks: new Map(),
      loadedAt: new Date(),
      errors: [],
    };

    const files = this.findAllJsonFiles(this.basePath);

    for (const file of files) {
      try {
        const bank = this.loadBankFile(file);
        if (bank) {
          this.registry.banks.set(bank.id, bank);
        }
      } catch (error: any) {
        this.registry.errors.push(`Failed to load ${file}: ${error.message}`);
      }
    }
  }

  /**
   * Load a specific bank file
   */
  private loadBankFile(filePath: string): LoadedBank | null {
    const relativePath = path.relative(this.basePath, filePath);
    const filename = path.basename(filePath);

    // Skip non-array format files (like pattern_bank.runtime.json)
    const content = fs.readFileSync(filePath, "utf-8");
    let data: any;

    try {
      data = JSON.parse(content);
    } catch (e) {
      return null;
    }

    if (!Array.isArray(data)) {
      return null;
    }

    const type = detectBankType(relativePath);
    const language = this.extractLanguage(filename);
    const bankName = this.extractBankName(filename);
    const id = this.generateBankId(relativePath, bankName, language);

    const validation = validateBank(data, type);

    return {
      id,
      type,
      language,
      data,
      count: data.length,
      filePath,
      loadedAt: new Date(),
      validation,
    };
  }

  /**
   * Get a bank by ID
   */
  getBank<T = any>(bankId: string): LoadedBank<T> | undefined {
    return this.registry.banks.get(bankId) as LoadedBank<T> | undefined;
  }

  /**
   * Get a bank by name and language
   */
  getBankByName<T = any>(name: string, language?: string): LoadedBank<T> | undefined {
    for (const bank of this.registry.banks.values()) {
      const bankName = this.extractBankName(path.basename(bank.filePath));
      if (bankName === name) {
        if (!language || bank.language === language || bank.language === null) {
          return bank as LoadedBank<T>;
        }
      }
    }
    return undefined;
  }

  /**
   * Get all banks of a specific type
   */
  getBanksByType<T = any>(type: BankType): LoadedBank<T>[] {
    return Array.from(this.registry.banks.values()).filter(
      (bank) => bank.type === type
    ) as LoadedBank<T>[];
  }

  /**
   * Get all patterns from banks of a type, for a specific language
   */
  getPatternsForType<T = any>(type: BankType, language?: string): T[] {
    const banks = this.getBanksByType<T>(type);
    const patterns: T[] = [];

    for (const bank of banks) {
      if (!language || bank.language === language || bank.language === null) {
        patterns.push(...bank.data);
      }
    }

    return patterns;
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    totalBanks: number;
    totalPatterns: number;
    byType: Record<BankType, { count: number; patterns: number }>;
    errors: string[];
  } {
    const byType: Record<BankType, { count: number; patterns: number }> = {
      trigger: { count: 0, patterns: 0 },
      negative: { count: 0, patterns: 0 },
      overlay: { count: 0, patterns: 0 },
      formatting: { count: 0, patterns: 0 },
      normalizer: { count: 0, patterns: 0 },
      lexicon: { count: 0, patterns: 0 },
      unknown: { count: 0, patterns: 0 },
    };

    let totalPatterns = 0;

    for (const bank of this.registry.banks.values()) {
      byType[bank.type].count++;
      byType[bank.type].patterns += bank.count;
      totalPatterns += bank.count;
    }

    return {
      totalBanks: this.registry.banks.size,
      totalPatterns,
      byType,
      errors: this.registry.errors,
    };
  }

  /**
   * Validate all loaded banks
   */
  validateAll(): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const bank of this.registry.banks.values()) {
      if (!bank.validation.valid) {
        errors.push(`${bank.id}: ${bank.validation.errors.join(", ")}`);
      }
      if (bank.validation.warnings.length > 0) {
        warnings.push(`${bank.id}: ${bank.validation.warnings.join(", ")}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private findAllJsonFiles(dir: string): string[] {
    const files: string[] = [];

    const walk = (currentDir: string) => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.name.endsWith(".json")) {
          files.push(fullPath);
        }
      }
    };

    if (fs.existsSync(dir)) {
      walk(dir);
    }

    return files.sort();
  }

  private extractLanguage(filename: string): string | null {
    const match = filename.match(/\.([a-z]{2})\.json$/);
    return match ? match[1] : null;
  }

  private extractBankName(filename: string): string {
    return filename.replace(/\.[a-z]{2}\.json$/, "").replace(/\.json$/, "");
  }

  private generateBankId(relativePath: string, name: string, language: string | null): string {
    const category = relativePath.split(path.sep)[0];
    const langSuffix = language ? `.${language}` : "";
    return `${category}:${name}${langSuffix}`;
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

export function loadDataBanks(basePath?: string): DataBankLoader {
  const loader = DataBankLoader.getInstance(basePath);
  loader.loadAll();
  return loader;
}

export function getBank<T = any>(bankId: string): LoadedBank<T> | undefined {
  return DataBankLoader.getInstance().getBank<T>(bankId);
}

export function getBankPatterns<T = any>(type: BankType, language?: string): T[] {
  return DataBankLoader.getInstance().getPatternsForType<T>(type, language);
}
