import { getBankLoaderInstance } from "../banks/bankLoader.service";
import { logger as appLogger } from "../../../utils/logger";

export interface EvidenceCheckResult {
  hasEvidence: boolean;
  evidenceStrength: "strong" | "moderate" | "weak" | "none";
  suggestedAction: "answer" | "hedge" | "clarify" | "apologize";
  missingEvidence: string[];
  foundEvidence: string[];
  clarifyQuestion?: string;
  hedgePrefix?: string;
}

interface EvidenceGateConfig {
  logger?: Pick<typeof appLogger, "info" | "warn" | "debug">;
}

type EvidenceGateRuntimeConfig = {
  factPatterns: Record<string, RegExp[]>;
  narrativeRiskPatterns: RegExp[];
  evidenceKeywords: Record<string, RegExp>;
  richContentMinWords: number;
  strongThreshold: number;
  moderateThreshold: number;
  copy: {
    clarifyQuestion: Record<string, string>;
    hedgePrefixWeak: Record<string, string>;
    hedgePrefixModerateNarrative: Record<string, string>;
  };
};

function normalizeLang(language: string): "en" | "pt" | "es" {
  const normalized = String(language || "en")
    .trim()
    .toLowerCase();
  if (normalized.startsWith("pt")) return "pt";
  if (normalized.startsWith("es")) return "es";
  return "en";
}

function getLocalizedCopy(
  byLang: Record<string, string>,
  language: string,
): string {
  const lang = normalizeLang(language);
  return (
    String(byLang[lang] || "").trim() ||
    String(byLang.en || "").trim() ||
    String(Object.values(byLang)[0] || "").trim()
  );
}

function compileRegexList(
  label: string,
  patterns: unknown,
  flags: string,
): RegExp[] {
  if (!Array.isArray(patterns) || patterns.length === 0) {
    throw new Error(
      `memory_policy.config.runtimeTuning.evidenceGate.${label} is required`,
    );
  }
  return patterns.map((pattern: unknown) => {
    const source = String(pattern || "").trim();
    if (!source) {
      throw new Error(`evidenceGate.${label} contains an empty regex`);
    }
    try {
      return new RegExp(source, flags);
    } catch {
      throw new Error(`Invalid evidenceGate regex for ${label}: ${source}`);
    }
  });
}

function compileRegexMap(
  label: string,
  patterns: unknown,
  flags: string,
): Record<string, RegExp> {
  if (!patterns || typeof patterns !== "object") {
    throw new Error(
      `memory_policy.config.runtimeTuning.evidenceGate.${label} is required`,
    );
  }
  const out: Record<string, RegExp> = {};
  for (const [key, value] of Object.entries(
    patterns as Record<string, unknown>,
  )) {
    const source = String(value || "").trim();
    if (!source) {
      throw new Error(`evidenceGate.${label}.${key} cannot be empty`);
    }
    try {
      out[key] = new RegExp(source, flags);
    } catch {
      throw new Error(
        `Invalid evidenceGate regex for ${label}.${key}: ${source}`,
      );
    }
  }
  if (Object.keys(out).length === 0) {
    throw new Error(
      `memory_policy.config.runtimeTuning.evidenceGate.${label} is required`,
    );
  }
  return out;
}

function resolveEvidenceGateRuntimeConfig(): EvidenceGateRuntimeConfig {
  const policyBank = getBankLoaderInstance().getBank<Record<string, unknown>>("memory_policy");
  const gate = policyBank?.config?.runtimeTuning?.evidenceGate;
  if (!gate || typeof gate !== "object") {
    throw new Error(
      "memory_policy.config.runtimeTuning.evidenceGate is required",
    );
  }

  const factPatternsRaw =
    gate.factRequiringPatterns && typeof gate.factRequiringPatterns === "object"
      ? gate.factRequiringPatterns
      : null;
  if (!factPatternsRaw) {
    throw new Error(
      "memory_policy.config.runtimeTuning.evidenceGate.factRequiringPatterns is required",
    );
  }
  const factPatterns: Record<string, RegExp[]> = {};
  for (const [key, value] of Object.entries(factPatternsRaw)) {
    factPatterns[key] = compileRegexList(
      `factRequiringPatterns.${key}`,
      value,
      "i",
    );
  }

  const narrativeRiskPatterns = compileRegexList(
    "narrativeRiskPatterns",
    gate.narrativeRiskPatterns,
    "i",
  );
  const evidenceKeywords = compileRegexMap(
    "evidenceKeywords",
    gate.evidenceKeywords,
    "i",
  );

  const richContentMinWords = Number(gate.richContentMinWords);
  if (!Number.isFinite(richContentMinWords) || richContentMinWords <= 0) {
    throw new Error(
      "memory_policy.config.runtimeTuning.evidenceGate.richContentMinWords is required",
    );
  }

  const strongThreshold = Number(gate?.strengthThresholds?.strong);
  const moderateThreshold = Number(gate?.strengthThresholds?.moderate);
  if (
    !Number.isFinite(strongThreshold) ||
    !Number.isFinite(moderateThreshold) ||
    strongThreshold <= 0 ||
    strongThreshold > 1 ||
    moderateThreshold <= 0 ||
    moderateThreshold > strongThreshold
  ) {
    throw new Error(
      "memory_policy.config.runtimeTuning.evidenceGate.strengthThresholds is required",
    );
  }

  const copy = gate.copy;
  if (!copy || typeof copy !== "object") {
    throw new Error(
      "memory_policy.config.runtimeTuning.evidenceGate.copy is required",
    );
  }

  return {
    factPatterns,
    narrativeRiskPatterns,
    evidenceKeywords,
    richContentMinWords: Math.floor(richContentMinWords),
    strongThreshold,
    moderateThreshold,
    copy: {
      clarifyQuestion: copy.clarifyQuestion || {},
      hedgePrefixWeak: copy.hedgePrefixWeak || {},
      hedgePrefixModerateNarrative: copy.hedgePrefixModerateNarrative || {},
    },
  };
}

export class EvidenceGateService {
  private readonly logger: Pick<typeof appLogger, "info" | "warn" | "debug">;
  private readonly runtimeConfig = resolveEvidenceGateRuntimeConfig();

  constructor(config: EvidenceGateConfig = {}) {
    this.logger = config.logger || appLogger;
  }

  checkEvidence(
    query: string,
    chunks: Array<{ text: string; metadata?: Record<string, unknown> }>,
    language: string,
  ): EvidenceCheckResult {
    const queryLower = String(query || "").toLowerCase();
    const requiredFactTypes = this.detectRequiredFacts(query);
    const isNarrativeRisk = this.runtimeConfig.narrativeRiskPatterns.some((p) =>
      p.test(queryLower),
    );

    const combinedText = chunks.map((c) => c.text).join("\n");
    const foundEvidence = this.findEvidence(combinedText);
    const topicOverlap = this.computeQueryTopicOverlap(
      queryLower,
      combinedText,
    );
    const evidenceStrength = this.calculateStrength(
      requiredFactTypes,
      foundEvidence,
      chunks.length,
      topicOverlap,
      isNarrativeRisk,
    );

    const result = this.determineAction(
      evidenceStrength,
      requiredFactTypes,
      foundEvidence,
      isNarrativeRisk,
      language,
    );

    this.logger.debug("[EvidenceGate] Check result", {
      query: String(query || "").substring(0, 50),
      requiredFactTypes,
      foundEvidence,
      evidenceStrength,
      topicOverlap: topicOverlap.toFixed(2),
      action: result.suggestedAction,
      isNarrativeRisk,
    });

    return result;
  }

  private detectRequiredFacts(query: string): string[] {
    const required: string[] = [];
    for (const [factType, patterns] of Object.entries(
      this.runtimeConfig.factPatterns,
    )) {
      if (patterns.some((p) => p.test(query))) {
        required.push(factType);
      }
    }
    return required;
  }

  private findEvidence(text: string): string[] {
    const found: string[] = [];
    for (const [evidenceType, pattern] of Object.entries(
      this.runtimeConfig.evidenceKeywords,
    )) {
      if (pattern.test(text)) {
        found.push(evidenceType);
      }
    }

    const wordCount = text.split(/\s+/).length;
    if (wordCount > this.runtimeConfig.richContentMinWords) {
      found.push("rich_content");
    }
    return found;
  }

  /**
   * Extract meaningful keywords from query text for topic overlap check.
   * Strips common stop words and returns lowercased terms (≥3 chars).
   */
  private extractQueryKeywords(queryLower: string): string[] {
    const stopWords = new Set([
      // English
      "the",
      "and",
      "for",
      "are",
      "but",
      "not",
      "you",
      "all",
      "can",
      "had",
      "her",
      "was",
      "one",
      "our",
      "out",
      "has",
      "his",
      "how",
      "its",
      "may",
      "who",
      "did",
      "get",
      "let",
      "say",
      "she",
      "too",
      "use",
      "what",
      "which",
      "will",
      "with",
      "this",
      "that",
      "from",
      "they",
      "been",
      "have",
      "many",
      "some",
      "them",
      "than",
      "each",
      "make",
      "like",
      "does",
      "into",
      "over",
      "such",
      "when",
      "very",
      "much",
      "about",
      "could",
      "would",
      "should",
      "there",
      "these",
      "those",
      "where",
      "being",
      "other",
      "their",
      // Portuguese
      "que",
      "para",
      "com",
      "uma",
      "por",
      "mais",
      "como",
      "mas",
      "dos",
      "das",
      "nos",
      "nas",
      "foi",
      "são",
      "tem",
      "ser",
      "ter",
      "seu",
      "sua",
      "seus",
      "suas",
      "este",
      "esta",
      "estes",
      "estas",
      "isso",
      "esse",
      "essa",
      "quais",
      "qual",
      "sobre",
      "entre",
      "todos",
      "todas",
      "cada",
      "muito",
      // Spanish
      "que",
      "para",
      "con",
      "una",
      "por",
      "más",
      "como",
      "pero",
      "del",
      "los",
      "las",
      "fue",
      "son",
      "tiene",
      "ser",
      "este",
      "esta",
    ]);
    return queryLower
      .replace(/[^a-záàâãéèêíïóôõöúçñ0-9\s]/gi, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !stopWords.has(w));
  }

  /**
   * Compute what fraction of the query's topic keywords appear in the evidence.
   * Returns 0.0 (no overlap) to 1.0 (all query keywords found in evidence).
   */
  private computeQueryTopicOverlap(
    queryLower: string,
    evidenceText: string,
  ): number {
    const keywords = this.extractQueryKeywords(queryLower);
    if (keywords.length === 0) return 1.0; // No meaningful keywords → assume generic query, pass through
    const evidenceLower = evidenceText.toLowerCase();
    const matched = keywords.filter((kw) => evidenceLower.includes(kw));
    return matched.length / keywords.length;
  }

  private calculateStrength(
    required: string[],
    found: string[],
    chunkCount: number,
    topicOverlap: number,
    isNarrativeRisk = false,
  ): "strong" | "moderate" | "weak" | "none" {
    // No chunks at all → no evidence
    if (chunkCount === 0) return "none";

    // When no specific fact types were required, use topic overlap to determine strength.
    // This prevents the gate from always returning "strong" for generic evidence.
    // IMPORTANT: When chunks exist (chunkCount > 0) we never return "none" because
    // the retrieval pipeline already scoped to attached/locked documents. Returning
    // "none" would block the LLM entirely (apologize path), which is wrong when
    // evidence was found — even if query keywords don't overlap with chunk text
    // (common for Portuguese meta-questions like "me dá uma visão geral").
    if (required.length === 0) {
      const hasRichContent = found.includes("rich_content");
      if (topicOverlap >= 0.6 && hasRichContent) return "strong";
      if (topicOverlap >= 0.4 && hasRichContent) return "moderate";
      if (topicOverlap >= 0.2) return "weak";
      // Negligible overlap (<0.10) with no rich content → chunks are irrelevant.
      // Return "none" so the LLM apologizes instead of hedging on unrelated evidence.
      // Exception: narrative-risk queries (e.g. "visão geral") are deliberately vague —
      // low keyword overlap is expected, so we hedge instead of refusing.
      if (topicOverlap < 0.10 && !hasRichContent && !isNarrativeRisk) return "none";
      // Low overlap (0.10..0.20) or narrative-risk: hedge.
      return "weak";
    }

    const matchedRequired = required.filter((r) => {
      if (r === "dates" && found.includes("dates")) return true;
      if (r === "numbers" && found.includes("numbers")) return true;
      if (r === "names" && found.includes("names")) return true;
      if (
        r === "specifics" &&
        (found.includes("quotes") || found.includes("specifics"))
      ) {
        return true;
      }
      return false;
    });

    const matchRatio =
      required.length > 0 ? matchedRequired.length / required.length : 0;

    // When fact types are explicitly required and matched, trust the fact-pattern matching.
    // Fact patterns already encode "what the user needs", so high match → strong.
    if (matchRatio >= this.runtimeConfig.strongThreshold) return "strong";
    if (matchRatio >= this.runtimeConfig.moderateThreshold) return "moderate";
    if (
      matchRatio > 0 ||
      (found.includes("rich_content") && topicOverlap >= 0.3)
    )
      return "weak";
    return "none";
  }

  private determineAction(
    strength: "strong" | "moderate" | "weak" | "none",
    requiredTypes: string[],
    foundEvidence: string[],
    isNarrativeRisk: boolean,
    language: string,
  ): EvidenceCheckResult {
    const missingEvidence = requiredTypes.filter(
      (r) => !foundEvidence.some((f) => f.includes(r)),
    );
    const result: EvidenceCheckResult = {
      hasEvidence: strength !== "none",
      evidenceStrength: strength,
      suggestedAction: "answer",
      missingEvidence,
      foundEvidence,
    };

    if (strength === "none") {
      result.suggestedAction = "apologize";
      return result;
    }

    if (strength === "weak") {
      if (isNarrativeRisk) {
        result.suggestedAction = "clarify";
        result.clarifyQuestion = getLocalizedCopy(
          this.runtimeConfig.copy.clarifyQuestion,
          language,
        );
      } else {
        result.suggestedAction = "hedge";
        result.hedgePrefix = getLocalizedCopy(
          this.runtimeConfig.copy.hedgePrefixWeak,
          language,
        );
      }
      return result;
    }

    if (strength === "moderate" && isNarrativeRisk) {
      result.suggestedAction = "hedge";
      result.hedgePrefix = getLocalizedCopy(
        this.runtimeConfig.copy.hedgePrefixModerateNarrative,
        language,
      );
      return result;
    }

    result.suggestedAction = "answer";
    return result;
  }

  getPromptModification(result: EvidenceCheckResult, language: string): string {
    const lang = normalizeLang(language);
    switch (result.suggestedAction) {
      case "apologize":
        return lang === "pt"
          ? "\n\nIMPORTANTE: Nao encontrei informacoes suficientes nos documentos para responder esta pergunta. Diga isso honestamente ao usuario sem inventar detalhes."
          : "\n\nIMPORTANT: I could not find sufficient information in the documents to answer this question. Tell the user this honestly without inventing details.";
      case "clarify":
        return lang === "pt"
          ? `\n\nIMPORTANTE: A evidencia e limitada. Pergunte: "${result.clarifyQuestion}" ao inves de inventar detalhes.`
          : `\n\nIMPORTANT: Evidence is limited. Ask: "${result.clarifyQuestion}" instead of inventing details.`;
      case "hedge":
        return lang === "pt"
          ? `\n\nIMPORTANTE: Comece a resposta com: "${result.hedgePrefix}" para indicar incerteza. Nao invente detalhes como datas de fundacao, historia da empresa, ou missao a menos que estejam explicitamente citados.`
          : `\n\nIMPORTANT: Start the response with: "${result.hedgePrefix}" to indicate uncertainty. DO NOT invent details like founding dates, company history, or mission statements unless explicitly quoted.`;
      case "answer":
      default:
        return "";
    }
  }
}

let evidenceGateInstance: EvidenceGateService | null = null;

export function getEvidenceGate(): EvidenceGateService {
  if (!evidenceGateInstance) {
    evidenceGateInstance = new EvidenceGateService();
  }
  return evidenceGateInstance;
}
