/**
 * Trust Gate Service
 *
 * Ensures system never invents facts and states plainly when evidence is missing.
 * Detects potential hallucinations and enforces citation requirements.
 *
 * Usage:
 * ```typescript
 * const trustGate = getTrustGate();
 * const validation = trustGate.validate(answer, chunks, language);
 * const noEvidence = trustGate.getNoEvidenceResponse('field_not_found', 'en', { field: 'EBITDA' });
 * ```
 */

import * as fs from "fs";
import * as path from "path";

// ============================================================================
// Types
// ============================================================================

export type NoEvidenceType =
  | "not_in_document"
  | "not_in_documents"
  | "field_not_found"
  | "no_data_for_period"
  | "partial_data"
  | "no_match"
  | "ambiguous_no_evidence"
  | "calculation_impossible";

export type ConfidenceLevel = "high" | "medium" | "low" | "none";

export type LimitationType =
  | "cant_access"
  | "outside_docs"
  | "need_more_context"
  | "ambiguous_results"
  | "incomplete_extraction";

export interface TrustContext {
  filename?: string;
  field?: string;
  period?: string;
  partial?: string;
  query?: string;
  missing_field?: string;
  fact?: string;
  value?: string;
  source?: string;
}

export interface ChunkEvidence {
  text: string;
  score: number;
  source?: string;
  pageNumber?: number;
}

export interface ValidationResult {
  trusted: boolean;
  issues: TrustIssue[];
  groundedClaims: number;
  ungroundedClaims: number;
  recommendedAction: "pass" | "add_citation" | "hedge" | "rewrite" | "reject";
}

export interface TrustIssue {
  type:
    | "ungrounded_number"
    | "ungrounded_date"
    | "ungrounded_name"
    | "ungrounded_claim"
    | "forbidden_pattern";
  text: string;
  position: number;
  suggestion?: string;
}

interface TrustPolicy {
  no_evidence_responses: Record<string, Record<string, string>>;
  hedging_phrases: Record<string, Record<string, string>>;
  forbidden_patterns: {
    patterns: string[];
    exceptions: string[];
  };
  citation_requirements: {
    always_cite: string[];
    citation_format: Record<string, string>;
  };
  confidence_levels: Record<
    string,
    { min_score: number } & Record<string, string>
  >;
  honest_limitations: Record<string, Record<string, string>>;
}

// ============================================================================
// Service
// ============================================================================

export class TrustGateService {
  private policy: TrustPolicy | null = null;
  private forbiddenPatterns: RegExp[] = [];
  private exceptionPatterns: RegExp[] = [];

  // Patterns for extracting claims
  private readonly numberPattern = /\$?[\d,]+(\.\d+)?%?/g;
  private readonly datePattern =
    /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{1,2},?\s*\d{2,4}\b|\b(Q[1-4])\s*\d{2,4}\b|\b\d{4}\b/gi;
  private readonly namePattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g;

  constructor() {
    this.loadPolicy();
  }

  private loadPolicy(): void {
    try {
      const policyPath = path.join(
        __dirname,
        "../../data_banks/formatting/trust_policy.json",
      );

      if (fs.existsSync(policyPath)) {
        this.policy = JSON.parse(fs.readFileSync(policyPath, "utf-8"));
        this.compilePatterns();
        console.log("✅ [TrustGate] Policy loaded");
      } else {
        console.warn("⚠️ [TrustGate] Policy not found");
      }
    } catch (error: any) {
      console.error("❌ [TrustGate] Load failed:", error.message);
    }
  }

  private compilePatterns(): void {
    if (!this.policy) return;

    // Compile forbidden patterns
    this.forbiddenPatterns = this.policy.forbidden_patterns.patterns.map(
      (p) => new RegExp(`\\b${p}\\b`, "gi"),
    );

    // Compile exception patterns
    this.exceptionPatterns = this.policy.forbidden_patterns.exceptions.map(
      (p) => new RegExp(p, "gi"),
    );
  }

  /**
   * Validate answer against evidence chunks
   */
  public validate(
    answer: string,
    chunks: ChunkEvidence[],
    language: "en" | "pt" = "en",
  ): ValidationResult {
    const issues: TrustIssue[] = [];
    let groundedClaims = 0;
    let ungroundedClaims = 0;

    // Build evidence corpus
    const evidenceText = chunks.map((c) => c.text.toLowerCase()).join(" ");

    // Check numbers
    const numbers = answer.match(this.numberPattern) || [];
    for (const num of numbers) {
      const cleanNum = num.replace(/[$,]/g, "");
      if (evidenceText.includes(cleanNum) || this.isCommonNumber(cleanNum)) {
        groundedClaims++;
      } else {
        ungroundedClaims++;
        issues.push({
          type: "ungrounded_number",
          text: num,
          position: answer.indexOf(num),
          suggestion: `Add citation for ${num} or remove if not in documents`,
        });
      }
    }

    // Check dates
    const dates = answer.match(this.datePattern) || [];
    for (const date of dates) {
      const dateLower = date.toLowerCase();
      if (evidenceText.includes(dateLower) || this.isCommonDate(date)) {
        groundedClaims++;
      } else {
        ungroundedClaims++;
        issues.push({
          type: "ungrounded_date",
          text: date,
          position: answer.indexOf(date),
          suggestion: `Verify ${date} is in the document`,
        });
      }
    }

    // Check forbidden patterns
    for (const pattern of this.forbiddenPatterns) {
      const matches = answer.match(pattern) || [];
      for (const match of matches) {
        // Check if it's part of an exception
        const isException = this.exceptionPatterns.some((ep) =>
          ep.test(
            answer.slice(
              Math.max(0, answer.indexOf(match) - 20),
              answer.indexOf(match) + match.length + 20,
            ),
          ),
        );

        if (!isException) {
          issues.push({
            type: "forbidden_pattern",
            text: match,
            position: answer.indexOf(match),
            suggestion: `Replace "${match}" with evidence-based language`,
          });
        }
      }
    }

    // Determine recommendation
    let recommendedAction:
      | "pass"
      | "add_citation"
      | "hedge"
      | "rewrite"
      | "reject" = "pass";

    if (issues.length === 0) {
      recommendedAction = "pass";
    } else if (
      issues.filter((i) => i.type === "forbidden_pattern").length > 0
    ) {
      recommendedAction = "hedge";
    } else if (ungroundedClaims > groundedClaims) {
      recommendedAction = "rewrite";
    } else if (ungroundedClaims > 0) {
      recommendedAction = "add_citation";
    }

    // Reject if too many issues
    if (issues.length > 5 || ungroundedClaims > 3) {
      recommendedAction = "reject";
    }

    return {
      trusted: issues.length === 0,
      issues,
      groundedClaims,
      ungroundedClaims,
      recommendedAction,
    };
  }

  /**
   * Check if number is common/not needing citation
   */
  private isCommonNumber(num: string): boolean {
    const commonNumbers = ["1", "2", "3", "4", "5", "10", "100", "1000"];
    return commonNumbers.includes(num);
  }

  /**
   * Check if date is common/not needing citation
   */
  private isCommonDate(date: string): boolean {
    // Current year doesn't need citation
    const currentYear = new Date().getFullYear().toString();
    return date.includes(currentYear);
  }

  /**
   * Get no-evidence response
   */
  public getNoEvidenceResponse(
    type: NoEvidenceType,
    language: "en" | "pt" = "en",
    context?: TrustContext,
  ): string {
    const template = this.policy?.no_evidence_responses[language]?.[type];
    if (!template) {
      return language === "pt"
        ? "Não encontrei isso nos documentos."
        : "I couldn't find this in the documents.";
    }

    return this.fillTemplate(template, context);
  }

  /**
   * Get hedging phrase
   */
  public getHedgingPhrase(
    type: "uncertain" | "limited_data" | "inference" | "outside_scope",
    language: "en" | "pt" = "en",
  ): string {
    return this.policy?.hedging_phrases[language]?.[type] || "";
  }

  /**
   * Get confidence-level response
   */
  public getConfidenceResponse(
    level: ConfidenceLevel,
    language: "en" | "pt" = "en",
    context?: TrustContext,
  ): string {
    const levelConfig = this.policy?.confidence_levels[level];
    if (!levelConfig) {
      return this.getNoEvidenceResponse("not_in_documents", language);
    }

    const template = levelConfig[language];
    return this.fillTemplate(template, context);
  }

  /**
   * Get honest limitation response
   */
  public getLimitationResponse(
    type: LimitationType,
    language: "en" | "pt" = "en",
  ): string {
    return this.policy?.honest_limitations[language]?.[type] || "";
  }

  /**
   * Get confidence level based on score
   */
  public getConfidenceLevel(score: number): ConfidenceLevel {
    if (score >= 0.85) return "high";
    if (score >= 0.65) return "medium";
    if (score >= 0.45) return "low";
    return "none";
  }

  /**
   * Format citation
   */
  public formatCitation(
    value: string,
    source: string,
    language: "en" | "pt" = "en",
  ): string {
    const format =
      this.policy?.citation_requirements?.citation_format[language];
    if (!format) {
      return `${value} (${source})`;
    }

    return format.replace("{value}", value).replace("{source}", source);
  }

  /**
   * Check if answer needs citation
   */
  public needsCitation(answer: string): boolean {
    const hasNumbers = this.numberPattern.test(answer);
    const hasDates = this.datePattern.test(answer);
    const hasNames = this.namePattern.test(answer);

    return hasNumbers || hasDates || hasNames;
  }

  /**
   * Fill template with context values
   */
  private fillTemplate(template: string, context?: TrustContext): string {
    if (!context) return template;

    let result = template;

    if (context.filename) {
      result = result.replace(/{filename}/g, context.filename);
    }
    if (context.field) {
      result = result.replace(/{field}/g, context.field);
    }
    if (context.period) {
      result = result.replace(/{period}/g, context.period);
    }
    if (context.partial) {
      result = result.replace(/{partial}/g, context.partial);
    }
    if (context.query) {
      result = result.replace(/{query}/g, context.query);
    }
    if (context.missing_field) {
      result = result.replace(/{missing_field}/g, context.missing_field);
    }
    if (context.fact) {
      result = result.replace(/{fact}/g, context.fact);
    }
    if (context.value) {
      result = result.replace(/{value}/g, context.value);
    }
    if (context.source) {
      result = result.replace(/{source}/g, context.source);
    }

    return result;
  }

  /**
   * Check if text contains forbidden patterns
   */
  public containsForbiddenPatterns(text: string): string[] {
    const found: string[] = [];

    for (const pattern of this.forbiddenPatterns) {
      const matches = text.match(pattern) || [];
      found.push(...matches);
    }

    return found;
  }

  /**
   * Add hedge to uncertain claim
   */
  public addHedge(claim: string, language: "en" | "pt" = "en"): string {
    const hedge = this.getHedgingPhrase("uncertain", language);
    return `${hedge} ${claim}`;
  }

  /**
   * Get service stats
   */
  public getStats(): {
    noEvidenceTemplates: number;
    hedgingPhrases: number;
    forbiddenPatterns: number;
    exceptionPatterns: number;
  } {
    return {
      noEvidenceTemplates:
        Object.keys(this.policy?.no_evidence_responses?.en || {}).length +
        Object.keys(this.policy?.no_evidence_responses?.pt || {}).length,
      hedgingPhrases:
        Object.keys(this.policy?.hedging_phrases?.en || {}).length +
        Object.keys(this.policy?.hedging_phrases?.pt || {}).length,
      forbiddenPatterns: this.forbiddenPatterns.length,
      exceptionPatterns: this.exceptionPatterns.length,
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let instance: TrustGateService | null = null;

export function getTrustGate(): TrustGateService {
  if (!instance) {
    instance = new TrustGateService();
  }
  return instance;
}

export default TrustGateService;
