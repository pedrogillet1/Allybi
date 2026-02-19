export type ValidationRiskLevel = "LOW" | "MED" | "HIGH";

export interface DocxEditValidationInput {
  originalText: string;
  proposedText: string;
  requiredTokens?: string[];
  preserveEntities?: boolean;
  strictFacts?: boolean;
  styleOnly?: boolean;
  similarityThreshold?: number;
  maxSentenceDelta?: number;
}

export interface ValidationViolation {
  code:
    | "EMPTY_PROPOSED_TEXT"
    | "MISSING_REQUIRED_TOKEN"
    | "MISSING_PRESERVED_ENTITY"
    | "STRICT_NEW_FACT"
    | "STYLE_SIMILARITY_BELOW_THRESHOLD"
    | "STYLE_SENTENCE_DELTA_EXCEEDED";
  message: string;
  details?: Record<string, unknown>;
}

export interface EntityPreservation {
  originalEntities: string[];
  preservedEntities: string[];
  missingEntities: string[];
}

export interface SimilarityBreakdown {
  tokenDice: number;
  charBigramJaccard: number;
  composite: number;
}

export interface FactDiff {
  originalFacts: string[];
  proposedFacts: string[];
  introducedFacts: string[];
}

export interface DocxEditValidationResult {
  valid: boolean;
  violations: ValidationViolation[];
  preservedTokens: string[];
  missingTokens: string[];
  entityPreservation: EntityPreservation;
  factDiff: FactDiff;
  similarity: SimilarityBreakdown;
  riskLevel: ValidationRiskLevel;
}

const DEFAULT_SIMILARITY_THRESHOLD = 0.74;
const DEFAULT_MAX_SENTENCE_DELTA = 2;

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function tokenize(text: string): string[] {
  return normalizeWhitespace(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

function tokenDice(left: string, right: string): number {
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);

  if (leftTokens.length === 0 && rightTokens.length === 0) return 1;
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;

  const counts = new Map<string, number>();
  for (const token of leftTokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }

  let overlap = 0;
  for (const token of rightTokens) {
    const count = counts.get(token) ?? 0;
    if (count > 0) {
      overlap += 1;
      counts.set(token, count - 1);
    }
  }

  return (2 * overlap) / (leftTokens.length + rightTokens.length);
}

function charBigrams(input: string): string[] {
  const normalized = normalizeWhitespace(input).toLowerCase();
  if (normalized.length < 2) {
    return normalized ? [normalized] : [];
  }

  const grams: string[] = [];
  for (let i = 0; i < normalized.length - 1; i++) {
    grams.push(normalized.slice(i, i + 2));
  }
  return grams;
}

function bigramJaccard(left: string, right: string): number {
  const leftSet = new Set(charBigrams(left));
  const rightSet = new Set(charBigrams(right));

  if (leftSet.size === 0 && rightSet.size === 0) return 1;

  let intersection = 0;
  for (const gram of leftSet) {
    if (rightSet.has(gram)) {
      intersection += 1;
    }
  }

  const union = leftSet.size + rightSet.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

function sentenceCount(text: string): number {
  const matches = normalizeWhitespace(text).match(/[^.!?]+[.!?]?/g);
  if (!matches) return 0;
  return matches.map((part) => part.trim()).filter(Boolean).length;
}

function extractEntities(text: string): string[] {
  const entities: string[] = [];

  const emailMatches =
    text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) ?? [];
  entities.push(...emailMatches.map((m) => m.toLowerCase()));

  const moneyMatches =
    text.match(/\b(?:usd|eur|brl|r\$|\$)\s?\d+(?:[.,]\d+)?\b/gi) ?? [];
  entities.push(
    ...moneyMatches.map((m) => normalizeWhitespace(m.toLowerCase())),
  );

  const properNounMatches =
    text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\b/g) ?? [];
  entities.push(...properNounMatches.map((m) => normalizeWhitespace(m)));

  return dedupe(entities);
}

function extractFacts(text: string): string[] {
  const patterns = [
    /\b\d{1,4}(?:[.,]\d+)?%?\b/g,
    /\b\d{4}-\d{2}-\d{2}\b/g,
    /\b(?:usd|eur|brl|r\$|\$)\s?\d+(?:[.,]\d+)?\b/gi,
  ];

  const facts: string[] = [];
  for (const pattern of patterns) {
    const matches = text.match(pattern) ?? [];
    for (const match of matches) {
      facts.push(normalizeWhitespace(match.toLowerCase()));
    }
  }

  return dedupe(facts);
}

function buildSimilarity(
  originalText: string,
  proposedText: string,
): SimilarityBreakdown {
  const tokenScore = tokenDice(originalText, proposedText);
  const charScore = bigramJaccard(originalText, proposedText);
  const composite = tokenScore * 0.65 + charScore * 0.35;

  return {
    tokenDice: tokenScore,
    charBigramJaccard: charScore,
    composite,
  };
}

function computeRiskLevel(
  violations: ValidationViolation[],
): ValidationRiskLevel {
  if (violations.length === 0) return "LOW";

  const highRiskCodes = new Set<ValidationViolation["code"]>([
    "STRICT_NEW_FACT",
    "MISSING_REQUIRED_TOKEN",
    "MISSING_PRESERVED_ENTITY",
  ]);

  return violations.some((v) => highRiskCodes.has(v.code)) ? "HIGH" : "MED";
}

export class DocxValidatorsService {
  validateEdit(input: DocxEditValidationInput): DocxEditValidationResult {
    const originalText = normalizeWhitespace(input.originalText);
    const proposedText = normalizeWhitespace(input.proposedText);

    const violations: ValidationViolation[] = [];

    if (!proposedText) {
      violations.push({
        code: "EMPTY_PROPOSED_TEXT",
        message: "Proposed paragraph text cannot be empty.",
      });
    }

    const requiredTokens = dedupe(
      (input.requiredTokens ?? [])
        .map((token) => normalizeWhitespace(token))
        .filter(Boolean),
    );
    const preservedTokens = requiredTokens.filter((token) =>
      proposedText.toLowerCase().includes(token.toLowerCase()),
    );
    const missingTokens = requiredTokens.filter(
      (token) => !proposedText.toLowerCase().includes(token.toLowerCase()),
    );

    for (const token of missingTokens) {
      violations.push({
        code: "MISSING_REQUIRED_TOKEN",
        message: `Required token was not preserved: "${token}"`,
        details: { token },
      });
    }

    const originalEntities = input.preserveEntities
      ? extractEntities(originalText)
      : [];
    const preservedEntities = originalEntities.filter((entity) =>
      proposedText.toLowerCase().includes(entity.toLowerCase()),
    );
    const missingEntities = originalEntities.filter(
      (entity) => !proposedText.toLowerCase().includes(entity.toLowerCase()),
    );

    if (input.preserveEntities) {
      for (const entity of missingEntities) {
        violations.push({
          code: "MISSING_PRESERVED_ENTITY",
          message: `Entity preservation failed for "${entity}"`,
          details: { entity },
        });
      }
    }

    const originalFacts = input.strictFacts ? extractFacts(originalText) : [];
    const proposedFacts = input.strictFacts ? extractFacts(proposedText) : [];
    const originalFactSet = new Set(originalFacts);
    const introducedFacts = proposedFacts.filter(
      (fact) => !originalFactSet.has(fact),
    );

    if (input.strictFacts) {
      for (const fact of introducedFacts) {
        violations.push({
          code: "STRICT_NEW_FACT",
          message: `Strict mode blocked newly introduced fact "${fact}"`,
          details: { fact },
        });
      }
    }

    const similarity = buildSimilarity(originalText, proposedText);

    if (input.styleOnly) {
      const threshold =
        input.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;
      if (similarity.composite < threshold) {
        violations.push({
          code: "STYLE_SIMILARITY_BELOW_THRESHOLD",
          message: `Style-only similarity ${similarity.composite.toFixed(3)} is below threshold ${threshold.toFixed(3)}.`,
          details: {
            composite: similarity.composite,
            threshold,
            tokenDice: similarity.tokenDice,
            charBigramJaccard: similarity.charBigramJaccard,
          },
        });
      }

      const maxSentenceDelta =
        input.maxSentenceDelta ?? DEFAULT_MAX_SENTENCE_DELTA;
      const sentenceDelta = Math.abs(
        sentenceCount(originalText) - sentenceCount(proposedText),
      );
      if (sentenceDelta > maxSentenceDelta) {
        violations.push({
          code: "STYLE_SENTENCE_DELTA_EXCEEDED",
          message: `Style-only edit changed sentence count by ${sentenceDelta}, max allowed is ${maxSentenceDelta}.`,
          details: { sentenceDelta, maxSentenceDelta },
        });
      }
    }

    return {
      valid: violations.length === 0,
      violations,
      preservedTokens,
      missingTokens,
      entityPreservation: {
        originalEntities,
        preservedEntities,
        missingEntities,
      },
      factDiff: {
        originalFacts,
        proposedFacts,
        introducedFacts,
      },
      similarity,
      riskLevel: computeRiskLevel(violations),
    };
  }
}
